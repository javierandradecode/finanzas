import type { LoginInput, RegisterInput } from '@/features/auth/schemas'
import { api } from './client'

export interface AuthUser {
  id: string
  email: string
  name: string
  currency: string
}

export interface AuthResponse {
  accessToken: string
  user: AuthUser
}

export const loginRequest = (input: LoginInput) =>
  api<AuthResponse>('/auth/login', { method: 'POST', body: input })

export const registerRequest = (input: RegisterInput) =>
  api<AuthResponse>('/auth/register', { method: 'POST', body: input })

export const meRequest = () => api<AuthUser>('/auth/me')
