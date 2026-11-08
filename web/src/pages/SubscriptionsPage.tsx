import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAccounts } from '@/api/accounts'
import { useCategories } from '@/api/categories'
import { useCreditCards } from '@/api/credit-cards'
import {
  usePauseSubscription,
  useProcessDue,
  useReactivateSubscription,
  useSubscriptions,
  type Subscription,
} from '@/api/subscriptions'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/features/auth/useAuth'
import { SubscriptionDialog } from '@/features/subscriptions/SubscriptionDialog'
import { FREQUENCY_UNITS, summarize } from '@/features/subscriptions/subscription-form'
import { UpcomingPanel } from '@/features/subscriptions/UpcomingPanel'
import { formatDateUtc } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

const errorText = (e: unknown) =>
  e instanceof Error ? e.message : 'Ocurrió un error inesperado'

export function SubscriptionsPage() {
  const currency = useAuth().user?.currency ?? 'USD'
  const { data, isPending, error } = useSubscriptions()
  const accounts = useAccounts(true).data
  const cards = useCreditCards(true).data
  const categories = useCategories(true).data
  const pause = usePauseSubscription()
  const reactivate = useReactivateSubscription()
  const processDue = useProcessDue()

  const [dialog, setDialog] = useState<{ subscription?: Subscription } | null>(null)
  const [toPause, setToPause] = useState<Subscription | null>(null)

  const names = useMemo(
    () => ({
      accounts: new Map((accounts ?? []).map((a) => [a._id, a.name])),
      cards: new Map((cards ?? []).map((c) => [c._id, c.name])),
      categories: new Map((categories ?? []).map((c) => [c._id, c.name])),
    }),
    [accounts, cards, categories],
  )
  const payerName = (s: { accountId?: string; creditCardId?: string }) =>
    s.accountId ? names.accounts.get(s.accountId) : s.creditCardId ? names.cards.get(s.creditCardId) : undefined

  // Active first (soonest charge first), paused ones at the end.
  const sorted = useMemo(
    () =>
      [...(data ?? [])].sort(
        (a, b) =>
          Number(b.active) - Number(a.active) || Date.parse(a.nextDate) - Date.parse(b.nextDate),
      ),
    [data],
  )
  const { activeCount, monthlyCents } = summarize(data ?? [])

  const runProcessDue = async () => {
    try {
      const r = await processDue.mutateAsync()
      if (r.failed.length > 0) {
        toast.error(
          `No se pudo cobrar: ${r.failed.map((f) => `${f.name} (${f.error})`).join('; ')}`,
        )
      }
      if (r.charged > 0) {
        toast.success(`${r.charged} ${r.charged === 1 ? 'cobro realizado' : 'cobros realizados'}`)
      } else if (r.failed.length === 0) {
        toast.info('No había cobros vencidos')
      }
    } catch (e) {
      toast.error(errorText(e))
    }
  }

  const doReactivate = async (s: Subscription) => {
    try {
      await reactivate.mutateAsync(s._id)
      toast.success('Suscripción reactivada')
    } catch (e) {
      toast.error(errorText(e))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Suscripciones</h1>
          {data && (
            <p data-testid="summary" className="text-muted-foreground">
              {activeCount} {activeCount === 1 ? 'suscripción activa' : 'suscripciones activas'} · ≈{' '}
              <strong className="text-foreground">{formatMoney(monthlyCents, currency)}</strong> al
              mes
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={processDue.isPending}
            onClick={() => void runProcessDue()}
          >
            Cobrar vencidos ahora
          </Button>
          <Button onClick={() => setDialog({})}>
            <Plus className="size-4" /> Nueva suscripción
          </Button>
        </div>
      </div>

      {isPending && <p className="text-muted-foreground">Cargando…</p>}
      {error && (
        <p role="alert" className="text-destructive">
          {errorText(error)}
        </p>
      )}

      {data?.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-muted-foreground">Aún no tienes suscripciones.</p>
            <Button onClick={() => setDialog({})}>Nueva suscripción</Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {sorted.map((s) => (
          <Card key={s._id} data-testid="subscription" className={cn(!s.active && 'opacity-60')}>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="flex items-center gap-2 font-medium">
                    {s.name}
                    {!s.active && <Badge variant="outline">Pausada</Badge>}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {[
                      payerName(s),
                      names.categories.get(s.categoryId),
                      `Próximo cobro: ${formatDateUtc(s.nextDate)}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <p className="font-semibold">
                  {formatMoney(s.amountCents, currency)} / {FREQUENCY_UNITS[s.frequency]}
                </p>
              </div>

              {s.lastError && (
                <p role="alert" className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">
                  No se pudo cobrar
                  {s.lastErrorAt ? ` el ${formatDateUtc(s.lastErrorAt)}` : ''}: {s.lastError}
                </p>
              )}

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setDialog({ subscription: s })}>
                  Editar
                </Button>
                {s.active ? (
                  <Button variant="outline" size="sm" onClick={() => setToPause(s)}>
                    Pausar
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => void doReactivate(s)}>
                    Reactivar
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <UpcomingPanel payerName={payerName} />

      {dialog && (
        <SubscriptionDialog
          key={dialog.subscription?._id ?? 'new'}
          open
          onOpenChange={(open) => !open && setDialog(null)}
          subscription={dialog.subscription}
        />
      )}

      <ConfirmDialog
        open={toPause !== null}
        onOpenChange={(open) => !open && setToPause(null)}
        title="¿Pausar suscripción?"
        description="Dejará de cobrarse hasta que la reactives. Al reactivarla no se cobra el período pausado."
        confirmLabel="Pausar"
        onConfirm={async () => {
          if (!toPause) return
          try {
            await pause.mutateAsync(toPause._id)
            toast.success('Suscripción pausada')
          } catch (e) {
            toast.error(errorText(e))
          }
        }}
      />
    </div>
  )
}
