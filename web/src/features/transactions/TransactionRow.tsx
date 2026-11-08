import { ArrowLeftRight } from 'lucide-react'
import type { Category } from '@/api/categories'
import type { Transaction } from '@/api/transactions'
import { CategoryIcon } from '@/components/CategoryIcon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDateUtc } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

export interface Lookups {
  accounts: Map<string, string>
  cards: Map<string, string>
  categories: Map<string, Category>
}

export function TransactionRow({
  tx,
  lookups,
  currency,
  onEdit,
  onDelete,
}: {
  tx: Transaction
  lookups: Lookups
  currency: string
  onEdit: () => void
  onDelete: () => void
}) {
  const category = tx.categoryId ? lookups.categories.get(tx.categoryId) : undefined
  const from = tx.accountId
    ? lookups.accounts.get(tx.accountId)
    : tx.creditCardId
      ? lookups.cards.get(tx.creditCardId)
      : undefined
  const to = tx.toAccountId
    ? lookups.accounts.get(tx.toAccountId)
    : tx.toCreditCardId
      ? lookups.cards.get(tx.toCreditCardId)
      : undefined

  const title = tx.note || category?.name || (tx.type === 'transfer' ? 'Transferencia' : 'Sin categoría')
  const where = tx.type === 'transfer' ? `${from ?? '?'} → ${to ?? '?'}` : from
  const details = [tx.note ? category?.name : undefined, where, formatDateUtc(tx.date)]
    .filter(Boolean)
    .join(' · ')

  const sign = tx.type === 'expense' ? '-' : tx.type === 'income' ? '+' : ''
  const managed = Boolean(tx.installmentPurchaseId)

  return (
    <li
      data-testid="tx-row"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl p-3 ring-1 ring-foreground/10"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted"
          style={category ? { backgroundColor: `${category.color}22` } : undefined}
        >
          {tx.type === 'transfer' ? (
            <ArrowLeftRight className="size-4" />
          ) : (
            <CategoryIcon name={category?.icon ?? 'tag'} color={category?.color} />
          )}
        </span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            <span className="truncate">{title}</span>
            {tx.source === 'installment' && <Badge variant="secondary">Cuota</Badge>}
            {tx.source === 'subscription' && <Badge variant="secondary">Suscripción</Badge>}
          </p>
          <p className="truncate text-sm text-muted-foreground">{details}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <p
          data-testid="amount"
          className={cn(
            'font-semibold',
            tx.type === 'expense' && 'text-destructive',
            tx.type === 'income' && 'text-emerald-600 dark:text-emerald-400',
          )}
        >
          {sign}
          {formatMoney(tx.amountCents, currency)}
        </p>
        {managed ? (
          <span className="max-w-40 text-xs text-muted-foreground">
            Gestionado por una compra a cuotas
          </span>
        ) : (
          <div className="flex gap-1">
            <Button variant="outline" size="sm" onClick={onEdit}>
              Editar
            </Button>
            <Button variant="outline" size="sm" onClick={onDelete}>
              Eliminar
            </Button>
          </div>
        )}
      </div>
    </li>
  )
}
