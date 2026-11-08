import { useUpcoming } from '@/api/subscriptions'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/features/auth/useAuth'
import { formatDateUtc } from '@/lib/dates'
import { formatMoney } from '@/lib/money'

/** Charges expected in the next 30 days. `payerName` turns the ids into a readable name. */
export function UpcomingPanel({
  payerName,
}: {
  payerName: (s: { accountId?: string; creditCardId?: string }) => string | undefined
}) {
  const currency = useAuth().user?.currency ?? 'USD'
  const { data, isPending, error } = useUpcoming(30)

  return (
    <section>
      <Card>
        <CardContent className="space-y-3">
          <h2 className="font-semibold">Próximos 30 días</h2>
          {isPending && <p className="text-sm text-muted-foreground">Cargando…</p>}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error.message}
            </p>
          )}
          {data?.length === 0 && (
            <p className="text-sm text-muted-foreground">Sin cobros en los próximos 30 días.</p>
          )}
          {data && data.length > 0 && (
            <ul className="divide-y text-sm">
              {data.map((c) => (
                <li
                  key={`${c.subscriptionId}-${c.date}`}
                  data-testid="upcoming"
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-24 text-muted-foreground">{formatDateUtc(c.date)}</span>
                    <span className="font-medium">{c.name}</span>
                    {c.overdue && <Badge variant="destructive">Atrasado</Badge>}
                    <span className="text-muted-foreground">{payerName(c)}</span>
                  </div>
                  <span className="font-medium">{formatMoney(c.amountCents, currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
