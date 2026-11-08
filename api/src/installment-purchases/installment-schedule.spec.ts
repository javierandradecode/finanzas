import { buildSchedule, ScheduleItem } from './installment-schedule';

const dueDates = (n: number) =>
  Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 3 + i, 5)));

const build = (totalCents: number, installments: number, rate = 0) =>
  buildSchedule({
    totalCents,
    installments,
    annualRatePercent: rate,
    dueDates: dueDates(installments),
  });

describe('buildSchedule without interest', () => {
  it('splits 1200.00 into 12 equal installments', () => {
    const schedule = build(120000, 12);
    expect(schedule).toHaveLength(12);
    for (const item of schedule) {
      expect(item.principalCents).toBe(10000);
      expect(item.interestCents).toBe(0);
      expect(item.paymentCents).toBe(10000);
    }
  });

  it('puts the leftover cents in the first installment', () => {
    expect(build(100000, 3).map((i) => i.principalCents)).toEqual([
      33334, 33333, 33333,
    ]);
    // 100000 / 7 = 14285 remainder 5 -> all 5 extra cents in the first one
    expect(build(100000, 7).map((i) => i.principalCents)).toEqual([
      14290, 14285, 14285, 14285, 14285, 14285, 14285,
    ]);
  });
});

describe('buildSchedule with interest', () => {
  it('computes a fixed French-system payment for 1200.00 at 12% over 12 months', () => {
    const schedule = build(120000, 12, 12);
    const first = schedule[0];
    expect(first.interestCents).toBe(1200);
    expect(first.paymentCents).toBe(10662);
    expect(first.principalCents).toBe(9462);
    expect(first.remainingPrincipalCents).toBe(110538);
    expect(schedule[11].remainingPrincipalCents).toBe(0);
    // every installment but the last has the same payment
    expect(new Set(schedule.slice(0, 11).map((i) => i.paymentCents)).size).toBe(
      1,
    );
  });
});

describe('buildSchedule invariants', () => {
  const totals = [99999, 100000, 123457, 5000000];
  const counts = [2, 3, 7, 12, 60];
  const rates = [0, 5, 18.5, 100];

  it.each(
    totals.flatMap((t) =>
      counts.flatMap((n) => rates.map((r) => [t, n, r] as const)),
    ),
  )('total %i in %i installments at %f%%', (total, n, rate) => {
    const schedule: ScheduleItem[] = build(total, n, rate);
    const principal = schedule.reduce((s, i) => s + i.principalCents, 0);
    expect(principal).toBe(total);

    let remaining = total;
    schedule.forEach((item, idx) => {
      expect(item.number).toBe(idx + 1);
      expect(item.dueDate).toEqual(dueDates(n)[idx]);
      expect(Number.isInteger(item.principalCents)).toBe(true);
      expect(Number.isInteger(item.interestCents)).toBe(true);
      expect(item.principalCents).toBeGreaterThanOrEqual(1);
      expect(item.interestCents).toBeGreaterThanOrEqual(0);
      expect(item.paymentCents).toBe(item.principalCents + item.interestCents);
      remaining -= item.principalCents;
      expect(item.remainingPrincipalCents).toBe(remaining);
    });
    expect(remaining).toBe(0);
  });
});

describe('buildSchedule validation', () => {
  it('rejects a due date list of the wrong length', () => {
    expect(() =>
      buildSchedule({
        totalCents: 1000,
        installments: 3,
        annualRatePercent: 0,
        dueDates: dueDates(2),
      }),
    ).toThrow();
  });

  it.each([0, -5, 10.5])('rejects totalCents %p', (total) => {
    expect(() => build(total, 2)).toThrow();
  });

  it('rejects fewer installments than 1', () => {
    expect(() =>
      buildSchedule({
        totalCents: 1000,
        installments: 0,
        annualRatePercent: 0,
        dueDates: [],
      }),
    ).toThrow();
  });

  it('rejects a total smaller than the number of installments', () => {
    expect(() => build(1, 2)).toThrow();
  });

  it('rejects an amount too small to amortise at that rate', () => {
    expect(() => build(100, 60, 100)).toThrow();
  });
});
