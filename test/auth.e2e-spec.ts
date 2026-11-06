import { decodeJwt, decodeProtectedHeader } from 'jose';
import { createTestApp, registration, resetDatabase, type TestContext } from './helpers';

describe('Compte : inscription, connexion, sessions', () => {
  let t: TestContext;

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    t.mailer.sent.length = 0;
  });
  afterAll(() => t.close());

  describe('POST /v1/auth/register', () => {
    it('crée le compte, le consentement aux CGU et ouvre une session (201 AuthSession)', async () => {
      const res = await t.http().post('/v1/auth/register').send(registration()).expect(201);

      expect(res.body).toEqual({
        accessToken: expect.any(String),
        refreshToken: expect.stringMatching(/^prt_/),
        user: {
          id: expect.any(String),
          firstName: 'Camille',
          lastName: 'Martin',
          email: 'camille.martin@example.com',
          phoneNumber: '+33612345678',
          registeredAt: expect.stringMatching(/Z$/),
          emailVerified: false,
        },
      });
      const consent = await t.prisma.consent.findFirstOrThrow({ where: { userId: res.body.user.id } });
      expect(consent).toMatchObject({ type: 'terms_privacy', version: '2026-10', revokedAt: null });
      expect(t.mailer.lastTo('camille.martin@example.com')?.subject).toBe('Confirmez votre adresse e-mail');
      expect(res.headers['x-request-id']).toBeDefined();
    });

    it('émet un JWT RS256 at+jwt, rôle owner, sans donnée personnelle', async () => {
      const res = await t.http().post('/v1/auth/register').send(registration()).expect(201);
      const header = decodeProtectedHeader(res.body.accessToken);
      const claims = decodeJwt(res.body.accessToken);
      expect(header).toMatchObject({ alg: 'RS256', typ: 'at+jwt' });
      expect(claims).toMatchObject({ sub: res.body.user.id, role: 'owner', ver: 0, aud: 'pawrise-api' });
      expect(JSON.stringify(claims)).not.toContain('camille');
      expect(claims.exp! - claims.iat!).toBe(900);

      const jwks = await t.http().get('/.well-known/jwks.json').expect(200);
      expect(jwks.body.keys[0]).toMatchObject({ kty: 'RSA', alg: 'RS256', use: 'sig', kid: header.kid });
    });

    it('refuse un e-mail déjà utilisé, sans tenir compte de la casse (409 EMAIL_ALREADY_USED, RG10)', async () => {
      await t.http().post('/v1/auth/register').send(registration()).expect(201);
      const res = await t
        .http()
        .post('/v1/auth/register')
        .send(registration({ email: 'Camille.MARTIN@example.com' }))
        .expect(409);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body).toEqual({ status: 409, code: 'EMAIL_ALREADY_USED', title: 'Email already used' });
    });

    it('liste toutes les erreurs de champ (400 VALIDATION_FAILED)', async () => {
      const res = await t
        .http()
        .post('/v1/auth/register')
        .send({ firstName: '', email: 'pas-un-email', phoneNumber: '0612', password: 'court' })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          { field: 'firstName', code: 'REQUIRED' },
          { field: 'lastName', code: 'REQUIRED' },
          { field: 'email', code: 'INVALID_EMAIL' },
          { field: 'phoneNumber', code: 'INVALID_PHONE' },
          { field: 'password', code: 'PASSWORD_TOO_SHORT' },
          { field: 'acceptedTermsVersion', code: 'TERMS_NOT_ACCEPTED' },
        ]),
      );
    });

    it('refuse une version des CGU qui n’est pas celle en vigueur', async () => {
      const res = await t
        .http()
        .post('/v1/auth/register')
        .send(registration({ acceptedTermsVersion: '2025-01' }))
        .expect(400);
      expect(res.body.errors).toEqual([{ field: 'acceptedTermsVersion', code: 'TERMS_NOT_ACCEPTED' }]);
    });

    it('refuse un mot de passe courant et un champ inconnu', async () => {
      const common = await t
        .http()
        .post('/v1/auth/register')
        .send(registration({ password: 'password1' }));
      expect(common.body.errors).toEqual([{ field: 'password', code: 'PASSWORD_TOO_COMMON' }]);

      const extra = await t
        .http()
        .post('/v1/auth/register')
        .send(registration({ role: 'vet' }));
      expect(extra.body.errors).toEqual([{ field: 'role', code: 'UNKNOWN_FIELD' }]);
    });

    it('répond MALFORMED_JSON à un corps invalide', async () => {
      const res = await t
        .http()
        .post('/v1/auth/register')
        .set('Content-Type', 'application/json')
        .send('{"email":')
        .expect(400);
      expect(res.body.code).toBe('MALFORMED_JSON');
    });
  });

  describe('POST /v1/auth/login', () => {
    beforeEach(async () => {
      await t.http().post('/v1/auth/register').send(registration()).expect(201);
    });

    it('ouvre une session, e-mail sans tenir compte de la casse', async () => {
      const res = await t
        .http()
        .post('/v1/auth/login')
        .send({ email: ' CAMILLE.martin@example.com ', password: 'chien-oslo-2026' })
        .expect(200);
      expect(res.body.user.email).toBe('camille.martin@example.com');
    });

    it('même 401 INVALID_CREDENTIALS pour un e-mail inconnu et un mauvais mot de passe', async () => {
      const wrong = await t
        .http()
        .post('/v1/auth/login')
        .send({ email: 'camille.martin@example.com', password: 'mauvais-mot' })
        .expect(401);
      const unknown = await t
        .http()
        .post('/v1/auth/login')
        .send({ email: 'personne@example.com', password: 'mauvais-mot' })
        .expect(401);
      expect(wrong.body).toEqual(unknown.body);
      expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('verrouille après 5 échecs d’affilée (429 TOO_MANY_ATTEMPTS + Retry-After), même mot de passe juste', async () => {
      for (let i = 0; i < 5; i++) {
        await t
          .http()
          .post('/v1/auth/login')
          .send({ email: 'camille.martin@example.com', password: `faux-${i}-xxxx` })
          .expect(401);
      }
      const res = await t
        .http()
        .post('/v1/auth/login')
        .send({ email: 'camille.martin@example.com', password: 'chien-oslo-2026' })
        .expect(429);
      expect(res.body.code).toBe('TOO_MANY_ATTEMPTS');
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(800);
    });

    it('une connexion réussie remet le compteur à zéro', async () => {
      for (let i = 0; i < 4; i++) {
        await t
          .http()
          .post('/v1/auth/login')
          .send({ email: 'camille.martin@example.com', password: 'faux-xxxx' });
      }
      await t
        .http()
        .post('/v1/auth/login')
        .send({ email: 'camille.martin@example.com', password: 'chien-oslo-2026' })
        .expect(200);
      await t
        .http()
        .post('/v1/auth/login')
        .send({ email: 'camille.martin@example.com', password: 'faux-xxxx' });
      await t
        .http()
        .post('/v1/auth/login')
        .send({ email: 'camille.martin@example.com', password: 'chien-oslo-2026' })
        .expect(200);
    });
  });

  describe('POST /v1/auth/refresh et /logout', () => {
    let session: { accessToken: string; refreshToken: string };

    beforeEach(async () => {
      session = (await t.http().post('/v1/auth/register').send(registration()).expect(201)).body;
    });

    it('fait tourner le jeton : nouvelle paire, l’ancien refusé', async () => {
      const res = await t
        .http()
        .post('/v1/auth/refresh')
        .send({ refreshToken: session.refreshToken })
        .expect(200);
      expect(Object.keys(res.body).sort()).toEqual(['accessToken', 'refreshToken']);
      expect(res.body.refreshToken).not.toBe(session.refreshToken);
      await t.http().get('/v1/me').set('Authorization', `Bearer ${res.body.accessToken}`).expect(200);
    });

    it('un jeton déjà utilisé qui revient révoque toute la session (vol, RG78)', async () => {
      const rotated = await t.http().post('/v1/auth/refresh').send({ refreshToken: session.refreshToken });
      const replay = await t
        .http()
        .post('/v1/auth/refresh')
        .send({ refreshToken: session.refreshToken })
        .expect(401);
      expect(replay.body.code).toBe('INVALID_REFRESH_TOKEN');
      // Le jeton légitime issu de la rotation est révoqué lui aussi.
      await t.http().post('/v1/auth/refresh').send({ refreshToken: rotated.body.refreshToken }).expect(401);
    });

    it('refuse un jeton inconnu', async () => {
      const res = await t.http().post('/v1/auth/refresh').send({ refreshToken: 'prt_inconnu' }).expect(401);
      expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('la déconnexion ferme la session de cet appareil seulement, et reste idempotente', async () => {
      const other = (
        await t
          .http()
          .post('/v1/auth/login')
          .send({ email: 'camille.martin@example.com', password: 'chien-oslo-2026' })
      ).body;
      const auth = `Bearer ${session.accessToken}`;
      await t
        .http()
        .post('/v1/auth/logout')
        .set('Authorization', auth)
        .send({ refreshToken: session.refreshToken })
        .expect(204);
      await t
        .http()
        .post('/v1/auth/logout')
        .set('Authorization', auth)
        .send({ refreshToken: session.refreshToken })
        .expect(204);
      await t.http().post('/v1/auth/refresh').send({ refreshToken: session.refreshToken }).expect(401);
      await t.http().post('/v1/auth/refresh').send({ refreshToken: other.refreshToken }).expect(200);
    });

    it('exige un jeton d’accès pour se déconnecter', async () => {
      const res = await t
        .http()
        .post('/v1/auth/logout')
        .send({ refreshToken: session.refreshToken })
        .expect(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });
  });

  it('GET /health vérifie la base', async () => {
    await t.http().get('/health').expect(200, { status: 'ok' });
  });

  it('route inconnue : 404 au format Problem Details', async () => {
    const res = await t.http().get('/v1/nope').expect(404);
    expect(res.body).toEqual({ status: 404, code: 'NOT_FOUND', title: 'Not found' });
  });
});
