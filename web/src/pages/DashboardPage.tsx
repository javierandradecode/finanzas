import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useBudgetReport } from '@/api/budgets'
import { useIncomeVsExpenses, useSpendingByCategory, useSummary } from '@/api/reports'
import { MonthSelector } from '@/components/MonthSelector'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/features/auth/useAuth'
import { BudgetBars } from '@/features/dashboard/BudgetBars'
import { lastMonthsRange } from '@/features/dashboard/dashboard-data'
import { MonthlyBars } from '@/features/dashboard/MonthlyBars'
import { SpendingDonut } from '@/features/dashboard/SpendingDonut'
import { SummaryCards } from '@/features/dashboard/SummaryCards'
import { UpcomingPayments } from '@/features/dashboard/UpcomingPayments'
import { monthDateRange, monthFromSearch } from '@/lib/months'
import { cn } from '@/lib/utils'

export function DashboardPage() {
  const currency = useAuth().user?.currency ?? 'USD'
  const [params, setParams] = useSearchParams()
  const month = monthFromSearch(params)
  const { from, to } = monthDateRange(month)
  const range = lastMonthsRange(month)

  const summary = useSummary(month)
  const spending = useSpendingByCategory(from, to)
  const flow = useIncomeVsExpenses(range.from, range.to)
  const budgets = useBudgetReport(month)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Resumen</h1>
        <MonthSelector month={month} onChange={(m) => setParams({ month: m })} />
      </div>

      <Async query={summary}>
        {(s) => <SummaryCards summary={s} currency={currency} />}
      </Async>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Gasto por categoría">
          <Async query={spending}>
            {(r) => <SpendingDonut report={r} currency={currency} />}
          </Async>
        </Panel>
        <Panel title="Ingresos y gastos">
          <Async query={flow}>{(f) => <MonthlyBars flow={f} currency={currency} />}</Async>
        </Panel>
        <Panel title="Presupuesto contra real">
          <Async query={budgets}>
            {(b) => <BudgetBars items={b.items} currency={currency} />}
          </Async>
        </Panel>
        <Panel title="Próximos pagos">
          <Async query={summary}>
            {(s) => (
              <UpcomingPayments
                subscriptions={s.upcomingSubscriptions}
                installments={s.installmentProjection}
                currency={currency}
              />
            )}
          </Async>
        </Panel>
      </div>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <Card>
        <CardContent className="space-y-3">
          <h2 className="font-semibold">{title}</h2>
          {children}
        </CardContent>
      </Card>
    </section>
  )
}

/** Loading, error or data for one query, so a failing report only breaks its own panel. */
function Async<T>({
  query,
  children,
}: {
  query: { data: T | undefined; isPlaceholderData: boolean; error: Error | null }
  children: (data: T) => ReactNode
}) {
  if (query.data !== undefined) {
    // While another month loads we keep showing the old numbers, but dimmed so
    // nobody reads them as the new month's.
    return (
      <div
        aria-busy={query.isPlaceholderData}
        className={cn('transition-opacity', query.isPlaceholderData && 'opacity-50')}
      >
        {children(query.data)}
      </div>
    )
  }
  if (query.error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {query.error.message}
      </p>
    )
  }
  return <p className="text-sm text-muted-foreground">Cargando…</p>
}
