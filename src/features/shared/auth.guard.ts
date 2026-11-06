import { CanActivate, ExecutionContext, Injectable, createParamDecorator } from '@nestjs/common';
import type { UserAccount } from '@prisma/client';
import type { Request } from 'express';
import { UnauthorizedError } from '../../domain/errors';
import { AccessTokens } from '../../infra/jwt/access-tokens';
import { PrismaService } from '../../infra/prisma.service';

type AuthedRequest = Request & { user?: UserAccount };

/**
 * Exige `Authorization: Bearer <jeton d'accès>`. Charge le compte et compare `ver` à `token_version` :
 * un mot de passe réinitialisé ou un compte supprimé invalide aussitôt les jetons déjà émis.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly accessTokens: AccessTokens,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const [scheme, token] = (req.header('authorization') ?? '').split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) throw new UnauthorizedError();

    const claims = await this.accessTokens.verify(token);
    const user = await this.prisma.userAccount.findUnique({ where: { id: claims.userId } });
    if (!user || user.tokenVersion !== claims.tokenVersion) throw new UnauthorizedError();
    req.user = user;
    return true;
  }
}

/** Compte de l'utilisateur connecté, chargé par `AuthGuard`. */
export const CurrentUser = createParamDecorator((_: unknown, context: ExecutionContext): UserAccount => {
  const user = context.switchToHttp().getRequest<AuthedRequest>().user;
  if (!user) throw new UnauthorizedError();
  return user;
});

/** Adresse IP du client (Express applique `trust proxy`). */
export const ClientIp = createParamDecorator(
  (_: unknown, context: ExecutionContext): string | undefined =>
    context.switchToHttp().getRequest<Request>().ip,
);
