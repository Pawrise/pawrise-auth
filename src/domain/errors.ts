/**
 * Erreurs métier typées (convention 4 de pawrise-doc) : chacune porte son statut HTTP et un `code` stable,
 * en MAJUSCULES_SNAKE, que l'app lit pour afficher son propre message. Le domaine ne dépend pas de NestJS :
 * c'est `ProblemDetailsFilter` qui convertit ces erreurs en `application/problem+json`.
 */
export interface FieldError {
  field: string;
  code: string;
}

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly title: string,
    readonly detail?: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(detail ?? title);
  }
}

export class ValidationError extends AppError {
  constructor(readonly errors: FieldError[]) {
    super(400, 'VALIDATION_FAILED', 'Validation failed');
  }

  static field(field: string, code: string): ValidationError {
    return new ValidationError([{ field, code }]);
  }
}

export class UnauthorizedError extends AppError {
  constructor(code = 'UNAUTHORIZED', title = 'Unauthorized') {
    super(401, code, title);
  }
}

export class NotFoundError extends AppError {
  constructor(code = 'NOT_FOUND', title = 'Not found') {
    super(404, code, title);
  }
}

export class ConflictError extends AppError {
  constructor(code: string, title: string, detail?: string) {
    super(409, code, title, detail);
  }
}

export class TooManyAttemptsError extends AppError {
  constructor(retryAfterSeconds: number) {
    super(429, 'TOO_MANY_ATTEMPTS', 'Too many attempts', undefined, {
      'Retry-After': String(Math.max(1, Math.ceil(retryAfterSeconds))),
    });
  }
}

export const Errors = {
  emailAlreadyUsed: () => new ConflictError('EMAIL_ALREADY_USED', 'Email already used'),
  invalidCredentials: () => new UnauthorizedError('INVALID_CREDENTIALS', 'Invalid credentials'),
  invalidRefreshToken: () => new UnauthorizedError('INVALID_REFRESH_TOKEN', 'Invalid refresh token'),
  invalidProviderToken: () => new UnauthorizedError('INVALID_PROVIDER_TOKEN', 'Invalid provider token'),
  providerNotConfigured: () =>
    new AppError(503, 'PROVIDER_NOT_CONFIGURED', 'Sign-in provider not configured on this server'),
  invalidOrExpiredToken: () => new AppError(400, 'INVALID_OR_EXPIRED_TOKEN', 'Invalid or expired token'),
} as const;
