import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Sessions } from '../../shared/sessions';
import type { AuthTokensDto } from '../../shared/user.dto';

/** `RefreshRequest` de openapi.yaml (aussi utilisé par la déconnexion). */
export class RefreshDto {
  @IsString()
  @IsNotEmpty({ context: { code: 'REQUIRED' } })
  @MaxLength(512)
  refreshToken!: string;
}

/** Aucun écran : l'app échange son jeton de rafraîchissement quand le jeton d'accès expire. */
@Controller('auth')
export class RefreshController {
  constructor(private readonly sessions: Sessions) {}

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() body: RefreshDto): Promise<AuthTokensDto> {
    return this.sessions.rotate(body.refreshToken);
  }
}
