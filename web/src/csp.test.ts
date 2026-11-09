import html from '../index.html?raw'
import themeInit from '../public/theme-init.js?raw'

// The production CSP (render.yaml) forbids inline scripts, so index.html must not have any.
describe('index.html and the production CSP', () => {
  it('has no inline <script> blocks', () => {
    const inline = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].filter(
      ([, attrs, body]) => !/\bsrc=/.test(attrs) && body.trim() !== '',
    )
    expect(inline).toEqual([])
  })

  it('loads the theme script from a file that exists', () => {
    expect(html).toContain('src="/theme-init.js"')
    expect(themeInit).toContain('classList')
  })
})
