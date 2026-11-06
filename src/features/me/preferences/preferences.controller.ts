import { Body, Controller, Get, Inject, Patch, UseGuards } from '@nestjs/common';
import type { UserAccount } from '@prisma/client';
import { IsBoolean } from 'class-validator';
import { ValidateIfPresent } from '../../../common/validators';
import { ENV, type Env } from '../../../config/env';
import { ValidationError } from '../../../domain/errors';
import { PrismaService } from '../../../infra/prisma.service';
import { AuthGuard, CurrentUser } from '../../shared/auth.guard';

export class UpdatePreferencesDto {
  @ValidateIfPresent()
  @IsBoolean({ context: { code: 'REQUIRED' } })
  deviceLocationSharing?: boolean;

  @ValidateIfPresent()
  @IsBoolean({ context: { code: 'REQUIRED' } })
  healthNotifications?: boolean;

  @ValidateIfPresent()
  @IsBoolean({ context: { code: 'REQUIRED' } })
  anonymizedDataSharing?: boolean;
}

export interface PreferencesDto {
  deviceLocationSharing: boolean;
  healthNotifications: boolean;
  anonymizedDataSharing: boolean;
}

/**
 * S17 Paramètres → Confidentialité (US-24, hypothèses D6). `anonymizedDataSharing` est un consentement RGPD
 * historisé dans `consent` (RG12, RG13) ; les deux autres sont des préférences du compte.
 */
@Controller('me/preferences')
@UseGuards(AuthGuard)
export class PreferencesController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  get(@CurrentUser() user: UserAccount): Promise<PreferencesDto> {
    return this.read(user.id);
  }

  @Patch()
  async update(
    @CurrentUser() user: UserAccount,
    @Body() body: UpdatePreferencesDto,
  ): Promise<PreferencesDto> {
    if (Object.values(body).every((v) => v === undefined)) throw new ValidationError([]);
    await this.prisma.$transaction(async (tx) => {
      if (body.deviceLocationSharing !== undefined || body.healthNotifications !== undefined) {
        await tx.userAccount.update({
          where: { id: user.id },
          data: {
            locationSharing: body.deviceLocationSharing,
            healthNotifications: body.healthNotifications,
          },
        });
      }
      if (body.anonymizedDataSharing === true) {
        const active = await tx.consent.findFirst({
          where: { userId: user.id, type: 'anonymized_data', revokedAt: null },
        });
        if (!active) {
          await tx.consent.create({
            data: {
              userId: user.id,
              type: 'anonymized_data',
              version: this.env.ANONYMIZED_DATA_POLICY_VERSION,
            },
          });
        }
      } else if (body.anonymizedDataSharing === false) {
        await tx.consent.updateMany({
          where: { userId: user.id, type: 'anonymized_data', revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    });
    return this.read(user.id);
  }

  private async read(userId: string): Promise<PreferencesDto> {
    const user = await this.prisma.userAccount.findUniqueOrThrow({
      where: { id: userId },
      include: { consents: { where: { type: 'anonymized_data', revokedAt: null }, take: 1 } },
    });
    return {
      deviceLocationSharing: user.locationSharing,
      healthNotifications: user.healthNotifications,
      anonymizedDataSharing: user.consents.length > 0,
    };
  }
}
