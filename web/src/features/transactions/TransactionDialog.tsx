import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { useAccounts, type Account } from '@/api/accounts'
import { useCategories, type Category } from '@/api/categories'
import { useCreditCards, type CreditCard } from '@/api/credit-cards'
import {
  useCreateTransaction,
  useUpdateTransaction,
  type Transaction,
} from '@/api/transactions'
import { MoneyInput } from '@/components/MoneyInput'
import { NativeSelect } from '@/components/NativeSelect'
import { Segmented } from '@/components/Segmented'
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
import { todayLocal } from '@/lib/dates'
import {
  fromTransaction,
  toCreatePayload,
  toUpdatePayload,
  transactionSchema,
  type TransactionFormValues,
  type TxType,
} from './transaction-form'

const TYPE_LABELS: Record<TxType, string> = {
  expense: 'Gasto',
  income: 'Ingreso',
  transfer: 'Transferencia',
}
const TYPE_OPTIONS = (Object.keys(TYPE_LABELS) as TxType[]).map((value) => ({
  value,
  label: TYPE_LABELS[value],
}))
const SOURCE_LABELS: Record<TxType, string> = {
  expense: 'Pagado con',
  income: 'Cuenta',
  transfer: 'Origen',
}

const emptyValues = (): TransactionFormValues => ({
  type: 'expense',
  amountCents: null,
  date: todayLocal(),
  source: '',
  destination: '',
  categoryId: '',
  subcategoryId: '',
  note: '',
})

/** Active items, plus the one the transaction already uses (it may be archived). */
const usable = <T extends { _id: string; isArchived: boolean }>(
  items: T[] | undefined,
  currentId?: string,
) => (items ?? []).filter((i) => !i.isArchived || i._id === currentId)

export function TransactionDialog({
  open,
  onOpenChange,
  transaction,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction?: Transaction
}) {
  const accounts = useAccounts(true)
  const cards = useCreditCards(true)
  const categories = useCategories(true)
  const error = accounts.error ?? cards.error ?? categories.error

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{transaction ? 'Editar movimiento' : 'Nuevo movimiento'}</DialogTitle>
        </DialogHeader>
        {accounts.data && cards.data && categories.data ? (
          // Mounted only once the lists exist, so a <select> never starts without its options.
          <TransactionForm
            transaction={transaction}
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

function TransactionForm({
  transaction,
  onOpenChange,
  accounts,
  cards,
  categories,
}: {
  transaction?: Transaction
  onOpenChange: (open: boolean) => void
  accounts: Account[]
  cards: CreditCard[]
  categories: Category[]
}) {
  const create = useCreateTransaction()
  const update = useUpdateTransaction()

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues: transaction ? fromTransaction(transaction) : emptyValues(),
  })

  const type = watch('type')
  const source = watch('source')
  const destination = watch('destination')
  const categoryId = watch('categoryId')

  const refId = (ref: string) => ref.slice(ref.indexOf(':') + 1)
  const accountOptions = (current: string) =>
    usable(accounts, current.startsWith('account:') ? refId(current) : undefined)
  const cardOptions = (current: string) =>
    usable(cards, current.startsWith('card:') ? refId(current) : undefined)

  const categoryOptions = usable(
    categories.filter((c) => c.type === (type === 'income' ? 'income' : 'expense')),
    categoryId,
  )
  const subcategoryOptions = usable(
    categories.find((c) => c._id === categoryId)?.subcategories,
    watch('subcategoryId'),
  )

  const changeType = (next: TxType) => {
    setValue('type', next)
    setValue('categoryId', '')
    setValue('subcategoryId', '')
    if (next !== 'expense' && source.startsWith('card:')) setValue('source', '')
    if (next !== 'transfer') setValue('destination', '')
  }

  const onSubmit = async (values: TransactionFormValues, addAnother = false) => {
    try {
      if (transaction) {
        await update.mutateAsync({ id: transaction._id, ...toUpdatePayload(values) })
      } else {
        await create.mutateAsync(toCreatePayload(values))
      }
      toast.success(transaction ? 'Movimiento actualizado' : 'Movimiento creado')
      if (addAnother) {
        // what usually repeats stays; what belongs to the next movement is emptied
        reset({ ...emptyValues(), type: values.type, date: values.date, source: values.source })
        document.getElementById('tx-amount')?.focus()
      } else {
        onOpenChange(false)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ocurrió un error inesperado')
    }
  }

  const groups = (current: string, withCards: boolean) => (
    <>
      <option value="">Elige…</option>
      <optgroup label="Cuentas">
        {accountOptions(current).map((a) => (
          <option key={a._id} value={`account:${a._id}`}>
            {a.name}
          </option>
        ))}
      </optgroup>
      {withCards && (
        <optgroup label="Tarjetas">
          {cardOptions(current).map((c) => (
            <option key={c._id} value={`card:${c._id}`}>
              {c.name}
            </option>
          ))}
        </optgroup>
      )}
    </>
  )

  return (
        <form onSubmit={handleSubmit((values) => onSubmit(values))} className="space-y-4" noValidate>
          <Segmented
            label="Tipo de movimiento"
            value={type}
            options={TYPE_OPTIONS}
            onChange={changeType}
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="tx-amount">Monto</Label>
              <Controller
                control={control}
                name="amountCents"
                render={({ field }) => (
                  <MoneyInput
                    id="tx-amount"
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
              <Label htmlFor="tx-date">Fecha</Label>
              <Input id="tx-date" type="date" {...register('date')} />
              <FieldError message={errors.date?.message} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tx-source">{SOURCE_LABELS[type]}</Label>
            <NativeSelect id="tx-source" {...register('source')}>
              {groups(source, type === 'expense')}
            </NativeSelect>
            <FieldError message={errors.source?.message} />
          </div>

          {type === 'transfer' && (
            <div className="space-y-2">
              <Label htmlFor="tx-destination">Destino</Label>
              <NativeSelect id="tx-destination" {...register('destination')}>
                {groups(destination, true)}
              </NativeSelect>
              <FieldError message={errors.destination?.message} />
            </div>
          )}

          {type !== 'transfer' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="tx-category">Categoría</Label>
                <NativeSelect
                  id="tx-category"
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
                <Label htmlFor="tx-subcategory">Subcategoría</Label>
                <NativeSelect id="tx-subcategory" {...register('subcategoryId')}>
                  <option value="">Sin subcategoría</option>
                  {subcategoryOptions.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="tx-note">Nota</Label>
            <Input id="tx-note" {...register('note')} />
            <FieldError message={errors.note?.message} />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" className="flex-1" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando…' : 'Guardar'}
            </Button>
            {!transaction && (
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={isSubmitting}
                onClick={() => void handleSubmit((values) => onSubmit(values, true))()}
              >
                Guardar y añadir otro
              </Button>
            )}
          </div>
        </form>
  )
}
