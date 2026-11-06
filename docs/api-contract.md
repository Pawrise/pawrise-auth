# Contrat d'API · pawrise-auth v1

Toutes les routes sont exposées par KrakenD sous `https://api.pawrise.fr`. En local : `http://localhost:8200`.
Corps en JSON (`snake_case`), dates en ISO 8601 UTC.

## Sommaire

| Méthode | Route | Auth | Usage |
|---|---|---|---|
| POST | `/v1/auth/register` | — | Créer un compte e-mail + mot de passe |
| POST | `/v1/auth/login` | — | Se connecter |
| POST | `/v1/auth/apple` | — | Se connecter / s'inscrire avec Apple |
| POST | `/v1/auth/google` | — | Se connecter / s'inscrire avec Google |
| POST | `/v1/auth/refresh` | — | Nouveau couple de tokens |
| POST | `/v1/auth/logout` | Bearer | Révoquer la session courante |
| POST | `/v1/auth/logout-all` | Bearer | Révoquer toutes les sessions |
| POST | `/v1/auth/verify-email` | — | Valider l'e-mail (lien reçu) |
| POST | `/v1/auth/resend-verification` | Bearer | Renvoyer l'e-mail de vérification |
| POST | `/v1/auth/forgot-password` | — | Recevoir un code de réinitialisation |
| POST | `/v1/auth/reset-password` | — | Choisir un nouveau mot de passe avec le code |
| POST | `/v1/auth/change-password` | Bearer | Changer de mot de passe (connecté) |
| GET | `/v1/me` | Bearer | Compte courant |
| PATCH | `/v1/me` | Bearer | Modifier nom / téléphone |
| DELETE | `/v1/me` | Bearer | Supprimer le compte (RGPD art. 17) |
| GET | `/.well-known/jwks.json` | — | Clés publiques de signature |
| GET | `/health` | — | Sonde |

---

## Objets communs

### `AuthResponse`

Renvoyé par `register`, `login`, `apple`, `google`.

```json
{
  "tokens": {
    "access_token": "eyJhbGciOiJSUzI1NiIsImtpZCI6IjIwMjYtMTEiLCJ0eXAiOiJhdCtqd3QifQ…",
    "refresh_token": "prt_4bS0n9…",
    "token_type": "Bearer",
    "expires_in": 900
  },
  "user": {
    "id": "8f0f6b1e-6a3c-4a8e-9d5b-0f4f1c9e2a11",
    "email": "alex@example.com",
    "name": "Alex Martin",
    "phone": "+33612345678",
    "email_verified": false,
    "role": "owner",
    "providers": ["password"],
    "created_at": "2026-11-06T10:12:00Z"
  },
  "is_new_user": true
}
```

- `is_new_user` : `true` quand le compte vient d'être créé (y compris via Apple/Google). L'app enchaîne alors sur la découverte puis le profil du chien.
- `providers` : méthodes de connexion liées au compte, parmi `password`, `apple`, `google`.
- `role` : `owner` pour les comptes créés depuis l'app. `vet` et `admin` sont attribués côté back-office.

### `TokenPair`

Renvoyé par `refresh` : `{ "tokens": TokenPair }`.

### Erreurs (RFC 9457 `application/problem+json`)

```json
{
  "type": "https://docs.pawrise.fr/errors/email_taken",
  "title": "Adresse e-mail déjà utilisée",
  "status": 409,
  "code": "email_taken",
  "detail": "Un compte existe déjà avec cette adresse.",
  "errors": { "email": ["already_taken"] }
}
```

L'app se base sur `code` (stable), jamais sur `title`/`detail` (texte affichable, peut changer).

