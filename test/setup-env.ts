process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://pawrise_auth:pawrise_auth@localhost:54330/pawrise_auth_test';
process.env.EMAIL_TOKEN_SECRET = 'test-secret-0123456789abcdef-0123456789';
process.env.HIBP_ENABLED = 'false';
process.env.APPLE_AUDIENCES = 'fr.pawrise.app';
process.env.GOOGLE_CLIENT_IDS =
  'ios-client.apps.googleusercontent.com,android-client.apps.googleusercontent.com';
process.env.TERMS_VERSION = '2026-10';
process.env.PUBLIC_BASE_URL = 'http://localhost:8200';
