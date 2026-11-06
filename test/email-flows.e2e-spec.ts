import { createTestApp, registration, resetDatabase, waitForMail, type TestContext } from './helpers';

const EMAIL = 'camille.martin@example.com';

describe('Vérification d’e-mail et mot de passe oublié', () => {
  let t: TestContext;

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    t.mailer.sent.length = 0;
  });
  afterAll(() => t.close());

  const tokenFromMail = () => {
    const mail = t.mailer.lastTo(EMAIL)!;
    return new URL(/(http\S+verify-email\S+)/.exec(mail.text)![1]).searchParams.get('token')!;
  };

  describe('vérification', () => {
    it('le lien de l’e-mail confirme l’adresse (page HTML), puis ne sert plus', async () => {
      const session = (await t.http().post('/v1/auth/register').send(registration()).expect(201)).body;
      const token = tokenFromMail();

      const page = await t
        .http()
        .get(`/v1/auth/verify-email?token=${encodeURIComponent(token)}`)
        .expect(200);
      expect(page.text).toContain('Adresse confirmée');
      const me = await t.http().get('/v1/me').set('Authorization', `Bearer ${session.accessToken}`);
      expect(me.body.emailVerified).toBe(true);

      const again = await t
        .http()
        .get(`/v1/auth/verify-email?token=${encodeURIComponent(token)}`)
        .expect(400);
      expect(again.text).toContain('Lien expiré');
    });

    it('version JSON pour l’app', async () => {
      await t.http().post('/v1/auth/register').send(registration()).expect(201);
      await t.http().post('/v1/auth/verify-email').send({ token: tokenFromMail() }).expect(204);
      const res = await t.http().post('/v1/auth/verify-email').send({ token: 'pev_faux' }).expect(400);
      expect(res.body.code).toBe('INVALID_OR_EXPIRED_TOKEN');
    });

    it('renvoyer un lien invalide le précédent', async () => {
      const session = (await t.http().post('/v1/auth/register').send(registration()).expect(201)).body;
      const first = tokenFromMail();
      await t
        .http()
        .post('/v1/auth/resend-verification')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(204);
      const second = tokenFromMail();
      expect(second).not.toBe(first);
      await t.http().post('/v1/auth/verify-email').send({ token: first }).expect(400);
      await t.http().post('/v1/auth/verify-email').send({ token: second }).expect(204);
    });
  });

  describe('mot de passe oublié', () => {
    it('répond 202 que le compte existe ou non', async () => {
      await t.http().post('/v1/auth/forgot-password').send({ email: 'personne@example.com' }).expect(202);
      expect(t.mailer.sent).toHaveLength(0);
    });

    it('code reçu par e-mail → nouveau mot de passe, toutes les sessions fermées', async () => {
      const session = (await t.http().post('/v1/auth/register').send(registration()).expect(201)).body;
      await t.http().post('/v1/auth/forgot-password').send({ email: EMAIL }).expect(202);
      const code = /(\d{6})/.exec((await waitForMail(t.mailer, EMAIL, 'code')).subject)![1];

      await t
        .http()
        .post('/v1/auth/reset-password')
        .send({ email: EMAIL, code, newPassword: 'nouveau-chien-2026' })
        .expect(204);

      await t.http().post('/v1/auth/refresh').send({ refreshToken: session.refreshToken }).expect(401);
      await t.http().get('/v1/me').set('Authorization', `Bearer ${session.accessToken}`).expect(401);
      await t.http().post('/v1/auth/login').send({ email: EMAIL, password: 'chien-oslo-2026' }).expect(401);
      const login = await t
        .http()
        .post('/v1/auth/login')
        .send({ email: EMAIL, password: 'nouveau-chien-2026' })
        .expect(200);
      expect(login.body.user.emailVerified).toBe(true);
      // Le code ne sert qu'une fois.
      await t
        .http()
        .post('/v1/auth/reset-password')
        .send({ email: EMAIL, code, newPassword: 'encore-un-autre-2026' })
        .expect(400);
    });

    it('brûle le code après 5 essais ratés', async () => {
      await t.http().post('/v1/auth/register').send(registration()).expect(201);
      await t.http().post('/v1/auth/forgot-password').send({ email: EMAIL }).expect(202);
      const code = /(\d{6})/.exec((await waitForMail(t.mailer, EMAIL, 'code')).subject)![1];
      const wrong = code === '000000' ? '111111' : '000000';

      for (let i = 0; i < 5; i++) {
        const res = await t
          .http()
          .post('/v1/auth/reset-password')
          .send({ email: EMAIL, code: wrong, newPassword: 'nouveau-chien-2026' })
          .expect(400);
        expect(res.body.code).toBe('INVALID_OR_EXPIRED_TOKEN');
      }
      await t
        .http()
        .post('/v1/auth/reset-password')
        .send({ email: EMAIL, code, newPassword: 'nouveau-chien-2026' })
        .expect(400);
    });

    it('applique la politique de mot de passe au nouveau mot de passe', async () => {
      await t.http().post('/v1/auth/register').send(registration()).expect(201);
      const res = await t
        .http()
        .post('/v1/auth/reset-password')
        .send({ email: EMAIL, code: '123456', newPassword: 'court' })
        .expect(400);
      expect(res.body.errors).toEqual([{ field: 'newPassword', code: 'PASSWORD_TOO_SHORT' }]);
    });
  });
});
