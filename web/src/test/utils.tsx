import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

export function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

export function queryWrapper(client = makeClient()) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

export const jsonResponse = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status })

/** Stubs fetch: each call returns the next response (the last one repeats). */
export function stubFetch(...responses: Response[]) {
  let i = 0
  const fn = vi.fn().mockImplementation(() => {
    const r = responses[Math.min(i++, responses.length - 1)]
    return Promise.resolve(r.clone())
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

export const callOf = (fn: ReturnType<typeof vi.fn>, n = 0) => {
  const [url, init] = fn.mock.calls[n] as [string, RequestInit | undefined]
  return {
    path: url.replace(/^https?:\/\/[^/]+\/api/, ''),
    method: init?.method ?? 'GET',
    body: init?.body ? JSON.parse(init.body as string) : undefined,
  }
}

export interface RecordedCall {
  path: string
  method: string
  body?: unknown
}

/** Stubs fetch by "METHOD /path"; unknown routes answer 404. Returns the recorded calls. */
export function routeFetch(routes: Record<string, () => Response | Promise<Response>>) {
  const calls: RecordedCall[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const path = url.replace(/^https?:\/\/[^/]+\/api/, '')
      const method = init?.method ?? 'GET'
      calls.push({
        path,
        method,
        body: init?.body ? JSON.parse(init.body as string) : undefined,
      })
      const handler = routes[`${method} ${path}`]
      return Promise.resolve(handler ? handler() : jsonResponse(404, { message: 'no route' }))
    }),
  )
  return calls
}

/**
 * Picks a date in a DatePicker: opens it from its label, chooses the year and
 * month in the lists (works for any date) and presses the day.
 */
export async function pickDate(label: string, ymd: string) {
  const [year, month] = ymd.split('-')
  await userEvent.click(screen.getByLabelText(label))
  await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Año' }), year)
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Mes' }), String(Number(month) - 1))
  const day = document.querySelector(`[data-day="${ymd}"] button`)
  if (!day) throw new Error(`No day button for ${ymd}`)
  await userEvent.click(day)
}
