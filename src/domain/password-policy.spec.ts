import { checkPasswordLocally, passwordLength } from './password-policy';

describe('checkPasswordLocally', () => {
  it('refuse moins de 8 caractères', () => {
    expect(checkPasswordLocally('abc1234')).toBe('PASSWORD_TOO_SHORT');
  });

  it('compte les caractères Unicode, pas les octets', () => {
    expect(passwordLength('🐶🐶🐶🐶🐶🐶🐶🐶')).toBe(8);
    expect(checkPasswordLocally('🐶🐶🐶🐶🐶🐶🐶🐶')).toBeNull();
  });

  it('refuse plus de 128 caractères', () => {
    expect(checkPasswordLocally('a'.repeat(129))).toBe('PASSWORD_TOO_LONG');
  });

  it('refuse un mot de passe courant, quelle que soit la casse', () => {
    expect(checkPasswordLocally('Password1')).toBe('PASSWORD_TOO_COMMON');
    expect(checkPasswordLocally('12345678')).toBe('PASSWORD_TOO_COMMON');
  });

  it("refuse la partie locale de l'e-mail", () => {
    expect(checkPasswordLocally('camillemartin', { email: 'camillemartin@example.com' })).toBe(
      'PASSWORD_TOO_COMMON',
    );
  });

  it('accepte une phrase de passe sans règle de composition', () => {
    expect(checkPasswordLocally('chien-oslo-2026')).toBeNull();
  });
});
