import { ChevronDown, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  useArchiveCategory,
  useCategories,
  useUpdateCategory,
  type Category,
  type CategoryType,
} from '@/api/categories'
import { CategoryIcon } from '@/components/CategoryIcon'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CategoryDialog } from '@/features/categories/CategoryDialog'
import { SubcategoryList } from '@/features/categories/SubcategoryList'
import { cn } from '@/lib/utils'

const errorText = (e: unknown) =>
  e instanceof Error ? e.message : 'Ocurrió un error inesperado'

export function CategoriesPage() {
  const [tab, setTab] = useState<CategoryType>('expense')
  const [showArchived, setShowArchived] = useState(false)
  const { data, isPending, error } = useCategories(showArchived)
  const archive = useArchiveCategory()
  const update = useUpdateCategory()

  const [dialog, setDialog] = useState<{ category?: Category } | null>(null)
  const [toArchive, setToArchive] = useState<Category | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const categories = (data ?? []).filter((c) => c.type === tab)

  const restore = async (category: Category) => {
    try {
      await update.mutateAsync({ id: category._id, isArchived: false })
      toast.success('Categoría restaurada')
    } catch (e) {
      toast.error(errorText(e))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Categorías</h1>
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
            <Plus className="size-4" /> Nueva categoría
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as CategoryType)}>
        <TabsList>
          <TabsTrigger value="expense">Gastos</TabsTrigger>
          <TabsTrigger value="income">Ingresos</TabsTrigger>
        </TabsList>
      </Tabs>

      {isPending && <p className="text-muted-foreground">Cargando…</p>}
      {error && (
        <p role="alert" className="text-destructive">
          {errorText(error)}
        </p>
      )}

      {data && categories.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {tab === 'expense'
              ? 'No hay categorías de gastos.'
              : 'No hay categorías de ingresos.'}
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {categories.map((category) => {
          const activeSubs = category.subcategories.filter((s) => !s.isArchived)
          const open = expanded === category._id
          return (
            <Card key={category._id} className={cn(category.isArchived && 'opacity-60')}>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span
                      className="flex size-9 items-center justify-center rounded-full"
                      style={{ backgroundColor: `${category.color}22` }}
                    >
                      <CategoryIcon name={category.icon} color={category.color} />
                    </span>
                    <span className="font-medium">{category.name}</span>
                    {category.isArchived && <Badge variant="outline">Archivada</Badge>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-expanded={open}
                      onClick={() => setExpanded(open ? null : category._id)}
                    >
                      Subcategorías ({activeSubs.length})
                      <ChevronDown
                        className={cn('size-4 transition-transform', open && 'rotate-180')}
                      />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDialog({ category })}
                    >
                      Editar
                    </Button>
                    {category.isArchived ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void restore(category)}
                      >
                        Restaurar
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setToArchive(category)}
                      >
                        Archivar
                      </Button>
                    )}
                  </div>
                </div>
                {open && (
                  <SubcategoryList category={category} showArchived={showArchived} />
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {dialog && (
        <CategoryDialog
          key={dialog.category?._id ?? 'new'}
          open
          onOpenChange={(o) => !o && setDialog(null)}
          type={tab}
          category={dialog.category}
        />
      )}

      <ConfirmDialog
        open={toArchive !== null}
        onOpenChange={(o) => !o && setToArchive(null)}
        title="¿Archivar categoría?"
        description="Dejará de aparecer al crear movimientos, pero los anteriores la conservan y podrás restaurarla."
        confirmLabel="Archivar"
        onConfirm={async () => {
          if (!toArchive) return
          try {
            await archive.mutateAsync(toArchive._id)
            toast.success('Categoría archivada')
          } catch (e) {
            toast.error(errorText(e))
          }
        }}
      />
    </div>
  )
}
