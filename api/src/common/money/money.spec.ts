import { formatCents, toCents } from './money';

describe('toCents', () => {
  it.each([
    ['19.99', 1999],
    ['0.1', 10],
    ['5', 500],
    ['1234.50', 123450],
    ['-5.25', -525],
  ])('converts %s to %i cents', (input, expected) => {
    expect(toCents(input)).toBe(expected);
  });

  it.each(['19.999', '1,50', '', 'abc'])('rejects %p', (input) => {
    expect(() => toCents(input)).toThrow();
  });
});

describe('formatCents', () => {
  it('formats cents as USD', () => {
    const out = formatCents(1999);
    expect(out).toContain('19,99');
    expect(out).toContain('$');
  });

  it('formats zero', () => {
    expect(formatCents(0)).toContain('0,00');
  });

  it('rejects non-integer cents', () => {
    expect(() => formatCents(1.5)).toThrow();
  });
});
