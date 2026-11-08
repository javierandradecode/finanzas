import { ArrowLeft, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useCategories } from '@/api/categories'
import { useCreditCards } from '@/api/credit-cards'
import {
  useDeletePurchase,
  usePurchases,
  type InstallmentPurchase,
} from '@/api/installment-purchases'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/features/auth/useAuth'
import { PayInstallmentDialog } from '@/features/cards/PayInstallmentDialog'
import { PurchaseCard } from '@/features/cards/PurchaseCard'
import { PurchaseDialog } from '@/features/cards/PurchaseDialog'
import { StatementPanel } from '@/features/cards/StatementPanel'
import { formatMoney } from '@/lib/money'

const errorText = (e: unknown) =>
  e instanceof Error ? e.message : 'Ocurrió un error inesperado'

export function CardDetailPage() {
  const { id = '' } = useParams()
  const currency = useAuth().user?.currency ?? 'USD'
  const cards = useCreditCards(true)
  const purchases = usePurchases(id)
  const categories = useCategories(true).data
  const remove = useDeletePurchase()

  const card = cards.data?.find((c) => c._id === id)
  const categoryNames = useMemo(
    () => new Map((categories ?? []).map((c) => [c._id, c.name])),
    [categories],
  )

  const [dialog, setDialog] = useState<{ purchase?: InstallmentPurchase } | null>(null)
  const [paying, setPaying] = useState<InstallmentPurchase | null>(null)
  const [toDelete, setToDelete] = useState<InstallmentPurchase | null>(null)

  if (cards.isPending) return <p className="text-muted-foreground">Cargando…</p>
  if (!card) {
    return (
      <div className="space-y-3">
        <p>No encontramos esa tarjeta.</p>
        <Link to="/tarjetas" className="text-primary underline">
          Volver a tarjetas
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Link
        to="/tarjetas"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Tarjetas
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            {card.name}
            {card.isArchived && <Badge variant="outline">Archivada</Badge>}
          </h1>
          <p className="text-muted-foreground">
            Deuda <strong data-testid="header-debt">{formatMoney(card.debtCents, currency)}</strong>
            {' · '}Disponible{' '}
            <strong data-testid="header-available">
              {formatMoney(card.availableCents, currency)}
            </strong>
          </p>
        </div>
      </div>

      <StatementPanel cardId={id} />

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Compras a cuotas</h2>
          <Button disabled={card.isArchived} onClick={() => setDialog({})}>
            <Plus className="size-4" /> Nueva compra a cuotas
          </Button>
        </div>

        {purchases.isPending && <p className="text-muted-foreground">Cargando…</p>}
        {purchases.error && (
          <p role="alert" className="text-destructive">
            {errorText(purchases.error)}
          </p>
        )}
        {purchases.data?.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Esta tarjeta no tiene compras a cuotas.
            </CardContent>
          </Card>
        )}
        {purchases.data?.map((p) => (
          <PurchaseCard
            key={p._id}
            purchase={p}
            categoryName={categoryNames.get(p.categoryId)}
            currency={currency}
            onPay={() => setPaying(p)}
            onEdit={() => setDialog({ purchase: p })}
            onDelete={() => setToDelete(p)}
          />
        ))}
      </section>

      {dialog && (
        <PurchaseDialog
          key={dialog.purchase?._id ?? 'new'}
          open
          onOpenChange={(open) => !open && setDialog(null)}
          cardId={id}
          purchase={dialog.purchase}
        />
      )}

      {paying && (
        <PayInstallmentDialog
          key={`${paying._id}-${paying.paidInstallments}`}
          open
          onOpenChange={(open) => !open && setPaying(null)}
          purchase={paying}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="¿Eliminar compra?"
        description="Se borrará la compra y la deuda de la tarjeta volverá a como estaba antes. No se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={async () => {
          if (!toDelete) return
          try {
            await remove.mutateAsync(toDelete._id)
            toast.success('Compra eliminada')
          } catch (e) {
            toast.error(errorText(e))
          }
        }}
      />
    </div>
  )
}
