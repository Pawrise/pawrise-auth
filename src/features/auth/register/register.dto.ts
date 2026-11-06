import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { IsAcceptablePassword, ValidateIfNotNull, Trim } from '../../../common/validators';
import { E164 } from '../../../domain/identity';

/** `RegisterRequest` de openapi.yaml. */
export class RegisterDto {
  @IsString()
  @IsNotEmpty({ context: { code: 'REQUIRED' } })
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @IsNotEmpty({ context: { code: 'REQUIRED' } })
  @MaxLength(100)
  lastName!: string;

  @Trim()
  @IsString()
  @IsNotEmpty({ context: { code: 'REQUIRED' } })
  @MaxLength(255)
  @IsEmail({}, { context: { code: 'INVALID_EMAIL' } })
  email!: string;

  @IsOptional()
  @ValidateIfNotNull()
  @IsString()
  @Matches(E164, { context: { code: 'INVALID_PHONE' } })
  phoneNumber?: string | null;

  @IsString()
  @IsNotEmpty({ context: { code: 'REQUIRED' } })
  @IsAcceptablePassword()
  password!: string;

  @IsString()
  @IsNotEmpty({ context: { code: 'TERMS_NOT_ACCEPTED' } })
  @MaxLength(20)
  acceptedTermsVersion!: string;
}
