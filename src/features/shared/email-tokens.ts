import { Inject, Injectable } from '@nestjs/common';
import type { UserAccount } from '@prisma/client';
import { ENV, type Env } from '../../config/env';
import { generateNumericCode, generateOpaqueToken, hmac } from '../../domain/tokens';
import { Mailer } from '../../infra/mail/mailer';
import { resetPasswordMessage, verifyEmailMessage } from '../../infra/mail/templates';
import { PrismaService } from '../../infra/prisma.service';

export const VERIFY_EMAIL_TTL_MS = 24 * 3_600_000;
export const RESET_CODE_TTL_MS = 15 * 60_000;
export const RESET_CODE_MAX_ATTEMPTS = 5;

/** Liens de vérification et codes de réinitialisation : stockés en HMAC, un seul valide à la fois par usage. */
@Injectable()
export class EmailTokens {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly mailer: Mailer,
  ) {}

  hash(value: string): string {
    return hmac(this.env.EMAIL_TOKEN_SECRET, value);
  }

  async sendVerification(user: UserAccount): Promise<void> {
    const token = generateOpaqueToken('pev');
    await this.replace(user, 'verify_email', this.hash(token), VERIFY_EMAIL_TTL_MS);
    const link = `${this.env.PUBLIC_BASE_URL}/v1/auth/verify-email?token=${encodeURIComponent(token)}`;
    await this.mailer.send(verifyEmailMessage(user.email, user.firstName, link));
  }

  async sendResetCode(user: UserAccount): Promise<void> {
    const code = generateNumericCode();
    // Le code est lié au compte : le HMAC inclut l'identifiant, deux comptes peuvent recevoir le même code.
    await this.replace(user, 'reset_password', this.hash(`${user.id}:${code}`), RESET_CODE_TTL_MS);
    await this.mailer.send(resetPasswordMessage(user.email, user.firstName, code));
  }

  private async replace(user: UserAccount, purpose: string, tokenHash: string, ttlMs: number): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.emailToken.updateMany({
        where: { userId: user.id, purpose, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.emailToken.create({
        data: {
          userId: user.id,
          purpose,
          tokenHash,
          email: user.email,
          expiresAt: new Date(Date.now() + ttlMs),
        },
      }),
    ]);
  }
}
