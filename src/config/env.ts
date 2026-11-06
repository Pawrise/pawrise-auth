import { z } from 'zod';

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const list = z.string().transform((v) =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

/** Variables d'environnement, validées au démarrage : le service refuse de démarrer si l'une manque. */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(8200),
  DATABASE_URL: z.string().min(1),

  /** URL publique du service, utilisée dans les liens envoyés par e-mail. */
  PUBLIC_BASE_URL: z.url().default('http://localhost:8200'),

  JWT_ISSUER: z.string().default('https://auth.pawrise.fr'),
  JWT_AUDIENCE: z.string().default('pawrise-api'),
  /** Clé privée RSA (PEM, PKCS#8). Absente hors production : une clé de dev est créée dans .keys/. */
  JWT_PRIVATE_KEY: z.string().optional(),
  JWT_KEY_ID: z.string().optional(),
  /** Clé publique précédente (PEM), encore publiée dans le JWKS pendant une rotation. */
  JWT_PREVIOUS_PUBLIC_KEY: z.string().optional(),
  JWT_PREVIOUS_KEY_ID: z.string().optional(),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  /** Secret des HMAC des liens et codes envoyés par e-mail (32 octets minimum). */
  EMAIL_TOKEN_SECRET: z.string().min(32),

  /** Version des CGU en vigueur : l'inscription doit envoyer exactement celle-ci (RG11). */
  TERMS_VERSION: z.string().max(20).default('2026-10'),
  /** Version de la politique de partage des données anonymisées (consentement `anonymized_data`). */
  ANONYMIZED_DATA_POLICY_VERSION: z.string().max(20).default('2026-10'),

  SMTP_URL: z.string().default('smtp://localhost:1125'),
  MAIL_FROM: z.string().default('Pawrise <no-reply@pawrise.fr>'),

  HIBP_ENABLED: bool.default(true),

  APPLE_AUDIENCES: list.default(['fr.pawrise.app']),
  GOOGLE_CLIENT_IDS: list.default([]),

  LOGIN_MAX_FAILURES: z.coerce.number().int().positive().default(5),
  LOGIN_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),

  /** Derrière Traefik / Cloudflare : nombre de proxys de confiance pour lire l'IP du client. */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
    throw new Error(`Configuration invalide :\n  ${details}`);
  }
  if (parsed.data.NODE_ENV === 'production' && !parsed.data.JWT_PRIVATE_KEY) {
    throw new Error('Configuration invalide : JWT_PRIVATE_KEY est obligatoire en production.');
  }
  return parsed.data;
}

export const ENV = Symbol('ENV');
