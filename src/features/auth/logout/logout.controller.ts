import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import type { UserAccount } from '@prisma/client';
import { AuthGuard, CurrentUser } from '../../shared/auth.guard';
import { Sessions } from '../../shared/sessions';
import { RefreshDto } from '../refresh/refresh.controller';

/** S17 Paramètres → Se déconnecter (US-26) : ferme la session de cet appareil, idempotent. */
@Controller('auth')
export class LogoutController {
  constructor(private readonly sessions: Sessions) {}

  @Post('logout')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async logout(@CurrentUser() user: UserAccount, @Body() body: RefreshDto): Promise<void> {
    await this.sessions.close(user.id, body.refreshToken);
  }
}
