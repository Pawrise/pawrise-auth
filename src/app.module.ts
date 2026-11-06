import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ENV, loadEnv, type Env } from './config/env';
import { ProblemDetailsFilter } from './common/problem-details.filter';
import { RequestContextMiddleware } from './common/request-context';
import { LoginController } from './features/auth/login/login.controller';
import { LoginAttempts } from './features/auth/login/login-attempts';
import { LoginHandler } from './features/auth/login/login.handler';
import { LogoutController } from './features/auth/logout/logout.controller';
import { PasswordResetController } from './features/auth/password-reset/password-reset.controller';
import { PasswordResetHandler } from './features/auth/password-reset/password-reset.handler';
import { RefreshController } from './features/auth/refresh/refresh.controller';
import { RegisterController } from './features/auth/register/register.controller';
import { RegisterHandler } from './features/auth/register/register.handler';
import { SocialSignInHandler } from './features/auth/social/social-sign-in.handler';
import { SocialController } from './features/auth/social/social.controller';
import { VerifyEmailController } from './features/auth/verify-email/verify-email.controller';
import { VerifyEmailHandler } from './features/auth/verify-email/verify-email.handler';
import { DeleteAccountController } from './features/me/delete-account/delete-account.controller';
import { PreferencesController } from './features/me/preferences/preferences.controller';
import { ProfileController } from './features/me/profile/profile.controller';
import { AuthGuard } from './features/shared/auth.guard';
import { EmailTokens } from './features/shared/email-tokens';
import { PasswordChecks } from './features/shared/password-checks';
import { Sessions } from './features/shared/sessions';
import { WellKnownController } from './features/well-known/well-known.controller';
import { BreachedPasswords } from './infra/breached-passwords';
import { AccessTokens } from './infra/jwt/access-tokens';
import { SigningKeys } from './infra/jwt/signing-keys';
import { Mailer, SmtpMailer } from './infra/mail/mailer';
import { PasswordHasher } from './infra/password-hasher';
import { PrismaService } from './infra/prisma.service';
import { IdentityProviders, PROVIDER_KEYS, remoteProviderKeys } from './infra/providers/identity-providers';

const env = loadEnv();

@Module({
  imports: [
    // Limite par IP, en mémoire : suffisant pour une instance (un VPS). Les routes sensibles ont leur propre limite.
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
      skipIf: () => env.NODE_ENV === 'test',
    }),
  ],
  controllers: [
    RegisterController,
    LoginController,
    RefreshController,
    LogoutController,
    SocialController,
    VerifyEmailController,
    PasswordResetController,
    ProfileController,
    PreferencesController,
    DeleteAccountController,
    WellKnownController,
  ],
  providers: [
    { provide: ENV, useValue: env },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: Mailer, useClass: SmtpMailer },
    { provide: PROVIDER_KEYS, useFactory: remoteProviderKeys },
    PrismaService,
    PasswordHasher,
    BreachedPasswords,
    SigningKeys,
    AccessTokens,
    IdentityProviders,
    Sessions,
    EmailTokens,
    PasswordChecks,
    AuthGuard,
    RegisterHandler,
    LoginHandler,
    LoginAttempts,
    SocialSignInHandler,
    VerifyEmailHandler,
    PasswordResetHandler,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*path');
  }
}

export type { Env };
