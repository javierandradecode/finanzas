import { loginSchema, registerSchema } from './schemas'

describe('loginSchema', () => {
  it('accepts valid input', () => {
    expect(
      loginSchema.safeParse({ email: 'a@b.co', password: 'x' }).success,
    ).toBe(true)
  })

  it('rejects bad email and empty password with Spanish messages', () => {
    const r = loginSchema.safeParse({ email: 'nope', password: '' })
    expect(r.success).toBe(false)
    const msgs = r.error!.issues.map((i) => i.message)
    expect(msgs).toContain('Correo no válido')
    expect(msgs).toContain('Ingresa tu contraseña')
  })
})

describe('registerSchema', () => {
  const ok = { name: 'Ana', email: 'a@b.co', password: '12345678' }

  it('accepts valid input', () => {
    expect(registerSchema.safeParse(ok).success).toBe(true)
  })

  it('rejects a short password', () => {
    const r = registerSchema.safeParse({ ...ok, password: '1234567' })
    expect(r.error!.issues[0].message).toBe(
      'La contraseña debe tener al menos 8 caracteres',
    )
  })

  it('rejects a name with only spaces', () => {
    const r = registerSchema.safeParse({ ...ok, name: '   ' })
    expect(r.error!.issues[0].message).toBe('Ingresa tu nombre')
  })
})
