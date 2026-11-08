import { endOfRange } from './date-range';

describe('endOfRange', () => {
  it('a date-only value covers the whole day in UTC', () => {
    expect(endOfRange('2026-03-31').toISOString()).toBe(
      '2026-03-31T23:59:59.999Z',
    );
  });

  it('a full ISO datetime is kept as is', () => {
    expect(endOfRange('2026-03-31T10:00:00Z').toISOString()).toBe(
      '2026-03-31T10:00:00.000Z',
    );
  });
});
