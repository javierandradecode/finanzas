import { MoreHorizontal, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  useAccounts,
  useArchiveAccount,
  useUpdateAccount,
  type Account,
  type AccountType,
} from '@/api/accounts'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { AccountDialog } from '@/features/accounts/AccountDialog'
import { ACCOUNT_TYPE_LABELS } from '@/features/accounts/account-schema'
import { groupAccounts } from '@/features/accounts/group'
import { useAuth } from '@/features/auth/useAuth'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

const errorText = (e: unknown) =>
  e instanceof Error ? e.message : 'Ocurrió un error inesperado'

// Three tones of the primary colour; the legend repeats them in text.
const SHARE_TONE: Record<AccountType, string> = {
  checking: 'bg-primary',
  savings: 'bg-primary/60',
  cash: 'bg-primary/30',
}

/** True once `active` has lasted `ms` without ending (the free host may be waking up). */
function useSlow(active: boolean, ms = 4000) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!active) return
    const timer = setTimeout(() => setSlow(true), ms)
    return () => {
      clearTimeout(timer)
      setSlow(false)
    }
  }, [active, ms])
  return active && slow
}

function AccountsSkeleton() {
  return (
    <div data-testid="accounts-skeleton" aria-hidden className="animate-pulse space-y-6">
      <div className="space-y-3">
        <div className="h-10 w-56 rounded-md bg-muted" />
        <div className="h-2 w-full rounded-full bg-muted" />
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="space-y-3">
          <div className="h-4 w-24 rounded bg-muted" />
          <div className="h-12 w-full rounded-md bg-muted" />
          <div className="h-12 w-full rounded-md bg-muted" />
        </div>
      ))}
    </div>
  )
}

export function AccountsPage() {
  const { user } = useAuth()
  const currency = user?.currency ?? 'USD'
  const [showArchived, setShowArchived] = useState(false)
  const { data: accounts, isPending, error } = useAccounts(showArchived)
  const archive = useArchiveAccount()
  const update = useUpdateAccount()
  const slow = useSlow(isPending)

  const [dialog, setDialog] = useState<{ account?: Account } | null>(null)
  const [toArchive, setToArchive] = useState<Account | null>(null)

  const { total, groups, shares } = groupAccounts(accounts ?? [])
  const money = (cents: number) => formatMoney(cents, currency)

  const restore = async (account: Account) => {
    try {
      await update.mutateAsync({ id: account._id, isArchived: false })
      toast.success('Cuenta restaurada')
    } catch (e) {
      toast.error(errorText(e))
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Cuentas</h1>
        <Button onClick={() => setDialog({})}>
          <Plus className="size-4" /> Nueva cuenta
        </Button>
      </div>

      {isPending && (
        <>
          <AccountsSkeleton />
          {slow && (
            <p role="status" className="text-sm text-muted-foreground">
              La primera carga puede tardar hasta un minuto: el servidor gratuito se
              estaba despertando.
            </p>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {errorText(error)}
        </p>
      )}

      {accounts?.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="font-medium">Aún no tienes cuentas.</p>
            <p className="max-w-sm text-muted-foreground">
              Crea la primera: tu efectivo, una cuenta de ahorros o la corriente del
              banco. Después registras tus movimientos en ella.
            </p>
          </CardContent>
        </Card>
      )}

      {accounts && accounts.length > 0 && (
        <section aria-label="Resumen" className="space-y-3">
          <div>
            <p className="text-sm text-muted-foreground">Saldo total</p>
            <p
              data-testid="total"
              className={cn(
                'text-4xl font-semibold tracking-tight tabular-nums',
                total < 0 && 'text-destructive',
              )}
            >
              {money(total)}
            </p>
          </div>
          {shares.length > 0 && (
            <>
              <div aria-hidden className="flex h-2 overflow-hidden rounded-full bg-muted">
                {shares.map((s) => (
                  <div
                    key={s.type}
                    className={SHARE_TONE[s.type]}
                    style={{ width: `${s.percent}%` }}
                  />
                ))}
              </div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {shares.map((s) => (
                  <li key={s.type} className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className={cn('size-2.5 rounded-full', SHARE_TONE[s.type])}
                    />
                    {`${ACCOUNT_TYPE_LABELS[s.type]} ${s.percent} %`}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {groups.map((group) => (
        <section key={group.type}>
          <div className="flex items-baseline justify-between border-b pb-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              {ACCOUNT_TYPE_LABELS[group.type]}
            </h2>
            <span
              data-testid={`subtotal-${group.type}`}
              className={cn(
                'text-sm tabular-nums text-muted-foreground',
                group.subtotal < 0 && 'text-destructive',
              )}
            >
              {money(group.subtotal)}
            </span>
          </div>
          <ul className="divide-y">
            {group.accounts.map((account) => (
              <li key={account._id} className="relative flex items-center gap-3 py-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {/* the link stretches over the whole row; the menu sits above it */}
                  <Link
                    to={`/movimientos?accountId=${account._id}`}
                    className={cn(
                      'truncate font-medium outline-none after:absolute after:inset-0 hover:underline focus-visible:underline',
                      account.isArchived && 'text-muted-foreground',
                    )}
                  >
                    {account.name}
                  </Link>
                  {account.isArchived && <Badge variant="outline">Archivada</Badge>}
                </div>
                <p
                  data-testid="balance"
                  className={cn(
                    'font-semibold tabular-nums',
                    account.balanceCents < 0 && 'text-destructive',
                    account.isArchived && 'font-normal text-muted-foreground',
                  )}
                >
                  {money(account.balanceCents)}
                </p>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon"
                        className="relative z-10"
                        aria-label={`Acciones de ${account.name}`}
                      />
                    }
                  >
                    <MoreHorizontal className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setDialog({ account })}>
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {account.isArchived ? (
                      <DropdownMenuItem onClick={() => void restore(account)}>
                        Restaurar
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setToArchive(account)}
                      >
                        Archivar
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div className="flex items-center gap-2 text-sm">
        <Switch
          id="show-archived"
          checked={showArchived}
          onCheckedChange={setShowArchived}
        />
        <Label htmlFor="show-archived">Mostrar archivadas</Label>
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
