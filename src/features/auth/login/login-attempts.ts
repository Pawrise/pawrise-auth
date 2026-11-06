import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../../../config/env';
import { TooManyAttemptsError } from '../../../domain/errors';
import { PrismaService } from '../../../infra/prisma.service';

/**
 * Verrouillage temporaire : 5 échecs d'affilée en 15 min sur un e-mail → 429 `TOO_MANY_ATTEMPTS`
 * jusqu'à ce que le plus ancien de ces échecs sorte de la fenêtre. Même comportement pour un e-mail
 * inconnu : la réponse ne révèle pas si le compte existe.
 */
@Injectable()
export class LoginAttempts {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
  ) {}

  async assertNotLocked(email: string): Promise<void> {
    const windowMs = this.env.LOGIN_WINDOW_MINUTES * 60_000;
    const since = new Date(Date.now() - windowMs);
    const recent = await this.prisma.loginAttempt.findMany({
      where: { email, attemptedAt: { gte: since } },
      orderBy: { attemptedAt: 'desc' },
      take: this.env.LOGIN_MAX_FAILURES,
    });
    const failures = recent.filter((a) => !a.succeeded);
    // « D'affilée » : une connexion réussie remet le compteur à zéro.
    if (failures.length < this.env.LOGIN_MAX_FAILURES || recent.some((a) => a.succeeded)) return;
    const oldest = failures[failures.length - 1].attemptedAt.getTime();
    throw new TooManyAttemptsError((oldest + windowMs - Date.now()) / 1000);
  }

  async record(email: string, ipAddress: string | undefined, succeeded: boolean): Promise<void> {
    await this.prisma.loginAttempt.create({
      data: { email, ipAddress: ipAddress?.slice(0, 45) ?? null, succeeded },
    });
  }
}
