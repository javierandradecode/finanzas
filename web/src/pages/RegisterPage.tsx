import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AuthShell, FieldError } from '@/features/auth/AuthShell'
import { registerSchema, type RegisterInput } from '@/features/auth/schemas'
import { useAuth } from '@/features/auth/useAuth'

export function RegisterPage() {
  const { status, register: signUp } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) })

  if (status === 'authenticated') return <Navigate to="/" replace />

  const onSubmit = async (values: RegisterInput) => {
    setError(null)
    try {
      await signUp(values)
    } catch (e) {
      const err = e instanceof ApiError ? e : null
      setError(
        err?.status === 409
          ? 'Ese correo ya está registrado'
          : (err?.message ?? 'Ocurrió un error inesperado'),
      )
    }
  }

  return (
    <AuthShell title="Crear cuenta">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="name">Nombre</Label>
          <Input id="name" autoComplete="name" {...register('name')} />
          <FieldError message={errors.name?.message} />
        </div>
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
            autoComplete="new-password"
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
          {isSubmitting ? 'Creando…' : 'Crear cuenta'}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className="text-primary underline">
            Inicia sesión
          </Link>
        </p>
      </form>
    </AuthShell>
  )
}
