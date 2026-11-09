import { ApiError, api, apiDownload, setUnauthorizedHandler } from './client'
import { clearToken, setToken } from '@/lib/token'

function mockFetch(status: number, body?: unknown, raw?: string) {
  const fn = vi.fn().mockResolvedValue(
    new Response(raw ?? (body === undefined ? null : JSON.stringify(body)), {
      status,
    }),
  )
  vi.stubGlobal('fetch', fn)
  return fn
}

const headersOf = (fn: ReturnType<typeof vi.fn>) =>
  new Headers((fn.mock.calls[0][1] as RequestInit).headers)

describe('api client', () => {
  beforeEach(() => {
    clearToken()
    setUnauthorizedHandler(null)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('sends Authorization only when there is a token', async () => {
    let fn = mockFetch(200, { ok: true })
    await api('/x')
    expect(headersOf(fn).get('Authorization')).toBeNull()

    setToken('tok')
    fn = mockFetch(200, { ok: true })
    await api('/x')
    expect(headersOf(fn).get('Authorization')).toBe('Bearer tok')
  })

  it('serializes the body as JSON', async () => {
    const fn = mockFetch(200, {})
    await api('/x', { method: 'POST', body: { a: 1 } })
    const init = fn.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"a":1}')
    expect(headersOf(fn).get('Content-Type')).toBe('application/json')
  })

  it('returns undefined on 204', async () => {
    mockFetch(204)
    await expect(api('/x', { method: 'DELETE' })).resolves.toBeUndefined()
  })

  it('joins array messages into one string', async () => {
    mockFetch(400, { message: ['a', 'b'] })
    await expect(api('/x')).rejects.toMatchObject({
      status: 400,
      message: 'a, b',
    })
  })

  it('uses a string message as is', async () => {
    mockFetch(409, { message: 'x' })
    const err = await api('/x').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 409, message: 'x' })
  })

  it('calls the unauthorized handler once on 401', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    mockFetch(401, { message: 'Unauthorized' })
    await expect(api('/x')).rejects.toMatchObject({ status: 401 })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('turns network failures into ApiError status 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fail')))
    await expect(api('/x')).rejects.toMatchObject({
      status: 0,
      message: 'No se pudo conectar con el servidor',
    })
  })

  it('falls back to a generic message when the error body is not JSON', async () => {
    mockFetch(500, undefined, '<html>boom</html>')
    await expect(api('/x')).rejects.toMatchObject({
      status: 500,
      message: 'Error 500',
    })
  })
})

describe('apiDownload', () => {
  beforeEach(() => {
    clearToken()
    setUnauthorizedHandler(null)
  })
  afterEach(() => vi.unstubAllGlobals())

  const file = (headers: Record<string, string> = {}) =>
    new Response('a,b', { status: 200, headers })

  it('sends the token and returns the blob with the server file name', async () => {
    setToken('tok')
    const fn = vi.fn().mockResolvedValue(
      file({ 'Content-Disposition': 'attachment; filename="movimientos-2026-03-15.csv"' }),
    )
    vi.stubGlobal('fetch', fn)
    const out = await apiDownload('/transactions/export?type=income')
    expect(headersOf(fn).get('Authorization')).toBe('Bearer tok')
    expect(fn.mock.calls[0][0]).toMatch(/\/transactions\/export\?type=income$/)
    expect(out.filename).toBe('movimientos-2026-03-15.csv')
    expect(await out.blob.text()).toBe('a,b')
  })

  it('falls back to a default file name', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(file()))
    expect((await apiDownload('/x')).filename).toBe('movimientos.csv')
  })

  it('throws the API message on errors and reports 401', async () => {
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'nope' }), { status: 401 })),
    )
    await expect(apiDownload('/x')).rejects.toMatchObject({ status: 401, message: 'nope' })
    expect(onUnauthorized).toHaveBeenCalled()
  })

  it('reports a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('x')))
    await expect(apiDownload('/x')).rejects.toMatchObject({ status: 0 })
  })
})
