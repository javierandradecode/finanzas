import { renderHook, waitFor } from '@testing-library/react'
import { act } from 'react'
import {
  callOf,
  jsonResponse,
  makeClient,
  queryWrapper,
  stubFetch,
} from '@/test/utils'
import {
  useAccounts,
  useArchiveAccount,
  useCreateAccount,
  useUpdateAccount,
} from './accounts'

const account = {
  _id: 'a1',
  type: 'cash',
  name: 'Caja',
  balanceCents: 100,
  isArchived: false,
}

describe('account hooks', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('lists active accounts by default', async () => {
    const fetchMock = stubFetch(jsonResponse(200, [account]))
    const { result } = renderHook(() => useAccounts(false), {
      wrapper: queryWrapper(),
    })
    await waitFor(() => expect(result.current.data).toEqual([account]))
    expect(callOf(fetchMock).path).toBe('/accounts')
  })

  it('asks for archived accounts when requested', async () => {
    const fetchMock = stubFetch(jsonResponse(200, []))
    const { result } = renderHook(() => useAccounts(true), {
      wrapper: queryWrapper(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(callOf(fetchMock).path).toBe('/accounts?includeArchived=true')
  })

  it('creates with POST and refetches the list', async () => {
    const fetchMock = stubFetch(jsonResponse(200, []), jsonResponse(201, account))
    const wrapper = queryWrapper(makeClient())
    const { result } = renderHook(
      () => ({ list: useAccounts(false), create: useCreateAccount() }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))
    await act(() =>
      result.current.create.mutateAsync({
        type: 'cash',
        name: 'Caja',
        initialBalanceCents: 500,
      }),
    )
    const post = callOf(fetchMock, 1)
    expect(post).toMatchObject({ path: '/accounts', method: 'POST' })
    expect(post.body).toEqual({
      type: 'cash',
      name: 'Caja',
      initialBalanceCents: 500,
    })
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(2))
    expect(callOf(fetchMock, 2).method).toBe('GET')
  })

  it('updates with PATCH and keeps the id out of the body', async () => {
    const fetchMock = stubFetch(jsonResponse(200, account))
    const { result } = renderHook(() => useUpdateAccount(), {
      wrapper: queryWrapper(),
    })
    await act(() =>
      result.current.mutateAsync({ id: 'a1', name: 'Nueva', isArchived: false }),
    )
    const c = callOf(fetchMock)
    expect(c).toMatchObject({ path: '/accounts/a1', method: 'PATCH' })
    expect(c.body).toEqual({ name: 'Nueva', isArchived: false })
  })

  it('archives with DELETE', async () => {
    const fetchMock = stubFetch(jsonResponse(204))
    const { result } = renderHook(() => useArchiveAccount(), {
      wrapper: queryWrapper(),
    })
    await act(() => result.current.mutateAsync('a1'))
    expect(callOf(fetchMock)).toMatchObject({
      path: '/accounts/a1',
      method: 'DELETE',
    })
  })
})
