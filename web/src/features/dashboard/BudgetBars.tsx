import { Link } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { BudgetItem } from '@/features/budgets/budget-form'
import { formatMoney } from '@/lib/money'
import { chartAmount } from './dashboard-data'

const TOOLTIP_STYLE = {
  background: 'var(--popover)',
  color: 'var(--popover-foreground)',
  border: '1px solid var(--border)',
  borderRadius: 8,
}

/** Limit versus spent for each budget of the month; the exceeded ones are red. */
export function BudgetBars({ items, currency }: { items: BudgetItem[]; currency: string }) {
  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Sin presupuestos este mes.{' '}
        <Link to="/presupuestos" className="text-primary underline">
          Crea un presupuesto
        </Link>
      </p>
    )
  }

  const money = (cents: number) => formatMoney(cents, currency)
  const data = items.map((i) => ({
    name: i.name,
    Límite: chartAmount(i.limitCents),
    Gastado: chartAmount(i.spentCents),
    over: i.overBudget,
  }))

  return (
    <div className="space-y-3">
      <div
        role="img"
        aria-label={`Presupuesto contra gasto real de ${items.length} ${items.length === 1 ? 'categoría' : 'categorías'}`}
        style={{ height: Math.max(180, items.length * 56) }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid horizontal={false} stroke="var(--border)" />
            <XAxis type="number" tickLine={false} axisLine={false} stroke="var(--muted-foreground)" />
            <YAxis
              type="category"
              dataKey="name"
              width={110}
              tickLine={false}
              axisLine={false}
              stroke="var(--muted-foreground)"
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value) => money(Math.round(Number(value) * 100))}
            />
            <Bar dataKey="Límite" fill="var(--muted-foreground)" fillOpacity={0.35} radius={4} />
            <Bar dataKey="Gastado" radius={4}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.over ? 'var(--destructive)' : 'var(--primary)'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <table aria-label="Presupuesto contra real" className="sr-only">
        <thead>
          <tr>
            <th>Categoría</th>
            <th>Límite</th>
            <th>Gastado</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.budgetId}>
              <td>{i.name}</td>
              <td>{money(i.limitCents)}</td>
              <td>{money(i.spentCents)}</td>
              <td>{i.overBudget ? 'Excedido' : 'Dentro del límite'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
