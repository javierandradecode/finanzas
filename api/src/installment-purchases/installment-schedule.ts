export interface ScheduleItem {
  number: number;
  dueDate: Date;
  principalCents: number;
  interestCents: number;
  paymentCents: number;
  /** Principal still owed after this installment is paid. */
  remainingPrincipalCents: number;
}

export interface ScheduleInput {
  totalCents: number;
  installments: number;
  annualRatePercent: number;
  dueDates: Date[];
}

/**
 * Amortisation schedule for an installment purchase.
 *
 * - Rate 0: total / n, with all leftover cents in the first installment.
 * - Rate > 0: fixed payment (French system, monthly rate = annual / 12); the
 *   last installment's principal is whatever remains, absorbing rounding.
 *
 * The principal always sums exactly to `totalCents`.
 */
export function buildSchedule(input: ScheduleInput): ScheduleItem[] {
  const { totalCents, installments, annualRatePercent, dueDates } = input;
  if (!Number.isInteger(totalCents) || totalCents < 1) {
    throw new Error('totalCents must be an integer >= 1');
  }
  if (!Number.isInteger(installments) || installments < 1) {
    throw new Error('installments must be an integer >= 1');
  }
  if (dueDates.length !== installments) {
    throw new Error('dueDates must have one date per installment');
  }
  if (totalCents < installments) {
    throw new Error('totalCents must be at least one cent per installment');
  }

  const monthlyRate = annualRatePercent / 100 / 12;
  const principals =
    monthlyRate === 0 ? evenPrincipals(totalCents, installments) : null;
  const payment =
    monthlyRate === 0
      ? 0
      : Math.round(
          (totalCents * monthlyRate) /
            (1 - Math.pow(1 + monthlyRate, -installments)),
        );

  const schedule: ScheduleItem[] = [];
  let remaining = totalCents;
  for (let i = 0; i < installments; i++) {
    const isLast = i === installments - 1;
    const interest = Math.round(remaining * monthlyRate);
    const principal = principals
      ? principals[i]
      : isLast
        ? remaining
        : payment - interest;
    if (principal < 1) {
      throw new Error('Amount is too small to amortise at this rate');
    }
    remaining -= principal;
    schedule.push({
      number: i + 1,
      dueDate: dueDates[i],
      principalCents: principal,
      interestCents: interest,
      paymentCents: principal + interest,
      remainingPrincipalCents: remaining,
    });
  }
  if (remaining !== 0) {
    throw new Error('Amount is too small to amortise at this rate');
  }
  return schedule;
}

function evenPrincipals(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  const leftover = total - base * n;
  return Array.from({ length: n }, (_, i) =>
    i === 0 ? base + leftover : base,
  );
}
