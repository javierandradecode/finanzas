import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { IncomeVsExpenses } from '@/api/reports'
import { formatMonthShort } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { chartAmount } from './dashboard-data'

const TOOLTIP_STYLE = {
  background: 'var(--popover)',
  color: 'var(--popover-foreground)',
  border: '1px solid var(--border)',
  borderRadius: 8,
}

/** Income and expenses side by side, one pair of bars per month. */
export function MonthlyBars({ flow, currency }: { flow: IncomeVsExpenses; currency: string }) {
  const empty = flow.months.every((m) => m.incomeCents === 0 && m.expenseCents === 0)
  if (empty) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Sin movimientos en estos meses.
      </p>
    )
  }

  const money = (cents: number) => formatMoney(cents, currency)
  const data = flow.months.map((m) => ({
    label: formatMonthShort(m.month),
    Ingresos: chartAmount(m.incomeCents),
    Gastos: chartAmount(m.expenseCents),
  }))

  return (
    <div className="space-y-3">
      <div
        role="img"
        aria-label={`Ingresos y gastos de ${data[0].label} a ${data[data.length - 1].label}`}
        className="h-64"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} stroke="var(--muted-foreground)" />
            <YAxis width={56} tickLine={false} axisLine={false} stroke="var(--muted-foreground)" />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value) => money(Math.round(Number(value) * 100))}
            />
            <Bar dataKey="Ingresos" fill="var(--primary)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Gastos" fill="var(--destructive)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <table aria-label="Evolución mensual" className="sr-only">
        <thead>
          <tr>
            <th>Mes</th>
            <th>Ingresos</th>
            <th>Gastos</th>
            <th>Neto</th>
          </tr>
        </thead>
        <tbody>
          {flow.months.map((m) => (
            <tr key={m.month}>
              <td>{formatMonthShort(m.month)}</td>
              <td>{money(m.incomeCents)}</td>
              <td>{money(m.expenseCents)}</td>
              <td>{money(m.netCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
