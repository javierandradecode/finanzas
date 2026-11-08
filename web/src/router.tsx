import type { ReactNode } from 'react'
import { Navigate, createBrowserRouter } from 'react-router-dom'
import { AppLayout } from '@/components/AppLayout'
import { NAV_ITEMS } from '@/components/nav-items'
import { RequireAuth } from '@/features/auth/RequireAuth'
import { LoginPage } from '@/pages/LoginPage'
import { PlaceholderPage } from '@/pages/PlaceholderPage'
import { AccountsPage } from '@/pages/AccountsPage'
import { CardDetailPage } from '@/pages/CardDetailPage'
import { CardsPage } from '@/pages/CardsPage'
import { CategoriesPage } from '@/pages/CategoriesPage'
import { SubscriptionsPage } from '@/pages/SubscriptionsPage'
import { TransactionsPage } from '@/pages/TransactionsPage'
import { RegisterPage } from '@/pages/RegisterPage'

// Screens built so far; the rest of the menu still shows a placeholder.
const PAGES: Record<string, ReactNode> = {
  '/cuentas': <AccountsPage />,
  '/categorias': <CategoriesPage />,
  '/tarjetas': <CardsPage />,
  '/suscripciones': <SubscriptionsPage />,
  '/movimientos': <TransactionsPage />,
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          ...NAV_ITEMS.map(({ label, path }) => ({
            path,
            element: PAGES[path] ?? <PlaceholderPage title={label} />,
          })),
          { path: '/tarjetas/:id', element: <CardDetailPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
