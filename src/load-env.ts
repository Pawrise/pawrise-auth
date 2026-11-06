import { existsSync } from 'node:fs';

// Développement : lit .env s'il existe (Node ≥ 22). En production, l'environnement vient du conteneur.
if (process.env.NODE_ENV !== 'production' && existsSync('.env')) {
  process.loadEnvFile('.env');
}
