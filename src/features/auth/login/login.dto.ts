import { Trim } from '../../../common/validators';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** `LoginRequest` de openapi.yaml. */
export class LoginDto {
  @Trim()
  @IsString()
  @IsNotEmpty({ context: { code: 'REQUIRED' } })
  @MaxLength(255)
  @IsEmail({}, { context: { code: 'INVALID_EMAIL' } })
  email!: string;

  @IsString()
  @IsNotEmpty({ context: { code: 'REQUIRED' } })
  @MaxLength(128)
  password!: string;
}
