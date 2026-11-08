/** "18", "18,5" or "18.5" → 18 / 18.5 (up to 2 decimals, not negative); otherwise null. */
export function parseRate(text: string): number | null {
  const s = text.trim()
  if (!/^\d+([.,]\d{1,2})?$/.test(s)) return null
  return Number(s.replace(',', '.'))
}

/** Digits only ("5", "031"); anything else (decimals, signs, empty) is null. */
export function parseIntText(text: string): number | null {
  const s = text.trim()
  return /^\d+$/.test(s) ? Number(s) : null
}
