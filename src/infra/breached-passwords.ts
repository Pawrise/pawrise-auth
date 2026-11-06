import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ENV, type Env } from '../config/env';

/**
 * Have I Been Pwned, k-anonymity : seuls les 5 premiers caractères du SHA-1 sortent du serveur.
 * En cas de panne ou de lenteur (3 s), on laisse passer et on le journalise (fail-open, NIST 800-63B).
 */
@Injectable()
export class BreachedPasswords {
  private readonly logger = new Logger(BreachedPasswords.name);

  constructor(@Inject(ENV) private readonly env: Env) {}

  async isBreached(password: string): Promise<boolean> {
    if (!this.env.HIBP_ENABLED) return false;
    const sha1 = createHash('sha1').update(password.normalize('NFC')).digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    try {
      const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: { 'Add-Padding': 'true', 'User-Agent': 'pawrise-auth' },
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.text();
      return body.split('\n').some((line) => {
        const [hashSuffix, count] = line.trim().split(':');
        return hashSuffix === suffix && Number(count) > 0;
      });
    } catch (error) {
      this.logger.warn(`Vérification HIBP impossible, mot de passe accepté : ${String(error)}`);
      return false;
    }
  }
}
