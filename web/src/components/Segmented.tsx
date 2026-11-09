import { useId } from 'react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * A row of buttons where exactly one is chosen. They are real radio inputs
 * (hidden, the label is the button), so arrow keys and screen readers work
 * without extra code. Name the group with `label` or point `labelledBy` at a visible label.
 */
export function Segmented<T extends string>({
  label,
  labelledBy,
  value,
  options,
  onChange,
}: {
  label?: string
  labelledBy?: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  const name = useId()
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-labelledby={labelledBy}
      className="flex flex-wrap gap-2"
    >
      {options.map((o) => (
        <label
          key={o.value}
          className={cn(
            buttonVariants({ size: 'sm', variant: value === o.value ? 'default' : 'outline' }),
            'cursor-pointer has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
          )}
        >
          <input
            type="radio"
            name={name}
            className="sr-only"
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
          />
          {o.label}
        </label>
      ))}
    </div>
  )
}
