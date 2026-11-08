import { Menu } from 'lucide-react'
import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/Sidebar'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet'

export function AppLayout() {
  const [open, setOpen] = useState(false)

  return (
    <div className="min-h-screen md:grid md:grid-cols-[16rem_1fr]">
      <aside className="hidden border-r md:block">
        <div className="sticky top-0 h-screen">
          <Sidebar />
        </div>
      </aside>

      <header className="flex items-center gap-2 border-b p-3 md:hidden">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Abrir menú"
          onClick={() => setOpen(true)}
        >
          <Menu className="size-5" />
        </Button>
        <span className="font-semibold text-primary">Finanzas</span>
      </header>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">Menú</SheetTitle>
          <SheetDescription className="sr-only">Navegación</SheetDescription>
          <Sidebar onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      <main className="p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  )
}
