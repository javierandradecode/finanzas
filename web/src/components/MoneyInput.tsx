import { useState, type ComponentProps } from 'react'
import { Input } from '@/components/ui/input'
import { parseMoneyToCents } from '@/lib/money'

const toText = (cents: number | null) =>
  cents === null ? '' : (cents / 100).toFixed(2).replace('.', ',')

type Props = Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> & {
  value: number | null
  onChange: (cents: number | null) => void
}

/** Text field that edits money as the user types it and reports integer cents. */
export function MoneyInput({ value, onChange, onBlur, ...rest }: Props) {
  const [text, setText] = useState(() => toText(value))

  // Follow outside changes (e.g. a form reset) but never fight the user typing.
  // Adjusting state during render is React's alternative to a syncing effect.
  const [prevValue, setPrevValue] = useState(value)
  if (value !== prevValue) {
    setPrevValue(value)
    if (parseMoneyToCents(text) !== value) setText(toText(value))
  }

  return (
    <Input
      {...rest}
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        onChange(parseMoneyToCents(e.target.value))
      }}
      onBlur={(e) => {
        const cents = parseMoneyToCents(text)
        if (cents !== null) setText(toText(cents))
        onBlur?.(e)
      }}
    />
  )
}
