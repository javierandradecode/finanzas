import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import type { Category, CategoryType } from '@/api/categories'
import { useCreateCategory, useUpdateCategory } from '@/api/categories'
import { CategoryIcon } from '@/components/CategoryIcon'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FieldError } from '@/features/auth/AuthShell'
import { CATEGORY_COLORS, CATEGORY_ICONS } from '@/lib/category-options'
import { cn } from '@/lib/utils'
import { categorySchema, type CategoryFormValues } from './category-schema'

/** The curated options, plus the current value if it is not one of them. */
const withCurrent = (options: string[], current?: string) =>
  current && !options.includes(current) ? [...options, current] : options

export function CategoryDialog({
  open,
  onOpenChange,
  type,
  category,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Type for a new category (taken from the active tab); ignored when editing. */
  type: CategoryType
  category?: Category
}) {
  const create = useCreateCategory()
  const update = useUpdateCategory()
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: category?.name ?? '',
      icon: category?.icon ?? 'tag',
      color: category?.color ?? CATEGORY_COLORS[0],
    },
  })

  const icons = withCurrent(Object.keys(CATEGORY_ICONS), category?.icon)
  const colors = withCurrent(CATEGORY_COLORS, category?.color)

  const onSubmit = async (values: CategoryFormValues) => {
    try {
      if (category) {
        await update.mutateAsync({ id: category._id, ...values })
      } else {
        await create.mutateAsync({ type, ...values })
      }
      toast.success(category ? 'Categoría actualizada' : 'Categoría creada')
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ocurrió un error inesperado')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {category ? 'Editar categoría' : 'Nueva categoría'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="category-name">Nombre</Label>
            <Input id="category-name" {...register('name')} />
            <FieldError message={errors.name?.message} />
          </div>

          <div className="space-y-2">
            <Label>Icono</Label>
            <Controller
              control={control}
              name="icon"
              render={({ field }) => (
                <div className="grid grid-cols-7 gap-1">
                  {icons.map((name) => (
                    <Button
                      key={name}
                      type="button"
                      size="icon"
                      variant={field.value === name ? 'default' : 'outline'}
                      aria-label={`Icono ${name}`}
                      aria-pressed={field.value === name}
                      onClick={() => field.onChange(name)}
                    >
                      <CategoryIcon name={name} />
                    </Button>
                  ))}
                </div>
              )}
            />
            <FieldError message={errors.icon?.message} />
          </div>

          <div className="space-y-2">
            <Label>Color</Label>
            <Controller
              control={control}
              name="color"
              render={({ field }) => (
                <div className="flex flex-wrap gap-2">
                  {colors.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      aria-label={`Color ${hex}`}
                      aria-pressed={field.value === hex}
                      onClick={() => field.onChange(hex)}
                      style={{ backgroundColor: hex }}
                      className={cn(
                        'size-7 rounded-full ring-offset-2 ring-offset-background',
                        field.value === hex && 'ring-2 ring-foreground',
                      )}
                    />
                  ))}
                </div>
              )}
            />
            <FieldError message={errors.color?.message} />
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando…' : 'Guardar'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
