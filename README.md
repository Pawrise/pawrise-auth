# pawrise-auth

Service d'authentification de Pawrise Care, en **NestJS** avec sa propre base PostgreSQL.

- **Contrat** : tag `Compte` de [pawrise-doc `openapi.yaml`](https://github.com/AadiDevv/pawrise-doc/blob/main/contrat-interface/openapi.yaml), plus les conventions de `conventions.md` (camelCase, Problem Details avec `code`, `/v1`, `X-Request-Id`).
- **Ajouts et différences** : [`ECARTS.md`](ECARTS.md) (Apple / Google, vérification d'e-mail, mot de passe oublié, base séparée).

## Routes

| Route | Rôle |
|---|---|
| `POST /v1/auth/register` | Inscription + CGU (RG11) → session |
| `POST /v1/auth/login` | Connexion (429 après 5 échecs en 15 min) |
| `POST /v1/auth/apple`, `/google` | Connexion Apple / Google |
| `POST /v1/auth/refresh` | Nouvelle paire de jetons (rotation, détection de vol) |
| `POST /v1/auth/logout` | Ferme la session de cet appareil |
| `GET`/`POST /v1/auth/verify-email`, `POST /v1/auth/resend-verification` | Vérification de l'adresse |
| `POST /v1/auth/forgot-password`, `/reset-password` | Mot de passe oublié (code à 6 chiffres) |
| `GET`/`PATCH`/`DELETE /v1/me` | Mon profil, suppression du compte |
| `GET`/`PATCH /v1/me/preferences` | Les 3 interrupteurs de confidentialité |
| `GET /.well-known/jwks.json` | Clés publiques des jetons d'accès |
| `GET /health` | Sonde |

## Lancer en local

Prérequis : Node 22+, Docker.

```sh
cp .env.example .env
npm install
npm run db:up        # Postgres (localhost:54330) + Mailpit (http://localhost:8125)
npm run db:migrate
npm run dev          # http://localhost:8200
```

Les e-mails (lien de vérification, code de réinitialisation) arrivent dans **Mailpit : http://localhost:8125**.

Essai rapide :

```sh
curl -s localhost:8200/v1/auth/register -H 'content-type: application/json' -d '{
  "firstName": "Camille", "lastName": "Martin", "email": "camille@example.com",
  "password": "chien-oslo-2026", "acceptedTermsVersion": "2026-10" }'
```

L'app iOS l'utilise en mettant `PAWRISE_AUTH_MODE = remote` dans `ios/Config/Local.xcconfig` (voir pawrise-mobile).

## Tests

```sh
npm test            # unitaires (règles de mot de passe, identité)
npm run test:e2e    # bout en bout sur la base pawrise_auth_test (créée par docker compose)
npm run lint && npm run typecheck
```

Les tests de bout en bout couvrent chaque route : codes d'erreur, verrouillage, rotation et vol de jeton de rafraîchissement, Apple / Google avec de faux fournisseurs (nonce, audience, pré-création malveillante), liens et codes par e-mail, consentements.

## Architecture

```
src/
  domain/      Règles pures : politique de mot de passe, e-mail, jetons, erreurs typées
  infra/       Prisma, Argon2id, HIBP, JWT RS256 + JWKS, SMTP, vérification Apple / Google
  features/    Un dossier par cas d'usage (contrôleur + handler + DTO)
    auth/      register, login, refresh, logout, social, verify-email, password-reset
    me/        profile, preferences, delete-account
    shared/    sessions, garde d'authentification, liens par e-mail
  common/      Filtre Problem Details, validation → VALIDATION_FAILED, X-Request-Id
prisma/
  migrations/  SQL : seule source du schéma (base d'abord)
  schema.prisma  Modèle camelCase ↔ colonnes snake_case (@map)
```

## Sécurité

| Sujet | Choix | Référence |
|---|---|---|
| Mots de passe | Argon2id m = 19 MiB, t = 2, p = 1 ; 8 à 128 caractères, sans règle de composition ; liste des 10 000 plus courants ; fuites via HIBP (k-anonymity, fail-open) | OWASP Password Storage, NIST 800-63B, ASVS 2.1 |
| Énumération des comptes | Même 401 et même temps de calcul (hash factice) pour e-mail inconnu ou mauvais mot de passe ; mot de passe oublié toujours 202 | ASVS 2.2, 2.5 |
| Jeton d'accès | JWT RS256, `typ: at+jwt`, 15 min, `iss`/`aud`/`sub`/`role`/`ver`/`jti`, aucune donnée personnelle ; algorithme fixé au vérificateur | RFC 9068 |
| Jeton de rafraîchissement | Opaque 256 bits (`prt_…`), SHA-256 en base, usage unique, rotation ; un jeton réutilisé révoque toute la session | RFC 9700 §4.14.2, D15 / RG77–79 |
| Révocation globale | `token_version` vérifié à chaque requête authentifiée | — |
| Apple / Google | Signature JWKS, `iss`, `aud` (liste de clients), âge ≤ 10 min, nonce Apple, `email_verified` ; rattachement sûr d'un compte non vérifié | Guidelines Apple / Google |
| Liens et codes par e-mail | HMAC-SHA-256 avec secret serveur, usage unique, 24 h / 15 min, 5 essais | ASVS 2.5 |
| Limites | Par e-mail (verrouillage en base) et par IP (`@nestjs/throttler`, en mémoire : une instance) | ASVS 2.2.1 |
| RGPD | CGU et partage anonymisé dans `consent`, historisés (RG11–RG14) ; suppression en cascade | RGPD art. 7, 17 |

## Déploiement

`docker build -t pawrise-auth .` : l'image applique les migrations au démarrage puis lance le service sur le port 8200. En production : `JWT_PRIVATE_KEY` (PEM PKCS#8), `EMAIL_TOKEN_SECRET`, `DATABASE_URL`, `SMTP_URL`, `GOOGLE_CLIENT_IDS` sont obligatoires ; `TRUST_PROXY_HOPS` à régler derrière Traefik / Cloudflare.
