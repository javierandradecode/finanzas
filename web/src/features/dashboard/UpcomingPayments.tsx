import { Link } from 'react-router-dom'
import type { MonthlyProjection } from '@/api/installment-purchases'
import type { UpcomingCharge } from '@/api/subscriptions'
import { Badge } from '@/components/ui/badge'
import { formatDateUtc, formatMonth } from '@/lib/dates'
import { formatMoney } from '@/lib/money'

/** Subscription charges (next 14 days) and card installments (next months), in two groups. */
export function UpcomingPayments({
  subscriptions,
  installments,
  currency,
}: {
  subscriptions: UpcomingCharge[]
  installments: MonthlyProjection[]
  currency: string
}) {
  const money = (cents: number) => formatMoney(cents, currency)
  const months = installments.filter((m) => m.count > 0)

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Suscripciones (próximos 14 días)</h3>
          <Link to="/suscripciones" className="text-sm text-primary underline">
            Ver suscripciones
          </Link>
        </div>
        {subscriptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin cobros en los próximos 14 días.</p>
        ) : (
          <ul className="divide-y text-sm">
            {subscriptions.map((c) => (
              <li
                key={`${c.subscriptionId}-${c.date}`}
                data-testid="upcoming-sub"
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="w-24 text-muted-foreground">{formatDateUtc(c.date)}</span>
                  <span className="font-medium">{c.name}</span>
                  {c.overdue && <Badge variant="destructive">Atrasado</Badge>}
                </span>
                <span className="font-medium">{money(c.amountCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Cuotas de tarjetas</h3>
          <Link to="/tarjetas" className="text-sm text-primary underline">
            Ver tarjetas
          </Link>
        </div>
        {months.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin cuotas pendientes en los próximos meses.
          </p>
        ) : (
          <ul className="divide-y text-sm">
            {months.map((m) => (
              <li
                key={m.month}
                data-testid="upcoming-installments"
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span className="first-letter:uppercase">{formatMonth(m.month)}</span>
                <span className="text-muted-foreground">
                  {m.count} {m.count === 1 ? 'cuota' : 'cuotas'}
                </span>
                <span className="font-medium">{money(m.paymentCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
