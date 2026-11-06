import { E164, fallbackNames, normalizeEmail } from './identity';

describe('identity', () => {
  it("normalise l'e-mail", () => {
    expect(normalizeEmail('  Camille.Martin@Example.COM ')).toBe('camille.martin@example.com');
  });

  it('valide le format E.164', () => {
    expect(E164.test('+33612345678')).toBe(true);
    expect(E164.test('0612345678')).toBe(false);
    expect(E164.test('+33 6 12 34 56 78')).toBe(false);
  });

  it("utilise la partie locale de l'e-mail quand le fournisseur ne donne pas de nom", () => {
    expect(fallbackNames('nala.owner@privaterelay.appleid.com', null, null)).toEqual({
      firstName: 'nala.owner',
      lastName: '',
    });
    expect(fallbackNames('x@y.z', 'Camille', 'Martin')).toEqual({ firstName: 'Camille', lastName: 'Martin' });
  });
});
