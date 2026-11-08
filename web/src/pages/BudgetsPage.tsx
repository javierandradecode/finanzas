import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useBudgetReport, useCopyBudgets, useDeleteBudget } from '@/api/budgets'
import { useCategories } from '@/api/categories'
import { CategoryIcon } from '@/components/CategoryIcon'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ProgressBar } from '@/components/ProgressBar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/features/auth/useAuth'
import { BudgetDialog } from '@/features/budgets/BudgetDialog'
import { budgetStatus, copyMessage, type BudgetItem } from '@/features/budgets/budget-form'
import { formatMonth } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import {
  currentMonthKey,
  monthFromSearch,
  monthsBetween,
  nextMonth,
  previousMonth,
} from '@/lib/months'
import { cn } from '@/lib/utils'

const MAX_MONTHS_AHEAD = 12

const errorText = (e: unknown) =>
  e instanceof Error ? e.message : 'Ocurrió un error inesperado'

const percentText = (p: number) =>
  `${new Intl.NumberFormat('es', { maximumFractionDigits: 1 }).format(p)} %`

export function BudgetsPage() {
  const currency = useAuth().user?.currency ?? 'USD'
  const [params, setParams] = useSearchParams()
  const month = monthFromSearch(params)
  const canGoNext = monthsBetween(currentMonthKey(), month) < MAX_MONTHS_AHEAD

  const { data, isPending, error } = useBudgetReport(month)
  const categories = useCategories(true).data
  const remove = useDeleteBudget()
  const copy = useCopyBudgets()

  const [dialog, setDialog] = useState<{ item?: BudgetItem } | null>(null)
  const [toDelete, setToDelete] = useState<BudgetItem | null>(null)

  const money = (cents: number) => formatMoney(cents, currency)
  const taken = (data?.items ?? []).map((i) => i.categoryId)
  const available = (categories ?? []).filter(
    (c) => c.type === 'expense' && !c.isArchived && !taken.includes(c._id),
  )
  const nothingToAdd = categories !== undefined && data !== undefined && available.length === 0

  const runCopy = async () => {
    try {
      const result = await copy.mutateAsync({ from: previousMonth(month), to: month })
      const { kind, text } = copyMessage(result)
      if (kind === 'success') toast.success(text)
      else toast.info(text)
    } catch (e) {
      toast.error(errorText(e))
    }
  }

  const totals = data?.totals
  const remaining = totals ? totals.limitCents - totals.spentCents : 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Presupuestos</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={copy.isPending} onClick={() => void runCopy()}>
            Copiar mes anterior
          </Button>
          <Button disabled={nothingToAdd} onClick={() => setDialog({})}>
            <Plus className="size-4" /> Nuevo presupuesto
          </Button>
        </div>
      </div>
      {nothingToAdd && (
        <p className="text-sm text-muted-foreground">
          Todas las categorías de gasto ya tienen presupuesto este mes.
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label="Mes anterior"
          onClick={() => setParams({ month: previousMonth(month) })}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span data-testid="month" className="min-w-40 text-center text-lg font-medium first-letter:uppercase">
          {formatMonth(month)}
        </span>
        <Button
          variant="outline"
          size="icon"
          aria-label="Mes siguiente"
          disabled={!canGoNext}
          onClick={() => setParams({ month: nextMonth(month) })}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {isPending && <p className="text-muted-foreground">Cargando…</p>}
      {error && (
        <p role="alert" className="text-destructive">
          {errorText(error)}
        </p>
      )}

      {data && totals && data.items.length > 0 && (
        <Card>
          <CardContent className="space-y-3">
            <dl className="grid gap-3 text-sm sm:grid-cols-4">
              <Stat label="Límite total" id="sum-limit" value={money(totals.limitCents)} />
              <Stat label="Gastado" id="sum-spent" value={money(totals.spentCents)} />
              <Stat
                label={remaining >= 0 ? 'Restante' : 'Excedido'}
                id="sum-remaining"
                value={money(Math.abs(remaining))}
                danger={remaining < 0}
              />
              <Stat
                label="Presupuestos"
                id="sum-over"
                value={
                  totals.overBudgetCount === 0
                    ? 'Ninguno excedido'
                    : `${totals.overBudgetCount} ${totals.overBudgetCount === 1 ? 'excedido' : 'excedidos'}`
                }
                danger={totals.overBudgetCount > 0}
              />
            </dl>
            <ProgressBar
              value={totals.spentCents}
              max={totals.limitCents}
              tone={remaining < 0 ? 'over' : 'ok'}
            />
          </CardContent>
        </Card>
      )}

      {data && data.items.length === 0 && (
        <Card>
          <CardContent className="space-y-1 py-8 text-center">
            <p className="font-medium">No hay presupuestos este mes.</p>
            <p className="text-sm text-muted-foreground">
              Copia los del mes anterior o crea uno nuevo.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {data?.items.map((item) => (
          <Card key={item.budgetId} data-testid="budget">
            <CardContent className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span
                    className="flex size-9 items-center justify-center rounded-full"
                    style={{ backgroundColor: `${item.color}22` }}
                  >
                    <CategoryIcon name={item.icon} color={item.color} />
                  </span>
                  <span className="font-medium">{item.name}</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setDialog({ item })}>
                    Editar
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setToDelete(item)}>
                    Eliminar
                  </Button>
                </div>
              </div>
              <ProgressBar value={item.spentCents} max={item.limitCents} tone={budgetStatus(item)} />
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <p className={cn(item.overBudget && 'text-destructive')}>
                  Gastado {money(item.spentCents)} de {money(item.limitCents)} ·{' '}
                  {item.remainingCents >= 0
                    ? `queda ${money(item.remainingCents)}`
                    : `excedido por ${money(-item.remainingCents)}`}
                </p>
                <span data-testid="percent" className="text-muted-foreground">
                  {percentText(item.percentUsed)}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        El gasto incluye las compras con tarjeta y a cuotas en su fecha de compra.
      </p>

      {dialog && (
        <BudgetDialog
          key={dialog.item?.budgetId ?? 'new'}
          open
          onOpenChange={(open) => !open && setDialog(null)}
          month={month}
          takenCategoryIds={taken}
          item={dialog.item}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="¿Eliminar presupuesto?"
        description="Se borrará el límite de esta categoría para este mes. Los gastos no se tocan."
        confirmLabel="Eliminar"
        onConfirm={async () => {
          if (!toDelete) return
          try {
            await remove.mutateAsync(toDelete.budgetId)
            toast.success('Presupuesto eliminado')
          } catch (e) {
            toast.error(errorText(e))
          }
        }}
      />
    </div>
  )
}

function Stat({
  label,
  id,
  value,
  danger = false,
}: {
  label: string
  id: string
  value: string
  danger?: boolean
}) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd data-testid={id} className={cn('font-semibold', danger && 'text-destructive')}>
        {value}
      </dd>
    </div>
  )
}
