import { Injectable } from '@nestjs/common';
import { Errors } from '../../../domain/errors';
import { normalizeEmail } from '../../../domain/identity';
import { PasswordHasher } from '../../../infra/password-hasher';
import { PrismaService } from '../../../infra/prisma.service';
import { Sessions } from '../../shared/sessions';
import type { AuthSessionDto } from '../../shared/user.dto';
import { LoginAttempts } from './login-attempts';
import type { LoginDto } from './login.dto';

/**
 * S19 Connexion (US-27). Même 401 `INVALID_CREDENTIALS` pour un e-mail inconnu, un mauvais mot de passe
 * ou un compte sans mot de passe (Apple / Google seulement), et même temps de calcul (hash factice).
 */
@Injectable()
export class LoginHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
    private readonly attempts: LoginAttempts,
    private readonly sessions: Sessions,
  ) {}

  async execute(input: LoginDto, ip: string | undefined): Promise<AuthSessionDto> {
    const email = normalizeEmail(input.email);
    await this.attempts.assertNotLocked(email);

    const user = await this.prisma.userAccount.findFirst({ where: { email } });
    const valid = await this.hasher.verify(user?.passwordHash, input.password);
    await this.attempts.record(email, ip, valid);
    if (!user || !valid) throw Errors.invalidCredentials();

    if (user.passwordHash && this.hasher.needsRehash(user.passwordHash)) {
      const passwordHash = await this.hasher.hash(input.password);
      await this.prisma.userAccount.update({ where: { id: user.id }, data: { passwordHash } });
    }
    return this.sessions.open(user);
  }
}
