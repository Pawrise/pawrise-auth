import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type UserAccount } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ENV, type Env } from '../../config/env';
import { Errors } from '../../domain/errors';
import { generateOpaqueToken, sha256 } from '../../domain/tokens';
import { AccessTokens } from '../../infra/jwt/access-tokens';
import { PrismaService } from '../../infra/prisma.service';
import { AuthSessionDto, AuthTokensDto, toUserDto } from './user.dto';

type Db = Prisma.TransactionClient | PrismaService;

/**
 * Sessions (D15, RG77 à RG79). Une session = une famille de jetons de rafraîchissement (un appareil).
 * Le jeton de rafraîchissement est opaque (256 bits, préfixe `prt_`), stocké en SHA-256, à usage unique.
 */
@Injectable()
export class Sessions {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly accessTokens: AccessTokens,
  ) {}

  /** Ouvre une nouvelle session (nouvel appareil) et renvoie la réponse `AuthSession`. */
  async open(user: UserAccount, db: Db = this.prisma): Promise<AuthSessionDto> {
    const tokens = await this.issue(user, randomUUID(), db);
    return { ...tokens, user: toUserDto(user) };
  }

  /**
   * Rotation : le jeton présenté est marqué utilisé de façon atomique, puis remplacé dans la même famille.
   * Un jeton déjà utilisé qui revient signale un vol : toute la famille est révoquée (RFC 9700 §4.14.2).
   */
  async rotate(refreshToken: string): Promise<AuthTokensDto> {
    const hash = sha256(refreshToken);
    const tokens = await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.refreshToken.updateManyAndReturn({
        where: { tokenHash: hash, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
        include: { user: true },
      });
      const current = consumed[0];
      if (current) return this.issue(current.user, current.familyId, tx);

      const known = await tx.refreshToken.findUnique({ where: { tokenHash: hash } });
      if (known?.usedAt && !known.revokedAt) {
        await tx.refreshToken.updateMany({
          where: { familyId: known.familyId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      return null; // pas d'exception ici : la révocation de la famille doit être validée
    });
    if (!tokens) throw Errors.invalidRefreshToken();
    return tokens;
  }

  /** Ferme la session de l'appareil qui présente ce jeton. Idempotent ; un jeton d'un autre compte est ignoré. */
  async close(userId: string, refreshToken: string): Promise<void> {
    const known = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(refreshToken) } });
    if (!known || known.userId !== userId) return;
    await this.prisma.refreshToken.updateMany({
      where: { familyId: known.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Ferme toutes les sessions du compte et invalide ses jetons d'accès (mot de passe réinitialisé…). */
  async closeAll(userId: string, db: Db = this.prisma): Promise<void> {
    await db.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await db.userAccount.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
  }

  private async issue(user: UserAccount, familyId: string, db: Db): Promise<AuthTokensDto> {
    const refreshToken = generateOpaqueToken('prt');
    const expiresAt = new Date(Date.now() + this.env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
    await db.refreshToken.create({
      data: { tokenHash: sha256(refreshToken), familyId, expiresAt, userId: user.id },
    });
    const accessToken = await this.accessTokens.sign({
      userId: user.id,
      role: 'owner',
      tokenVersion: user.tokenVersion,
    });
    return { accessToken, refreshToken };
  }
}
