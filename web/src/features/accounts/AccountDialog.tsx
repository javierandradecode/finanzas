import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import type { Account } from '@/api/accounts'
import { useCreateAccount, useUpdateAccount } from '@/api/accounts'
import { MoneyInput } from '@/components/MoneyInput'
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
import {
  ACCOUNT_TYPE_LABELS,
  accountSchema,
  type AccountFormValues,
} from './account-schema'

const TYPE_OPTIONS = (
  Object.keys(ACCOUNT_TYPE_LABELS) as (keyof typeof ACCOUNT_TYPE_LABELS)[]
).map((value) => ({ value, label: ACCOUNT_TYPE_LABELS[value] }))

export function AccountDialog({
  open,
  onOpenChange,
  account,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  account?: Account
}) {
  const create = useCreateAccount()
  const update = useUpdateAccount()
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      name: account?.name ?? '',
      type: account?.type ?? 'cash',
      initialBalanceCents: null,
    },
  })

  const onSubmit = async (values: AccountFormValues) => {
    try {
      if (account) {
        await update.mutateAsync({
          id: account._id,
          name: values.name,
          type: values.type,
        })
      } else {
        await create.mutateAsync({
          name: values.name,
          type: values.type,
          initialBalanceCents: values.initialBalanceCents ?? undefined,
        })
      }
      toast.success(account ? 'Cuenta actualizada' : 'Cuenta creada')
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ocurrió un error inesperado')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{account ? 'Editar cuenta' : 'Nueva cuenta'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="account-name">Nombre</Label>
            <Input id="account-name" {...register('name')} />
            <FieldError message={errors.name?.message} />
          </div>

          <div className="space-y-2">
            <Label id="account-type-label">Tipo</Label>
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <Segmented
                  labelledBy="account-type-label"
                  value={field.value}
                  options={TYPE_OPTIONS}
                  onChange={field.onChange}
                />
              )}
            />
          </div>

          {account ? (
            <p className="text-sm text-muted-foreground">
              El saldo cambia con tus movimientos; no se edita aquí.
            </p>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="account-balance">Saldo inicial</Label>
              <Controller
                control={control}
                name="initialBalanceCents"
                render={({ field }) => (
                  <MoneyInput
                    id="account-balance"
                    placeholder="0,00"
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                  />
                )}
              />
              <p className="text-xs text-muted-foreground">
                Es el punto de partida; después el saldo cambia con tus movimientos.
              </p>
              <FieldError message={errors.initialBalanceCents?.message} />
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
