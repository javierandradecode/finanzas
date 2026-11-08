import { renderHook, waitFor } from '@testing-library/react'
import { callOf, jsonResponse, queryWrapper, stubFetch } from '@/test/utils'
import { useIncomeVsExpenses, useSpendingByCategory, useSummary } from './reports'

afterEach(() => vi.unstubAllGlobals())

describe('report hooks', () => {
  it('loads the summary of a month', async () => {
    const summary = { month: '2026-03', totalBalanceCents: 100 }
    const fetchMock = stubFetch(jsonResponse(200, summary))
    const { result } = renderHook(() => useSummary('2026-03'), { wrapper: queryWrapper() })
    await waitFor(() => expect(result.current.data).toEqual(summary))
    expect(callOf(fetchMock).path).toBe('/reports/summary?month=2026-03')
  })

  it('loads spending by category for a date range', async () => {
    const report = { from: 'x', to: 'y', totalCents: 0, items: [] }
    const fetchMock = stubFetch(jsonResponse(200, report))
    const { result } = renderHook(() => useSpendingByCategory('2026-03-01', '2026-03-31'), {
      wrapper: queryWrapper(),
    })
    await waitFor(() => expect(result.current.data).toEqual(report))
    expect(callOf(fetchMock).path).toBe(
      '/reports/spending-by-category?from=2026-03-01&to=2026-03-31',
    )
  })

  it('loads income vs expenses for a month range', async () => {
    const flow = { from: '2025-10', to: '2026-03', months: [] }
    const fetchMock = stubFetch(jsonResponse(200, flow))
    const { result } = renderHook(() => useIncomeVsExpenses('2025-10', '2026-03'), {
      wrapper: queryWrapper(),
    })
    await waitFor(() => expect(result.current.data).toEqual(flow))
    expect(callOf(fetchMock).path).toBe('/reports/income-vs-expenses?from=2025-10&to=2026-03')
  })

  it('exposes a server error without throwing', async () => {
    stubFetch(jsonResponse(500, { message: 'boom' }))
    const { result } = renderHook(() => useSummary('2026-03'), { wrapper: queryWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('boom')
    expect(result.current.data).toBeUndefined()
  })
})
