import { z } from 'zod'

export const categorySchema = z.object({
  name: z.string().trim().min(1, 'Ingresa un nombre'),
  icon: z.string().min(1, 'Elige un icono'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Elige un color'),
})

export type CategoryFormValues = z.infer<typeof categorySchema>
