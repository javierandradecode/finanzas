import { CategoryType } from './schemas/category.schema';

export interface DefaultCategory {
  type: CategoryType;
  name: string;
  icon: string;
  color: string;
}

export const DEFAULT_CATEGORIES: ReadonlyArray<DefaultCategory> = [
  { type: 'expense', name: 'Alimentación', icon: 'utensils', color: '#f97316' },
  { type: 'expense', name: 'Transporte', icon: 'car', color: '#3b82f6' },
  { type: 'expense', name: 'Vivienda', icon: 'home', color: '#8b5cf6' },
  { type: 'expense', name: 'Servicios', icon: 'zap', color: '#eab308' },
  { type: 'expense', name: 'Salud', icon: 'heart-pulse', color: '#ef4444' },
  {
    type: 'expense',
    name: 'Educación',
    icon: 'graduation-cap',
    color: '#06b6d4',
  },
  { type: 'expense', name: 'Entretenimiento', icon: 'film', color: '#ec4899' },
  { type: 'expense', name: 'Ropa', icon: 'shirt', color: '#14b8a6' },
  { type: 'expense', name: 'Suscripciones', icon: 'repeat', color: '#6366f1' },
  { type: 'expense', name: 'Otros gastos', icon: 'ellipsis', color: '#6b7280' },
  { type: 'income', name: 'Salario', icon: 'briefcase', color: '#22c55e' },
  { type: 'income', name: 'Ventas', icon: 'shopping-bag', color: '#10b981' },
  {
    type: 'income',
    name: 'Inversiones',
    icon: 'trending-up',
    color: '#84cc16',
  },
  {
    type: 'income',
    name: 'Otros ingresos',
    icon: 'plus-circle',
    color: '#16a34a',
  },
];
