import { INestApplication, RequestMethod } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createValidationPipe } from './common/validation';
import { ENV, type Env } from './config/env';

/** Réglages communs au serveur et aux tests de bout en bout. */
export function configureApp(app: NestExpressApplication): INestApplication {
  const env = app.get<Env>(ENV);
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.useBodyParser('json', { limit: '16kb' });
  // Convention 7 : version dans l'URL ; la sonde et le JWKS restent à la racine.
  app.setGlobalPrefix('v1', {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: '.well-known/jwks.json', method: RequestMethod.GET },
    ],
  });
  app.useGlobalPipes(createValidationPipe());
  app.enableShutdownHooks();
  return app;
}
