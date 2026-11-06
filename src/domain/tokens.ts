import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** Jeton opaque de 256 bits, préfixé pour être reconnaissable dans un scanner de secrets. */
export function generateOpaqueToken(prefix: string): string {
  return `${prefix}_${randomBytes(32).toString('base64url')}`;
}

/** Code à 6 chiffres saisi dans l'app (mot de passe oublié). */
export function generateNumericCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** Jetons de rafraîchissement : 256 bits aléatoires, un SHA-256 suffit (RG77). */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Liens et codes envoyés par e-mail : HMAC avec un secret serveur. Un code à 6 chiffres a peu d'entropie ;
 * sans le secret, une fuite de la base ne permet pas de le retrouver par force brute.
 */
export function hmac(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
