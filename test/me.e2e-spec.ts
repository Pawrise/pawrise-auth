import { createTestApp, registration, resetDatabase, type TestContext } from './helpers';

describe('Mon profil, préférences, suppression', () => {
  let t: TestContext;
  let auth: string;
  let refreshToken: string;

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    const session = (await t.http().post('/v1/auth/register').send(registration()).expect(201)).body;
    auth = `Bearer ${session.accessToken}`;
    refreshToken = session.refreshToken;
  });
  afterAll(() => t.close());

  it('GET /v1/me exige un jeton valide', async () => {
    await t.http().get('/v1/me').expect(401);
    await t.http().get('/v1/me').set('Authorization', 'Bearer pas.un.jwt').expect(401);
    const res = await t.http().get('/v1/me').set('Authorization', auth).expect(200);
    expect(res.body).toMatchObject({ firstName: 'Camille', phoneNumber: '+33612345678' });
  });

  describe('PATCH /v1/me', () => {
    it('ne change que les champs envoyés ; phoneNumber: null efface le numéro', async () => {
      const res = await t
        .http()
        .patch('/v1/me')
        .set('Authorization', auth)
        .send({ lastName: 'Durand', phoneNumber: null })
        .expect(200);
      expect(res.body).toMatchObject({ firstName: 'Camille', lastName: 'Durand', phoneNumber: null });
    });

    it('refuse null sur un champ obligatoire et un corps vide', async () => {
      const res = await t
        .http()
        .patch('/v1/me')
        .set('Authorization', auth)
        .send({ firstName: null })
        .expect(400);
      expect(res.body.errors).toEqual([{ field: 'firstName', code: 'REQUIRED' }]);
      await t.http().patch('/v1/me').set('Authorization', auth).send({}).expect(400);
    });

    it('changer d’e-mail : adresse non vérifiée et nouveau lien envoyé', async () => {
      await t.prisma.userAccount.updateMany({ data: { emailVerifiedAt: new Date() } });
      const res = await t
        .http()
        .patch('/v1/me')
        .set('Authorization', auth)
        .send({ email: 'Camille.M@Example.com' })
        .expect(200);
      expect(res.body).toMatchObject({ email: 'camille.m@example.com', emailVerified: false });
      expect(t.mailer.lastTo('camille.m@example.com')).toBeDefined();
    });

    it('409 EMAIL_ALREADY_USED si l’adresse appartient à un autre compte', async () => {
      await t
        .http()
        .post('/v1/auth/register')
        .send(registration({ email: 'autre@example.com' }))
        .expect(201);
      const res = await t
        .http()
        .patch('/v1/me')
        .set('Authorization', auth)
        .send({ email: 'AUTRE@example.com' })
        .expect(409);
      expect(res.body.code).toBe('EMAIL_ALREADY_USED');
    });
  });

  describe('préférences', () => {
    it('valeurs par défaut : localisation et alertes actives, partage anonymisé inactif', async () => {
      const res = await t.http().get('/v1/me/preferences').set('Authorization', auth).expect(200);
      expect(res.body).toEqual({
        deviceLocationSharing: true,
        healthNotifications: true,
        anonymizedDataSharing: false,
      });
    });

    it('le partage anonymisé est un consentement historisé (activer, révoquer, réactiver)', async () => {
      const set = (v: boolean) =>
        t
          .http()
          .patch('/v1/me/preferences')
          .set('Authorization', auth)
          .send({ anonymizedDataSharing: v })
          .expect(200);
      expect((await set(true)).body.anonymizedDataSharing).toBe(true);
      expect((await set(true)).body.anonymizedDataSharing).toBe(true);
      expect((await set(false)).body.anonymizedDataSharing).toBe(false);
      await set(true);

      const rows = await t.prisma.consent.findMany({
        where: { type: 'anonymized_data' },
        orderBy: { grantedAt: 'asc' },
      });
      expect(rows).toHaveLength(2);
      expect(rows[0].revokedAt).not.toBeNull();
      expect(rows[1].revokedAt).toBeNull();
    });

    it('un interrupteur à la fois, null refusé', async () => {
      const res = await t
        .http()
        .patch('/v1/me/preferences')
        .set('Authorization', auth)
        .send({ healthNotifications: false })
        .expect(200);
      expect(res.body).toMatchObject({ healthNotifications: false, deviceLocationSharing: true });
      const bad = await t
        .http()
        .patch('/v1/me/preferences')
        .set('Authorization', auth)
        .send({ healthNotifications: null })
        .expect(400);
      expect(bad.body.errors).toEqual([{ field: 'healthNotifications', code: 'REQUIRED' }]);
    });
  });

  it('DELETE /v1/me supprime le compte, ses sessions et invalide ses jetons', async () => {
    await t.http().delete('/v1/me').set('Authorization', auth).expect(204);
    await t.http().get('/v1/me').set('Authorization', auth).expect(401);
    await t.http().post('/v1/auth/refresh').send({ refreshToken }).expect(401);
    expect(await t.prisma.consent.count()).toBe(0);
    await t
      .http()
      .post('/v1/auth/login')
      .send({ email: 'camille.martin@example.com', password: 'chien-oslo-2026' })
      .expect(401);
  });
});
