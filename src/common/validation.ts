import { ValidationPipe, type ValidationError as ClassValidatorError } from '@nestjs/common';
import { FieldError, ValidationError } from '../domain/errors';

/** Code par défaut de chaque contrainte class-validator, quand le DTO n'en précise pas (`context.code`). */
const DEFAULT_CODES: Record<string, string> = {
  isDefined: 'REQUIRED',
  isNotEmpty: 'REQUIRED',
  whitelistValidation: 'UNKNOWN_FIELD',
  isEmail: 'INVALID_EMAIL',
  isString: 'INVALID_TYPE',
  isBoolean: 'INVALID_TYPE',
  maxLength: 'TOO_LONG',
  minLength: 'TOO_SHORT',
  matches: 'INVALID_FORMAT',
};

/** Ordre de priorité : on signale d'abord qu'un champ manque avant de dire qu'il est mal formé. */
const PRIORITY = ['whitelistValidation', 'isDefined', 'isNotEmpty', 'isString', 'isBoolean'];

function flatten(errors: ClassValidatorError[], parent = ''): FieldError[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own: FieldError[] = [];
    if (error.constraints) {
      const names = Object.keys(error.constraints).sort((a, b) => rank(a) - rank(b));
      const first = names[0];
      const contextCode = (error.contexts?.[first] as { code?: string } | undefined)?.code;
      // Contraintes maison (`pawrise*`) : leur message est directement le code d'erreur.
      const ownCode = first.startsWith('pawrise') ? error.constraints[first] : undefined;
      own.push({ field, code: contextCode ?? ownCode ?? DEFAULT_CODES[first] ?? 'INVALID' });
    }
    return [...own, ...flatten(error.children ?? [], field)];
  });
}

function rank(name: string): number {
  const index = PRIORITY.indexOf(name);
  return index === -1 ? PRIORITY.length : index;
}

/** Validation des corps de requête : `VALIDATION_FAILED` + `errors[{ field, code }]` (convention 4). */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true, // additionalProperties: false dans openapi.yaml
    transform: true,
    validateCustomDecorators: false,
    exceptionFactory: (errors) => new ValidationError(flatten(errors)),
  });
}
