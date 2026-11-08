import { applyTheme, getTheme } from './theme'

function mockSystemDark(dark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches: dark }),
  )
}

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
    mockSystemDark(false)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('defaults to system', () => {
    expect(getTheme()).toBe('system')
  })

  it('dark adds the class and persists', () => {
    applyTheme('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(getTheme()).toBe('dark')
  })

  it('light removes the class', () => {
    document.documentElement.classList.add('dark')
    applyTheme('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(getTheme()).toBe('light')
  })

  it('system follows prefers-color-scheme', () => {
    mockSystemDark(true)
    applyTheme('system')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    mockSystemDark(false)
    applyTheme('system')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('ignores an invalid stored value', () => {
    localStorage.setItem('theme', 'purple')
    expect(getTheme()).toBe('system')
  })

  it('does not throw when localStorage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(getTheme()).toBe('system')
    expect(() => applyTheme('dark')).not.toThrow()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })
})
