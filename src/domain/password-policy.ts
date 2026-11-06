import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** NIST SP 800-63B / OWASP ASVS 2.1 : longueur seule, pas de règles de composition, liste noire. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

let common: Set<string> | undefined;

function commonPasswords(): Set<string> {
  // Mots de passe de 8 caractères et plus parmi les 10 000 plus courants (SecLists), en minuscules.
  common ??= new Set(
    readFileSync(join(__dirname, 'data', 'common-passwords.txt'), 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean),
  );
  return common;
}

/** Longueur en caractères Unicode (un emoji compte pour un), comme le demande le NIST. */
export function passwordLength(password: string): number {
  return [...password.normalize('NFC')].length;
}

/**
 * Règles locales, de la moins coûteuse à la plus coûteuse. La vérification des fuites (HIBP) vient ensuite,
 * côté infrastructure. Renvoie le code d'erreur du champ `password`, ou null si le mot de passe convient.
 */
export function checkPasswordLocally(password: string, context: { email?: string } = {}): string | null {
  const length = passwordLength(password);
  if (length < PASSWORD_MIN_LENGTH) return 'PASSWORD_TOO_SHORT';
  if (length > PASSWORD_MAX_LENGTH) return 'PASSWORD_TOO_LONG';
  const lowered = password.toLowerCase();
  if (commonPasswords().has(lowered)) return 'PASSWORD_TOO_COMMON';
  const local = context.email?.split('@')[0]?.toLowerCase();
  if (local && local.length >= 4 && lowered === local) return 'PASSWORD_TOO_COMMON';
  return null;
}
