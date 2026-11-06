# Modèle de données · base `pawrise_auth`

Base PostgreSQL dédiée au service. Les autres services ne connaissent que `users.id` (le `sub` du JWT).

```sql
CREATE TABLE users (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email              VARCHAR(254) NOT NULL UNIQUE,          -- normalisé en minuscules
    email_verified_at  TIMESTAMPTZ,
    password_hash      VARCHAR(255),                           -- NULL si compte Apple/Google uniquement
    name               VARCHAR(100) NOT NULL,
    phone              VARCHAR(20),                            -- E.164
    role               VARCHAR(10)  NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'vet', 'admin')),
    token_version      INT          NOT NULL DEFAULT 1,
    terms_accepted_at  TIMESTAMPTZ  NOT NULL,
    terms_version      VARCHAR(20)  NOT NULL,
    last_active_at     TIMESTAMPTZ,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Un compte peut avoir plusieurs identités externes (Apple + Google)
CREATE TABLE user_identities (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider                 VARCHAR(10) NOT NULL CHECK (provider IN ('apple', 'google')),
    subject                  VARCHAR(255) NOT NULL,            -- claim `sub` du fournisseur
    email                    VARCHAR(254),
    apple_refresh_token_enc  BYTEA,                            -- AES-256-GCM, pour la révocation Apple
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider, subject),
    UNIQUE (user_id, provider)
);

CREATE TABLE refresh_tokens (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_id    UUID NOT NULL,                               -- une famille = une session / un appareil
    token_hash   CHAR(64) NOT NULL UNIQUE,                    -- SHA-256 hex, jamais le jeton en clair
    used_at      TIMESTAMPTZ,                                 -- rempli à la rotation
    revoked_at   TIMESTAMPTZ,
    expires_at   TIMESTAMPTZ NOT NULL,                        -- glissant 30 j
    family_expires_at TIMESTAMPTZ NOT NULL,                   -- absolu 180 j
    user_agent   VARCHAR(512),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON refresh_tokens (user_id) WHERE revoked_at IS NULL;
CREATE INDEX ON refresh_tokens (family_id);

CREATE TABLE email_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose     VARCHAR(20) NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
    token_hash  CHAR(64) NOT NULL,                            -- SHA-256 du lien ou du code
    attempts    SMALLINT NOT NULL DEFAULT 0,
    expires_at  TIMESTAMPTZ NOT NULL,                         -- 24 h (vérif.) / 15 min (réinit.)
    consumed_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE connection_logs (                              -- conservé 12 mois
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    method      VARCHAR(10) NOT NULL,                         -- password | apple | google | refresh
    ip          INET NOT NULL,
    user_agent  VARCHAR(512) NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON connection_logs (created_at);
```

## Clés Redis

| Clé | TTL | Usage |
|---|---|---|
| `auth:bl:<jti>` | durée restante du token | Liste noire après logout |
| `auth:ver:<user_id>` | 15 min | Cache de `token_version` |
| `auth:fail:<email>` | 15 min | Compteur d'échecs de connexion |
| `auth:fail-ip:<ip>` | 15 min | Compteur d'échecs par IP |
| `auth:active:<user_id>` | 15 min | Limite les écritures de `last_active_at` |
