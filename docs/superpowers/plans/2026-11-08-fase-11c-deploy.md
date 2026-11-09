# Fase 11c — Despliegue y README Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar la app lista para desplegar en Render + Atlas (blueprint, cabeceras, cobros al abrir la app) y documentarla en un README.

**Architecture:** `render.yaml` en la raíz define API y web; un script de comprobación valida el blueprint; la web recupera los cobros de suscripciones con una llamada a `process-due` al montar `AppLayout`; el README guía instalación y despliegue.

**Tech Stack:** Render blueprint (YAML), Node 22, Vitest + Testing Library, NestJS 11.

**Spec:** `docs/superpowers/specs/2026-11-08-fase-11c-deploy-design.md`

## Global Constraints

- Ningún secreto en git: `MONGODB_URI`, `CORS_ORIGIN`, `VITE_API_URL` van con `sync: false`; `JWT_SECRET` con `generateValue: true`.
- API: `buildCommand: npm ci --include=dev && npm run build`, `startCommand: node dist/main`, `healthCheckPath: /api/health`, `NODE_ENV=production`.
- Web: `staticPublishPath: dist`, rewrite `/* → /index.html`.
- El aviso de cobros solo aparece si `charged > 0`; un error de la llamada no se muestra al usuario.
- Código en inglés, textos de UI y README en español.
- Comandos: `cd api && npm test && npm run build && npm run lint`; `cd web && npm test -- --run && npm run build && npm run lint` (lint web: solo avisos conocidos).

## Review Focus

- `AppLayout` se monta una vez por carga de página pero no al navegar; el efecto no debe lanzar dos llamadas con React StrictMode ni al cambiar de ruta.
- Respuesta de `process-due` con `charged: 0` o con `failed` no vacío: sin aviso de éxito; un 401 sigue cerrando sesión por el manejador global.
- El blueprint no contiene valores de secretos y declara todas las variables que `validateEnv`/`assertProductionSafe` exigen en producción.
- La CSP no bloquea la web compilada (fuentes `@fontsource`, estilos en línea, gráficos): consola del navegador limpia al verificar.
- Rutas profundas (`/movimientos`) recargan gracias al rewrite; el README advierte del primer arranque lento del host gratuito.

---

### Task 1: Cobros pendientes al abrir la app

**Files:**
- Modify: `web/src/components/AppLayout.tsx`
- Test: `web/src/components/AppLayout.test.tsx` (crear si no existe)

**Interfaces:**
- Consumes: `useProcessDue()` de `@/api/subscriptions` (mutación; `mutate(undefined, { onSuccess(summary: ProcessSummary) })`); `toast` de `sonner`.
- Produces: comportamiento — al montar `AppLayout` se hace una sola llamada `POST /subscriptions/process-due`.

