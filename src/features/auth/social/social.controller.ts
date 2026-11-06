import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AppleSignInDto, GoogleSignInDto } from './social.dto';
import { SocialSignInHandler, type SocialSessionDto } from './social-sign-in.handler';

@Controller('auth')
@Throttle({ default: { limit: 30, ttl: 900_000 } })
export class SocialController {
  constructor(private readonly handler: SocialSignInHandler) {}

  @Post('apple')
  @HttpCode(200)
  apple(@Body() body: AppleSignInDto): Promise<SocialSessionDto> {
    return this.handler.apple(body);
  }

  @Post('google')
  @HttpCode(200)
  google(@Body() body: GoogleSignInDto): Promise<SocialSessionDto> {
    return this.handler.google(body);
  }
}
