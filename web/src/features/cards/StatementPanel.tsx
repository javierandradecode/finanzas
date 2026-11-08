import { useState } from 'react'
import { useStatement } from '@/api/credit-cards'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/features/auth/useAuth'
import { formatDateUtc } from '@/lib/dates'
import { formatMoney } from '@/lib/money'

const DAY_MS = 24 * 60 * 60 * 1000

/** Statement of one billing period; Anterior/Siguiente move by asking for a date next to it. */
export function StatementPanel({ cardId }: { cardId: string }) {
  const currency = useAuth().user?.currency ?? 'USD'
  const [date, setDate] = useState<string | undefined>(undefined)
  const [now] = useState(() => Date.now()) // stable across renders
  const { data: s, isPending, error } = useStatement(cardId, date)

  const money = (cents: number) => formatMoney(cents, currency)
  const isCurrent = s ? now <= Date.parse(s.period.end) : true

  return (
    <section>
      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Estado de cuenta</h2>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!s}
                onClick={() =>
                  s && setDate(new Date(Date.parse(s.period.start) - DAY_MS).toISOString())
                }
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!s || isCurrent}
                onClick={() =>
                  s && setDate(new Date(Date.parse(s.period.end) + DAY_MS).toISOString())
                }
              >
                Siguiente
              </Button>
            </div>
          </div>

          {isPending && <p className="text-sm text-muted-foreground">Cargando…</p>}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error.message}
            </p>
          )}

          {s && (
            <>
              <div className="text-sm text-muted-foreground">
                <p>
                  Período: {formatDateUtc(s.period.start)} – {formatDateUtc(s.period.end)}
                </p>
                <p>
                  Fecha límite de pago: <strong>{formatDateUtc(s.paymentDueDate)}</strong>
                </p>
              </div>

              <Group title="Compras del período" empty="Sin compras en este período.">
                {s.purchases.map((t) => (
                  <Line key={t._id} label={t.note || 'Compra'} value={money(t.amountCents)} />
                ))}
              </Group>
              <Group title="Pagos del período" empty="Sin pagos en este período.">
                {s.payments.map((t) => (
                  <Line key={t._id} label={t.note || 'Pago'} value={money(t.amountCents)} />
                ))}
              </Group>
              <Group title="Cuotas por vencer" empty="Sin cuotas por vencer.">
                {s.installmentsDue.map((d) => (
                  <Line
                    key={`${d.purchaseId}-${d.number}`}
                    label={`${d.description} · cuota ${d.number} de ${d.of}`}
                    value={money(d.paymentCents)}
                  />
                ))}
              </Group>

              <dl className="grid gap-1 border-t pt-3 text-sm sm:grid-cols-3">
                <Total label="Compras" id="total-purchases" value={money(s.totals.purchasesCents)} />
                <Total label="Pagos" id="total-payments" value={money(s.totals.paymentsCents)} />
                <Total
                  label="Cuotas por vencer"
                  id="total-due"
                  value={money(s.totals.installmentsDueCents)}
                />
              </dl>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

function Group({
  title,
  empty,
  children,
}: {
  title: string
  empty: string
  children: React.ReactNode[]
}) {
  return (
    <div>
      <h3 className="mb-1 text-sm font-medium">{title}</h3>
      {children.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y text-sm">{children}</ul>
      )}
    </div>
  )
}

const Line = ({ label, value }: { label: string; value: string }) => (
  <li className="flex justify-between py-1.5">
    <span>{label}</span>
    <span className="font-medium">{value}</span>
  </li>
)

const Total = ({ label, id, value }: { label: string; id: string; value: string }) => (
  <div>
    <dt className="text-muted-foreground">{label}</dt>
    <dd data-testid={id} className="font-semibold">
      {value}
    </dd>
  </div>
)
