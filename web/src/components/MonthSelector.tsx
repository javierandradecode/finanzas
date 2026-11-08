import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatMonth } from '@/lib/dates'
import { currentMonthKey, monthsBetween, nextMonth, previousMonth } from '@/lib/months'

/** Previous / next month arrows around the month name. Going forward stops `maxAhead` months from now. */
export function MonthSelector({
  month,
  onChange,
  maxAhead = 12,
}: {
  month: string
  onChange: (month: string) => void
  maxAhead?: number
}) {
  const canGoNext = monthsBetween(currentMonthKey(), month) < maxAhead

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        aria-label="Mes anterior"
        onClick={() => onChange(previousMonth(month))}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <span
        data-testid="month"
        className="min-w-40 text-center text-lg font-medium first-letter:uppercase"
      >
        {formatMonth(month)}
      </span>
      <Button
        variant="outline"
        size="icon"
        aria-label="Mes siguiente"
        disabled={!canGoNext}
        onClick={() => onChange(nextMonth(month))}
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  )
}
