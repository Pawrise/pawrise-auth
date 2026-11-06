import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

declare module 'express-serve-static-core' {
  interface Request {
    requestId?: string;
  }
}

const VALID_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * `X-Request-Id` (convention 6) : repris de la requête s'il est valide, créé sinon, renvoyé dans la réponse
 * et écrit dans le journal. Le journal ne contient ni corps de requête, ni jeton, ni mot de passe.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header('x-request-id');
    req.requestId = incoming && VALID_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      if (process.env.NODE_ENV === 'test') return;
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      this.logger.log(`${req.method} ${req.path} ${res.statusCode} ${ms.toFixed(1)}ms [${req.requestId}]`);
    });
    next();
  }
}
