import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/** A plain <select> styled like <Input>: simple, great on mobile, easy to test. */
export function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 py-1 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-sm dark:bg-input/30 [&>option]:bg-background [&>option]:text-foreground',
        className,
      )}
      {...props}
    />
  )
}
