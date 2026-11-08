import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { useCategories, type Category } from '@/api/categories'
import {
  useCreatePurchase,
  useUpdatePurchase,
  type InstallmentPurchase,
} from '@/api/installment-purchases'
import { MoneyInput } from '@/components/MoneyInput'
import { NativeSelect } from '@/components/NativeSelect'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FieldError } from '@/features/auth/AuthShell'
import { useAuth } from '@/features/auth/useAuth'
import { todayLocal } from '@/lib/dates'
import { previewSchedule } from '@/lib/installments'
import { formatMoney } from '@/lib/money'
import { parseIntText, parseRate } from '@/lib/numbers'
import {
  purchaseEditSchema,
  purchaseSchema,
  toPurchasePayload,
  type PurchaseEditValues,
  type PurchaseFormValues,
} from './purchase-form'

/** Active expense categories, plus the current one (it may be archived). */
const expenseCategories = (categories: Category[], current?: string) =>
  categories.filter((c) => c.type === 'expense' && (!c.isArchived || c._id === current))

const subcategoriesOf = (categories: Category[], categoryId: string, current?: string) =>
  (categories.find((c) => c._id === categoryId)?.subcategories ?? []).filter(
    (s) => !s.isArchived || s._id === current,
  )

export function PurchaseDialog({
  open,
  onOpenChange,
  cardId,
  purchase,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  cardId: string
  purchase?: InstallmentPurchase
}) {
  const categories = useCategories(true)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{purchase ? 'Editar compra' : 'Nueva compra a cuotas'}</DialogTitle>
        </DialogHeader>
        {categories.data ? (
          // Mounted once the categories exist, so a <select> never starts without its options.
          purchase ? (
            <EditForm purchase={purchase} categories={categories.data} onOpenChange={onOpenChange} />
          ) : (
            <CreateForm cardId={cardId} categories={categories.data} onOpenChange={onOpenChange} />
          )
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

const errorText = (e: unknown) =>
  e instanceof Error ? e.message : 'Ocurrió un error inesperado'

function CreateForm({
  cardId,
  categories,
  onOpenChange,
}: {
  cardId: string
  categories: Category[]
  onOpenChange: (open: boolean) => void
}) {
  const currency = useAuth().user?.currency ?? 'USD'
  const create = useCreatePurchase()
  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<PurchaseFormValues>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: {
      description: '',
      categoryId: '',
      subcategoryId: '',
      totalCents: null,
      installments: '',
      annualRatePercent: '',
      startDate: todayLocal(),
    },
  })

  const [categoryId, totalCents, installments, rateText] = useWatch({
    control,
    name: ['categoryId', 'totalCents', 'installments', 'annualRatePercent'],
  })
  const rate = rateText.trim() === '' ? 0 : (parseRate(rateText) ?? -1)
  const preview =
    typeof totalCents === 'number' && !Number.isNaN(totalCents)
      ? previewSchedule({
          totalCents,
          installments: parseIntText(installments) ?? 0,
          annualRatePercent: rate,
        })
      : null

  const onSubmit = async (values: PurchaseFormValues) => {
    try {
      await create.mutateAsync(toPurchasePayload(values, cardId))
      toast.success('Compra registrada')
      onOpenChange(false)
    } catch (e) {
      toast.error(errorText(e))
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="p-description">Descripción</Label>
        <Input id="p-description" {...register('description')} />
        <FieldError message={errors.description?.message} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="p-category">Categoría</Label>
          <NativeSelect
            id="p-category"
            {...register('categoryId', { onChange: () => setValue('subcategoryId', '') })}
          >
            <option value="">Elige…</option>
            {expenseCategories(categories).map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
          <FieldError message={errors.categoryId?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="p-subcategory">Subcategoría</Label>
          <NativeSelect id="p-subcategory" {...register('subcategoryId')}>
            <option value="">Sin subcategoría</option>
            {subcategoriesOf(categories, categoryId).map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label htmlFor="p-total">Monto total</Label>
          <Controller
            control={control}
            name="totalCents"
            render={({ field }) => (
              <MoneyInput
                id="p-total"
                placeholder="0,00"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          />
          <FieldError message={errors.totalCents?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="p-installments">Cuotas</Label>
          <Input id="p-installments" inputMode="numeric" {...register('installments')} />
          <FieldError message={errors.installments?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="p-rate">Tasa anual (%)</Label>
          <Input id="p-rate" inputMode="decimal" placeholder="0" {...register('annualRatePercent')} />
          <FieldError message={errors.annualRatePercent?.message} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="p-date">Fecha de compra</Label>
        <Input id="p-date" type="date" {...register('startDate')} />
        <FieldError message={errors.startDate?.message} />
      </div>

      <div data-testid="preview" className="rounded-lg bg-muted p-3 text-sm">
        {preview ? (
          <>
            Cuota estimada <strong>{formatMoney(preview.firstPaymentCents, currency)}</strong>
            {' · '}Interés total {formatMoney(preview.totalInterestCents, currency)}
            {' · '}Total a pagar {formatMoney(preview.totalPaidCents, currency)}
          </>
        ) : (
          'Completa monto y cuotas para ver la cuota.'
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Guardando…' : 'Guardar'}
      </Button>
    </form>
  )
}

function EditForm({
  purchase,
  categories,
  onOpenChange,
}: {
  purchase: InstallmentPurchase
  categories: Category[]
  onOpenChange: (open: boolean) => void
}) {
  const update = useUpdatePurchase()
  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<PurchaseEditValues>({
    resolver: zodResolver(purchaseEditSchema),
    defaultValues: {
      description: purchase.description,
      categoryId: purchase.categoryId,
      subcategoryId: purchase.subcategoryId ?? '',
    },
  })
  const categoryId = useWatch({ control, name: 'categoryId' })

  const onSubmit = async (values: PurchaseEditValues) => {
    try {
      await update.mutateAsync({
        id: purchase._id,
        description: values.description.trim(),
        categoryId: values.categoryId,
        subcategoryId: values.subcategoryId || null,
      })
      toast.success('Compra actualizada')
      onOpenChange(false)
    } catch (e) {
      toast.error(errorText(e))
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <p className="text-sm text-muted-foreground">
        El monto, las cuotas y la tasa no se pueden cambiar. Para corregirlos, elimina la compra
        (si no tiene cuotas pagadas) y créala de nuevo.
      </p>
      <div className="space-y-2">
        <Label htmlFor="p-description">Descripción</Label>
        <Input id="p-description" {...register('description')} />
        <FieldError message={errors.description?.message} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="p-category">Categoría</Label>
          <NativeSelect
            id="p-category"
            {...register('categoryId', { onChange: () => setValue('subcategoryId', '') })}
          >
            <option value="">Elige…</option>
            {expenseCategories(categories, purchase.categoryId).map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
          <FieldError message={errors.categoryId?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="p-subcategory">Subcategoría</Label>
          <NativeSelect id="p-subcategory" {...register('subcategoryId')}>
            <option value="">Sin subcategoría</option>
            {subcategoriesOf(categories, categoryId, purchase.subcategoryId).map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Guardando…' : 'Guardar'}
      </Button>
    </form>
  )
}
