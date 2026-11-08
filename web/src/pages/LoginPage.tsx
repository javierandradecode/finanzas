import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AuthShell, FieldError } from '@/features/auth/AuthShell'
import { loginSchema, type LoginInput } from '@/features/auth/schemas'
import { useAuth } from '@/features/auth/useAuth'

export function LoginPage() {
  const { status, login } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) })

  if (status === 'authenticated') return <Navigate to="/" replace />

  const onSubmit = async (values: LoginInput) => {
    setError(null)
    try {
      await login(values)
    } catch (e) {
      const err = e instanceof ApiError ? e : null
      setError(
        err?.status === 401
          ? 'Correo o contraseña incorrectos'
          : (err?.message ?? 'Ocurrió un error inesperado'),
      )
    }
  }

  return (
    <AuthShell title="Iniciar sesión">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="email">Correo</Label>
          <Input id="email" type="email" autoComplete="email" {...register('email')} />
          <FieldError message={errors.email?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Contraseña</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...register('password')}
          />
          <FieldError message={errors.password?.message} />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Entrando…' : 'Entrar'}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          ¿No tienes cuenta?{' '}
          <Link to="/register" className="text-primary underline">
            Regístrate
          </Link>
        </p>
      </form>
    </AuthShell>
  )
}
