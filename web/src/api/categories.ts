import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'

export type CategoryType = 'income' | 'expense'

export interface Subcategory {
  _id: string
  name: string
  isArchived: boolean
}

export interface Category {
  _id: string
  type: CategoryType
  name: string
  icon: string
  color: string
  isArchived: boolean
  subcategories: Subcategory[]
}

export const useCategories = (includeArchived: boolean) =>
  useQuery({
    queryKey: ['categories', { includeArchived }],
    queryFn: () =>
      api<Category[]>(
        `/categories${includeArchived ? '?includeArchived=true' : ''}`,
      ),
  })

/** Runs a mutation, then refetches every ['categories'] query. */
function useCategoryMutation<TVars>(fn: (vars: TVars) => Promise<unknown>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['categories'] }),
  })
}

export const useCreateCategory = () =>
  useCategoryMutation(
    (body: { type: CategoryType; name: string; icon: string; color: string }) =>
      api<Category>('/categories', { method: 'POST', body }),
  )

export const useUpdateCategory = () =>
  useCategoryMutation(
    ({
      id,
      ...body
    }: {
      id: string
      name?: string
      icon?: string
      color?: string
      isArchived?: boolean
    }) => api<Category>(`/categories/${id}`, { method: 'PATCH', body }),
  )

export const useArchiveCategory = () =>
  useCategoryMutation((id: string) =>
    api<void>(`/categories/${id}`, { method: 'DELETE' }),
  )

export const useAddSubcategory = () =>
  useCategoryMutation(
    ({ categoryId, name }: { categoryId: string; name: string }) =>
      api<Category>(`/categories/${categoryId}/subcategories`, {
        method: 'POST',
        body: { name },
      }),
  )

export const useUpdateSubcategory = () =>
  useCategoryMutation(
    ({
      categoryId,
      subId,
      ...body
    }: {
      categoryId: string
      subId: string
      name?: string
      isArchived?: boolean
    }) =>
      api<Category>(`/categories/${categoryId}/subcategories/${subId}`, {
        method: 'PATCH',
        body,
      }),
  )

export const useArchiveSubcategory = () =>
  useCategoryMutation(
    ({ categoryId, subId }: { categoryId: string; subId: string }) =>
      api<void>(`/categories/${categoryId}/subcategories/${subId}`, {
        method: 'DELETE',
      }),
  )
