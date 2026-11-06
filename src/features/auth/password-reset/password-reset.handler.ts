import { Injectable, Logger } from '@nestjs/common';
import { Errors } from '../../../domain/errors';
import { normalizeEmail } from '../../../domain/identity';
import { safeEqual } from '../../../domain/tokens';
import { PasswordHasher } from '../../../infra/password-hasher';
import { PrismaService } from '../../../infra/prisma.service';
import { EmailTokens, RESET_CODE_MAX_ATTEMPTS } from '../../shared/email-tokens';
import { PasswordChecks } from '../../shared/password-checks';
import { Sessions } from '../../shared/sessions';

/**
 * Mot de passe oublié (ajout E4) : un code à 6 chiffres par e-mail, 15 min, 5 essais.
 * La demande répond toujours 202, que le compte existe ou non. Une réinitialisation réussie ferme
 * toutes les sessions et invalide les jetons d'accès déjà émis.
 */
@Injectable()
export class PasswordResetHandler {
  private readonly logger = new Logger(PasswordResetHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
    private readonly passwords: PasswordChecks,
    private readonly emailTokens: EmailTokens,
    private readonly sessions: Sessions,
  ) {}

  async request(rawEmail: string): Promise<void> {
    const user = await this.prisma.userAccount.findFirst({ where: { email: normalizeEmail(rawEmail) } });
    // Envoi sans attendre : le temps de réponse ne dépend pas de l'existence du compte.
    if (user) {
      this.emailTokens.sendResetCode(user).catch((error: unknown) => {
        this.logger.error(`Code de réinitialisation non envoyé : ${String(error)}`);
      });
    }
  }

  async reset(rawEmail: string, code: string, newPassword: string): Promise<void> {
    const email = normalizeEmail(rawEmail);
    const user = await this.prisma.userAccount.findFirst({ where: { email } });
    const pending = user
      ? await this.prisma.emailToken.findFirst({
          where: { userId: user.id, purpose: 'reset_password', usedAt: null, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: 'desc' },
        })
      : null;
    if (!user || !pending || pending.attempts >= RESET_CODE_MAX_ATTEMPTS || pending.email !== user.email) {
      throw Errors.invalidOrExpiredToken();
    }
    if (!safeEqual(pending.tokenHash, this.emailTokens.hash(`${user.id}:${code}`))) {
      const attempts = pending.attempts + 1;
      await this.prisma.emailToken.update({
        where: { id: pending.id },
        // Au 5e essai raté, le code est brûlé : il faut en redemander un.
        data: { attempts, usedAt: attempts >= RESET_CODE_MAX_ATTEMPTS ? new Date() : null },
      });
      throw Errors.invalidOrExpiredToken();
    }

    await this.passwords.assertAcceptable(newPassword, 'newPassword', { email });
    const passwordHash = await this.hasher.hash(newPassword);
    await this.prisma.$transaction(async (tx) => {
      const used = await tx.emailToken.updateMany({
        where: { id: pending.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (used.count === 0) throw Errors.invalidOrExpiredToken();
      await this.sessions.closeAll(user.id, tx);
      // Le code reçu par e-mail prouve aussi la possession de l'adresse.
      await tx.userAccount.update({
        where: { id: user.id },
        data: { passwordHash, emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
      });
    });
  }
}
