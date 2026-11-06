import { Injectable } from '@nestjs/common';
import { Errors } from '../../../domain/errors';
import { PrismaService } from '../../../infra/prisma.service';
import { EmailTokens } from '../../shared/email-tokens';

/**
 * Vérification de l'adresse (ajout E4). Le lien n'est valable que pour l'adresse à laquelle il a été
 * envoyé : si l'e-mail du compte a changé depuis, il est refusé.
 */
@Injectable()
export class VerifyEmailHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailTokens: EmailTokens,
  ) {}

  async execute(token: string): Promise<void> {
    const now = new Date();
    const consumed = await this.prisma.emailToken.updateManyAndReturn({
      where: {
        tokenHash: this.emailTokens.hash(token),
        purpose: 'verify_email',
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: { usedAt: now },
      include: { user: true },
    });
    const row = consumed[0];
    if (!row || row.user.email !== row.email) throw Errors.invalidOrExpiredToken();
    if (!row.user.emailVerifiedAt) {
      await this.prisma.userAccount.update({ where: { id: row.userId }, data: { emailVerifiedAt: now } });
    }
  }
}
