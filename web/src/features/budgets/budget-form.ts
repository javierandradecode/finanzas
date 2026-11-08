import { z } from 'zod'

export interface BudgetItem {
  budgetId: string
  categoryId: string
  name: string
  icon: string
  color: string
  limitCents: number
  spentCents: number
  /** Negative when the budget is exceeded. */
  remainingCents: number
  /** Percentage with one decimal (not money). */
  percentUsed: number
  overBudget: boolean
}

export interface CopyResult {
  copied: number
  skipped: { categoryId: string; reason: 'already-exists' | 'category-archived' }[]
}

/**
 * Bar colour. Red follows the API's own `overBudget` (spent > limit), not the
 * rounded percentage; amber starts at 80 %.
 */
export function budgetStatus(item: {
  overBudget: boolean
  percentUsed: number
}): 'ok' | 'warn' | 'over' {
  if (item.overBudget) return 'over'
  return item.percentUsed >= 80 ? 'warn' : 'ok'
}

export interface BudgetFormValues {
  categoryId: string
  /** null = empty, NaN = text that is not an amount (see MoneyInput). */
  limitCents: number | null
}

export const budgetSchema = z
  .object({
    categoryId: z.string().min(1, 'Elige una categoría'),
    limitCents: z.number({ message: 'Monto no válido' }).nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.limitCents === null) {
      ctx.addIssue({ code: 'custom', path: ['limitCents'], message: 'Ingresa un monto' })
    } else if (v.limitCents < 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['limitCents'],
        message: 'El límite debe ser mayor que 0',
      })
    }
  })

/** What to tell the user after "copy previous month". */
export function copyMessage(r: CopyResult): { kind: 'success' | 'info'; text: string } {
  const existing = r.skipped.filter((s) => s.reason === 'already-exists').length
  const archived = r.skipped.filter((s) => s.reason === 'category-archived').length
  const parts = [
    existing > 0 ? `${existing} ${existing === 1 ? 'ya existía' : 'ya existían'}` : '',
    archived > 0 ? `${archived} con categoría archivada` : '',
  ].filter(Boolean)

  if (r.copied > 0) {
    const head = `${r.copied} ${r.copied === 1 ? 'presupuesto copiado' : 'presupuestos copiados'}`
    return { kind: 'success', text: [head, ...parts].join(', ') }
  }
  if (parts.length > 0) {
    return { kind: 'info', text: `No se copió nada: ${parts.join(', ')}` }
  }
  return { kind: 'info', text: 'No había presupuestos en el mes anterior' }
}
