import { renderHook, waitFor } from '@testing-library/react'
import { act } from 'react'
import { callOf, jsonResponse, makeClient, queryWrapper, stubFetch } from '@/test/utils'
import { useCreditCards } from './credit-cards'
import {
  useCreateTransaction,
  useDeleteTransaction,
  useTransactions,
  useUpdateTransaction,
} from './transactions'

const page = { items: [], total: 0, page: 1, limit: 20 }

describe('credit card hook', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('lists active cards, or all with archived', async () => {
    let fetchMock = stubFetch(jsonResponse(200, []))
    let r = renderHook(() => useCreditCards(false), { wrapper: queryWrapper() })
    await waitFor(() => expect(r.result.current.isSuccess).toBe(true))
    expect(callOf(fetchMock).path).toBe('/credit-cards')

    fetchMock = stubFetch(jsonResponse(200, []))
    r = renderHook(() => useCreditCards(true), { wrapper: queryWrapper() })
    await waitFor(() => expect(r.result.current.isSuccess).toBe(true))
    expect(callOf(fetchMock).path).toBe('/credit-cards?includeArchived=true')
  })
})

describe('transaction hooks', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('lists with the filters as a query string', async () => {
    const fetchMock = stubFetch(jsonResponse(200, page))
    const { result } = renderHook(
      () => useTransactions({ from: '2026-03-01', to: '2026-03-31', type: 'expense', page: 2 }),
      { wrapper: queryWrapper() },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(callOf(fetchMock).path).toBe(
      '/transactions?from=2026-03-01&to=2026-03-31&type=expense&page=2&limit=20',
    )
  })

  it('creates with POST', async () => {
    const fetchMock = stubFetch(jsonResponse(201, {}))
    const { result } = renderHook(() => useCreateTransaction(), { wrapper: queryWrapper() })
    const body = { type: 'expense' as const, amountCents: 100, date: '2026-03-15', accountId: 'a1', categoryId: 'c1' }
    await act(() => result.current.mutateAsync(body))
    expect(callOf(fetchMock)).toMatchObject({ path: '/transactions', method: 'POST', body })
  })

  it('updates with PATCH keeping nulls and leaving the id out of the body', async () => {
    const fetchMock = stubFetch(jsonResponse(200, {}))
    const { result } = renderHook(() => useUpdateTransaction(), { wrapper: queryWrapper() })
    await act(() =>
      result.current.mutateAsync({
        id: 't1',
        type: 'transfer',
        amountCents: 100,
        date: '2026-03-15',
        accountId: 'a1',
        toAccountId: 'a2',
        creditCardId: null,
        toCreditCardId: null,
        categoryId: null,
        subcategoryId: null,
        note: null,
      }),
    )
    const c = callOf(fetchMock)
    expect(c).toMatchObject({ path: '/transactions/t1', method: 'PATCH' })
    expect(c.body).not.toHaveProperty('id')
    expect(c.body).toMatchObject({ creditCardId: null, categoryId: null, note: null })
  })

  it('deletes with DELETE', async () => {
    const fetchMock = stubFetch(jsonResponse(204))
    const { result } = renderHook(() => useDeleteTransaction(), { wrapper: queryWrapper() })
    await act(() => result.current.mutateAsync('t1'))
    expect(callOf(fetchMock)).toMatchObject({ path: '/transactions/t1', method: 'DELETE' })
  })

  it.each([
    ['create', () => useCreateTransaction(), { type: 'income', amountCents: 1, date: '2026-03-01' }],
    ['update', () => useUpdateTransaction(), { id: 't1', amountCents: 5 }],
    ['delete', () => useDeleteTransaction(), 't1'],
  ] as const)('%s invalidates transactions, accounts and credit cards', async (_n, hook, vars) => {
    stubFetch(jsonResponse(200, {}))
    const client = makeClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => hook(), { wrapper: queryWrapper(client) })
    await act(() => (result.current.mutateAsync as (v: unknown) => Promise<unknown>)(vars))
    const keys = spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey[0])
    expect(keys).toEqual(expect.arrayContaining(['transactions', 'accounts', 'credit-cards']))
  })
})
