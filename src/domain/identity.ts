/** RG10 : l'e-mail est comparé sans tenir compte de la casse ; on le stocke en minuscules, sans espaces. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Format E.164 : `+` puis 8 à 15 chiffres, sans espace (ex. +33612345678). */
export const E164 = /^\+[1-9]\d{7,14}$/;

/**
 * Nom à défaut quand Apple ou Google ne le fournissent pas (Apple ne le donne qu'à la première connexion) :
 * la partie locale de l'e-mail sert de prénom, l'utilisateur le corrige ensuite dans Mon profil.
 */
export function fallbackNames(email: string, given?: string | null, family?: string | null) {
  const firstName = given?.trim() || email.split('@')[0] || 'Pawrise';
  return { firstName: firstName.slice(0, 100), lastName: (family?.trim() ?? '').slice(0, 100) };
}
