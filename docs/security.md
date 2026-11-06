# Sécurité · pawrise-auth

Ce document reprend le socle d'authentification déjà éprouvé sur Offrii (Rust/Axum, même équipe) et le corrige sur les points où les recommandations récentes vont plus loin. Chaque exigence indique la norme d'origine et ce qu'elle protège.

Références : OWASP ASVS 4.0.3 (V2 Authentification, V3 Sessions), OWASP Password Storage Cheat Sheet, RFC 9068 (JWT access tokens), RFC 9700 (OAuth 2.0 Security BCP, 2025), RFC 9457 (problem details), NIST SP 800-63B, guidelines Apple et Google Identity.

## 1. Mots de passe

| Exigence | Valeur | Norme | Protège contre |
|---|---|---|---|
| Algorithme | Argon2id v1.3, m = 19 456 KiB, t = 2, p = 1 | OWASP Password Storage | Cassage hors ligne après fuite de la base |
| Exécution | `tokio::task::spawn_blocking` | — | Blocage du runtime async |
| Longueur | 8 à 128 caractères Unicode, pas de règles de composition | ASVS 2.1.1/2.1.2, NIST 800-63B | Mots de passe trop courts |
| Liste noire | 10 000 mots de passe les plus courants (fichier embarqué) | ASVS 2.1.7 | Attaque par dictionnaire |
| Fuites | Have I Been Pwned, k-anonymity (5 premiers caractères du SHA-1), timeout 3 s, *fail-open* journalisé | ASVS 2.1.7, NIST 800-63B | Réutilisation d'un mot de passe déjà fuité |
| Temps constant | Vérification Argon2id contre un hash factice quand l'e-mail n'existe pas | ASVS 2.2.x | Énumération des comptes par le temps de réponse |
| Messages | `invalid_credentials` identique pour e-mail inconnu et mauvais mot de passe ; `forgot-password` renvoie toujours 202 | ASVS 2.5.x | Énumération des comptes |

Ordre de vérification à l'inscription : longueur → liste noire → HIBP (du moins coûteux au plus coûteux).

## 2. Tokens

### Access token

- JWT **RS256** (RSA 2048), en-tête `typ: at+jwt` et `kid` (RFC 9068). TTL 15 min.
- Claims `iss`, `aud`, `sub`, `role`, `ver`, `jti`, `iat`, `exp`. Pas de donnée personnelle (ni e-mail, ni nom).
- Validation stricte : algorithme fixé à RS256 côté vérificateur (jamais lu depuis le token), `iss` et `aud` obligatoires.
- **Rotation des clés** : `/.well-known/jwks.json` publie la clé active et la précédente. Nouvelle clé tous les 90 jours, ancienne retirée après 15 min + marge de cache KrakenD (1 h). Clés privées montées en secret (SOPS + age), jamais générées au démarrage en production.

### Refresh token (évolution par rapport à Offrii)

Offrii utilisait un JWT comme refresh token. Pawrise utilise un **jeton opaque** de 256 bits aléatoires, préfixé `prt_`, stocké uniquement sous forme de **SHA-256** en base.

- **Rotation à chaque usage** dans une transaction (`SELECT … FOR UPDATE`) : l'ancien est révoqué, le nouveau inséré avec le même `family_id`.
- **Détection de réutilisation** (RFC 9700 §4.14.2) : si un refresh token déjà utilisé est présenté, **toute la famille** est révoquée. Un voleur et l'utilisateur légitime ne peuvent pas coexister.
- Expiration glissante 30 jours, absolue 180 jours. 10 familles actives max par compte (une par appareil), les plus anciennes sont révoquées.

### Révocation

| Mécanisme | Portée | Implémentation |
|---|---|---|
| Liste noire `jti` | Un access token (logout) | Redis `auth:bl:<jti>`, TTL = durée restante |
| `token_version` | Tous les tokens d'un compte (changement/réinit. de mot de passe, logout-all, suppression) | Colonne `users.token_version`, cache Redis `auth:ver:<user_id>` |
| Famille de refresh | Une session / un appareil | Table `refresh_tokens` |

Politique **fail-closed** : si Redis est indisponible, les routes protégées de pawrise-auth répondent 503 plutôt que d'accepter un token potentiellement révoqué.

