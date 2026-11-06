import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthSessionDto } from '../../shared/user.dto';
import { RegisterDto } from './register.dto';
import { RegisterHandler } from './register.handler';

@Controller('auth')
export class RegisterController {
  constructor(private readonly handler: RegisterHandler) {}

  @Post('register')
  @HttpCode(201)
  @Throttle({ default: { limit: 20, ttl: 3_600_000 } })
  register(@Body() body: RegisterDto): Promise<AuthSessionDto> {
    return this.handler.execute(body);
  }
}
