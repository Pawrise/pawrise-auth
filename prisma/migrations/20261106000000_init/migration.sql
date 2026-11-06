-- pawrise-auth : base dédiée du service d'authentification.
-- Tables reprises de pawrise-doc/bdd/sql/pawrise_app_db.sql (user_account, consent, refresh_token),
-- avec les écarts listés dans ECARTS.md (E1 à E6). Ce fichier est la seule source du schéma :
-- prisma/schema.prisma le décrit (index partiels et sur expression : SQL uniquement).

-- ---------------------------------------------------------------------
-- Comptes
-- ---------------------------------------------------------------------

CREATE TABLE user_account (
    id_user               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    email                 varchar(255) NOT NULL,
    password_hash         varchar(255),                      -- E1 : NULL pour un compte créé par Apple / Google
    first_name            varchar(100) NOT NULL,
    last_name             varchar(100) NOT NULL,
    phone_number          varchar(20),
    email_verified_at     timestamptz,
    registration_date     timestamptz  NOT NULL DEFAULT now(),
    location_sharing      boolean      NOT NULL DEFAULT true,  -- préférence : position du téléphone envoyée à Pawrise
    health_notifications  boolean      NOT NULL DEFAULT true,  -- RG84 : push des alertes santé
    token_version         integer      NOT NULL DEFAULT 0      -- E3 : incrémenté pour invalider tous les jetons du compte
);
-- RG10 : e-mail unique, insensible à la casse
CREATE UNIQUE INDEX uq_user_account_email ON user_account (lower(email));

-- RG11 à RG14 : consentements historisés
CREATE TABLE consent (
    id_user             uuid        NOT NULL REFERENCES user_account (id_user) ON DELETE CASCADE,
    consent_type        varchar(30) NOT NULL,
    consent_granted_at  timestamptz NOT NULL DEFAULT now(),
    consent_version     varchar(20) NOT NULL,
    consent_revoked_at  timestamptz,
    PRIMARY KEY (id_user, consent_type, consent_granted_at),
    CONSTRAINT ck_consent_type  CHECK (consent_type IN ('terms_privacy', 'external_ai_processing', 'anonymized_data')),
    CONSTRAINT ck_consent_dates CHECK (consent_revoked_at IS NULL OR consent_revoked_at >= consent_granted_at)
);
-- RG12 : un seul consentement actif par type et par utilisateur
CREATE UNIQUE INDEX uq_consent_active ON consent (id_user, consent_type) WHERE consent_revoked_at IS NULL;

-- ---------------------------------------------------------------------
-- Sessions (D15, RG77 à RG79)
-- ---------------------------------------------------------------------

CREATE TABLE refresh_token (
    id_refresh_token  uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash        varchar(255) NOT NULL UNIQUE,          -- RG77 : SHA-256, jamais en clair
    family_id         uuid         NOT NULL,                 -- RG78 : session d'un appareil (chaîne des rotations)
    issued_at         timestamptz  NOT NULL DEFAULT now(),
    expires_at        timestamptz  NOT NULL,
    used_at           timestamptz,                           -- RG77 : usage unique
    revoked_at        timestamptz,                           -- RG78, RG79
    id_user           uuid         NOT NULL REFERENCES user_account (id_user) ON DELETE CASCADE,
    CONSTRAINT ck_refresh_token_dates CHECK (expires_at > issued_at)
);
CREATE INDEX ix_refresh_token_family ON refresh_token (family_id);
CREATE INDEX ix_refresh_token_user ON refresh_token (id_user);

-- ---------------------------------------------------------------------
-- E2 : identités Apple / Google rattachées à un compte
-- ---------------------------------------------------------------------

CREATE TABLE user_identity (
    provider        varchar(10)  NOT NULL,
    subject         varchar(255) NOT NULL,                   -- claim `sub` du fournisseur, stable pour un compte
    email           varchar(255),                            -- e-mail communiqué par le fournisseur au moment du rattachement
    linked_at       timestamptz  NOT NULL DEFAULT now(),
    id_user         uuid         NOT NULL REFERENCES user_account (id_user) ON DELETE CASCADE,
    PRIMARY KEY (provider, subject),
    CONSTRAINT ck_user_identity_provider CHECK (provider IN ('apple', 'google'))
);
CREATE INDEX ix_user_identity_user ON user_identity (id_user);

-- ---------------------------------------------------------------------
-- E4 : liens et codes envoyés par e-mail (vérification, mot de passe oublié)
-- ---------------------------------------------------------------------

CREATE TABLE email_token (
    id_email_token  uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    purpose         varchar(20)  NOT NULL,
    token_hash      varchar(255) NOT NULL UNIQUE,            -- HMAC-SHA-256 du jeton ou du code, jamais en clair
    email           varchar(255) NOT NULL,                   -- adresse à laquelle le message a été envoyé
    created_at      timestamptz  NOT NULL DEFAULT now(),
    expires_at      timestamptz  NOT NULL,
    used_at         timestamptz,
    attempts        integer      NOT NULL DEFAULT 0,          -- essais ratés sur un code de réinitialisation
    id_user         uuid         NOT NULL REFERENCES user_account (id_user) ON DELETE CASCADE,
    CONSTRAINT ck_email_token_purpose CHECK (purpose IN ('verify_email', 'reset_password')),
    CONSTRAINT ck_email_token_dates CHECK (expires_at > created_at)
);
CREATE INDEX ix_email_token_user_purpose ON email_token (id_user, purpose);

-- ---------------------------------------------------------------------
-- E5 : essais de connexion (verrouillage temporaire, 429 TOO_MANY_ATTEMPTS)
-- ---------------------------------------------------------------------

CREATE TABLE login_attempt (
    id_login_attempt  bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email             varchar(255) NOT NULL,                 -- en minuscules, même si le compte n'existe pas
    ip_address        varchar(45),
    succeeded         boolean      NOT NULL,
    attempted_at      timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX ix_login_attempt_email_time ON login_attempt (email, attempted_at DESC);
