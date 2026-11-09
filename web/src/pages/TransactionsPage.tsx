import { Download, Plus, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useAccounts } from '@/api/accounts'
import { useCategories } from '@/api/categories'
import { useCreditCards } from '@/api/credit-cards'
import {
  useDeleteTransaction,
  useExportTransactions,
  useTransactions,
  useTransactionsSummary,
  type Transaction,
} from '@/api/transactions'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { MonthSelector } from '@/components/MonthSelector'
import { NativeSelect } from '@/components/NativeSelect'
import { Segmented } from '@/components/Segmented'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/features/auth/useAuth'
import { groupByDay } from '@/features/transactions/day-groups'
import {
  filtersFromSearch,
  filtersToSearch,
  type TxFilters,
} from '@/features/transactions/filters'
import { TransactionDialog } from '@/features/transactions/TransactionDialog'
import {
  TransactionRow,
  type Lookups,
} from '@/features/transactions/TransactionRow'
import type { TxType } from '@/features/transactions/transaction-form'
import { formatDateUtc, formatDayUtc, formatMonth } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { currentMonthKey, monthDateRange, monthOfRange } from '@/lib/months'
import { cn } from '@/lib/utils'
import { useSlow } from '@/lib/use-slow'

const PAGE_SIZE = 20

const TYPE_FILTERS: { value: '' | TxType; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'expense', label: 'Gastos' },
  { value: 'income', label: 'Ingresos' },
  { value: 'transfer', label: 'Transferencias' },
]

const errorText = (e: unknown) =>
  e instanceof Error ? e.message : 'Ocurrió un error inesperado'

const dayStart = (ymd: string) => `${ymd}T00:00:00.000Z`

