import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { SpendingReport } from '@/api/reports'
import { formatMoney } from '@/lib/money'
import { chartAmount, formatPercent, percentOf, topWithOthers } from './dashboard-data'

const TOOLTIP_STYLE = {
  background: 'var(--popover)',
  color: 'var(--popover-foreground)',
  border: '1px solid var(--border)',
  borderRadius: 8,
}

/** Spending of the month by category: top five plus "Otras". */
export function SpendingDonut({ report, currency }: { report: SpendingReport; currency: string }) {
  if (report.totalCents <= 0 || report.items.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Sin gastos este mes.</p>
  }

  const slices = topWithOthers(report.items)
  const money = (cents: number) => formatMoney(cents, currency)

  return (
    <div className="space-y-3">
      <div
        role="img"
        aria-label={`Gasto del mes por categoría: ${slices.map((s) => `${s.name} ${money(s.totalCents)}`).join(', ')}`}
        className="h-64"
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices.map((s) => ({ name: s.name, value: chartAmount(s.totalCents) }))}
              dataKey="value"
              nameKey="name"
              innerRadius="55%"
              outerRadius="85%"
              paddingAngle={2}
              stroke="var(--card)"
            >
              {slices.map((s) => (
                <Cell key={s.categoryId} fill={s.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value) => money(Math.round(Number(value) * 100))}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <table aria-label="Gasto por categoría" className="w-full text-sm">
        <thead className="sr-only">
          <tr>
            <th>Categoría</th>
            <th>Monto</th>
            <th>Porcentaje</th>
          </tr>
        </thead>
        <tbody>
          {slices.map((s) => (
            <tr key={s.categoryId}>
              <td className="py-1">
                <span
                  aria-hidden
                  className="mr-2 inline-block size-3 rounded-full align-middle"
                  style={{ backgroundColor: s.color }}
                />
                {s.name}
              </td>
              <td className="text-right font-medium">{money(s.totalCents)}</td>
              <td className="w-16 text-right text-muted-foreground">
                {formatPercent(percentOf(s.totalCents, report.totalCents))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
