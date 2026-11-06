import { Controller, Delete, HttpCode, UseGuards } from '@nestjs/common';
import type { UserAccount } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma.service';
import { AuthGuard, CurrentUser } from '../../shared/auth.guard';

/**
 * S25 Détruire le compte (US-35, US-36). Supprime le compte et, en cascade, ses sessions, consentements,
 * identités Apple / Google et liens en attente. Les jetons d'accès déjà émis échouent ensuite (compte absent).
 * La règle `CHIEF_TRANSFER_REQUIRED` et le sort des chiens relèvent de l'API-CORE (écart E7).
 */
@Controller('me')
@UseGuards(AuthGuard)
export class DeleteAccountController {
  constructor(private readonly prisma: PrismaService) {}

  @Delete()
  @HttpCode(204)
  async delete(@CurrentUser() user: UserAccount): Promise<void> {
    await this.prisma.userAccount.delete({ where: { id: user.id } });
  }
}