| `code` | HTTP | Quand |
|---|---|---|
| `validation_failed` | 422 | Champ manquant ou mal formé. `errors` détaille par champ. |
| `email_taken` | 409 | Inscription avec un e-mail existant. |
| `weak_password` | 422 | Mot de passe trop court, trop long ou dans la liste des mots de passe courants. |
| `password_breached` | 422 | Mot de passe présent dans une fuite connue (Have I Been Pwned). |
| `invalid_credentials` | 401 | E-mail ou mot de passe incorrect. Même réponse si l'e-mail n'existe pas. |
| `account_locked` | 423 | 5 échecs de connexion en 15 min. En-tête `Retry-After` (secondes). |
| `rate_limited` | 429 | Trop de requêtes depuis cette IP. En-tête `Retry-After`. |
| `invalid_refresh_token` | 401 | Refresh token inconnu, expiré ou révoqué. L'app déconnecte l'utilisateur. |
| `provider_token_invalid` | 401 | Jeton Apple/Google refusé (signature, audience, expiration, nonce). |
| `provider_email_unverified` | 401 | Google renvoie un e-mail non vérifié. |
| `invalid_code` | 400 | Code de réinitialisation faux ou expiré. |
| `unauthorized` | 401 | Access token absent, expiré ou invalide. |
| `forbidden` | 403 | Rôle insuffisant. |
| `internal` | 500 | Erreur serveur. Pas de détail technique dans la réponse. |

---

## Inscription et connexion

### `POST /v1/auth/register`

```json
{
  "email": "alex@example.com",
  "password": "un-mot-de-passe-solide",
  "name": "Alex Martin",
  "phone": "+33612345678",
  "terms_accepted": true
}
```

| Champ | Règle |
|---|---|
| `email` | Format e-mail, 254 car. max, normalisé en minuscules et sans espaces. |
| `password` | 8 à 128 caractères (comptés en Unicode), pas dans les 10 000 plus courants, pas dans HIBP. |
| `name` | 1 à 100 caractères. |
| `phone` | Optionnel. Format E.164. |
| `terms_accepted` | Doit valoir `true` (consentement CGU + politique de confidentialité, horodaté). |

→ `201 AuthResponse`. Un e-mail de vérification part en arrière-plan ; le compte est utilisable tout de suite.
Erreurs : `validation_failed`, `email_taken`, `weak_password`, `password_breached`, `rate_limited`.

> ⚠️ Le Figma indique « 6 caractères minimum ». Il faut passer à **8** (OWASP ASVS 2.1.1) et mettre à jour le texte d'aide.

### `POST /v1/auth/login`

```json
{ "email": "alex@example.com", "password": "un-mot-de-passe-solide" }
```

→ `200 AuthResponse` (`is_new_user: false`).
Erreurs : `invalid_credentials`, `account_locked`, `rate_limited`.

### `POST /v1/auth/apple`

L'app génère un `nonce` aléatoire, envoie son **SHA-256** à Apple, puis envoie la valeur **brute** ici.

```json
{
  "id_token": "eyJraWQiOiJXNldjT0tCIiwiYWxnIjoiUlMyNTYifQ…",
  "authorization_code": "c1a2b3…",
  "nonce": "Jx9fQ2…",
  "name": "Alex Martin"
}
```

- `authorization_code` : à échanger côté serveur contre un refresh token Apple, indispensable pour **révoquer** l'accès Apple à la suppression du compte (App Store Guideline 5.1.1(v)).
- `name` : Apple ne le donne qu'à la **première** connexion, et seulement à l'app. L'app l'envoie quand elle l'a.
- L'e-mail peut être un relais `@privaterelay.appleid.com` : c'est un e-mail valide.

→ `200 AuthResponse` (`is_new_user` selon le cas).
Erreurs : `provider_token_invalid`, `validation_failed`.

### `POST /v1/auth/google`

```json
{ "id_token": "eyJhbGciOiJSUzI1NiIsImtpZCI6…", "nonce": "optionnel", "name": "Alex Martin" }
```

Le serveur accepte les audiences des clients **iOS, Android et web** configurés (`GOOGLE_CLIENT_IDS`, liste).

→ `200 AuthResponse`. Erreurs : `provider_token_invalid`, `provider_email_unverified`.

### Règle de rattachement des comptes (Apple / Google)

