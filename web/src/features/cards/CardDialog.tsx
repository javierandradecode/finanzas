import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { useCreateCard, useUpdateCard, type CreditCard } from '@/api/credit-cards'
import { MoneyInput } from '@/components/MoneyInput'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FieldError } from '@/features/auth/AuthShell'
import { cardSchema, toCardPayload, type CardFormValues } from './card-form'

export function CardDialog({
  open,
  onOpenChange,
  card,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  card?: CreditCard
}) {
  const create = useCreateCard()
  const update = useUpdateCard()
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CardFormValues>({
    resolver: zodResolver(cardSchema),
    defaultValues: {
      name: card?.name ?? '',
      limitCents: card?.limitCents ?? null,
      cutoffDay: card ? String(card.cutoffDay) : '',
      paymentDay: card ? String(card.paymentDay) : '',
      annualRatePercent: card ? String(card.annualRatePercent).replace('.', ',') : '',
      initialDebtCents: null,
    },
  })

  const onSubmit = async (values: CardFormValues) => {
    try {
      if (card) {
        await update.mutateAsync({ id: card._id, ...toCardPayload(values, 'update') })
      } else {
        await create.mutateAsync(toCardPayload(values, 'create'))
      }
      toast.success(card ? 'Tarjeta actualizada' : 'Tarjeta creada')
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ocurrió un error inesperado')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{card ? 'Editar tarjeta' : 'Nueva tarjeta'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="card-name">Nombre</Label>
            <Input id="card-name" {...register('name')} />
            <FieldError message={errors.name?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="card-limit">Cupo</Label>
            <Controller
              control={control}
              name="limitCents"
              render={({ field }) => (
                <MoneyInput
                  id="card-limit"
                  placeholder="0,00"
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                />
              )}
            />
            <FieldError message={errors.limitCents?.message} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="card-cutoff">Día de corte</Label>
              <Input id="card-cutoff" inputMode="numeric" {...register('cutoffDay')} />
              <FieldError message={errors.cutoffDay?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="card-payment">Día de pago</Label>
              <Input id="card-payment" inputMode="numeric" {...register('paymentDay')} />
              <FieldError message={errors.paymentDay?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="card-rate">Tasa anual (%)</Label>
              <Input
                id="card-rate"
                inputMode="decimal"
                placeholder="0"
                {...register('annualRatePercent')}
              />
              <FieldError message={errors.annualRatePercent?.message} />
            </div>
          </div>

          {!card && (
            <div className="space-y-2">
              <Label htmlFor="card-debt">Deuda inicial</Label>
              <Controller
                control={control}
                name="initialDebtCents"
                render={({ field }) => (
                  <MoneyInput
                    id="card-debt"
                    placeholder="0,00"
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                  />
                )}
              />
              <FieldError message={errors.initialDebtCents?.message} />
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando…' : 'Guardar'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
