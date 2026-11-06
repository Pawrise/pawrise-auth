import './load-env';
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { ENV, type Env } from './config/env';

async function main(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  configureApp(app);
  const env = app.get<Env>(ENV);
  await app.listen(env.PORT, '0.0.0.0');
  new Logger('pawrise-auth').log(`Prêt sur http://localhost:${env.PORT} (${env.NODE_ENV})`);
}

void main();
