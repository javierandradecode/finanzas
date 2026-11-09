// Apply the theme before first paint (no light/dark flash).
// A separate file (not inline) because the production CSP forbids inline scripts.
try {
  var t = localStorage.getItem('theme')
  var dark =
    t === 'dark' ||
    (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
} catch (e) {}
