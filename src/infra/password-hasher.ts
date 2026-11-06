import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';

/**
 * Argon2id, paramètres de l'OWASP Password Storage Cheat Sheet (m = 19 MiB, t = 2, p = 1).
 * argon2 calcule dans le pool de threads de libuv : la boucle d'événements n'est pas bloquée.
 */
@Injectable()
export class PasswordHasher {
  private static readonly OPTIONS = {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  } as const;

  /** Hash calculé une fois : vérifié quand l'e-mail est inconnu, pour un temps de réponse identique. */
  private dummyHash?: Promise<string>;

  hash(password: string): Promise<string> {
    return argon2.hash(password.normalize('NFC'), PasswordHasher.OPTIONS);
  }

  async verify(hash: string | null | undefined, password: string): Promise<boolean> {
    if (!hash) {
      this.dummyHash ??= this.hash('pawrise-dummy-password-for-timing');
      await argon2.verify(await this.dummyHash, password.normalize('NFC')).catch(() => false);
      return false;
    }
    try {
      return await argon2.verify(hash, password.normalize('NFC'));
    } catch {
      return false;
    }
  }

  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, PasswordHasher.OPTIONS);
  }
}
