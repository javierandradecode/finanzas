import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { useAccounts, type Account } from '@/api/accounts'
import { useCategories, type Category } from '@/api/categories'
import { useCreditCards, type CreditCard } from '@/api/credit-cards'
import {
  useCreateSubscription,
  useUpdateSubscription,
  type Subscription,
} from '@/api/subscriptions'
import { DatePicker } from '@/components/DatePicker'
import { MoneyInput } from '@/components/MoneyInput'
import { NativeSelect } from '@/components/NativeSelect'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FieldError } from '@/features/auth/AuthShell'
import { todayLocal } from '@/lib/dates'
import {
  FREQUENCIES,
  FREQUENCY_LABELS,
  fromSubscription,
  isPastDate,
  subscriptionSchema,
  toCreatePayload,
  toUpdatePayload,
  type Frequency,
  type SubscriptionFormValues,
} from './subscription-form'

export function SubscriptionDialog({
  open,
  onOpenChange,
  subscription,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  subscription?: Subscription
}) {
  const accounts = useAccounts(true)
  const cards = useCreditCards(true)
  const categories = useCategories(true)
  const error = accounts.error ?? cards.error ?? categories.error

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{subscription ? 'Editar suscripción' : 'Nueva suscripción'}</DialogTitle>
        </DialogHeader>
        {accounts.data && cards.data && categories.data ? (
          // Mounted once the lists exist, so a <select> never starts without its options.
          <SubscriptionForm
            subscription={subscription}
            onOpenChange={onOpenChange}
            accounts={accounts.data}
            cards={cards.data}
            categories={categories.data}
          />
        ) : error ? (
          <p role="alert" className="text-destructive">
            {error.message}
          </p>
        ) : (
          <p className="text-muted-foreground">Cargando…</p>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Active items, plus the one the subscription already uses (it may be archived). */
const usable = <T extends { _id: string; isArchived: boolean }>(items: T[], currentId?: string) =>
  items.filter((i) => !i.isArchived || i._id === currentId)

function SubscriptionForm({
  subscription,
  onOpenChange,
  accounts,
  cards,
  categories,
}: {
  subscription?: Subscription
  onOpenChange: (open: boolean) => void
  accounts: Account[]
  cards: CreditCard[]
  categories: Category[]
}) {
  const create = useCreateSubscription()
  const update = useUpdateSubscription()
  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SubscriptionFormValues>({
    resolver: zodResolver(subscriptionSchema),
    defaultValues: subscription
      ? fromSubscription(subscription)
      : {
          name: '',
          amountCents: null,
          frequency: 'monthly',
          nextDate: todayLocal(),
          payer: '',
          categoryId: '',
          subcategoryId: '',
        },
  })
  const [categoryId, nextDate] = useWatch({ control, name: ['categoryId', 'nextDate'] })

  const categoryOptions = usable(
    categories.filter((c) => c.type === 'expense'),
    subscription?.categoryId,
  )
  const subcategoryOptions = (categories.find((c) => c._id === categoryId)?.subcategories ?? []).filter(
    (s) => !s.isArchived || s._id === subscription?.subcategoryId,
  )

  const onSubmit = async (values: SubscriptionFormValues) => {
    try {
      if (subscription) {
        await update.mutateAsync({ id: subscription._id, ...toUpdatePayload(values) })
      } else {
        await create.mutateAsync(toCreatePayload(values))
      }
      toast.success(subscription ? 'Suscripción actualizada' : 'Suscripción creada')
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ocurrió un error inesperado')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="sub-name">Nombre</Label>
        <Input id="sub-name" {...register('name')} />
        <FieldError message={errors.name?.message} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="sub-amount">Monto</Label>
          <Controller
            control={control}
            name="amountCents"
            render={({ field }) => (
              <MoneyInput
                id="sub-amount"
                placeholder="0,00"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          />
          <FieldError message={errors.amountCents?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sub-frequency">Frecuencia</Label>
          <NativeSelect id="sub-frequency" {...register('frequency')}>
            {FREQUENCIES.map((f: Frequency) => (
              <option key={f} value={f}>
                {FREQUENCY_LABELS[f]}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="sub-date">Próximo cobro</Label>
        <Controller
                control={control}
                name="nextDate"
                render={({ field }) => (
                  <DatePicker id="sub-date" label="Próximo cobro" value={field.value} onChange={field.onChange} />
                )}
              />
        <FieldError message={errors.nextDate?.message} />
        {isPastDate(nextDate, todayLocal()) && (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Se cobrarán los períodos vencidos desde esa fecha.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="sub-payer">Se paga con</Label>
        <NativeSelect id="sub-payer" {...register('payer')}>
          <option value="">Elige…</option>
          <optgroup label="Cuentas">
            {usable(accounts, subscription?.accountId).map((a) => (
              <option key={a._id} value={`account:${a._id}`}>
                {a.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Tarjetas">
            {usable(cards, subscription?.creditCardId).map((c) => (
              <option key={c._id} value={`card:${c._id}`}>
                {c.name}
              </option>
            ))}
          </optgroup>
        </NativeSelect>
        <FieldError message={errors.payer?.message} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="sub-category">Categoría</Label>
          <NativeSelect
            id="sub-category"
            {...register('categoryId', { onChange: () => setValue('subcategoryId', '') })}
          >
            <option value="">Elige…</option>
            {categoryOptions.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
          <FieldError message={errors.categoryId?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sub-subcategory">Subcategoría</Label>
          <NativeSelect id="sub-subcategory" {...register('subcategoryId')}>
            <option value="">Sin subcategoría</option>
            {subcategoryOptions.map((s) => (
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