function ListSkeleton() {
  return (
    <div data-testid="transactions-skeleton" aria-hidden className="animate-pulse space-y-6">
      {[0, 1].map((i) => (
        <div key={i} className="space-y-3">
          <div className="h-4 w-40 rounded bg-muted" />
          {[0, 1, 2].map((j) => (
            <div key={j} className="flex items-center gap-3">
              <div className="size-9 rounded-full bg-muted" />
              <div className="h-10 flex-1 rounded-md bg-muted" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export function TransactionsPage() {
  const { user } = useAuth()
  const currency = user?.currency ?? 'USD'
  const [params, setParams] = useSearchParams()
  const filters = filtersFromSearch(params)

  const { data, isPending, error } = useTransactions(filters)
  const summary = useTransactionsSummary(filters).data
  const accounts = useAccounts(true).data
  const cards = useCreditCards(true).data
  const categories = useCategories(true).data
  const remove = useDeleteTransaction()
  const exportCsv = useExportTransactions()
  const slow = useSlow(isPending)

  const [dialog, setDialog] = useState<{ tx?: Transaction } | null>(null)
  const [toDelete, setToDelete] = useState<Transaction | null>(null)
  const [showMore, setShowMore] = useState(false)

  const lookups = useMemo<Lookups>(
    () => ({
      accounts: new Map((accounts ?? []).map((a) => [a._id, a.name])),
      cards: new Map((cards ?? []).map((c) => [c._id, c.name])),
      categories: new Map((categories ?? []).map((c) => [c._id, c])),
    }),
    [accounts, cards, categories],
  )

  /** Any filter change goes back to page 1. */
  const setFilters = (change: Partial<TxFilters>) =>
    setParams(filtersToSearch({ ...filters, ...change, page: 1 }))
  const setPage = (page: number) => setParams(filtersToSearch({ ...filters, page }))

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  const month = monthOfRange(filters.from, filters.to)
  const allTime = !filters.from && !filters.to
  const narrowed = Boolean(filters.type || filters.accountId || filters.categoryId)

  const chips = [
    filters.accountId ? {
      label: `Cuenta: ${lookups.accounts.get(filters.accountId) ?? '…'}`,
      remove: 'Quitar filtro de cuenta',
      clear: () => setFilters({ accountId: undefined }),
    } : undefined,
    filters.categoryId ? {
      label: `Categoría: ${lookups.categories.get(filters.categoryId)?.name ?? '…'}`,
      remove: 'Quitar filtro de categoría',
      clear: () => setFilters({ categoryId: undefined }),
    } : undefined,
  ].filter((c): c is NonNullable<typeof c> => Boolean(c))

  const net = summary ? summary.incomeCents - summary.expenseCents : 0

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Movimientos</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={exportCsv.isPending}
            onClick={() =>
              exportCsv.mutate(filters, {
                onError: (e) => toast.error(errorText(e)),
              })
            }
          >
            <Download className="size-4" /> Exportar CSV
          </Button>
          <Button onClick={() => setDialog({})}>
            <Plus className="size-4" /> Nuevo movimiento
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {month ? (
            <MonthSelector month={month} onChange={(m) => setFilters(monthDateRange(m))} />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span data-testid="period" className="text-lg font-medium">
                {allTime ? 'Todo el historial' : 'Rango personalizado'}
              </span>
              {!allTime && (
                <span className="text-sm text-muted-foreground">
                  {filters.from ? formatDateUtc(dayStart(filters.from)) : '…'} –{' '}
                  {filters.to ? formatDateUtc(dayStart(filters.to)) : '…'}
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFilters(monthDateRange(currentMonthKey()))}
              >
                Este mes
              </Button>
            </div>
          )}
          <Segmented
            label="Tipo"
            value={filters.type ?? ''}
            options={TYPE_FILTERS}
            onChange={(v) => setFilters({ type: v || undefined })}
          />
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={showMore}
            onClick={() => setShowMore((s) => !s)}
          >
            Más filtros
          </Button>
        </div>

        {showMore && (
          <Card>
            <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="space-y-1">
                <Label htmlFor="f-from">Desde</Label>
                <Input
                  id="f-from"
                  type="date"
                  value={filters.from ?? ''}
                  onChange={(e) => setFilters({ from: e.target.value || undefined })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="f-to">Hasta</Label>
                <Input
                  id="f-to"
                  type="date"
                  value={filters.to ?? ''}
                  onChange={(e) => setFilters({ to: e.target.value || undefined })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="f-account">Cuenta</Label>
                <NativeSelect
                  id="f-account"
                  value={filters.accountId ?? ''}
                  onChange={(e) => setFilters({ accountId: e.target.value || undefined })}
                >
                  <option value="">Todas</option>
                  {accounts?.map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1">
                <Label htmlFor="f-category">Categoría</Label>
                <NativeSelect
                  id="f-category"
                  value={filters.categoryId ?? ''}
                  onChange={(e) => setFilters({ categoryId: e.target.value || undefined })}
                >
                  <option value="">Todas</option>
                  {categories?.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </CardContent>
          </Card>
        )}

        {chips.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {chips.map((chip) => (
              <li
                key={chip.remove}
                className="inline-flex items-center gap-1 rounded-full bg-secondary py-0.5 pr-1 pl-3 text-sm"
              >
                {chip.label}
                <button
                  type="button"
                  aria-label={chip.remove}
                  onClick={chip.clear}
                  className="rounded-full p-1.5 outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <X className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {summary && (
        <dl data-testid="summary" className="flex flex-wrap gap-x-10 gap-y-2">
          <div>
            <dt className="text-sm text-muted-foreground">Ingresos</dt>
            <dd data-testid="summary-income" className="font-semibold tabular-nums">
              {formatMoney(summary.incomeCents, currency)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Gastos</dt>
            <dd data-testid="summary-expense" className="font-semibold tabular-nums">
              {formatMoney(summary.expenseCents, currency)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Neto</dt>
            <dd
              data-testid="summary-net"
              className={cn('font-semibold tabular-nums', net < 0 && 'text-destructive')}
            >
              {formatMoney(net, currency)}
            </dd>
          </div>
        </dl>
      )}

      {isPending && (
        <>
          <ListSkeleton />
          {slow && (
            <p role="status" className="text-sm text-muted-foreground">
              La primera carga puede tardar hasta un minuto: el servidor gratuito se
              estaba despertando.
            </p>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {errorText(error)}
        </p>
      )}

      {data && data.items.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            {data.total > 0 ? (
              <>
                <p className="font-medium">Esta página no tiene movimientos.</p>
                <Button variant="outline" onClick={() => setPage(1)}>
                  Ir a la primera página
                </Button>
              </>
            ) : narrowed ? (
              <>
                <p className="font-medium">No hay movimientos con estos filtros.</p>
                <Button
                  variant="outline"
                  onClick={() =>
                    setFilters({ type: undefined, accountId: undefined, categoryId: undefined })
                  }
                >
                  Quitar filtros
                </Button>
              </>
            ) : allTime ? (
              <>
                <p className="font-medium">Aún no registras movimientos.</p>
                <p className="text-muted-foreground">
                  Usa «Nuevo movimiento» para anotar el primero.
                </p>
              </>
            ) : (
              <>
                <p className="font-medium">
                  {month
                    ? `No hay movimientos en ${formatMonth(month)}.`
                    : 'No hay movimientos en este rango.'}
                </p>
                <Button
                  variant="outline"
                  onClick={() => setFilters({ from: undefined, to: undefined })}
                >
                  Ver todo el historial
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {data &&
        groupByDay(data.items).map((group) => (
          <section key={group.day}>
            <h2 className="border-b pb-2 text-sm font-medium text-muted-foreground first-letter:uppercase">
              {formatDayUtc(dayStart(group.day))}
            </h2>
            <ul className="divide-y">
              {group.items.map((tx) => (
                <TransactionRow
                  key={tx._id}
                  tx={tx}
                  lookups={lookups}
                  currency={currency}
                  onEdit={() => setDialog({ tx })}
                  onDelete={() => setToDelete(tx)}
                />
              ))}
            </ul>
          </section>
        ))}

      {data && data.total > 0 && (
        <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            Página {filters.page} de {totalPages} · {data.total} movimientos
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={filters.page <= 1}
              onClick={() => setPage(filters.page - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={filters.page >= totalPages}
              onClick={() => setPage(filters.page + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}

      {dialog && (
        <TransactionDialog
          key={dialog.tx?._id ?? 'new'}
          open
          onOpenChange={(open) => !open && setDialog(null)}
          transaction={dialog.tx}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="¿Eliminar movimiento?"
        description="Se borrará y los saldos de las cuentas o tarjetas volverán a como estaban antes. No se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={async () => {
          if (!toDelete) return
          try {
            await remove.mutateAsync(toDelete._id)
            toast.success('Movimiento eliminado')
          } catch (e) {
            toast.error(errorText(e))
          }
        }}
      />
    </div>
  )
}
