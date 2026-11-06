import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ForgotPasswordDto, ResetPasswordDto } from './password-reset.dto';
import { PasswordResetHandler } from './password-reset.handler';

@Controller('auth')
export class PasswordResetController {
  constructor(private readonly handler: PasswordResetHandler) {}

  @Post('forgot-password')
  @HttpCode(202)
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  async forgot(@Body() body: ForgotPasswordDto): Promise<void> {
    await this.handler.request(body.email);
  }

  @Post('reset-password')
  @HttpCode(204)
  @Throttle({ default: { limit: 20, ttl: 3_600_000 } })
  async reset(@Body() body: ResetPasswordDto): Promise<void> {
    await this.handler.reset(body.email, body.code, body.newPassword);
  }
}
