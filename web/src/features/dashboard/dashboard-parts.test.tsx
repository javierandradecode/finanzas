import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Summary } from '@/api/reports'
import { SummaryCards } from './SummaryCards'
import { UpcomingPayments } from './UpcomingPayments'

const summary = (over: Partial<Summary> = {}): Summary => ({
  month: '2026-11',
  totalBalanceCents: 1234500,
  cardDebtCents: 70000,
  incomeCents: 80000,
  expenseCents: 115000,
  netCents: -35000,
  topCategories: [],
  budgets: { limitCents: 0, spentCents: 0, overBudgetCount: 0 },
  upcomingSubscriptions: [],
  installmentProjection: [],
  ...over,
})

describe('SummaryCards', () => {
  it('shows balance, income, expenses and card debt formatted in the user currency', () => {
    render(<SummaryCards summary={summary()} currency="USD" />)
    expect(screen.getByTestId('card-balance')).toHaveTextContent('12.345,00')
    expect(screen.getByTestId('card-income')).toHaveTextContent('800,00')
    expect(screen.getByTestId('card-expense')).toHaveTextContent('1.150,00')
    expect(screen.getByTestId('card-debt')).toHaveTextContent('700,00')
  })

  it('shows a negative net with its sign and in red', () => {
    render(<SummaryCards summary={summary()} currency="USD" />)
    const net = screen.getByTestId('net')
    expect(net).toHaveTextContent('-350,00')
    expect(net).toHaveClass('text-destructive')
  })

  it('shows a positive net with a plus sign, not in red', () => {
    render(
      <SummaryCards
        summary={summary({ incomeCents: 200000, expenseCents: 50000, netCents: 150000 })}
        currency="USD"
      />,
    )
    const net = screen.getByTestId('net')
    expect(net).toHaveTextContent('+1.500,00')
    expect(net).not.toHaveClass('text-destructive')
  })

  it('handles an empty month without NaN', () => {
    const { container } = render(
      <SummaryCards
        summary={summary({ totalBalanceCents: 0, cardDebtCents: 0, incomeCents: 0, expenseCents: 0, netCents: 0 })}
        currency="USD"
      />,
    )
    expect(screen.getByTestId('card-balance')).toHaveTextContent('0,00')
    expect(screen.getByTestId('card-debt')).toHaveTextContent('0,00')
    expect(container.textContent).not.toMatch(/NaN/)
  })
})

describe('UpcomingPayments', () => {
  const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)
  const charge = (over: object) => ({
    subscriptionId: 's1', name: 'Netflix', amountCents: 999, date: '2026-11-20T00:00:00.000Z',
    overdue: false, frequency: 'monthly' as const, accountId: 'a1', categoryId: 'c1', ...over,
  })
  const month = (m: string, count: number, paymentCents: number) => ({
    month: m, principalCents: paymentCents, interestCents: 0, paymentCents, count,
  })

  it('lists subscription charges with the overdue tagged', () => {
    wrap(
      <UpcomingPayments
        currency="USD"
        subscriptions={[charge({ overdue: true, date: '2026-11-01T00:00:00.000Z' }), charge({ name: 'Spotify' })]}
        installments={[]}
      />,
    )
    const items = screen.getAllByTestId('upcoming-sub')
    expect(items).toHaveLength(2)
    expect(within(items[0]).getByText('Netflix')).toBeInTheDocument()
    expect(within(items[0]).getByText('Atrasado')).toBeInTheDocument()
    expect(within(items[0]).getByText(/9,99/)).toBeInTheDocument()
    expect(within(items[1]).queryByText('Atrasado')).toBeNull()
  })

  it('lists only the months that have installments due', () => {
    wrap(
      <UpcomingPayments
        currency="USD"
        subscriptions={[]}
        installments={[month('2026-11', 3, 30000), month('2026-12', 0, 0), month('2027-01', 1, 10000)]}
      />,
    )
    const items = screen.getAllByTestId('upcoming-installments')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('noviembre de 2026')
    expect(items[0]).toHaveTextContent('3 cuotas')
    expect(items[0]).toHaveTextContent('300,00')
    expect(items[1]).toHaveTextContent('enero de 2027')
    expect(items[1]).toHaveTextContent('1 cuota')
    expect(items[1]).not.toHaveTextContent('1 cuotas')
  })

  it('has an empty text per group and links to both screens', () => {
    wrap(<UpcomingPayments currency="USD" subscriptions={[]} installments={[month('2026-11', 0, 0)]} />)
    expect(screen.getByText('Sin cobros en los próximos 14 días.')).toBeInTheDocument()
    expect(screen.getByText('Sin cuotas pendientes en los próximos meses.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver suscripciones' })).toHaveAttribute('href', '/suscripciones')
    expect(screen.getByRole('link', { name: 'Ver tarjetas' })).toHaveAttribute('href', '/tarjetas')
  })
})
