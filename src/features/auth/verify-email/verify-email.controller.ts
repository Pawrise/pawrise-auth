import { Body, Controller, Get, Header, HttpCode, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { UserAccount } from '@prisma/client';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { Response } from 'express';
import { AppError } from '../../../domain/errors';
import { AuthGuard, CurrentUser } from '../../shared/auth.guard';
import { EmailTokens } from '../../shared/email-tokens';
import { VerifyEmailHandler } from './verify-email.handler';

export class VerifyEmailDto {
  @IsString()
  @IsNotEmpty({ context: { code: 'REQUIRED' } })
  @MaxLength(256)
  token!: string;
}

@Controller('auth')
export class VerifyEmailController {
  constructor(
    private readonly handler: VerifyEmailHandler,
    private readonly emailTokens: EmailTokens,
  ) {}

  /** Lien ouvert depuis l'e-mail, dans le navigateur du téléphone : renvoie une page courte. */
  @Get('verify-email')
  @Header('Cache-Control', 'no-store')
  @Header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'")
  async verifyFromLink(@Query('token') token: string | undefined, @Res() res: Response): Promise<void> {
    try {
      if (!token || token.length > 256) throw new Error('missing token');
      await this.handler.execute(token);
      res.status(200).type('html').send(page('Adresse confirmée', 'Vous pouvez revenir dans l’app Pawrise.'));
    } catch (error) {
      const status = error instanceof AppError ? error.status : 400;
      res
        .status(status)
        .type('html')
        .send(page('Lien expiré ou déjà utilisé', 'Depuis l’app, demandez un nouveau lien dans Mon profil.'));
    }
  }

  /** Même vérification depuis l'app (lien universel), réponse JSON. */
  @Post('verify-email')
  @HttpCode(204)
  async verify(@Body() body: VerifyEmailDto): Promise<void> {
    await this.handler.execute(body.token);
  }

  @Post('resend-verification')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  @Throttle({ default: { limit: 3, ttl: 600_000 } })
  async resend(@CurrentUser() user: UserAccount): Promise<void> {
    if (!user.emailVerifiedAt) await this.emailTokens.sendVerification(user);
  }
}

function page(title: string, text: string): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Pawrise</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#F4F8FB;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#123044">
<main style="max-width:360px;padding:24px;text-align:center"><p style="font-size:40px;margin:0">🐾</p><h1 style="font-size:22px">${title}</h1><p style="color:#5A7082">${text}</p></main></body></html>`;
}
