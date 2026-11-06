import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ValidateIfNotNull, ValidateIfPresent, Trim } from '../../../common/validators';
import { E164 } from '../../../domain/identity';

/** `UpdateMeRequest` : champ absent = inchangé ; `null` interdit sauf pour `phoneNumber` (convention 9). */
export class UpdateMeDto {
  @ValidateIfPresent()
  @IsNotEmpty({ context: { code: 'REQUIRED' } })
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ValidateIfPresent()
  @IsNotEmpty({ context: { code: 'REQUIRED' } })
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @Trim()
  @ValidateIfPresent()
  @IsNotEmpty({ context: { code: 'REQUIRED' } })
  @IsString()
  @MaxLength(255)
  @IsEmail({}, { context: { code: 'INVALID_EMAIL' } })
  email?: string;

  @IsOptional()
  @ValidateIfNotNull()
  @IsString()
  @Matches(E164, { context: { code: 'INVALID_PHONE' } })
  phoneNumber?: string | null;
}
