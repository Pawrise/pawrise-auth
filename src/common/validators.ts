import { Transform } from 'class-transformer';
import { registerDecorator, ValidateIf, type ValidationOptions } from 'class-validator';
import { checkPasswordLocally } from '../domain/password-policy';

/** Règles locales du mot de passe (longueur, liste noire) ; le message de la contrainte est le code d'erreur. */
export function IsAcceptablePassword(options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    let lastCode = 'INVALID';
    registerDecorator({
      name: 'pawrisePassword',
      target: target.constructor,
      propertyName: String(propertyName),
      options,
      validator: {
        validate(value: unknown, args) {
          if (typeof value !== 'string') return true; // IsString signale le type
          const email = (args?.object as { email?: unknown } | undefined)?.email;
          const code = checkPasswordLocally(value, { email: typeof email === 'string' ? email : undefined });
          if (code) lastCode = code;
          return code === null;
        },
        defaultMessage: () => lastCode,
      },
    });
  };
}

/**
 * Champ facultatif d'un PATCH qui ne peut pas valoir `null` (convention 9) :
 * absent → ignoré ; présent (même `null`) → validé, donc `null` donne REQUIRED.
 */
export function ValidateIfPresent(): PropertyDecorator {
  return ValidateIf((object: object, value: unknown) => value !== undefined);
}

/** Champ facultatif qui accepte `null` (effacement) : validé seulement s'il a une valeur. */
export function ValidateIfNotNull(): PropertyDecorator {
  return ValidateIf((_object: object, value: unknown) => value !== undefined && value !== null);
}

/** Retire les espaces autour d'une chaîne avant validation (e-mail collé avec un espace…). */
export function Trim(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));
}
