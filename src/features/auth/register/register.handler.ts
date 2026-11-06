import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../../../config/env';
import { Errors, ValidationError } from '../../../domain/errors';
import { normalizeEmail } from '../../../domain/identity';
import { PasswordHasher } from '../../../infra/password-hasher';
import { PrismaService } from '../../../infra/prisma.service';
import { EmailTokens } from '../../shared/email-tokens';
import { PasswordChecks } from '../../shared/password-checks';
import { Sessions } from '../../shared/sessions';
import type { AuthSessionDto } from '../../shared/user.dto';
import type { RegisterDto } from './register.dto';

/**
 * S20 Inscription (US-28). Crée le compte et le consentement aux CGU dans la même transaction (RG11),
 * ouvre une session, puis envoie le lien de vérification de l'adresse.
 */
@Injectable()
export class RegisterHandler {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
    private readonly passwords: PasswordChecks,
    private readonly sessions: Sessions,
    private readonly emailTokens: EmailTokens,
  ) {}

  async execute(input: RegisterDto): Promise<AuthSessionDto> {
    if (input.acceptedTermsVersion !== this.env.TERMS_VERSION) {
      throw ValidationError.field('acceptedTermsVersion', 'TERMS_NOT_ACCEPTED');
    }
    const email = normalizeEmail(input.email);
    if (await this.emailTaken(email)) throw Errors.emailAlreadyUsed();
    await this.passwords.assertAcceptable(input.password, 'password', { email });

    const passwordHash = await this.hasher.hash(input.password);
    const session = await this.prisma
      .$transaction(async (tx) => {
        const user = await tx.userAccount.create({
          data: {
            email,
            passwordHash,
            firstName: input.firstName.trim(),
            lastName: input.lastName.trim(),
            phoneNumber: input.phoneNumber ?? null,
            consents: { create: { type: 'terms_privacy', version: input.acceptedTermsVersion } },
          },
        });
        return this.sessions.open(user, tx);
      })
      .catch((error: unknown) => {
        // Deux inscriptions simultanées avec le même e-mail : l'index unique tranche.
        if (isUniqueViolation(error)) throw Errors.emailAlreadyUsed();
        throw error;
      });

    const user = await this.prisma.userAccount.findUniqueOrThrow({ where: { id: session.user.id } });
    await this.emailTokens.sendVerification(user);
    return session;
  }

  private async emailTaken(email: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<{ n: number }[]>`
      SELECT 1 AS n FROM user_account WHERE lower(email) = ${email} LIMIT 1`;
    return rows.length > 0;
  }
}

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
