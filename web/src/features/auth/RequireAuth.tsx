import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './useAuth'

/** Like Laravel's `auth` middleware: no session → /login. */
export function RequireAuth() {
  const { status } = useAuth()
  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Cargando…
      </div>
    )
  }
  if (status === 'anonymous') return <Navigate to="/login" replace />
  return <Outlet />
}
