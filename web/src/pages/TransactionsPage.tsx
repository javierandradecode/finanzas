import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useAccounts } from '@/api/accounts'
import { useCategories } from '@/api/categories'
import { useCreditCards } from '@/api/credit-cards'
import {
  useDeleteTransaction,
  useTransactions,
  type Transaction,
} from '@/api/transactions'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { NativeSelect } from '@/components/NativeSelect'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/features/auth/useAuth'
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

const PAGE_SIZE = 20

const errorText = (e: unknown) =>
  e instanceof Error ? e.message : 'Ocurrió un error inesperado'

export function TransactionsPage() {
  const { user } = useAuth()
  const currency = user?.currency ?? 'USD'
  const [params, setParams] = useSearchParams()
  const filters = filtersFromSearch(params)

  const { data, isPending, error } = useTransactions(filters)
  const accounts = useAccounts(true).data
  const cards = useCreditCards(true).data
  const categories = useCategories(true).data
  const remove = useDeleteTransaction()

  const [dialog, setDialog] = useState<{ tx?: Transaction } | null>(null)
  const [toDelete, setToDelete] = useState<Transaction | null>(null)

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Movimientos</h1>
        <Button onClick={() => setDialog({})}>
          <Plus className="size-4" /> Nuevo movimiento
        </Button>
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 items-end gap-3 md:grid-cols-3 xl:grid-cols-6">
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
            <Label htmlFor="f-type">Tipo</Label>
            <NativeSelect
              id="f-type"
              value={filters.type ?? ''}
              onChange={(e) => setFilters({ type: (e.target.value || undefined) as TxType | undefined })}
            >
              <option value="">Todos</option>
              <option value="expense">Gasto</option>
              <option value="income">Ingreso</option>
              <option value="transfer">Transferencia</option>
            </NativeSelect>
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
          <Button variant="outline" onClick={() => setParams({})}>
            Limpiar
          </Button>
        </CardContent>
      </Card>

      {isPending && <p className="text-muted-foreground">Cargando…</p>}
      {error && (
        <p role="alert" className="text-destructive">
          {errorText(error)}
        </p>
      )}

      {data && data.items.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No hay movimientos para estos filtros.
          </CardContent>
        </Card>
      )}

      {data && data.items.length > 0 && (
        <ul className="space-y-2">
          {data.items.map((tx) => (
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
      )}

      {data && (
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
