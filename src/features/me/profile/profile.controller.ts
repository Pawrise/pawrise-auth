import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import type { UserAccount } from '@prisma/client';
import { Errors, ValidationError } from '../../../domain/errors';
import { normalizeEmail } from '../../../domain/identity';
import { PrismaService } from '../../../infra/prisma.service';
import { isUniqueViolation } from '../../auth/register/register.handler';
import { AuthGuard, CurrentUser } from '../../shared/auth.guard';
import { EmailTokens } from '../../shared/email-tokens';
import { toUserDto, type UserDto } from '../../shared/user.dto';
import { UpdateMeDto } from './update-me.dto';

/** S17 Paramètres → Mon profil (US-22). */
@Controller('me')
@UseGuards(AuthGuard)
export class ProfileController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailTokens: EmailTokens,
  ) {}

  @Get()
  get(@CurrentUser() user: UserAccount): UserDto {
    return toUserDto(user);
  }

  /** Changement d'e-mail accepté tout de suite ; l'adresse repasse « non vérifiée » et un lien est envoyé. */
  @Patch()
  async update(@CurrentUser() user: UserAccount, @Body() body: UpdateMeDto): Promise<UserDto> {
    if (Object.values(body).every((v) => v === undefined)) throw new ValidationError([]); // minProperties: 1
    const email = body.email === undefined ? undefined : normalizeEmail(body.email);
    const emailChanged = email !== undefined && email !== user.email;

    if (emailChanged) {
      const taken = await this.prisma.$queryRaw<{ n: number }[]>`
        SELECT 1 AS n FROM user_account WHERE lower(email) = ${email} AND id_user <> ${user.id}::uuid LIMIT 1`;
      if (taken.length > 0) throw Errors.emailAlreadyUsed();
    }

    const updated = await this.prisma.userAccount
      .update({
        where: { id: user.id },
        data: {
          firstName: body.firstName?.trim(),
          lastName: body.lastName?.trim(),
          phoneNumber: body.phoneNumber,
          ...(emailChanged ? { email, emailVerifiedAt: null } : {}),
        },
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) throw Errors.emailAlreadyUsed();
        throw error;
      });

    if (emailChanged) await this.emailTokens.sendVerification(updated);
    return toUserDto(updated);
  }
}
