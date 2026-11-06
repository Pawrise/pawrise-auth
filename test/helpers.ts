import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createHash } from 'node:crypto';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey } from 'jose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { InMemoryMailer, Mailer } from '../src/infra/mail/mailer';
import { PrismaService } from '../src/infra/prisma.service';
import { PROVIDER_KEYS } from '../src/infra/providers/identity-providers';

export interface TestContext {
  app: NestExpressApplication;
  http: () => ReturnType<typeof request>;
  mailer: InMemoryMailer;
  prisma: PrismaService;
  signProviderToken: (provider: 'apple' | 'google', claims: Record<string, unknown>) => Promise<string>;
  close: () => Promise<void>;
}

/** Démarre l'app avec une boîte mail en mémoire et de faux fournisseurs Apple / Google (JWKS local). */
export async function createTestApp(): Promise<TestContext> {
  const apple = await generateKeyPair('RS256');
  const google = await generateKeyPair('RS256');
  const jwks = async (key: CryptoKey, kid: string) =>
    createLocalJWKSet({ keys: [{ ...(await exportJWK(key)), kid, alg: 'RS256' }] });
  const mailer = new InMemoryMailer();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Mailer)
    .useValue(mailer)
    .overrideProvider(PROVIDER_KEYS)
    .useValue({
      apple: await jwks(apple.publicKey, 'apple-1'),
      google: await jwks(google.publicKey, 'google-1'),
    })
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false, logger: false });
  configureApp(app);
  await app.init();
  const prisma = app.get(PrismaService);

  return {
    app,
    http: () => request(app.getHttpServer()),
    mailer,
    prisma,
    async signProviderToken(provider, claims) {
      const key = provider === 'apple' ? apple.privateKey : google.privateKey;
      return new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256', kid: `${provider}-1` })
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(key);
    },
    close: () => app.close(),
  };
}

export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE user_account, consent, refresh_token, user_identity, email_token, login_attempt RESTART IDENTITY CASCADE',
  );
}

export const TERMS = '2026-10';

export function registration(overrides: Record<string, unknown> = {}) {
  return {
    firstName: 'Camille',
    lastName: 'Martin',
    email: 'camille.martin@example.com',
    phoneNumber: '+33612345678',
    password: 'chien-oslo-2026',
    acceptedTermsVersion: TERMS,
    ...overrides,
  };
}

export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

/** Attend un e-mail envoyé sans être attendu par la requête (mot de passe oublié). */
export async function waitForMail(mailer: InMemoryMailer, to: string, subjectPart: string) {
  for (let i = 0; i < 50; i++) {
    const mail = [...mailer.sent].reverse().find((m) => m.to === to && m.subject.includes(subjectPart));
    if (mail) return mail;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`Aucun e-mail « ${subjectPart} » pour ${to}`);
}
