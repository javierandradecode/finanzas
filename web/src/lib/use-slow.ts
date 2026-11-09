import { useEffect, useState } from 'react'

/** True once `active` has lasted `ms` without ending (the free host may be waking up). */
export function useSlow(active: boolean, ms = 4000) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!active) return
    const timer = setTimeout(() => setSlow(true), ms)
    return () => {
      clearTimeout(timer)
      setSlow(false)
    }
  }, [active, ms])
  return active && slow
}
