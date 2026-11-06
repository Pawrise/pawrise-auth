import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createPublicKey, generateKeyPairSync, createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { exportJWK, importPKCS8, importSPKI, type JWK, type CryptoKey } from 'jose';
import { ENV, type Env } from '../../config/env';

interface PublicKeyEntry {
  kid: string;
  key: CryptoKey;
  jwk: JWK;
}

/**
 * Clés RS256 des jetons d'accès. En production, la clé privée vient des secrets (JWT_PRIVATE_KEY) ;
 * en dev et en test, une clé est créée une fois dans .keys/ (ignoré par git).
 * Le JWKS publie la clé active et, pendant une rotation, la précédente.
 */
@Injectable()
export class SigningKeys implements OnModuleInit {
  private readonly logger = new Logger(SigningKeys.name);
  private privateKey!: CryptoKey;
  private activeKid!: string;
  private publicKeys: PublicKeyEntry[] = [];

  constructor(@Inject(ENV) private readonly env: Env) {}

  async onModuleInit(): Promise<void> {
    const privatePem = this.env.JWT_PRIVATE_KEY?.replace(/\\n/g, '\n') ?? this.devPrivateKey();
    const publicPem = createPublicKey(privatePem).export({ type: 'spki', format: 'pem' }).toString();
    this.activeKid = this.env.JWT_KEY_ID ?? thumbprint(publicPem);
    this.privateKey = await importPKCS8(privatePem, 'RS256');
    this.publicKeys = [await toEntry(this.activeKid, publicPem)];

    const previous = this.env.JWT_PREVIOUS_PUBLIC_KEY?.replace(/\\n/g, '\n');
    if (previous) {
      this.publicKeys.push(await toEntry(this.env.JWT_PREVIOUS_KEY_ID ?? thumbprint(previous), previous));
    }
  }

  get signingKey(): { kid: string; key: CryptoKey } {
    return { kid: this.activeKid, key: this.privateKey };
  }

  publicKey(kid: string | undefined): CryptoKey | undefined {
    return this.publicKeys.find((k) => k.kid === kid)?.key;
  }

  jwks(): { keys: JWK[] } {
    return { keys: this.publicKeys.map((k) => k.jwk) };
  }

  private devPrivateKey(): string {
    const dir = join(process.cwd(), '.keys');
    const file = join(dir, `jwt-${this.env.NODE_ENV}.pem`);
    if (!existsSync(file)) {
      mkdirSync(dir, { recursive: true });
      const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      writeFileSync(file, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
      this.logger.warn(`Clé de signature de dev créée : ${file}`);
    }
    return readFileSync(file, 'utf8');
  }
}

async function toEntry(kid: string, publicPem: string): Promise<PublicKeyEntry> {
  const key = await importSPKI(publicPem, 'RS256', { extractable: true });
  const jwk = { ...(await exportJWK(key)), kid, alg: 'RS256', use: 'sig' };
  return { kid, key, jwk };
}

function thumbprint(publicPem: string): string {
  return createHash('sha256').update(publicPem).digest('base64url').slice(0, 16);
}
