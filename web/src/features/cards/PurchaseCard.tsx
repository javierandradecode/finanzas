import { useState } from 'react'
import type { InstallmentPurchase } from '@/api/installment-purchases'
import { ProgressBar } from '@/components/ProgressBar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatDateUtc } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

export function PurchaseCard({
  purchase: p,
  categoryName,
  currency,
  onPay,
  onEdit,
  onDelete,
}: {
  purchase: InstallmentPurchase
  categoryName?: string
  currency: string
  onPay: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const money = (cents: number) => formatMoney(cents, currency)
  const next = p.schedule[p.paidInstallments] ?? p.schedule.at(-1)

  return (
    <Card data-testid="purchase" className={cn(p.isPaidOff && 'opacity-70')}>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium">{p.description}</p>
            <p className="text-sm text-muted-foreground">
              {[categoryName, `Compra del ${formatDateUtc(p.startDate)}`].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="text-right">
            <p className="font-semibold">{money(p.totalCents)}</p>
            {p.isPaidOff ? (
              <Badge variant="secondary">Pagada</Badge>
            ) : (
              next && <p className="text-sm text-muted-foreground">Cuota {money(next.paymentCents)}</p>
            )}
          </div>
        </div>

        <ProgressBar value={p.paidInstallments} max={p.installments} />
        <p className="text-sm">
          {p.paidInstallments} de {p.installments} cuotas pagadas
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {!p.isPaidOff && (
            <Button size="sm" onClick={onPay}>
              Pagar cuota
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setOpen(!open)}>
            {open ? 'Ocultar calendario' : 'Ver calendario'}
          </Button>
          <Button variant="outline" size="sm" onClick={onEdit}>
            Editar
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={p.paidInstallments > 0}
            onClick={onDelete}
          >
            Eliminar
          </Button>
          {p.paidInstallments > 0 && (
            <span className="text-xs text-muted-foreground">
              No se puede eliminar: ya tiene cuotas pagadas.
            </span>
          )}
        </div>

        {open && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-2">#</th>
                  <th className="pr-2">Vence</th>
                  <th className="pr-2 text-right">Capital</th>
                  <th className="pr-2 text-right">Interés</th>
                  <th className="pr-2 text-right">Pago</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {p.schedule.map((r) => (
                  <tr key={r.number} className={cn('border-t', r.paid && 'text-muted-foreground')}>
                    <td className="py-1 pr-2">{r.number}</td>
                    <td className="pr-2">{formatDateUtc(r.dueDate)}</td>
                    <td className="pr-2 text-right">{money(r.principalCents)}</td>
                    <td className="pr-2 text-right">{money(r.interestCents)}</td>
                    <td className="pr-2 text-right font-medium">{money(r.paymentCents)}</td>
                    <td>{r.paid ? 'Pagada' : 'Pendiente'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
