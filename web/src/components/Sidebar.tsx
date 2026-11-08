import { LogOut } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ThemeToggle'
import { NAV_ITEMS } from '@/components/nav-items'
import { useAuth } from '@/features/auth/useAuth'
import { cn } from '@/lib/utils'

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth()

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="px-2 text-lg font-semibold text-primary">Finanzas</div>
      <nav className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map(({ label, path, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent',
                isActive && 'bg-primary/10 text-primary hover:bg-primary/15',
              )
            }
          >
            <Icon className="size-4" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="flex items-center justify-between gap-2 border-t pt-4">
        <span className="truncate text-sm text-muted-foreground">
          {user?.name}
        </span>
        <ThemeToggle />
      </div>
      <Button variant="outline" onClick={logout}>
        <LogOut className="size-4" /> Cerrar sesión
      </Button>
    </div>
  )
}
