import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ClientIp } from '../../shared/auth.guard';
import type { AuthSessionDto } from '../../shared/user.dto';
import { LoginDto } from './login.dto';
import { LoginHandler } from './login.handler';

@Controller('auth')
export class LoginController {
  constructor(private readonly handler: LoginHandler) {}

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 900_000 } }) // bourrage d'identifiants depuis une même IP
  login(@Body() body: LoginDto, @ClientIp() ip: string | undefined): Promise<AuthSessionDto> {
    return this.handler.execute(body, ip);
  }
}
