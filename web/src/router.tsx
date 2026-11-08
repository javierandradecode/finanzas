import { Navigate, createBrowserRouter } from 'react-router-dom'
import { AppLayout } from '@/components/AppLayout'
import { NAV_ITEMS } from '@/components/nav-items'
import { RequireAuth } from '@/features/auth/RequireAuth'
import { LoginPage } from '@/pages/LoginPage'
import { PlaceholderPage } from '@/pages/PlaceholderPage'
import { RegisterPage } from '@/pages/RegisterPage'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: NAV_ITEMS.map(({ label, path }) => ({
          path,
          element: <PlaceholderPage title={label} />,
        })),
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
