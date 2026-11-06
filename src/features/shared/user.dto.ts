import type { UserAccount } from '@prisma/client';

/**
 * Schéma `User` de openapi.yaml, plus `emailVerified` (ajout E6, non cassant : convention 7).
 * Tous les champs sont présents, `null` quand vide (convention 9).
 */
export interface UserDto {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string | null;
  registeredAt: string;
  emailVerified: boolean;
}

export function toUserDto(user: UserAccount): UserDto {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phoneNumber: user.phoneNumber,
    registeredAt: user.registeredAt.toISOString(),
    emailVerified: user.emailVerifiedAt !== null,
  };
}

export interface AuthTokensDto {
  accessToken: string;
  refreshToken: string;
}

export interface AuthSessionDto extends AuthTokensDto {
  user: UserDto;
}
