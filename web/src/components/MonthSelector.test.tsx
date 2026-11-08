import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MonthSelector } from './MonthSelector'

describe('MonthSelector', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 8, 12, 0)) // November 2026
  })
  afterEach(() => vi.useRealTimers())

  it('shows the month name in Spanish', () => {
    render(<MonthSelector month="2026-03" onChange={vi.fn()} />)
    expect(screen.getByTestId('month')).toHaveTextContent('marzo de 2026')
  })

  it('previous and next report the right month, across the year boundary', async () => {
    const onChange = vi.fn()
    const { rerender } = render(<MonthSelector month="2026-01" onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Mes anterior' }))
    expect(onChange).toHaveBeenLastCalledWith('2025-12')

    rerender(<MonthSelector month="2026-12" onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }))
    expect(onChange).toHaveBeenLastCalledWith('2027-01')
  })

  it('stops going forward 12 months after the current one', () => {
    const { rerender } = render(<MonthSelector month="2027-10" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Mes siguiente' })).toBeEnabled()
    rerender(<MonthSelector month="2027-11" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Mes siguiente' })).toBeDisabled()
  })

  it('the limit is configurable', () => {
    render(<MonthSelector month="2026-12" onChange={vi.fn()} maxAhead={1} />)
    expect(screen.getByRole('button', { name: 'Mes siguiente' })).toBeDisabled()
  })

  it('going back is never limited', () => {
    render(<MonthSelector month="2020-01" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Mes anterior' })).toBeEnabled()
  })
})
