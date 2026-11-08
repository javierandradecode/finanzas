import { renderHook, waitFor } from '@testing-library/react'
import { act } from 'react'
import { callOf, jsonResponse, queryWrapper, stubFetch } from '@/test/utils'
import {
  useAddSubcategory,
  useArchiveCategory,
  useArchiveSubcategory,
  useCategories,
  useCreateCategory,
  useUpdateCategory,
  useUpdateSubcategory,
} from './categories'

describe('category hooks', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('lists, with and without archived', async () => {
    let fetchMock = stubFetch(jsonResponse(200, []))
    let r = renderHook(() => useCategories(false), { wrapper: queryWrapper() })
    await waitFor(() => expect(r.result.current.isSuccess).toBe(true))
    expect(callOf(fetchMock).path).toBe('/categories')

    fetchMock = stubFetch(jsonResponse(200, []))
    r = renderHook(() => useCategories(true), { wrapper: queryWrapper() })
    await waitFor(() => expect(r.result.current.isSuccess).toBe(true))
    expect(callOf(fetchMock).path).toBe('/categories?includeArchived=true')
  })

  it('creates, updates and archives a category', async () => {
    const fetchMock = stubFetch(jsonResponse(200, {}))
    const wrapper = queryWrapper()
    const create = renderHook(() => useCreateCategory(), { wrapper })
    await act(() =>
      create.result.current.mutateAsync({
        type: 'expense',
        name: 'Gym',
        icon: 'dumbbell',
        color: '#ef4444',
      }),
    )
    expect(callOf(fetchMock, 0)).toMatchObject({
      path: '/categories',
      method: 'POST',
      body: { type: 'expense', name: 'Gym', icon: 'dumbbell', color: '#ef4444' },
    })

    const update = renderHook(() => useUpdateCategory(), { wrapper })
    await act(() => update.result.current.mutateAsync({ id: 'c1', name: 'X' }))
    expect(callOf(fetchMock, 1)).toMatchObject({
      path: '/categories/c1',
      method: 'PATCH',
      body: { name: 'X' },
    })

    const archive = renderHook(() => useArchiveCategory(), { wrapper })
    await act(() => archive.result.current.mutateAsync('c1'))
    expect(callOf(fetchMock, 2)).toMatchObject({
      path: '/categories/c1',
      method: 'DELETE',
    })
  })

  it('manages subcategories', async () => {
    const fetchMock = stubFetch(jsonResponse(200, {}))
    const wrapper = queryWrapper()
    const add = renderHook(() => useAddSubcategory(), { wrapper })
    await act(() =>
      add.result.current.mutateAsync({ categoryId: 'c1', name: 'Super' }),
    )
    expect(callOf(fetchMock, 0)).toMatchObject({
      path: '/categories/c1/subcategories',
      method: 'POST',
      body: { name: 'Super' },
    })

    const upd = renderHook(() => useUpdateSubcategory(), { wrapper })
    await act(() =>
      upd.result.current.mutateAsync({
        categoryId: 'c1',
        subId: 's1',
        isArchived: false,
      }),
    )
    expect(callOf(fetchMock, 1)).toMatchObject({
      path: '/categories/c1/subcategories/s1',
      method: 'PATCH',
      body: { isArchived: false },
    })

    const arc = renderHook(() => useArchiveSubcategory(), { wrapper })
    await act(() =>
      arc.result.current.mutateAsync({ categoryId: 'c1', subId: 's1' }),
    )
    expect(callOf(fetchMock, 2)).toMatchObject({
      path: '/categories/c1/subcategories/s1',
      method: 'DELETE',
    })
  })
})
