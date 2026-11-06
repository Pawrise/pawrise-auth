import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SignJWT, decodeProtectedHeader, jwtVerify } from 'jose';
import { ENV, type Env } from '../../config/env';
import { UnauthorizedError } from '../../domain/errors';
import { SigningKeys } from './signing-keys';

export interface AccessClaims {
  userId: string;
  role: 'owner' | 'vet';
  tokenVersion: number;
}

/**
 * Jeton d'accès JWT RS256 (RFC 9068 : `typ: at+jwt`), 15 min, sans donnée personnelle.
 * Rôle `owner` / `vet` dans le payload (T1) ; les rôles propres à un chien restent dans l'API-CORE.
 */
@Injectable()
export class AccessTokens {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly keys: SigningKeys,
  ) {}

  async sign(claims: AccessClaims): Promise<string> {
    const { kid, key } = this.keys.signingKey;
    return new SignJWT({ role: claims.role, ver: claims.tokenVersion })
      .setProtectedHeader({ alg: 'RS256', typ: 'at+jwt', kid })
      .setIssuer(this.env.JWT_ISSUER)
      .setAudience(this.env.JWT_AUDIENCE)
      .setSubject(claims.userId)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime(`${this.env.ACCESS_TOKEN_TTL_SECONDS}s`)
      .sign(key);
  }

  async verify(token: string): Promise<AccessClaims> {
    try {
      const { kid } = decodeProtectedHeader(token);
      const key = this.keys.publicKey(kid);
      if (!key) throw new Error('unknown kid');
      const { payload } = await jwtVerify(token, key, {
        algorithms: ['RS256'], // fixé côté vérificateur, jamais lu depuis le jeton
        issuer: this.env.JWT_ISSUER,
        audience: this.env.JWT_AUDIENCE,
        typ: 'at+jwt',
        requiredClaims: ['sub', 'exp', 'iat', 'jti'],
      });
      const role = payload.role;
      if ((role !== 'owner' && role !== 'vet') || typeof payload.ver !== 'number' || !payload.sub) {
        throw new Error('invalid claims');
      }
      return { userId: payload.sub, role, tokenVersion: payload.ver };
    } catch {
      throw new UnauthorizedError();
    }
  }
}
