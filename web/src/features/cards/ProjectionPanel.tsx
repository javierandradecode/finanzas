import { useProjection } from '@/api/installment-purchases'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/features/auth/useAuth'
import { formatMonth } from '@/lib/dates'
import { formatMoney } from '@/lib/money'

/** Installment payments due in the next 12 months, all cards together. */
export function ProjectionPanel() {
  const currency = useAuth().user?.currency ?? 'USD'
  const { data, isPending, error } = useProjection(12)

  return (
    <Card>
      <CardContent className="space-y-3">
        <h2 className="font-semibold">Pagos de cuotas: próximos 12 meses</h2>
        {isPending && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error.message}
          </p>
        )}
        {data && data.length === 0 && (
          <p className="text-sm text-muted-foreground">Sin cuotas pendientes.</p>
        )}
        {data && data.length > 0 && (
          <ul className="divide-y text-sm">
            {data.map((m) => (
              <li key={m.month} className="flex items-center justify-between py-2">
                <span className="capitalize">{formatMonth(m.month)}</span>
                <span className="text-muted-foreground">
                  {m.count} {m.count === 1 ? 'cuota' : 'cuotas'}
                </span>
                <span className="font-medium">{formatMoney(m.paymentCents, currency)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