- [ ] **Step 1: Escribe pruebas (fallan)** con `routeFetch`, `QueryClientProvider` y `MemoryRouter` (patrón de `TransactionsPage.test.tsx`, `vi.mock('sonner')`): (a) al montar se hace exactamente un `POST /subscriptions/process-due`; (b) con `charged: 2` se llama `toast.success` con `Se registraron 2 cobros de suscripciones`, y con `charged: 1` el texto es singular `Se registró 1 cobro de suscripción`; (c) con `charged: 0` no hay toast; (d) con 500 no hay toast de error ni excepción; (e) navegar a otra ruta dentro del layout no repite la llamada.
- [ ] **Step 2: Ejecuta** `cd web && npx vitest run src/components/AppLayout.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implementa** en `AppLayout` un `useEffect` con dependencia vacía que llama a `mutate` una vez; protege contra el doble montaje de StrictMode con un `useRef` de "ya llamado"; `onError` solo `console.error`.
- [ ] **Step 4: Ejecuta** el test y luego `npm test -- --run`. Expected: PASS. Mutación: quitar el `useRef` → la prueba (a) bajo `StrictMode` debe fallar (monta el layout dentro de `<StrictMode>` en esa prueba); restaurar.
- [ ] **Step 5: Commit** `feat: collect due subscriptions when the app opens`.

### Task 2: `render.yaml` y su comprobación

**Files:**
- Create: `render.yaml`, `scripts/check-render-yaml.js`

**Interfaces:**
- Produces: `node scripts/check-render-yaml.js` (sale con código 1 y explica el fallo si el blueprint no cumple); el script no necesita dependencias nuevas: si `yaml` no está en `api/node_modules`, lo resuelve desde ahí con `require.resolve('yaml', { paths: [...] })` o, si falta, instala solo en una carpeta temporal del scratchpad; alternativa aceptable: comprobar con expresiones regulares las claves esperadas (decide el implementador y lo deja en el commit).

- [ ] **Step 1: Escribe `scripts/check-render-yaml.js` (falla: no hay blueprint)**. Comprueba: existen un servicio `web` (runtime node, `rootDir: api`) y uno `static` (`rootDir: web`); `buildCommand` de la API contiene `--include=dev`; `healthCheckPath: /api/health`; `NODE_ENV=production`; `JWT_SECRET` con `generateValue: true`; `MONGODB_URI`, `CORS_ORIGIN` y `VITE_API_URL` con `sync: false`; ninguna variable tiene `value` que parezca secreto (patrón de `scripts/scan-git-secrets.js`); el static tiene rewrite `/*` → `/index.html` y las cabeceras `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`.
- [ ] **Step 2: Ejecuta** `node scripts/check-render-yaml.js`. Expected: FAIL (falta `render.yaml`).
- [ ] **Step 3: Crea `render.yaml`** según la sección "Diseño" del spec (CSP provisional: `default-src 'self'; connect-src 'self' https://*.onrender.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; frame-ancestors 'none'`).
- [ ] **Step 4: Ejecuta** el script. Expected: salida `render.yaml OK`. Mutación: poner `value: <un valor tipo secreto>` a `MONGODB_URI` o quitar `--include=dev` → el script debe fallar; restaurar.
- [ ] **Step 5: Commit** `feat: Render blueprint and its check`.

### Task 3: Verificación de producción

**Files:** Modify (si hace falta): `render.yaml` (afinar la CSP), `api/.env.example`.

- [ ] **Step 1: Compila** `cd api && npm run build` y `cd web && npm run build`. Expected: sin errores.
- [ ] **Step 2: API en modo producción.** Con `NODE_ENV=production`, `JWT_SECRET` aleatorio de 48 caracteres, `CORS_ORIGIN=https://example.test`, `MONGODB_URI` de Atlas (usuario de prueba propio) y `PORT=3001`: `node dist/main` arranca y `GET /api/health` responde 200. Con `JWT_SECRET=corto` o `CORS_ORIGIN=http://localhost:5173` el arranque falla con un mensaje que nombra la variable y no imprime su valor. No pegar secretos en la conversación ni en archivos del repositorio.
- [ ] **Step 3: Web compilada.** `cd web && VITE_API_URL=http://localhost:3001/api npm run build && npx vite preview`; con la API del paso anterior y `CORS_ORIGIN=http://localhost:4173` (puerto de preview) iniciar sesión con un usuario de prueba propio, recargar `/movimientos` (en preview el fallback funciona; el rewrite de Render se documenta) y revisar la consola del navegador: sin violaciones de CSP al aplicar la CSP del blueprint como `<meta>` temporal o cabecera del preview. Ajustar la CSP en `render.yaml` según lo observado.
- [ ] **Step 4: Comprueba** el aviso de cobros: crear una suscripción vencida para el usuario de prueba, abrir la app y ver el aviso y el movimiento creado.
- [ ] **Step 5: Detén** los procesos propios, borra los archivos temporales y haz commit de los ajustes (`fix: tune production config`) solo si hubo cambios.

### Task 4: README y cierre

**Files:**
- Create: `README.md` (raíz)
- Modify: `docs/PLAN.md`, `docs/SECURITY.md` (CSP ya no pendiente; añade el despliegue a "Cómo repetirlo")

- [ ] **Step 1: Escribe el README** con las secciones del spec (descripción y stack, estructura, requisitos y arranque local, tests, despliegue paso a paso con comprobación esperada en cada paso, tabla de variables de `api/.env.example` y `VITE_API_URL`, notas del plan gratuito, copia de seguridad con el CSV, enlaces). Todas las rutas y comandos citados deben existir: verifícalos con `grep` sobre `package.json`/`.env.example`.
- [ ] **Step 2: Actualiza** `docs/PLAN.md`: marca "README…" como hecho y "Despliegue…" como preparado (`- [x] Despliegue (configuración lista; falta ejecutar los pasos del README con tus cuentas)`). En `docs/SECURITY.md` cambia la mención a la CSP "en la Fase 11c" por lo implementado.
- [ ] **Step 3: Ejecuta** `cd api && npm test && npm run build && npm run lint` y `cd web && npm test -- --run && npm run build && npm run lint`; `node scripts/check-render-yaml.js`; `node scripts/scan-git-secrets.js`. Expected: todo verde y 0 hallazgos.
- [ ] **Step 4: Commit** `feat: deployment config and README (phase 11c)`.
