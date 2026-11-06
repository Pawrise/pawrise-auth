import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

class SocialBase {
  /** En touchant « Continuer avec Apple / Google », l'utilisateur accepte les CGU affichées sous le bouton (RG11). */
  @IsString()
  @IsNotEmpty({ context: { code: 'TERMS_NOT_ACCEPTED' } })
  @MaxLength(20)
  acceptedTermsVersion!: string;
}

/** `POST /v1/auth/apple` (ajout E2). */
export class AppleSignInDto extends SocialBase {
  @IsString()
  @IsNotEmpty({ context: { code: 'REQUIRED' } })
  @MaxLength(4096)
  identityToken!: string;

  /** Nonce brut ; l'app a envoyé son SHA-256 à Apple. */
  @IsString()
  @IsNotEmpty({ context: { code: 'REQUIRED' } })
  @MaxLength(128)
  nonce!: string;

  /** Apple ne transmet le nom qu'à la toute première autorisation, côté app : elle le recopie ici. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;
}

/** `POST /v1/auth/google` (ajout E2). */
export class GoogleSignInDto extends SocialBase {
  @IsString()
  @IsNotEmpty({ context: { code: 'REQUIRED' } })
  @MaxLength(4096)
  idToken!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  nonce?: string;
}
