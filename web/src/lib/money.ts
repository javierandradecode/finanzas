/** Display only: money is stored and moved around as integer cents. */
export function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('es', {
    style: 'currency',
    currency,
    useGrouping: 'always',
  }).format(cents / 100)
}

/** "1.234" style groups: 1–3 digits, then groups of exactly 3. */
function ungroup(text: string, sep: string): string | null {
  const parts = text.split(sep)
  if (!/^\d{1,3}$/.test(parts[0])) return null
  if (!parts.slice(1).every((p) => /^\d{3}$/.test(p))) return null
  return parts.join('')
}

/**
 * Parses what a person types ("12,50", "1.234,56", "-3") into integer cents,
 * without floating point. Returns null when invalid or ambiguous.
 * A single separator followed by 3 digits ("12.345") is rejected: it could be
 * thousands or decimals, and guessing wrong would be off by 1000x.
 */
export function parseMoneyToCents(text: string): number | null {
  let s = text.trim()
  let sign = 1
  if (s.startsWith('-')) {
    sign = -1
    s = s.slice(1).trim()
  }
  if (!/^\d[\d.,]*$/.test(s)) return null

  const idx = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','))
  let intPart = s
  let decPart = ''

  if (idx >= 0) {
    const sep = s[idx]
    const other = sep === '.' ? ',' : '.'
    const count = s.split(sep).length - 1
    const hasOther = s.includes(other)

    if (count > 1) {
      if (hasOther) return null
      const joined = ungroup(s, sep) // 1.234.567
      if (joined === null) return null
      intPart = joined
    } else {
      decPart = s.slice(idx + 1)
      if (!/^\d{1,2}$/.test(decPart)) return null
      const head = s.slice(0, idx)
      const joined = hasOther ? ungroup(head, other) : head
      if (joined === null || !/^\d+$/.test(joined)) return null
      intPart = joined
    }
  }

  const cents = Number(intPart) * 100 + Number(decPart.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents)) return null
  return cents === 0 ? 0 : sign * cents
}
