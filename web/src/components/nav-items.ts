import {
  CreditCard,
  Landmark,
  LayoutDashboard,
  PiggyBank,
  Repeat,
  Receipt,
  Tags,
} from 'lucide-react'

export const NAV_ITEMS = [
  { label: 'Resumen', path: '/', icon: LayoutDashboard },
  { label: 'Movimientos', path: '/movimientos', icon: Receipt },
  { label: 'Cuentas', path: '/cuentas', icon: Landmark },
  { label: 'Categorías', path: '/categorias', icon: Tags },
  { label: 'Tarjetas', path: '/tarjetas', icon: CreditCard },
  { label: 'Suscripciones', path: '/suscripciones', icon: Repeat },
  { label: 'Presupuestos', path: '/presupuestos', icon: PiggyBank },
] as const
