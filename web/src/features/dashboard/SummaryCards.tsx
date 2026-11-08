import { CreditCard, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import type { Summary } from '@/api/reports'
import { Card, CardContent } from '@/components/ui/card'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

export function SummaryCards({ summary, currency }: { summary: Summary; currency: string }) {
  const money = (cents: number) => formatMoney(cents, currency)
  const net = summary.netCents

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat icon={Wallet} label="Saldo total" id="card-balance" value={money(summary.totalBalanceCents)} />
      <Stat
        icon={TrendingUp}
        label="Ingresos del mes"
        id="card-income"
        value={money(summary.incomeCents)}
        tone="text-emerald-600 dark:text-emerald-400"
      />
      <Stat
        icon={TrendingDown}
        label="Gastos del mes"
        id="card-expense"
        value={money(summary.expenseCents)}
        footer={
          <span data-testid="net" className={cn(net < 0 && 'text-destructive')}>
            Neto {net > 0 ? '+' : ''}
            {money(net)}
          </span>
        }
      />
      <Stat icon={CreditCard} label="Deuda en tarjetas" id="card-debt" value={money(summary.cardDebtCents)} />
    </div>
  )
}

function Stat({
  icon: Icon,
  label,
  id,
  value,
  tone,
  footer,
}: {
  icon: typeof Wallet
  label: string
  id: string
  value: string
  tone?: string
  footer?: React.ReactNode
}) {
  return (
    <Card data-testid={id}>
      <CardContent className="space-y-1">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{label}</span>
          <Icon className="size-4" />
        </div>
        <p className={cn('text-2xl font-semibold', tone)}>{value}</p>
        {footer && <p className="text-sm text-muted-foreground">{footer}</p>}
      </CardContent>
    </Card>
  )
}
