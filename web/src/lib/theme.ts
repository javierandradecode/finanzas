export type Theme = 'light' | 'dark' | 'system'

const KEY = 'theme'

export function getTheme(): Theme {
  try {
    const value = localStorage.getItem(KEY)
    if (value === 'light' || value === 'dark') return value
  } catch {
    // storage blocked
  }
  return 'system'
}

export function applyTheme(theme: Theme): void {
  const dark =
    theme === 'dark' ||
    (theme === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // preference just won't persist
  }
}
