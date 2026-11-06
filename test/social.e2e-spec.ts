import { createTestApp, registration, resetDatabase, sha256, TERMS, type TestContext } from './helpers';

describe('Connexion Apple / Google', () => {
  let t: TestContext;

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(() => resetDatabase(t.prisma));
  afterAll(() => t.close());

  const appleToken = (claims: Record<string, unknown> = {}, nonce = 'nonce-brut-123') =>
    t.signProviderToken('apple', {
      iss: 'https://appleid.apple.com',
      aud: 'fr.pawrise.app',
      sub: '001234.apple-sub',
      email: 'nala.owner@privaterelay.appleid.com',
      email_verified: 'true',
      nonce: sha256(nonce),
      ...claims,
    });

  const googleToken = (claims: Record<string, unknown> = {}) =>
    t.signProviderToken('google', {
      iss: 'https://accounts.google.com',
      aud: 'android-client.apps.googleusercontent.com',
      sub: 'google-sub-42',
      email: 'camille.martin@example.com',
      email_verified: true,
      given_name: 'Camille',
      family_name: 'Martin',
      ...claims,
    });

  describe('POST /v1/auth/apple', () => {
    it('crée le compte sans mot de passe, adresse vérifiée, CGU enregistrées (isNewUser)', async () => {
      const res = await t
        .http()
        .post('/v1/auth/apple')
        .send({
          identityToken: await appleToken(),
          nonce: 'nonce-brut-123',
          firstName: 'Camille',
          lastName: 'Martin',
          acceptedTermsVersion: TERMS,
        })
        .expect(200);

      expect(res.body.isNewUser).toBe(true);
      expect(res.body.user).toMatchObject({
        firstName: 'Camille',
        lastName: 'Martin',
        email: 'nala.owner@privaterelay.appleid.com',
        emailVerified: true,
      });
      const user = await t.prisma.userAccount.findUniqueOrThrow({
        where: { id: res.body.user.id },
        include: { consents: true, identities: true },
      });
      expect(user.passwordHash).toBeNull();
      expect(user.consents).toHaveLength(1);
      expect(user.identities[0]).toMatchObject({ provider: 'apple', subject: '001234.apple-sub' });
    });

    it('reconnecte le même compte ensuite (isNewUser: false), même sans nom', async () => {
      const body = { nonce: 'nonce-brut-123', acceptedTermsVersion: TERMS };
      const first = await t
        .http()
        .post('/v1/auth/apple')
        .send({ ...body, identityToken: await appleToken() });
      const second = await t
        .http()
        .post('/v1/auth/apple')
        .send({ ...body, identityToken: await appleToken() })
        .expect(200);
      expect(second.body.isNewUser).toBe(false);
      expect(second.body.user.id).toBe(first.body.user.id);
      expect(first.body.user.firstName).toBe('nala.owner');
    });

    it('refuse un nonce qui ne correspond pas (rejeu d’un jeton intercepté)', async () => {
      const res = await t
        .http()
        .post('/v1/auth/apple')
        .send({ identityToken: await appleToken(), nonce: 'autre-nonce', acceptedTermsVersion: TERMS })
        .expect(401);
      expect(res.body.code).toBe('INVALID_PROVIDER_TOKEN');
    });

    it('refuse un jeton émis pour une autre app', async () => {
      const res = await t
        .http()
        .post('/v1/auth/apple')
        .send({
          identityToken: await appleToken({ aud: 'com.autre.app' }),
          nonce: 'nonce-brut-123',
          acceptedTermsVersion: TERMS,
        })
        .expect(401);
      expect(res.body.code).toBe('INVALID_PROVIDER_TOKEN');
    });

    it('exige l’acceptation des CGU', async () => {
      const res = await t
        .http()
        .post('/v1/auth/apple')
        .send({ identityToken: await appleToken(), nonce: 'nonce-brut-123' })
        .expect(400);
      expect(res.body.errors).toEqual([{ field: 'acceptedTermsVersion', code: 'TERMS_NOT_ACCEPTED' }]);
    });
  });

  describe('POST /v1/auth/google', () => {
    it('accepte les identifiants clients iOS et Android', async () => {
      for (const aud of [
        'ios-client.apps.googleusercontent.com',
        'android-client.apps.googleusercontent.com',
      ]) {
        await t
          .http()
          .post('/v1/auth/google')
          .send({ idToken: await googleToken({ aud }), acceptedTermsVersion: TERMS })
          .expect(200);
      }
    });

    it('refuse une adresse non vérifiée par Google', async () => {
      const res = await t
        .http()
        .post('/v1/auth/google')
        .send({ idToken: await googleToken({ email_verified: false }), acceptedTermsVersion: TERMS })
        .expect(401);
      expect(res.body.code).toBe('PROVIDER_EMAIL_NOT_VERIFIED');
    });

    it('rattache Google à un compte vérifié existant sans toucher au mot de passe', async () => {
      const created = (await t.http().post('/v1/auth/register').send(registration()).expect(201)).body;
      await t.prisma.userAccount.update({
        where: { id: created.user.id },
        data: { emailVerifiedAt: new Date() },
      });

      const res = await t
        .http()
        .post('/v1/auth/google')
        .send({ idToken: await googleToken(), acceptedTermsVersion: TERMS })
        .expect(200);
      expect(res.body).toMatchObject({ isNewUser: false, user: { id: created.user.id } });
      await t.http().post('/v1/auth/refresh').send({ refreshToken: created.refreshToken }).expect(200);
      await t
        .http()
        .post('/v1/auth/login')
        .send({ email: 'camille.martin@example.com', password: 'chien-oslo-2026' })
        .expect(200);
    });

    it('pré-création malveillante : rattacher un compte non vérifié supprime son mot de passe et ses sessions', async () => {
      // Un attaquant crée le compte avec l'e-mail de la victime, sans pouvoir le vérifier.
      const attacker = (await t.http().post('/v1/auth/register').send(registration()).expect(201)).body;

      // La victime se connecte avec Google : elle prouve posséder l'adresse.
      const victim = await t
        .http()
        .post('/v1/auth/google')
        .send({ idToken: await googleToken(), acceptedTermsVersion: TERMS })
        .expect(200);
      expect(victim.body.user).toMatchObject({ id: attacker.user.id, emailVerified: true });

      await t.http().post('/v1/auth/refresh').send({ refreshToken: attacker.refreshToken }).expect(401);
      await t.http().get('/v1/me').set('Authorization', `Bearer ${attacker.accessToken}`).expect(401);
      await t
        .http()
        .post('/v1/auth/login')
        .send({ email: 'camille.martin@example.com', password: 'chien-oslo-2026' })
        .expect(401);
      await t.http().get('/v1/me').set('Authorization', `Bearer ${victim.body.accessToken}`).expect(200);
    });
  });
});
