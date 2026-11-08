import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  loginRequest,
  meRequest,
  registerRequest,
  type AuthResponse,
  type AuthUser,
} from '@/api/auth'
import { setUnauthorizedHandler } from '@/api/client'
import { clearToken, getToken, setToken } from '@/lib/token'
import { AuthContext, type AuthContextValue } from './useAuth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [status, setStatus] = useState<AuthContextValue['status']>(() =>
    getToken() ? 'loading' : 'anonymous',
  )

  const logout = useCallback(() => {
    clearToken()
    setUser(null)
    setStatus('anonymous')
    queryClient.clear() // another user must never see this one's cached data
  }, [queryClient])

  // Any 401 from the API ends the session.
  useEffect(() => {
    setUnauthorizedHandler(logout)
    return () => setUnauthorizedHandler(null)
  }, [logout])

  // Restore the session on first load.
  useEffect(() => {
    if (!getToken()) return
    let cancelled = false
    meRequest()
      .then((me) => {
        if (cancelled) return
        setUser(me)
        setStatus('authenticated')
      })
      .catch(() => {
        if (!cancelled) logout()
      })
    return () => {
      cancelled = true
    }
  }, [logout])

  const start = useCallback((res: AuthResponse) => {
    setToken(res.accessToken)
    setUser(res.user)
    setStatus('authenticated')
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      login: async (input) => start(await loginRequest(input)),
      register: async (input) => start(await registerRequest(input)),
      logout,
    }),
    [user, status, start, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
