import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../../../config/env';
import { AppError, Errors, ValidationError } from '../../../domain/errors';
import { fallbackNames, normalizeEmail } from '../../../domain/identity';
import { IdentityProviders, type ProviderIdentity } from '../../../infra/providers/identity-providers';
import { PrismaService } from '../../../infra/prisma.service';
import { Sessions } from '../../shared/sessions';
import type { AuthSessionDto } from '../../shared/user.dto';
import { isUniqueViolation } from '../register/register.handler';
import type { AppleSignInDto, GoogleSignInDto } from './social.dto';

export interface SocialSessionDto extends AuthSessionDto {
  /** Vrai si le compte vient d'être créé : l'app enchaîne sur la découverte (S21). */
  isNewUser: boolean;
}

/**
 * Connexion Apple / Google (ajout E2). Trois cas :
 * 1. identité déjà rattachée → connexion ;
 * 2. compte existant avec le même e-mail → rattachement. Si ce compte n'a jamais prouvé son adresse,
 *    son mot de passe est supprimé et ses sessions fermées : protège d'une pré-création malveillante
 *    (quelqu'un crée un compte avec l'e-mail de la victime avant elle et garderait l'accès) ;
 * 3. sinon → création du compte (sans mot de passe), avec le consentement aux CGU.
 */
@Injectable()
export class SocialSignInHandler {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly providers: IdentityProviders,
    private readonly sessions: Sessions,
  ) {}

  async apple(input: AppleSignInDto): Promise<SocialSessionDto> {
    this.assertTerms(input.acceptedTermsVersion);
    const identity = await this.providers.verifyApple(input.identityToken, input.nonce);
    return this.signIn(
      {
        ...identity,
        givenName: input.firstName ?? identity.givenName,
        familyName: input.lastName ?? identity.familyName,
      },
      input.acceptedTermsVersion,
    );
  }

  async google(input: GoogleSignInDto): Promise<SocialSessionDto> {
    this.assertTerms(input.acceptedTermsVersion);
    const identity = await this.providers.verifyGoogle(input.idToken, input.nonce);
    return this.signIn(identity, input.acceptedTermsVersion);
  }

  private assertTerms(version: string): void {
    if (version !== this.env.TERMS_VERSION) {
      throw ValidationError.field('acceptedTermsVersion', 'TERMS_NOT_ACCEPTED');
    }
  }

  private async signIn(identity: ProviderIdentity, termsVersion: string): Promise<SocialSessionDto> {
    const linked = await this.prisma.userIdentity.findUnique({
      where: { provider_subject: { provider: identity.provider, subject: identity.subject } },
      include: { user: true },
    });
    if (linked) return { ...(await this.sessions.open(linked.user)), isNewUser: false };

    // Sans adresse vérifiée par le fournisseur, on ne rattache ni ne crée rien.
    if (!identity.emailVerified) {
      throw new AppError(401, 'PROVIDER_EMAIL_NOT_VERIFIED', 'Provider email not verified');
    }
    const email = normalizeEmail(identity.email);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.userAccount.findFirst({ where: { email } });
        if (existing) {
          if (!existing.emailVerifiedAt) {
            await this.sessions.closeAll(existing.id, tx);
          }
          const user = await tx.userAccount.update({
            where: { id: existing.id },
            data: {
              emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
              passwordHash: existing.emailVerifiedAt ? existing.passwordHash : null,
              identities: {
                create: { provider: identity.provider, subject: identity.subject, email: identity.email },
              },
            },
          });
          return { ...(await this.sessions.open(user, tx)), isNewUser: false };
        }

        const names = fallbackNames(email, identity.givenName, identity.familyName);
        const user = await tx.userAccount.create({
          data: {
            email,
            passwordHash: null,
            ...names,
            emailVerifiedAt: new Date(),
            consents: { create: { type: 'terms_privacy', version: termsVersion } },
            identities: {
              create: { provider: identity.provider, subject: identity.subject, email: identity.email },
            },
          },
        });
        return { ...(await this.sessions.open(user, tx)), isNewUser: true };
      });
    } catch (error) {
      // Deux premières connexions simultanées : la seconde retrouve l'identité créée par la première.
      if (isUniqueViolation(error)) {
        const again = await this.prisma.userIdentity.findUnique({
          where: { provider_subject: { provider: identity.provider, subject: identity.subject } },
          include: { user: true },
        });
        if (again) return { ...(await this.sessions.open(again.user)), isNewUser: false };
        throw Errors.emailAlreadyUsed();
      }
      throw error;
    }
  }
}
