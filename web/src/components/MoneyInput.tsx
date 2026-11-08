import { useState, type ComponentProps } from 'react'
import { Input } from '@/components/ui/input'
import { parseMoneyToCents } from '@/lib/money'

const toText = (cents: number | null) =>
  cents === null || Number.isNaN(cents)
    ? ''
    : (cents / 100).toFixed(2).replace('.', ',')

/** Empty text → null, invalid text → NaN (so a schema can reject it), else cents. */
function fromText(text: string): number | null {
  if (text.trim() === '') return null
  return parseMoneyToCents(text) ?? Number.NaN
}

type Props = Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> & {
  /** Integer cents; null when empty, NaN when what was typed is not an amount. */
  value: number | null
  onChange: (cents: number | null) => void
}

/** Text field that edits money as the user types it and reports integer cents. */
export function MoneyInput({ value, onChange, onBlur, ...rest }: Props) {
  const [text, setText] = useState(() => toText(value))

  // Follow outside changes (e.g. a form reset) but never fight the user typing.
  // Adjusting state during render is React's alternative to a syncing effect.
  const [prevValue, setPrevValue] = useState(value)
  if (!Object.is(value, prevValue)) {
    setPrevValue(value)
    if (!Object.is(fromText(text), value)) setText(toText(value))
  }

  return (
    <Input
      {...rest}
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        onChange(fromText(e.target.value))
      }}
      onBlur={(e) => {
        const cents = fromText(text)
        if (cents !== null && !Number.isNaN(cents)) setText(toText(cents))
        onBlur?.(e)
      }}
    />
  )
}
