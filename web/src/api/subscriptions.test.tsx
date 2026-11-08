import { renderHook, waitFor } from '@testing-library/react'
import { act } from 'react'
import { callOf, jsonResponse, makeClient, queryWrapper, stubFetch } from '@/test/utils'
import {
  useCreateSubscription,
  usePauseSubscription,
  useProcessDue,
  useReactivateSubscription,
  useSubscriptions,
  useUpcoming,
  useUpdateSubscription,
} from './subscriptions'

afterEach(() => vi.unstubAllGlobals())

const keysOf = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey[0])

describe('subscription queries', () => {
  it('lists subscriptions and upcoming charges', async () => {
    let fetchMock = stubFetch(jsonResponse(200, []))
    let r = renderHook(() => useSubscriptions(), { wrapper: queryWrapper() })
    await waitFor(() => expect(r.result.current.isSuccess).toBe(true))
    expect(callOf(fetchMock).path).toBe('/subscriptions')

    fetchMock = stubFetch(jsonResponse(200, []))
    r = renderHook(() => useUpcoming(), { wrapper: queryWrapper() }) as unknown as typeof r
    await waitFor(() => expect(r.result.current.isSuccess).toBe(true))
    expect(callOf(fetchMock).path).toBe('/subscriptions/upcoming?days=30')
  })
})

describe('subscription mutations', () => {
  it('create, update (id out of the body, nulls kept), pause and reactivate', async () => {
    const fetchMock = stubFetch(jsonResponse(200, {}))
    const wrapper = queryWrapper()

    const create = renderHook(() => useCreateSubscription(), { wrapper })
    const body = {
      name: 'Netflix', amountCents: 999, frequency: 'monthly' as const,
      nextDate: '2026-03-15', accountId: 'a1', categoryId: 'c1',
    }
    await act(() => create.result.current.mutateAsync(body))
    expect(callOf(fetchMock, 0)).toMatchObject({ path: '/subscriptions', method: 'POST', body })

    const update = renderHook(() => useUpdateSubscription(), { wrapper })
    await act(() =>
      update.result.current.mutateAsync({
        id: 's1', name: 'Netflix', amountCents: 999, frequency: 'monthly', nextDate: '2026-03-15',
        accountId: null, creditCardId: 'k1', categoryId: 'c1', subcategoryId: null,
      }),
    )
    const patch = callOf(fetchMock, 1)
    expect(patch).toMatchObject({ path: '/subscriptions/s1', method: 'PATCH' })
    expect(patch.body).not.toHaveProperty('id')
    expect(patch.body).toMatchObject({ accountId: null, creditCardId: 'k1', subcategoryId: null })

    const pause = renderHook(() => usePauseSubscription(), { wrapper })
    await act(() => pause.result.current.mutateAsync('s1'))
    expect(callOf(fetchMock, 2)).toMatchObject({ path: '/subscriptions/s1', method: 'DELETE' })

    const reactivate = renderHook(() => useReactivateSubscription(), { wrapper })
    await act(() => reactivate.result.current.mutateAsync('s1'))
    expect(callOf(fetchMock, 3)).toMatchObject({
      path: '/subscriptions/s1',
      method: 'PATCH',
      body: { active: true },
    })
  })

  it.each([
    ['create', () => useCreateSubscription(), { name: 'x' }],
    ['pause', () => usePauseSubscription(), 's1'],
    ['reactivate', () => useReactivateSubscription(), 's1'],
  ] as const)('%s invalidates only subscriptions', async (_n, hook, vars) => {
    stubFetch(jsonResponse(200, {}))
    const client = makeClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => hook(), { wrapper: queryWrapper(client) })
    await act(() => (result.current.mutateAsync as (v: unknown) => Promise<unknown>)(vars))
    expect(keysOf(spy)).toEqual(['subscriptions'])
  })

  it('process-due posts and refreshes subscriptions, transactions, accounts and cards', async () => {
    const fetchMock = stubFetch(jsonResponse(200, { charged: 2, failed: [] }))
    const client = makeClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useProcessDue(), { wrapper: queryWrapper(client) })
    let summary: unknown
    await act(async () => {
      summary = await result.current.mutateAsync()
    })
    expect(callOf(fetchMock)).toMatchObject({ path: '/subscriptions/process-due', method: 'POST' })
    expect(summary).toEqual({ charged: 2, failed: [] })
    expect(keysOf(spy)).toEqual(
      expect.arrayContaining(['subscriptions', 'transactions', 'accounts', 'credit-cards']),
    )
  })
})
