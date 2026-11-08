import { useState } from 'react'
import { toast } from 'sonner'
import type { Category, Subcategory } from '@/api/categories'
import {
  useAddSubcategory,
  useArchiveSubcategory,
  useUpdateSubcategory,
} from '@/api/categories'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const errorText = (e: unknown) =>
  e instanceof Error ? e.message : 'Ocurrió un error inesperado'

export function SubcategoryList({
  category,
  showArchived,
}: {
  category: Category
  showArchived: boolean
}) {
  const add = useAddSubcategory()
  const update = useUpdateSubcategory()
  const archive = useArchiveSubcategory()
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)

  const subs = category.subcategories.filter((s) => showArchived || !s.isArchived)

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action()
      return true
    } catch (e) {
      toast.error(errorText(e))
      return false
    }
  }

  const submitNew = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    if (await run(() => add.mutateAsync({ categoryId: category._id, name }))) {
      setNewName('')
    }
  }

  const saveName = async (sub: Subcategory) => {
    const name = editing?.name.trim()
    if (!name) return
    if (
      await run(() =>
        update.mutateAsync({ categoryId: category._id, subId: sub._id, name }),
      )
    ) {
      setEditing(null)
    }
  }

  return (
    <div className="space-y-2 border-t pt-3">
      <ul className="space-y-1">
        {subs.map((sub) => (
          <li
            key={sub._id}
            className={cn(
              'flex items-center justify-between gap-2 text-sm',
              sub.isArchived && 'opacity-60',
            )}
          >
            {editing?.id === sub._id ? (
              <form
                className="flex flex-1 gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  void saveName(sub)
                }}
              >
                <Input
                  aria-label="Nuevo nombre"
                  value={editing.name}
                  onChange={(e) => setEditing({ id: sub._id, name: e.target.value })}
                />
                <Button type="submit" size="sm">
                  Guardar nombre
                </Button>
              </form>
            ) : (
              <>
                <span>{sub.name}</span>
                <span className="flex gap-1">
                  {sub.isArchived ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Restaurar ${sub.name}`}
                      onClick={() =>
                        void run(() =>
                          update.mutateAsync({
                            categoryId: category._id,
                            subId: sub._id,
                            isArchived: false,
                          }),
                        )
                      }
                    >
                      Restaurar
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Renombrar ${sub.name}`}
                        onClick={() => setEditing({ id: sub._id, name: sub.name })}
                      >
                        Renombrar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Archivar ${sub.name}`}
                        onClick={() =>
                          void run(() =>
                            archive.mutateAsync({
                              categoryId: category._id,
                              subId: sub._id,
                            }),
                          )
                        }
                      >
                        Archivar
                      </Button>
                    </>
                  )}
                </span>
              </>
            )}
          </li>
        ))}
      </ul>

      <form onSubmit={submitNew} className="flex gap-2">
        <Input
          aria-label="Nueva subcategoría"
          placeholder="Nueva subcategoría"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <Button type="submit" size="sm" variant="outline">
          Añadir
        </Button>
      </form>
    </div>
  )
}
