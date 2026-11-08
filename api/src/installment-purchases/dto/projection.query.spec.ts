import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ProjectionQuery } from './projection.query';

describe('ProjectionQuery', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });
  const run = (q: Record<string, unknown>) =>
    pipe.transform(q, { type: 'query', metatype: ProjectionQuery });

  it('defaults to 12 months', async () => {
    expect(((await run({})) as ProjectionQuery).months).toBe(12);
  });

  it('parses months from the query string', async () => {
    expect(((await run({ months: '36' })) as ProjectionQuery).months).toBe(36);
    expect(((await run({ months: '1' })) as ProjectionQuery).months).toBe(1);
  });

  it.each([
    ['months 0', { months: '0' }],
    ['months 37', { months: '37' }],
    ['non-numeric months', { months: 'abc' }],
    ['fractional months', { months: '2.5' }],
    ['malformed card id', { creditCardId: 'abc' }],
  ])('rejects %s', async (_name, q) => {
    await expect(run(q)).rejects.toBeInstanceOf(BadRequestException);
  });
});
