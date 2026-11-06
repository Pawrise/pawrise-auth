import { Controller, Get, Header } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../../infra/prisma.service';
import { SigningKeys } from '../../infra/jwt/signing-keys';

@Controller()
@SkipThrottle()
export class WellKnownController {
  constructor(
    private readonly keys: SigningKeys,
    private readonly prisma: PrismaService,
  ) {}

  /** Clés publiques des jetons d'accès : l'API-CORE et la passerelle vérifient les JWT avec. */
  @Get('.well-known/jwks.json')
  @Header('Cache-Control', 'public, max-age=900')
  jwks() {
    return this.keys.jwks();
  }

  /** Sonde de santé (Traefik, Docker) : vérifie aussi l'accès à la base. */
  @Get('health')
  async health(): Promise<{ status: 'ok' }> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}
