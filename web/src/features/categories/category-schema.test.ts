import { categorySchema } from './category-schema'

const ok = { name: 'Gym', icon: 'dumbbell', color: '#ef4444' }

describe('categorySchema', () => {
  it('accepts valid input', () => {
    expect(categorySchema.safeParse(ok).success).toBe(true)
  })

  it('rejects an empty or whitespace name', () => {
    for (const name of ['', '   ']) {
      const r = categorySchema.safeParse({ ...ok, name })
      expect(r.error!.issues[0].message).toBe('Ingresa un nombre')
    }
  })

  it('requires an icon', () => {
    expect(categorySchema.safeParse({ ...ok, icon: '' }).success).toBe(false)
  })

  it.each(['red', '#fff', '#12345g', 'ef4444'])('rejects color %p', (color) => {
    expect(categorySchema.safeParse({ ...ok, color }).success).toBe(false)
  })
})