## 3. Connexion Apple et Google

| Exigence | Détail | Protège contre |
|---|---|---|
| Vérification de signature | JWKS Apple (`appleid.apple.com/auth/keys`) et Google (`googleapis.com/oauth2/v3/certs`), cache 1 h, rechargement si `kid` inconnu | Jeton forgé |
| `iss` | Apple `https://appleid.apple.com` ; Google `accounts.google.com` ou `https://accounts.google.com` | Jeton émis par un tiers |
| `aud` | Apple : bundle id iOS (+ Services ID si web). Google : **liste** des client IDs iOS, Android, web | Jeton émis pour une autre app |
| `exp`, `iat` | Rejet si expiré ou émis il y a plus de 10 min | Rejeu |
| **Nonce Apple** (nouveau) | L'app envoie `SHA-256(nonce)` à Apple, le serveur compare au claim `nonce` avec la valeur brute reçue | Rejeu d'un `id_token` intercepté. Absent d'Offrii. |
| Google `email_verified` | Doit valoir `true` | Prise de contrôle via un e-mail non vérifié |
| Apple `authorization_code` | Échangé contre un refresh token Apple, stocké chiffré, utilisé pour `revoke` à la suppression du compte | Exigence App Store 5.1.1(v) |
| **Pré-création malveillante** (nouveau) | Rattachement à un compte existant **non vérifié** : suppression du mot de passe + révocation des sessions | Un attaquant crée un compte avec l'e-mail de la victime avant elle, puis garde l'accès après qu'elle se connecte avec Google. Offrii rattachait sans cette précaution. |

Identités stockées dans une table dédiée `user_identities (provider, subject)` : un même compte peut avoir mot de passe + Apple + Google (Offrii n'en permettait qu'un).

## 4. Limitation de débit et verrouillage

| Couche | Limite | Clé |
|---|---|---|
| KrakenD | 60 req/min | IP, routes `/v1/auth/*` |
| Connexion | **5 échecs / 15 min → `account_locked` 15 min** (story 1.2) | `auth:fail:<email>` |
| Connexion | 30 échecs / 15 min | `auth:fail-ip:<ip>` (bourrage d'identifiants) |
| Inscription | 5 / h | IP |
| Mot de passe oublié | 3 / h | e-mail et IP |
| Code de réinitialisation | 5 essais, puis code invalidé | code |
| Renvoi de vérification | 1 / min | compte |

Le verrouillage par compte est temporaire et ne révèle pas si le compte existe (réponse identique pour un e-mail inconnu).

## 5. Données et isolation

- Base PostgreSQL **`pawrise_auth`** dédiée, rôle SQL `pawrise_auth_app` avec droits limités aux tables du service. Aucun autre service n'a d'identifiants dessus.
- Requêtes SQLx paramétrées uniquement.
- Chiffrement au repos des refresh tokens Apple (AES-256-GCM, clé dans les secrets).
- Journaux : aucun mot de passe, token ou code dans les logs (`#[tracing::instrument(skip(...))]`).
- TLS terminé par Traefik, HSTS.

## 6. RGPD

| Exigence | Implémentation |
|---|---|
| Consentement (art. 6, 7) | `terms_accepted` obligatoire, horodaté dans `users.terms_accepted_at` avec la version des CGU |
| Effacement (art. 17) | `DELETE /v1/me` : suppression en cascade côté auth, révocation Apple, événement `auth.user.deleted` |
| Limitation de conservation (art. 5) | Journaux de connexion (IP, user-agent) 12 mois puis purge ; comptes inactifs : préavis à 23 mois, suppression à 24 mois |
| Minimisation | Le JWT ne contient aucune donnée personnelle |

## 7. Tests attendus

- Unitaires : hash/verify Argon2id, politique de mot de passe, validation des claims Apple/Google (iss, aud, exp, nonce, kid inconnu), rotation et réutilisation des refresh tokens.
- Intégration (testcontainers Postgres + Redis) : parcours register → login → refresh → logout, verrouillage après 5 échecs, rattachement Apple sur compte non vérifié, refresh concurrent (un seul gagne).
- CI : `cargo fmt`, `clippy -D warnings`, `cargo audit`, workflow réutilisable `rust-ci.yml` de l'organisation.
