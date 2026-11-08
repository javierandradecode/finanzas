export interface ScheduleInput {
  totalCents: number
  installments: number
  annualRatePercent: number
}

export interface PreviewItem {
  number: number
  principalCents: number
  interestCents: number
  paymentCents: number
  remainingPrincipalCents: number
}

export interface SchedulePreview {
  items: PreviewItem[]
  firstPaymentCents: number
  totalInterestCents: number
  totalPaidCents: number
}

/**
 * Same amortisation as the API (api/src/installment-purchases/installment-schedule.ts):
 * - rate 0: total / n with the leftover cents in the first installment;
 * - rate > 0: fixed French-system payment (monthly rate = annual / 12); the last
 *   installment's principal is whatever remains.
 * Returns null where the API would reject the input, so a live preview never throws.
 */
export function previewSchedule(input: ScheduleInput): SchedulePreview | null {
  const { totalCents, installments, annualRatePercent } = input
  if (!Number.isInteger(totalCents) || totalCents < 1) return null
  if (!Number.isInteger(installments) || installments < 1) return null
  if (totalCents < installments) return null
  if (!(annualRatePercent >= 0)) return null

  const monthlyRate = annualRatePercent / 100 / 12
  const base = Math.floor(totalCents / installments)
  const leftover = totalCents - base * installments
  const payment =
    monthlyRate === 0
      ? 0
      : Math.round(
          (totalCents * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -installments)),
        )

  const items: PreviewItem[] = []
  let remaining = totalCents
  for (let i = 0; i < installments; i++) {
    const isLast = i === installments - 1
    const interest = Math.round(remaining * monthlyRate)
    const principal =
      monthlyRate === 0
        ? i === 0
          ? base + leftover
          : base
        : isLast
          ? remaining
          : payment - interest
    if (principal < 1) return null
    remaining -= principal
    items.push({
      number: i + 1,
      principalCents: principal,
      interestCents: interest,
      paymentCents: principal + interest,
      remainingPrincipalCents: remaining,
    })
  }
  if (remaining !== 0) return null

  const totalInterestCents = items.reduce((s, i) => s + i.interestCents, 0)
  return {
    items,
    firstPaymentCents: items[0].paymentCents,
    totalInterestCents,
    totalPaidCents: totalCents + totalInterestCents,
  }
}
