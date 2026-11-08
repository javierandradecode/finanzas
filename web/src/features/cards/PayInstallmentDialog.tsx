import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { useAccounts } from '@/api/accounts'
import { usePayInstallment, type InstallmentPurchase } from '@/api/installment-purchases'
import { NativeSelect } from '@/components/NativeSelect'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FieldError } from '@/features/auth/AuthShell'
import { useAuth } from '@/features/auth/useAuth'
import { todayLocal } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import {
  payInstallmentSchema,
  type PayInstallmentValues,
} from './purchase-form'

export function PayInstallmentDialog({
  open,
  onOpenChange,
  purchase,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  purchase: InstallmentPurchase
}) {
  const currency = useAuth().user?.currency ?? 'USD'
  const accounts = useAccounts(true).data?.filter((a) => !a.isArchived) ?? []
  const pay = usePayInstallment()
  const next = purchase.schedule[purchase.paidInstallments]
  const money = (cents: number) => formatMoney(cents, currency)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PayInstallmentValues>({
    resolver: zodResolver(payInstallmentSchema),
    defaultValues: { accountId: '', date: todayLocal() },
  })

  const onSubmit = async (values: PayInstallmentValues) => {
    try {
      await pay.mutateAsync({ id: purchase._id, ...values })
      toast.success('Cuota pagada')
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ocurrió un error inesperado')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pagar cuota</DialogTitle>
        </DialogHeader>
        {next && (
          <p data-testid="breakdown" className="text-sm">
            {purchase.description} · cuota {next.number} de {purchase.installments}: capital{' '}
            <strong>{money(next.principalCents)}</strong> + interés{' '}
            <strong>{money(next.interestCents)}</strong> = <strong>{money(next.paymentCents)}</strong>
          </p>
        )}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="pay-account">Cuenta de origen</Label>
            <NativeSelect id="pay-account" {...register('accountId')}>
              <option value="">Elige…</option>
              {accounts.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name}
                </option>
              ))}
            </NativeSelect>
            <FieldError message={errors.accountId?.message} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pay-date">Fecha</Label>
            <Input id="pay-date" type="date" {...register('date')} />
            <FieldError message={errors.date?.message} />
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Pagando…' : 'Pagar'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
