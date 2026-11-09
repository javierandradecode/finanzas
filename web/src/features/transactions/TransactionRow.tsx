import { ArrowLeftRight, MoreHorizontal } from 'lucide-react'
import type { Category } from '@/api/categories'
import type { Transaction } from '@/api/transactions'
import { CategoryIcon } from '@/components/CategoryIcon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

export interface Lookups {
  accounts: Map<string, string>
  cards: Map<string, string>
  categories: Map<string, Category>
}

/** One movement inside a day: its date is the heading above, so it is not repeated here. */
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

  const managed = Boolean(tx.installmentPurchaseId)
  const title = tx.note || category?.name || (tx.type === 'transfer' ? 'Transferencia' : 'Sin categoría')
  const where = tx.type === 'transfer' ? `${from ?? '?'} → ${to ?? '?'}` : from
  const details = [
    tx.note ? category?.name : undefined,
    where,
    managed ? 'Gestionado por una compra a cuotas' : undefined,
  ]
    .filter(Boolean)
    .join(' · ')

  const sign = tx.type === 'expense' ? '-' : tx.type === 'income' ? '+' : ''

  return (
    <li data-testid="tx-row" className="flex items-center gap-3 py-3">
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
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-medium">
          <span className="truncate">{title}</span>
          {tx.source === 'installment' && <Badge variant="secondary">Cuota</Badge>}
          {tx.source === 'subscription' && <Badge variant="secondary">Suscripción</Badge>}
        </p>
        {details && <p className="truncate text-sm text-muted-foreground">{details}</p>}
      </div>
      <p
        data-testid="amount"
        className={cn(
          'shrink-0 font-semibold tabular-nums',
          tx.type === 'income' && 'text-emerald-600 dark:text-emerald-400',
        )}
      >
        {sign}
        {formatMoney(tx.amountCents, currency)}
      </p>
      {managed ? (
        // keeps the amounts aligned with rows that do have a menu
        <span aria-hidden className="size-8 shrink-0" />
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                aria-label={`Acciones de ${title}`}
              />
            }
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>Editar</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  )
}
