import { IsEmail, IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { IsAcceptablePassword, Trim } from '../../../common/validators';

export class ForgotPasswordDto {
  @Trim()
  @IsString()
  @IsNotEmpty({ context: { code: 'REQUIRED' } })
  @MaxLength(255)
  @IsEmail({}, { context: { code: 'INVALID_EMAIL' } })
  email!: string;
}

export class ResetPasswordDto extends ForgotPasswordDto {
  @IsString()
  @IsNotEmpty({ context: { code: 'REQUIRED' } })
  @Matches(/^\d{6}$/, { context: { code: 'INVALID_CODE' } })
  code!: string;

  @IsString()
  @IsNotEmpty({ context: { code: 'REQUIRED' } })
  @IsAcceptablePassword()
  newPassword!: string;
}
