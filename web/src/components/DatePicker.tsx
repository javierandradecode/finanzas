import { CalendarIcon } from 'lucide-react'
import { useState } from 'react'
import { DayPicker } from 'react-day-picker'
import { es } from 'react-day-picker/locale'
import 'react-day-picker/style.css'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatDateUtc, parseYmd, todayLocal, toYmd } from '@/lib/dates'
import { cn } from '@/lib/utils'

const FIRST_MONTH = new Date(2000, 0)
const LAST_MONTH = new Date(new Date().getFullYear() + 10, 11)

/**
 * A date field with our own calendar instead of the browser's. The value is the
 * text `YYYY-MM-DD` (or ''), and a day is read from the local calendar, so no
 * timezone can move it. `label` is read aloud together with the chosen date.
 */
export function DatePicker({
  id,
  label,
  value,
  onChange,
  clearable = false,
  invalid = false,
}: {
  id?: string
  label: string
  value: string
  onChange: (value: string) => void
  clearable?: boolean
  invalid?: boolean
}) {
  const [open, setOpen] = useState(false)
  const selected = parseYmd(value)
  const text = selected ? formatDateUtc(`${value}T00:00:00.000Z`) : undefined

  const pick = (next: string) => {
    onChange(next)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            data-value={value}
            aria-invalid={invalid || undefined}
            aria-label={`${label}: ${text ?? 'sin fecha'}`}
            className="w-full justify-between font-normal"
          />
        }
      >
        <span className={cn(!text && 'text-muted-foreground')}>{text ?? 'Elige una fecha'}</span>
        <CalendarIcon className="size-4 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent>
        <DayPicker
          mode="single"
          required
          locale={es}
          weekStartsOn={1}
          captionLayout="dropdown"
          startMonth={FIRST_MONTH}
          endMonth={LAST_MONTH}
          defaultMonth={selected}
          selected={selected}
          onSelect={(date) => pick(toYmd(date))}
          labels={{
            labelPrevious: () => 'Mes anterior',
            labelNext: () => 'Mes siguiente',
            labelMonthDropdown: () => 'Mes',
            labelYearDropdown: () => 'Año',
          }}
        />
        <div className="mt-2 flex items-center justify-between border-t pt-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => pick(todayLocal())}>
            Hoy
          </Button>
          {clearable && value && (
            <Button type="button" variant="ghost" size="sm" onClick={() => pick('')}>
              Borrar
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
