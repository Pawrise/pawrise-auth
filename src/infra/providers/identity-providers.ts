import { Inject, Injectable } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import { ENV, type Env } from '../../config/env';
import { Errors } from '../../domain/errors';
import { safeEqual, sha256 } from '../../domain/tokens';

export type Provider = 'apple' | 'google';

export interface ProviderIdentity {
  provider: Provider;
  subject: string;
  email: string;
  emailVerified: boolean;
  givenName?: string;
  familyName?: string;
}

/** Clés publiques des fournisseurs ; remplaçables dans les tests par un JWKS local. */
export const PROVIDER_KEYS = Symbol('PROVIDER_KEYS');
export type ProviderKeys = Record<Provider, JWTVerifyGetKey>;

export function remoteProviderKeys(): ProviderKeys {
  // jose met les clés en cache et les recharge quand un `kid` inconnu apparaît.
  return {
    apple: createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'), { cacheMaxAge: 3_600_000 }),
    google: createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'), {
      cacheMaxAge: 3_600_000,
    }),
  };
}

const ISSUERS: Record<Provider, string[]> = {
  apple: ['https://appleid.apple.com'],
  google: ['https://accounts.google.com', 'accounts.google.com'],
};

/**
 * Vérifie le jeton d'identité envoyé par l'app après « Se connecter avec Apple / Google » :
 * signature (JWKS du fournisseur), `iss`, `aud` (nos identifiants clients), `exp`, âge ≤ 10 min, nonce.
 */
@Injectable()
export class IdentityProviders {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(PROVIDER_KEYS) private readonly keys: ProviderKeys,
  ) {}

  async verifyApple(identityToken: string, rawNonce: string): Promise<ProviderIdentity> {
    if (this.env.APPLE_AUDIENCES.length === 0) throw Errors.providerNotConfigured();
    const payload = await this.verify('apple', identityToken, this.env.APPLE_AUDIENCES);
    // L'app envoie SHA-256(nonce) à Apple, qui le recopie dans le jeton ; on reçoit le nonce brut.
    if (typeof payload.nonce !== 'string' || !safeEqual(payload.nonce, sha256(rawNonce))) {
      throw Errors.invalidProviderToken();
    }
    return this.identity('apple', payload);
  }

  async verifyGoogle(idToken: string, rawNonce?: string): Promise<ProviderIdentity> {
    if (this.env.GOOGLE_CLIENT_IDS.length === 0) throw Errors.providerNotConfigured();
    const payload = await this.verify('google', idToken, this.env.GOOGLE_CLIENT_IDS);
    if (
      rawNonce !== undefined &&
      (typeof payload.nonce !== 'string' || !safeEqual(payload.nonce, rawNonce))
    ) {
      throw Errors.invalidProviderToken();
    }
    return this.identity('google', payload);
  }

  private async verify(provider: Provider, token: string, audiences: string[]): Promise<JWTPayload> {
    try {
      const { payload } = await jwtVerify(token, this.keys[provider], {
        algorithms: ['RS256'],
        issuer: ISSUERS[provider],
        audience: audiences,
        maxTokenAge: '10m',
        requiredClaims: ['sub', 'iat', 'exp'],
      });
      return payload;
    } catch {
      throw Errors.invalidProviderToken();
    }
  }

  private identity(provider: Provider, payload: JWTPayload): ProviderIdentity {
    const email = typeof payload.email === 'string' ? payload.email : undefined;
    if (!email || !payload.sub) throw Errors.invalidProviderToken();
    // Apple envoie parfois les booléens sous forme de chaîne.
    const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
    return {
      provider,
      subject: payload.sub,
      email,
      emailVerified,
      givenName: typeof payload.given_name === 'string' ? payload.given_name : undefined,
      familyName: typeof payload.family_name === 'string' ? payload.family_name : undefined,
    };
  }
}
