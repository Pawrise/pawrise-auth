# Écarts avec pawrise-doc

Ce service implémente le tag `Compte` de [`pawrise-doc/contrat-interface/openapi.yaml`](https://github.com/AadiDevv/pawrise-doc/blob/main/contrat-interface/openapi.yaml) et ses conventions (`conventions.md`). Ci-dessous, tout ce qui s'en écarte, avec la raison et la correction proposée dans la doc. **À reporter dans pawrise-doc par Aaditya** : ce dépôt ne modifie pas la doc.

| # | Écart | Où dans la doc | Raison | Proposition pour la doc |
|---|---|---|---|---|
| E0 | **Service séparé**, NestJS, base dédiée `pawrise_auth`, au lieu du tag `Compte` dans l'API-CORE sur l'App-DB | `context/architecture.md`, `context/decisions.md` (Prisma / App-DB) | Choix d'architecture de Yassine (2026-11-06) : l'auth a sa propre base | Ajouter le service AUTH (port 8200) au schéma MVP ; `user_account`, `consent`, `refresh_token` sortent de l'App-DB (voir E8) |
| E1 | `user_account.password_hash` **facultatif** | `bdd/sql/pawrise_app_db.sql` l. 41, `mcd-doc.md:156` (❓ OAuth) | Un compte créé par Apple / Google n'a pas de mot de passe | Fermer le ❓ : mot de passe facultatif, fournisseur stocké dans `user_identity` |
| E2 | **Connexion Apple et Google** : `POST /v1/auth/apple`, `POST /v1/auth/google`, table `user_identity (provider, subject)` | absent | Demandé (présentation, maquette S19) | Ajouter les deux endpoints (corps ci-dessous) et la table |
| E3 | `user_account.token_version` | absent | Invalider tous les jetons d'accès d'un compte (mot de passe réinitialisé, compte rattaché à Apple / Google) sans liste noire | Ajouter la colonne |
| E4 | **Vérification d'e-mail** et **mot de passe oublié** : 5 endpoints, table `email_token` | absent (`email_verified_at` existe mais rien ne le renseigne) | Demandé ; RG10 sans vérification permet de créer un compte avec l'e-mail d'un autre | Ajouter les endpoints et la table ; écran « Mot de passe oublié » dans la maquette (M7) |
| E5 | Table `login_attempt` | absent | Seuil du 429 `TOO_MANY_ATTEMPTS` de `POST /auth/login` (5 échecs d'affilée en 15 min) | Ajouter la table, ou noter « détail d'implémentation du service AUTH » |
| E6 | `User.emailVerified` (booléen) dans les réponses | schéma `User` | L'app doit savoir si elle affiche « Confirmez votre adresse » | Ajouter le champ (non cassant, convention 7) |
| E7 | `DELETE /me` ne vérifie pas `CHIEF_TRANSFER_REQUIRED` et ne touche pas aux chiens | `openapi.yaml` `deleteMe`, Q1 | Les chiens sont dans l'App-DB (API-CORE), pas dans la base d'auth | L'app appelle d'abord l'API-CORE (`DELETE /me/pets-data` ou équivalent, qui renvoie 409 si besoin), puis l'auth. Ou : l'auth publie `user.deleted` et l'API-CORE nettoie. À trancher avec Q1 |
| E8 | Liens entre bases : `pet_owner.id_user`, `device.id_user`… ne peuvent plus être des clés étrangères vers `user_account` | `bdd/sql/pawrise_app_db.sql` | Conséquence de E0 | L'API-CORE garde l'`id` du compte (claim `sub` du JWT) comme référence logique, sans FK, comme pour TimescaleDB |
| E9 | `device` (jetons push) n'est pas dans ce service | `bdd/sql` | Concerne les notifications, pas l'authentification | Laisser `device` dans l'App-DB (API-CORE) |
| E10 | `payment_customer_ref` (Stripe) n'est pas dans ce service | `bdd/sql` l. 47 | Concerne les abonnements | Le déplacer dans l'App-DB (table des abonnements) |
| E11 | Codes d'erreur supplémentaires (format de la convention 4) | `openapi.yaml` | Cas propres aux ajouts et à la politique de mot de passe | Les lister dans `openapi.yaml` (tableau ci-dessous) |
| E12 | `acceptedTermsVersion` doit être **égal à la version en vigueur** (`TERMS_VERSION`, aujourd'hui `2026-10`) | `RegisterRequest` | Sinon on enregistre l'acceptation d'une version que l'utilisateur n'a pas vue | Préciser la règle ; l'app embarque la version affichée |
| E13 | **Pas encore fait** : révocation du jeton Apple à la suppression du compte | — | Exigence App Store 5.1.1(v) : demande l'échange de l'`authorization_code` Apple contre un jeton, donc une clé `.p8` du compte Apple Developer | À faire dès que l'équipe a le compte Apple Developer (clé Sign in with Apple) |

## Codes d'erreur ajoutés (E11)

| Code | Statut | Quand |
|---|---|---|
| `PASSWORD_TOO_LONG` (champ) | 400 | plus de 128 caractères |
| `PASSWORD_TOO_COMMON` (champ) | 400 | dans les 10 000 mots de passe les plus courants, ou égal à la partie locale de l'e-mail |
| `PASSWORD_BREACHED` (champ) | 400 | trouvé dans une fuite connue (Have I Been Pwned, k-anonymity) |
| `UNKNOWN_FIELD` (champ) | 400 | champ non prévu (`additionalProperties: false`) |
| `INVALID_CODE` (champ) | 400 | code de réinitialisation qui n'a pas 6 chiffres |
| `MALFORMED_JSON` | 400 | corps illisible |
| `INVALID_OR_EXPIRED_TOKEN` | 400 | lien de vérification ou code de réinitialisation faux, expiré, déjà utilisé, ou brûlé après 5 essais |
| `INVALID_PROVIDER_TOKEN` | 401 | jeton Apple / Google invalide (signature, `aud`, `iss`, expiration, nonce) |
| `PROVIDER_EMAIL_NOT_VERIFIED` | 401 | Google indique une adresse non vérifiée |
| `PROVIDER_NOT_CONFIGURED` | 503 | identifiant client Apple / Google absent de la configuration du serveur |
| `UNAUTHORIZED` | 401 | jeton d'accès absent, invalide, expiré ou révoqué |

## Endpoints ajoutés (E2, E4)

Tous en JSON, champs en camelCase, erreurs au format de la convention 4.

### `POST /v1/auth/apple` · `POST /v1/auth/google`

```jsonc
// Apple
{ "identityToken": "<JWT Apple>", "nonce": "<nonce brut>", "firstName": "Camille", "lastName": "Martin", "acceptedTermsVersion": "2026-10" }
// Google
{ "idToken": "<JWT Google>", "nonce": "<facultatif>", "acceptedTermsVersion": "2026-10" }
```

Réponse 200 : `AuthSession` + `isNewUser` (vrai si le compte vient d'être créé → l'app enchaîne sur la découverte).

- Apple : l'app envoie `SHA-256(nonce)` à Apple et le nonce brut ici ; `firstName` / `lastName` ne sont fournis par Apple qu'à la première autorisation.
- Google : `aud` accepté parmi `GOOGLE_CLIENT_IDS` (clients iOS, Android, web) ; `email_verified` doit être vrai.
- Le bouton vaut acceptation des CGU affichées dessous (RG11) : `acceptedTermsVersion` obligatoire, enregistré seulement à la création.
- Rattachement automatique à un compte existant de même e-mail. Si ce compte n'avait jamais vérifié son adresse, son mot de passe est supprimé et ses sessions fermées (protection contre la pré-création malveillante).

### Vérification d'e-mail

| Endpoint | Corps | Réponse |
|---|---|---|
| `GET /v1/auth/verify-email?token=…` | — | Page HTML (lien ouvert depuis l'e-mail) |
| `POST /v1/auth/verify-email` | `{ "token" }` | 204 (depuis l'app, lien universel) |
| `POST /v1/auth/resend-verification` | — (Bearer) | 204 ; nouveau lien, l'ancien ne vaut plus |

Lien valable 24 h, à usage unique, envoyé à l'inscription et à chaque changement d'e-mail (`PATCH /me`).

### Mot de passe oublié

| Endpoint | Corps | Réponse |
|---|---|---|
| `POST /v1/auth/forgot-password` | `{ "email" }` | 202 toujours (ne révèle pas si le compte existe) |
| `POST /v1/auth/reset-password` | `{ "email", "code", "newPassword" }` | 204 |

Code à 6 chiffres par e-mail, 15 min, 5 essais. Une réinitialisation réussie ferme toutes les sessions, invalide les jetons d'accès déjà émis et marque l'adresse vérifiée.

### Autres routes du service

| Route | Rôle |
|---|---|
| `GET /.well-known/jwks.json` | Clés publiques RS256 : l'API-CORE vérifie les jetons d'accès avec (`iss` = `JWT_ISSUER`, `aud` = `pawrise-api`, `typ` = `at+jwt`) |
| `GET /health` | Sonde (vérifie aussi la base) |
