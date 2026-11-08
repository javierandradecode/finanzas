import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  useArchiveCard,
  useCreditCards,
  useUpdateCard,
  type CreditCard,
} from '@/api/credit-cards'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ProgressBar } from '@/components/ProgressBar'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useAuth } from '@/features/auth/useAuth'
import { CardDialog } from '@/features/cards/CardDialog'
import { ProjectionPanel } from '@/features/cards/ProjectionPanel'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

const errorText = (e: unknown) =>
  e instanceof Error ? e.message : 'Ocurrió un error inesperado'

export function CardsPage() {
  const currency = useAuth().user?.currency ?? 'USD'
  const [showArchived, setShowArchived] = useState(false)
  const { data: cards, isPending, error } = useCreditCards(showArchived)
  const archive = useArchiveCard()
  const update = useUpdateCard()

  const [dialog, setDialog] = useState<{ card?: CreditCard } | null>(null)
  const [toArchive, setToArchive] = useState<CreditCard | null>(null)

  const restore = async (card: CreditCard) => {
    try {
      await update.mutateAsync({ id: card._id, isArchived: false })
      toast.success('Tarjeta restaurada')
    } catch (e) {
      toast.error(errorText(e))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Tarjetas</h1>
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
            <Plus className="size-4" /> Nueva tarjeta
          </Button>
        </div>
      </div>

      {isPending && <p className="text-muted-foreground">Cargando…</p>}
      {error && (
        <p role="alert" className="text-destructive">
          {errorText(error)}
        </p>
      )}

      {cards?.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-muted-foreground">Aún no tienes tarjetas.</p>
            <Button onClick={() => setDialog({})}>Nueva tarjeta</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {cards?.map((card) => (
          <Card key={card._id} className={cn(card.isArchived && 'opacity-60')}>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{card.name}</p>
                {card.isArchived && <Badge variant="outline">Archivada</Badge>}
              </div>
              <ProgressBar
                value={card.debtCents}
                max={card.limitCents}
                danger={card.limitCents > 0 && card.debtCents / card.limitCents >= 0.9}
              />
              <div className="flex justify-between text-sm">
                <span>
                  Deuda{' '}
                  <strong data-testid="debt">{formatMoney(card.debtCents, currency)}</strong>
                </span>
                <span>
                  Disponible{' '}
                  <strong data-testid="available">
                    {formatMoney(card.availableCents, currency)}
                  </strong>
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Corte día {card.cutoffDay} · Pago día {card.paymentDay} · Tasa{' '}
                {card.annualRatePercent} %
              </p>
              <div className="flex flex-wrap gap-2">
                <Link
                  to={`/tarjetas/${card._id}`}
                  className={buttonVariants({ variant: 'default', size: 'sm' })}
                >
                  Ver detalle
                </Link>
                <Button variant="outline" size="sm" onClick={() => setDialog({ card })}>
                  Editar
                </Button>
                {card.isArchived ? (
                  <Button variant="outline" size="sm" onClick={() => void restore(card)}>
                    Restaurar
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setToArchive(card)}>
                    Archivar
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <ProjectionPanel />

      {dialog && (
        <CardDialog
          key={dialog.card?._id ?? 'new'}
          open
          onOpenChange={(open) => !open && setDialog(null)}
          card={dialog.card}
        />
      )}

      <ConfirmDialog
        open={toArchive !== null}
        onOpenChange={(open) => !open && setToArchive(null)}
        title="¿Archivar tarjeta?"
        description="La tarjeta dejará de ofrecerse al registrar gastos, pero conserva su historial y podrás restaurarla."
        confirmLabel="Archivar"
        onConfirm={async () => {
          if (!toArchive) return
          try {
            await archive.mutateAsync(toArchive._id)
            toast.success('Tarjeta archivada')
          } catch (e) {
            toast.error(errorText(e))
          }
        }}
      />
    </div>
  )
}
