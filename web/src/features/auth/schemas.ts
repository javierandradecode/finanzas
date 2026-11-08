import { z } from 'zod'

const email = z.string().trim().email('Correo no válido')

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Ingresa tu contraseña'),
})

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Ingresa tu nombre'),
  email,
  password: z
    .string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres'),
})

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
