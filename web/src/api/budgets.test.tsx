import { renderHook, waitFor } from '@testing-library/react'
import { act } from 'react'
import { callOf, jsonResponse, makeClient, queryWrapper, stubFetch } from '@/test/utils'
import {
  useBudgetReport,
  useCopyBudgets,
  useCreateBudget,
  useDeleteBudget,
  useUpdateBudget,
} from './budgets'

afterEach(() => vi.unstubAllGlobals())

const keysOf = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey[0])

describe('budget hooks', () => {
  it('loads the budget-vs-spent report of a month', async () => {
    const report = { month: '2026-03', items: [], totals: { limitCents: 0, spentCents: 0, overBudgetCount: 0 } }
    const fetchMock = stubFetch(jsonResponse(200, report))
    const { result } = renderHook(() => useBudgetReport('2026-03'), { wrapper: queryWrapper() })
    await waitFor(() => expect(result.current.data).toEqual(report))
    expect(callOf(fetchMock).path).toBe('/reports/budget-vs-spent?month=2026-03')
  })

  it('creates, updates (id out of the body), deletes and copies', async () => {
    const fetchMock = stubFetch(jsonResponse(200, { copied: 2, skipped: [] }))
    const wrapper = queryWrapper()

    const create = renderHook(() => useCreateBudget(), { wrapper })
    const body = { categoryId: 'c1', month: '2026-03', limitCents: 40000 }
    await act(() => create.result.current.mutateAsync(body))
    expect(callOf(fetchMock, 0)).toMatchObject({ path: '/budgets', method: 'POST', body })

    const update = renderHook(() => useUpdateBudget(), { wrapper })
    await act(() => update.result.current.mutateAsync({ id: 'b1', limitCents: 45000 }))
    const patch = callOf(fetchMock, 1)
    expect(patch).toMatchObject({ path: '/budgets/b1', method: 'PATCH' })
    expect(patch.body).toEqual({ limitCents: 45000 })

    const del = renderHook(() => useDeleteBudget(), { wrapper })
    await act(() => del.result.current.mutateAsync('b1'))
    expect(callOf(fetchMock, 2)).toMatchObject({ path: '/budgets/b1', method: 'DELETE' })

    const copy = renderHook(() => useCopyBudgets(), { wrapper })
    let result: unknown
    await act(async () => {
      result = await copy.result.current.mutateAsync({ from: '2026-02', to: '2026-03' })
    })
    expect(callOf(fetchMock, 3)).toMatchObject({
      path: '/budgets/copy',
      method: 'POST',
      body: { from: '2026-02', to: '2026-03' },
    })
    expect(result).toEqual({ copied: 2, skipped: [] })
  })

  it.each([
    ['create', () => useCreateBudget(), { categoryId: 'c1', month: '2026-03', limitCents: 1 }],
    ['update', () => useUpdateBudget(), { id: 'b1', limitCents: 2 }],
    ['delete', () => useDeleteBudget(), 'b1'],
    ['copy', () => useCopyBudgets(), { from: '2026-02', to: '2026-03' }],
  ] as const)('%s invalidates the budgets', async (_n, hook, vars) => {
    stubFetch(jsonResponse(200, {}))
    const client = makeClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => hook(), { wrapper: queryWrapper(client) })
    await act(() => (result.current.mutateAsync as (v: unknown) => Promise<unknown>)(vars))
    expect(keysOf(spy)).toEqual(['budgets'])
  })
})
