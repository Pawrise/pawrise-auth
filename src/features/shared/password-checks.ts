import { Injectable } from '@nestjs/common';
import { ValidationError } from '../../domain/errors';
import { checkPasswordLocally } from '../../domain/password-policy';
import { BreachedPasswords } from '../../infra/breached-passwords';

/** Politique complète d'un nouveau mot de passe : règles locales, puis fuites connues (HIBP). */
@Injectable()
export class PasswordChecks {
  constructor(private readonly breached: BreachedPasswords) {}

  async assertAcceptable(password: string, field: string, context: { email?: string } = {}): Promise<void> {
    const local = checkPasswordLocally(password, context);
    if (local) throw ValidationError.field(field, local);
    if (await this.breached.isBreached(password)) throw ValidationError.field(field, 'PASSWORD_BREACHED');
  }
}
