import { Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  useAccounts,
  useArchiveAccount,
  useUpdateAccount,
  type Account,
} from '@/api/accounts'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { AccountDialog } from '@/features/accounts/AccountDialog'
import { ACCOUNT_TYPE_LABELS } from '@/features/accounts/account-schema'
import { useAuth } from '@/features/auth/useAuth'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

const errorText = (e: unknown) =>
  e instanceof Error ? e.message : 'Ocurrió un error inesperado'

export function AccountsPage() {
  const { user } = useAuth()
  const currency = user?.currency ?? 'USD'
  const [showArchived, setShowArchived] = useState(false)
  const { data: accounts, isPending, error } = useAccounts(showArchived)
  const archive = useArchiveAccount()
  const update = useUpdateAccount()

  const [dialog, setDialog] = useState<{ account?: Account } | null>(null)
  const [toArchive, setToArchive] = useState<Account | null>(null)

  const total = (accounts ?? [])
    .filter((a) => !a.isArchived)
    .reduce((sum, a) => sum + a.balanceCents, 0)

  const restore = async (account: Account) => {
    try {
      await update.mutateAsync({ id: account._id, isArchived: false })
      toast.success('Cuenta restaurada')
    } catch (e) {
      toast.error(errorText(e))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Cuentas</h1>
          {accounts && (
            <p className="text-muted-foreground">
              Saldo total:{' '}
              <span
                className={cn(
                  'font-medium text-foreground',
                  total < 0 && 'text-destructive',
                )}
              >
                {formatMoney(total, currency)}
              </span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="show-archived"
              checked={showArchived}
              onCheckedChange={setShowArchived}
            />
            <Label htmlFor="show-archived">Mostrar archivadas</Label>
          </div>
          <Button onClick={() => setDialog({})}>
            <Plus className="size-4" /> Nueva cuenta
          </Button>
        </div>
      </div>

      {isPending && <p className="text-muted-foreground">Cargando…</p>}
      {error && (
        <p role="alert" className="text-destructive">
          {errorText(error)}
        </p>
      )}

      {accounts?.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-muted-foreground">Aún no tienes cuentas.</p>
            <Button onClick={() => setDialog({})}>Nueva cuenta</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {accounts?.map((account) => (
          <Card key={account._id} className={cn(account.isArchived && 'opacity-60')}>
            <CardContent className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{account.name}</p>
                  <Badge variant="secondary">
                    {ACCOUNT_TYPE_LABELS[account.type]}
                  </Badge>
                  {account.isArchived && (
                    <Badge variant="outline" className="ml-1">
                      Archivada
                    </Badge>
                  )}
                </div>
                <p
                  data-testid="balance"
                  className={cn(
                    'text-lg font-semibold',
                    account.balanceCents < 0 && 'text-destructive',
                  )}
                >
                  {formatMoney(account.balanceCents, currency)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDialog({ account })}
                >
                  Editar
                </Button>
                {account.isArchived ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void restore(account)}
                  >
                    Restaurar
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setToArchive(account)}
                  >
                    Archivar
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {dialog && (
        <AccountDialog
          // remount per opening so the form always starts from the right values
          key={dialog.account?._id ?? 'new'}
          open
          onOpenChange={(open) => !open && setDialog(null)}
          account={dialog.account}
        />
      )}

      <ConfirmDialog
        open={toArchive !== null}
        onOpenChange={(open) => !open && setToArchive(null)}
        title="¿Archivar cuenta?"
        description="La cuenta dejará de aparecer en las listas, pero podrás restaurarla cuando quieras."
        confirmLabel="Archivar"
        onConfirm={async () => {
          if (!toArchive) return
          try {
            await archive.mutateAsync(toArchive._id)
            toast.success('Cuenta archivada')
          } catch (e) {
            toast.error(errorText(e))
          }
        }}
      />
    </div>
  )
}
