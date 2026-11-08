import { renderHook, waitFor } from '@testing-library/react'
import { act } from 'react'
import { callOf, jsonResponse, makeClient, queryWrapper, stubFetch } from '@/test/utils'
import {
  useArchiveCard,
  useCreateCard,
  useStatement,
  useUpdateCard,
} from './credit-cards'
import {
  useCreatePurchase,
  useDeletePurchase,
  usePayInstallment,
  useProjection,
  usePurchases,
  useUpdatePurchase,
} from './installment-purchases'

afterEach(() => vi.unstubAllGlobals())

const keysOf = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey[0])

describe('credit card hooks', () => {
  it('creates, updates (id out of the body) and archives', async () => {
    const fetchMock = stubFetch(jsonResponse(200, {}))
    const wrapper = queryWrapper()
    const create = renderHook(() => useCreateCard(), { wrapper })
    const body = { name: 'Visa', limitCents: 100, cutoffDay: 5, paymentDay: 20, annualRatePercent: 0 }
    await act(() => create.result.current.mutateAsync(body))
    expect(callOf(fetchMock, 0)).toMatchObject({ path: '/credit-cards', method: 'POST', body })

    const update = renderHook(() => useUpdateCard(), { wrapper })
    await act(() => update.result.current.mutateAsync({ id: 'k1', name: 'Visa 2', isArchived: false }))
    const patch = callOf(fetchMock, 1)
    expect(patch).toMatchObject({ path: '/credit-cards/k1', method: 'PATCH' })
    expect(patch.body).toEqual({ name: 'Visa 2', isArchived: false })

    const archive = renderHook(() => useArchiveCard(), { wrapper })
    await act(() => archive.result.current.mutateAsync('k1'))
    expect(callOf(fetchMock, 2)).toMatchObject({ path: '/credit-cards/k1', method: 'DELETE' })
  })

  it('every card mutation invalidates credit-cards', async () => {
    stubFetch(jsonResponse(200, {}))
    const client = makeClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useArchiveCard(), { wrapper: queryWrapper(client) })
    await act(() => result.current.mutateAsync('k1'))
    expect(keysOf(spy)).toContain('credit-cards')
  })

  it('loads the statement with and without a date', async () => {
    let fetchMock = stubFetch(jsonResponse(200, { cardId: 'k1' }))
    let r = renderHook(() => useStatement('k1'), { wrapper: queryWrapper() })
    await waitFor(() => expect(r.result.current.isSuccess).toBe(true))
    expect(callOf(fetchMock).path).toBe('/credit-cards/k1/statement')

    fetchMock = stubFetch(jsonResponse(200, { cardId: 'k1' }))
    r = renderHook(() => useStatement('k1', '2026-03-04T23:59:59.999Z'), { wrapper: queryWrapper() })
    await waitFor(() => expect(r.result.current.isSuccess).toBe(true))
    expect(callOf(fetchMock).path).toBe('/credit-cards/k1/statement?date=2026-03-04T23:59:59.999Z')
  })
})

describe('installment purchase hooks', () => {
  it('lists, optionally by card, and loads the projection', async () => {
    let fetchMock = stubFetch(jsonResponse(200, []))
    let r = renderHook(() => usePurchases(), { wrapper: queryWrapper() })
    await waitFor(() => expect(r.result.current.isSuccess).toBe(true))
    expect(callOf(fetchMock).path).toBe('/installment-purchases')

    fetchMock = stubFetch(jsonResponse(200, []))
    r = renderHook(() => usePurchases('k1'), { wrapper: queryWrapper() })
    await waitFor(() => expect(r.result.current.isSuccess).toBe(true))
    expect(callOf(fetchMock).path).toBe('/installment-purchases?creditCardId=k1')

    fetchMock = stubFetch(jsonResponse(200, []))
    const p = renderHook(() => useProjection(), { wrapper: queryWrapper() })
    await waitFor(() => expect(p.result.current.isSuccess).toBe(true))
    expect(callOf(fetchMock).path).toBe('/installment-purchases/projection?months=12')
  })

  it('creates, updates, deletes and pays with the right requests', async () => {
    const fetchMock = stubFetch(jsonResponse(200, {}))
    const wrapper = queryWrapper()
    const create = renderHook(() => useCreatePurchase(), { wrapper })
    const body = {
      creditCardId: 'k1', description: 'Laptop', categoryId: 'c1', totalCents: 120000,
      installments: 12, annualRatePercent: 0, startDate: '2026-03-15',
    }
    await act(() => create.result.current.mutateAsync(body))
    expect(callOf(fetchMock, 0)).toMatchObject({ path: '/installment-purchases', method: 'POST', body })

    const update = renderHook(() => useUpdatePurchase(), { wrapper })
    await act(() => update.result.current.mutateAsync({ id: 'p1', description: 'X', subcategoryId: null }))
    const patch = callOf(fetchMock, 1)
    expect(patch).toMatchObject({ path: '/installment-purchases/p1', method: 'PATCH' })
    expect(patch.body).toEqual({ description: 'X', subcategoryId: null })

    const del = renderHook(() => useDeletePurchase(), { wrapper })
    await act(() => del.result.current.mutateAsync('p1'))
    expect(callOf(fetchMock, 2)).toMatchObject({ path: '/installment-purchases/p1', method: 'DELETE' })

    const pay = renderHook(() => usePayInstallment(), { wrapper })
    await act(() => pay.result.current.mutateAsync({ id: 'p1', accountId: 'a1', date: '2026-04-01' }))
    expect(callOf(fetchMock, 3)).toMatchObject({
      path: '/installment-purchases/p1/pay',
      method: 'POST',
      body: { accountId: 'a1', date: '2026-04-01' },
    })
  })

  it.each([
    ['create', () => useCreatePurchase(), { creditCardId: 'k1' }],
    ['delete', () => useDeletePurchase(), 'p1'],
    ['pay', () => usePayInstallment(), { id: 'p1', accountId: 'a1' }],
  ] as const)('%s invalidates purchases, cards, accounts and transactions', async (_n, hook, vars) => {
    stubFetch(jsonResponse(200, {}))
    const client = makeClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => hook(), { wrapper: queryWrapper(client) })
    await act(() => (result.current.mutateAsync as (v: unknown) => Promise<unknown>)(vars))
    expect(keysOf(spy)).toEqual(
      expect.arrayContaining(['installment-purchases', 'credit-cards', 'accounts', 'transactions']),
    )
  })

  it('editing a purchase only refreshes purchases', async () => {
    stubFetch(jsonResponse(200, {}))
    const client = makeClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useUpdatePurchase(), { wrapper: queryWrapper(client) })
    await act(() => result.current.mutateAsync({ id: 'p1', description: 'X' }))
    expect(keysOf(spy)).toEqual(['installment-purchases'])
  })
})
