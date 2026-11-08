import { BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  CardDebtQuery,
  MonthQuery,
  MonthRangeQuery,
  SpendingQuery,
} from './reports.queries';

describe('report query DTOs', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });
  const run = (metatype: new () => object, q: Record<string, unknown>) =>
    pipe.transform(q, { type: 'query', metatype });

  describe('SpendingQuery', () => {
    it.each(['2026-03-01', '2026-03-31T10:00:00Z'])(
      'accepts %s',
      async (value) => {
        await expect(
          run(SpendingQuery, { from: value, to: value }),
        ).resolves.toBeDefined();
      },
    );

    it.each(['abc', '2026-02-31', '31/03/2026'])(
      'rejects %p',
      async (value) => {
        await expect(
          run(SpendingQuery, { from: value }),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(run(SpendingQuery, { to: value })).rejects.toBeInstanceOf(
          BadRequestException,
        );
      },
    );

    it('allows both to be omitted', async () => {
      await expect(run(SpendingQuery, {})).resolves.toBeDefined();
    });
  });

  describe.each([
    ['MonthRangeQuery', MonthRangeQuery, ['from', 'to']],
    ['MonthQuery', MonthQuery, ['month']],
  ] as const)('%s', (_name, metatype, fields) => {
    it.each(fields)(
      'accepts 2026-03 and rejects bad months in `%s`',
      async (field) => {
        await expect(
          run(metatype, { [field]: '2026-03' }),
        ).resolves.toBeDefined();
        for (const bad of ['2026-13', '2026-3', '2026-00', 'abc']) {
          await expect(run(metatype, { [field]: bad })).rejects.toBeInstanceOf(
            BadRequestException,
          );
        }
      },
    );
  });

  describe('CardDebtQuery', () => {
    it('defaults to 12 months', async () => {
      expect(((await run(CardDebtQuery, {})) as CardDebtQuery).months).toBe(12);
    });

    it('parses months from the query string', async () => {
      expect(
        ((await run(CardDebtQuery, { months: '36' })) as CardDebtQuery).months,
      ).toBe(36);
    });

    it.each(['0', '37', 'abc', '2.5'])('rejects months=%s', async (months) => {
      await expect(run(CardDebtQuery, { months })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
