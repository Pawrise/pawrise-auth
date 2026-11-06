// Crée le compte de démo utilisé par l'app iOS (Nala) : demo@pawrise.fr / pawrise2026.
// Usage : npm run db:seed (idempotent). Jamais en production.
import { existsSync } from 'node:fs';
import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

if (existsSync('.env')) process.loadEnvFile('.env');
if (process.env.NODE_ENV === 'production') throw new Error('Pas de compte de démo en production.');

const prisma = new PrismaClient();
const email = 'demo@pawrise.fr';
const passwordHash = await argon2.hash('pawrise2026', { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });

const existing = await prisma.userAccount.findFirst({ where: { email } });
if (existing) {
  await prisma.userAccount.update({ where: { id: existing.id }, data: { passwordHash, emailVerifiedAt: new Date() } });
  console.log(`Compte de démo mis à jour : ${email}`);
} else {
  await prisma.userAccount.create({
    data: {
      email,
      passwordHash,
      firstName: 'Alex',
      lastName: 'Martin',
      emailVerifiedAt: new Date(),
      consents: { create: { type: 'terms_privacy', version: process.env.TERMS_VERSION ?? '2026-10' } },
    },
  });
  console.log(`Compte de démo créé : ${email} / pawrise2026`);
}
await prisma.loginAttempt.deleteMany({ where: { email } });
await prisma.$disconnect();
