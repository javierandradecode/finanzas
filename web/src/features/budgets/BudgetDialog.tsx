import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { useCreateBudget, useUpdateBudget } from '@/api/budgets'
import { useCategories, type Category } from '@/api/categories'
import { CategoryIcon } from '@/components/CategoryIcon'
import { MoneyInput } from '@/components/MoneyInput'
import { NativeSelect } from '@/components/NativeSelect'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { FieldError } from '@/features/auth/AuthShell'
import { formatMonth } from '@/lib/dates'
import { budgetSchema, type BudgetFormValues, type BudgetItem } from './budget-form'

const errorText = (e: unknown) =>
  e instanceof Error ? e.message : 'Ocurrió un error inesperado'

export function BudgetDialog({
  open,
  onOpenChange,
  month,
  takenCategoryIds,
  item,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  month: string
  /** Categories that already have a budget this month. */
  takenCategoryIds: string[]
  item?: BudgetItem
}) {
  const categories = useCategories(true)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? 'Editar presupuesto' : 'Nuevo presupuesto'}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{formatMonth(month)}</p>
        {item ? (
          <BudgetForm month={month} item={item} categories={[]} onOpenChange={onOpenChange} />
        ) : categories.data ? (
          // Mounted once the categories exist, so the <select> never starts without its options.
          <BudgetForm
            month={month}
            categories={categories.data.filter(
              (c) => c.type === 'expense' && !c.isArchived && !takenCategoryIds.includes(c._id),
            )}
            onOpenChange={onOpenChange}
          />
        ) : categories.error ? (
          <p role="alert" className="text-destructive">
            {categories.error.message}
          </p>
        ) : (
          <p className="text-muted-foreground">Cargando…</p>
        )}
      </DialogContent>
    </Dialog>
  )
}

function BudgetForm({
  month,
  item,
  categories,
  onOpenChange,
}: {
  month: string
  item?: BudgetItem
  categories: Category[]
  onOpenChange: (open: boolean) => void
}) {
  const create = useCreateBudget()
  const update = useUpdateBudget()
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<BudgetFormValues>({
    resolver: zodResolver(budgetSchema),
    defaultValues: {
      categoryId: item?.categoryId ?? '',
      limitCents: item?.limitCents ?? null,
    },
  })

  const onSubmit = async (values: BudgetFormValues) => {
    const limitCents = values.limitCents as number
    try {
      if (item) {
        await update.mutateAsync({ id: item.budgetId, limitCents })
      } else {
        await create.mutateAsync({ categoryId: values.categoryId, month, limitCents })
      }
      toast.success(item ? 'Presupuesto actualizado' : 'Presupuesto creado')
      onOpenChange(false)
    } catch (e) {
      toast.error(errorText(e))
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {item ? (
        <div className="flex items-center gap-2 font-medium">
          <CategoryIcon name={item.icon} color={item.color} />
          <span>{item.name}</span>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="budget-category">Categoría</Label>
          <NativeSelect id="budget-category" {...register('categoryId')}>
            <option value="">Elige…</option>
            {categories.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
          <FieldError message={errors.categoryId?.message} />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="budget-limit">Límite</Label>
        <Controller
          control={control}
          name="limitCents"
          render={({ field }) => (
            <MoneyInput
              id="budget-limit"
              placeholder="0,00"
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />
        <FieldError message={errors.limitCents?.message} />
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Guardando…' : 'Guardar'}
      </Button>
    </form>
  )
}
