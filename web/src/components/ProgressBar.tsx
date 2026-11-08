import { cn } from '@/lib/utils'

const TONES = {
  ok: 'bg-primary',
  warn: 'bg-amber-500',
  over: 'bg-destructive',
} as const

/** Shows value/max as a bar clamped to 0–100 %; the real numbers belong in the text next to it. */
export function ProgressBar({
  value,
  max,
  className,
  tone = 'ok',
  danger = false,
}: {
  value: number
  max: number
  className?: string
  tone?: keyof typeof TONES
  /** Shorthand for tone="over" (kept for the cards screen). */
  danger?: boolean
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <div
        className={cn('h-full rounded-full', TONES[danger ? 'over' : tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
