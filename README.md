# pawrise-auth

Service d'authentification de Pawrise Care. Il gère les comptes (e-mail + mot de passe, Apple, Google), émet les JWT et publie ses clés publiques. Il a **sa propre base de données** : aucun autre service n'y accède.

> État : **contrat d'API défini, implémentation à faire** par l'équipe back. Les apps iOS et Android développent contre ce contrat.

## Rôle dans l'architecture

```
App iOS / Android ──HTTPS──▶ KrakenD ──▶ pawrise-auth ──▶ PostgreSQL « pawrise_auth » + Redis
                               │  (routes /v1/auth/*, /.well-known/jwks.json : publiques)
                               │
                               └──▶ Core API, dialog… (routes protégées)
                                    KrakenD valide le JWT avec le JWKS de pawrise-auth
                                    et transmet sub + role en en-têtes.
```

- **pawrise-auth** est le seul à connaître les mots de passe, les identités Apple/Google et les refresh tokens.
- **Core API** ne stocke que l'identifiant du compte (`sub` du JWT, un UUID) comme `owner_id`. Elle ne lit jamais la base d'auth.
- Les événements de cycle de vie (`auth.user.registered`, `auth.user.deleted`) partent sur Kafka pour que la Core API crée ou supprime les données du propriétaire (RGPD, droit à l'effacement).

## Stack prévue

Rust · Axum · Tokio · SQLx (PostgreSQL) · Redis · `jsonwebtoken` · `argon2` · `validator` · `utoipa` (OpenAPI). Même socle que les autres services Rust de Pawrise.

## Documentation

| Document | Contenu |
|---|---|
| [`docs/api-contract.md`](docs/api-contract.md) | Endpoints, JSON échangés, erreurs, claims du JWT. **Source de vérité pour les apps.** |
| [`docs/security.md`](docs/security.md) | Exigences de sécurité (OWASP ASVS, RFC 9068, RFC 9700) et ce que chaque mécanisme protège. |
| [`docs/data-model.md`](docs/data-model.md) | Schéma de la base `pawrise_auth`. |

## Clients

| Client | Connexion e-mail | Apple | Google |
|---|---|---|---|
| iOS (`pawrise-mobile/ios`) | ✅ | ✅ Sign in with Apple natif | ✅ SDK GoogleSignIn |
| Android (`pawrise-mobile/android`) | ✅ | optionnel | ✅ Credential Manager |
| Portail véto | ✅ | — | — |

Apple impose « Se connecter avec Apple » sur iOS dès qu'une autre connexion tierce (Google) est proposée (App Store Review Guideline 4.8).

## Conventions

GitHub Flow, branches `feature/…`, commits `feat: …` en français, une PR approuvée par une personne. Voir [Pawrise/.github](https://github.com/Pawrise/.github).