1. Identité (`provider`, `sub`) déjà connue → connexion à ce compte.
2. Sinon, e-mail du fournisseur = e-mail d'un compte existant :
   - compte **vérifié** → on rattache l'identité au compte ;
   - compte **non vérifié** → on rattache, on marque l'e-mail vérifié, **on supprime le mot de passe** et on révoque toutes les sessions (protection contre la pré-création malveillante d'un compte, voir `security.md`).
3. Sinon → nouveau compte, `is_new_user: true`.

---

## Sessions

### `POST /v1/auth/refresh`

```json
{ "refresh_token": "prt_4bS0n9…" }
```

→ `200 { "tokens": TokenPair }`. **Le refresh token change à chaque appel** : l'app remplace l'ancien immédiatement.
Réutiliser un ancien refresh token révoque toute la session (détection de vol). Erreur : `invalid_refresh_token`.

Côté app : un seul refresh à la fois (les requêtes en 401 attendent le même refresh), puis on rejoue la requête une fois.

### `POST /v1/auth/logout`

Bearer + `{ "refresh_token": "prt_…" }` → `204`. Révoque ce refresh token et met l'access token en liste noire jusqu'à son expiration.

### `POST /v1/auth/logout-all`

Bearer → `204`. Incrémente `token_version` : tous les appareils sont déconnectés.

---

## E-mail et mot de passe

| Route | Corps | Réponse |
|---|---|---|
| `POST /v1/auth/verify-email` | `{ "token": "…" }` (lien `https://pawrise.fr/verify?token=…`, universal link vers l'app) | `204` · `invalid_code` |
| `POST /v1/auth/resend-verification` | — | `204` (limité à 1 / min) |
| `POST /v1/auth/forgot-password` | `{ "email": "…" }` | `202` **toujours**, que l'e-mail existe ou non |
| `POST /v1/auth/reset-password` | `{ "email", "code": "123456", "new_password" }` | `204` · `invalid_code`, `weak_password`, `password_breached`. Révoque toutes les sessions. |
| `POST /v1/auth/change-password` | `{ "current_password", "new_password" }` | `200 AuthResponse` (nouveaux tokens, autres sessions révoquées) |

Code de réinitialisation : 6 chiffres, valable 15 min, 5 essais maximum.

---

## Compte

- `GET /v1/me` → `200 user` (même objet que dans `AuthResponse`).
- `PATCH /v1/me` → `{ "name"?, "phone"? }` → `200 user`.
- `DELETE /v1/me` → `204`. Supprime le compte, révoque Apple, publie `auth.user.deleted` sur Kafka. La Core API supprime chiens, données collier et conversations.

---

## Access token (JWT, RFC 9068)

En-tête : `{ "alg": "RS256", "typ": "at+jwt", "kid": "2026-11" }`

```json
{
  "iss": "https://auth.pawrise.fr",
  "aud": "pawrise-api",
  "sub": "8f0f6b1e-6a3c-4a8e-9d5b-0f4f1c9e2a11",
  "role": "owner",
  "ver": 3,
  "jti": "c0b5d0d2-1f4e-4c55-9a59-2a0f8e9c1d77",
  "iat": 1793958000,
  "exp": 1793958900
}
```

- Durée de vie : **15 min**. Refresh token : **30 jours glissants**, opaque (pas un JWT).
- KrakenD valide `alg`, signature via `/.well-known/jwks.json` (cache 1 h), `iss`, `aud`, `exp`, puis transmet `X-User-Id: <sub>` et `X-User-Role: <role>` aux services.
- `ver` = `token_version` de l'utilisateur, vérifié par pawrise-auth et les services sensibles (révocation de masse).
- Les apps **ne décodent pas** le JWT pour décider de quoi que ce soit : elles utilisent `user` de la réponse et `GET /v1/me`.

## Événements Kafka publiés

| Topic | Clé | Payload |
|---|---|---|
| `auth.user.registered` | `user_id` | `{ user_id, email, name, role, occurred_at }` |
| `auth.user.deleted` | `user_id` | `{ user_id, occurred_at }` |
