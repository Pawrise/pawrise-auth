import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { AppError, FieldError, ValidationError } from '../domain/errors';

interface Problem {
  status: number;
  code: string;
  title: string;
  detail?: string;
  errors?: FieldError[];
}

const HTTP_CODES: Record<number, [string, string]> = {
  400: ['BAD_REQUEST', 'Bad request'],
  401: ['UNAUTHORIZED', 'Unauthorized'],
  403: ['FORBIDDEN', 'Forbidden'],
  404: ['NOT_FOUND', 'Not found'],
  405: ['METHOD_NOT_ALLOWED', 'Method not allowed'],
  413: ['PAYLOAD_TOO_LARGE', 'Payload too large'],
  415: ['UNSUPPORTED_MEDIA_TYPE', 'Unsupported media type'],
  429: ['TOO_MANY_ATTEMPTS', 'Too many attempts'],
};

/**
 * Convertit toute erreur au format Problem Details (RFC 9457) avec un `code` stable (convention 4).
 * Une erreur inattendue devient un 500 neutre : rien d'interne ne sort dans la réponse.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const { problem, headers } = this.toProblem(exception, req);

    if (problem.status >= 500) {
      this.logger.error(
        `${req.method} ${req.path} → ${problem.status} [${req.requestId ?? '-'}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }
    for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
    res.status(problem.status).type('application/problem+json').send(JSON.stringify(problem));
  }

  private toProblem(
    exception: unknown,
    _req: Request,
  ): { problem: Problem; headers: Record<string, string> } {
    if (exception instanceof ValidationError) {
      return {
        problem: { status: 400, code: exception.code, title: exception.title, errors: exception.errors },
        headers: {},
      };
    }
    if (exception instanceof AppError) {
      const problem: Problem = { status: exception.status, code: exception.code, title: exception.title };
      if (exception.detail) problem.detail = exception.detail;
      return { problem, headers: exception.headers };
    }
    if (exception instanceof ThrottlerException) {
      return { problem: { status: 429, code: 'TOO_MANY_ATTEMPTS', title: 'Too many attempts' }, headers: {} };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      // Nest transforme l'erreur de lecture du corps (SyntaxError) en BadRequestException.
      if (status === 400 && /JSON/i.test(exception.message)) {
        return {
          problem: { status: 400, code: 'MALFORMED_JSON', title: 'Request body is not valid JSON' },
          headers: {},
        };
      }
      const [code, title] = HTTP_CODES[status] ?? ['HTTP_ERROR', HttpStatus[status] ?? 'Error'];
      return { problem: { status, code, title }, headers: {} };
    }
    if (isBodyParserError(exception)) {
      if (exception.status === 413) {
        return {
          problem: { status: 413, code: 'PAYLOAD_TOO_LARGE', title: 'Payload too large' },
          headers: {},
        };
      }
      return {
        problem: { status: 400, code: 'MALFORMED_JSON', title: 'Request body is not valid JSON' },
        headers: {},
      };
    }
    // Filet de sécurité : la base refuse un doublon que le domaine n'a pas vu (course entre deux requêtes).
    if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2002') {
      return { problem: { status: 409, code: 'CONFLICT', title: 'Conflict' }, headers: {} };
    }
    return {
      problem: { status: 500, code: 'INTERNAL_ERROR', title: 'Internal server error' },
      headers: {},
    };
  }
}

function isBodyParserError(e: unknown): e is { status: number; type: string } {
  return (
    typeof e === 'object' &&
    e !== null &&
    'type' in e &&
    typeof (e as { type: unknown }).type === 'string' &&
    'status' in e
  );
}
