# Fase 8 — Base del frontend: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un `web/` con login/registro, rutas protegidas y layout con barra lateral y tema claro/oscuro, hablando con la API existente.

**Architecture:** SPA React (Vite). `fetch` wrapper (`api/client.ts`) añade el JWT desde `lib/token.ts`; `AuthProvider` guarda el usuario y restaura la sesión con `GET /auth/me`; `RequireAuth` protege rutas; TanStack Query para llamadas; formularios RHF + Zod.

**Tech Stack:** Vite, React 19, TypeScript strict, Tailwind v4 (`@tailwindcss/vite`), shadcn/ui, React Router, TanStack Query, React Hook Form + Zod, lucide-react, Vitest + Testing Library + jsdom.

**Spec:** `docs/superpowers/specs/2026-11-08-fase-8-frontend-base-design.md`

## Global Constraints

- Código en inglés, textos de UI en español.
- Llamadas a la API solo desde `web/src/api/` (hooks y cliente).
- Token en `localStorage` bajo la clave `token`; preferencia de tema bajo `theme` (`light|dark|system`). Todo acceso a `localStorage` envuelto en try/catch.
- `VITE_API_URL` por defecto `http://localhost:3000/api`; `web/.env` ignorado por git, `web/.env.example` versionado.
- Alias `@/` → `web/src/`. TS strict. ESLint + Prettier limpios.
- Rutas: `/login`, `/register` públicas; protegidas `/`, `/movimientos`, `/cuentas`, `/categorias`, `/tarjetas`, `/suscripciones`, `/presupuestos`; `*` → `/`.
- Mensajes: 401 login → "Correo o contraseña incorrectos"; 409 registro → "Ese correo ya está registrado".

## Review Focus

- Token corrupto/expirado al recargar: `GET /auth/me` da 401 → limpia token y queda en `/login`, sin bucle de redirecciones.
- Servidor caído (error de red) en login: muestra "No se pudo conectar con el servidor", no se queda cargando.
- `message` de la API como `string[]` (400): se muestra unido, no `[object Object]`.
- Respuesta 204 sin cuerpo: el wrapper no revienta al parsear JSON.
- `localStorage` bloqueado (modo privado): la app arranca como anónima sin lanzar.
- Tras logout o 401 la caché de TanStack Query se vacía (otro usuario no ve datos del anterior).

---

### Task 1: Scaffold de `web/`

**Files:**
- Create: `web/` (Vite react-ts), `web/.env.example`, `web/vitest.config` o bloque `test` en `vite.config.ts`, `web/src/test/setup.ts`
- Modify: `.gitignore` si hace falta (`web/.env`, `web/dist`)

**Interfaces:**
- Produces: alias `@/`, scripts `dev`, `build`, `lint`, `test` (`vitest run`), `cn()` en `web/src/lib/utils.ts`, Tailwind v4 activo, componentes shadcn en `web/src/components/ui/`: `button, input, label, card, sheet, dropdown-menu` (los que se usen).

- [ ] **Step 1:** Crear con `npm create vite@latest web -- --template react-ts` (Node 22), instalar dependencias: `tailwindcss @tailwindcss/vite react-router-dom @tanstack/react-query react-hook-form zod @hookform/resolvers lucide-react` y dev `vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event`.
- [ ] **Step 2:** Configurar alias `@/` en `vite.config.ts` y `tsconfig.app.json`, plugin `@tailwindcss/vite`, `test: { environment: 'jsdom', setupFiles: './src/test/setup.ts', globals: true }`; setup importa `@testing-library/jest-dom/vitest`. Quitar el boilerplate de Vite (App.css, assets, contenido de `App.tsx`).
- [ ] **Step 3:** `npx shadcn@latest init` (estilo por defecto, base color neutral, CSS variables) y añadir los componentes listados. Cambiar `--primary` (claro y oscuro) a un verde (p. ej. emerald) en `index.css`.
- [ ] **Step 4:** `web/.env.example` con `VITE_API_URL=http://localhost:3000/api`; copiar a `web/.env`.
- [ ] **Step 5:** Test de humo `src/lib/utils.test.ts`: `cn('a', false && 'b', 'c')` → `'a c'`. Run: `cd web && npm test` → PASS.
- [ ] **Step 6:** `npm run build && npm run lint` limpios. Commit `chore(web): scaffold vite react ts with tailwind and shadcn`.

---

### Task 2: Token y cliente HTTP (TDD)

**Files:**
- Create: `web/src/lib/token.ts`, `web/src/lib/token.test.ts`, `web/src/api/client.ts`, `web/src/api/client.test.ts`

**Interfaces:**
- Produces:
  - `getToken(): string | null`, `setToken(t: string): void`, `clearToken(): void` (nunca lanzan).
  - `class ApiError extends Error { status: number }` (message ya normalizado: string o `string[]` unido con ", ").
  - `api<T>(path: string, options?: { method?: string; body?: unknown }): Promise<T>`: base `import.meta.env.VITE_API_URL`; añade `Authorization: Bearer` si hay token y `Content-Type: application/json` si hay body; 204 → `undefined`; no-ok → `ApiError`; fallo de red → `ApiError` con status 0 y mensaje "No se pudo conectar con el servidor"; en 401 llama al handler.
  - `setUnauthorizedHandler(fn: (() => void) | null): void`.

- [ ] **Step 1: Tests de `token`** (storage normal; `localStorage` que lanza en get/set/remove → `getToken` devuelve null y `setToken/clearToken` no lanzan). Run → FAIL.
- [ ] **Step 2:** Implementar `token.ts`. Run → PASS.
- [ ] **Step 3: Tests de `client`** con `vi.stubGlobal('fetch', …)`: (a) envía `Authorization` solo con token; (b) serializa body JSON con content-type; (c) 204 → `undefined`; (d) 400 con `message: ['a','b']` → `ApiError` status 400, message `'a, b'`; (e) 409 con `message: 'x'` → message `'x'`; (f) 401 invoca el handler una vez y rechaza con `ApiError` 401; (g) `fetch` rechaza → `ApiError` status 0 con el mensaje en español; (h) respuesta de error sin JSON válido → mensaje genérico `Error {status}`. Run → FAIL.
- [ ] **Step 4:** Implementar `client.ts` (ver Interfaces). Run → PASS.
- [ ] **Step 5:** Mutación manual: quitar el `Authorization` o la llamada al handler y comprobar que falla el test correspondiente; restaurar. Commit `feat(web): token storage and http client`.

---

### Task 3: Auth: esquemas, hooks, provider y RequireAuth (TDD)

**Files:**
- Create: `web/src/features/auth/schemas.ts` (+ `.test.ts`), `web/src/features/auth/AuthProvider.tsx`, `web/src/features/auth/useAuth.ts`, `web/src/features/auth/RequireAuth.tsx` (+ `RequireAuth.test.tsx`), `web/src/api/auth.ts`

**Interfaces:**
- Consumes: `api`, `ApiError`, `setUnauthorizedHandler`, `getToken/setToken/clearToken`.
- Produces:
  - `loginSchema` (`email` válido, `password` no vacío), `registerSchema` (`name` no vacío tras trim, `email`, `password` ≥ 8), mensajes en español; tipos `LoginInput`, `RegisterInput`.
  - `api/auth.ts`: tipo `AuthUser { id; email; name; currency }`, `AuthResponse { accessToken; user }`, `loginRequest(i: LoginInput)`, `registerRequest(i: RegisterInput)`, `meRequest()` (funciones puras sobre `api`).
  - `AuthProvider` + `useAuth(): { user: AuthUser | null; status: 'loading'|'authenticated'|'anonymous'; login(i): Promise<void>; register(i): Promise<void>; logout(): void }`. `login/register` guardan token y usuario; `logout` y el handler de 401 limpian token, usuario y `queryClient.clear()`. Al montar sin token → `anonymous` sin llamar a la API; con token → `meRequest()`; error → limpia y `anonymous`.
  - `RequireAuth`: `loading` → indicador "Cargando…"; `anonymous` → `<Navigate to="/login" replace />`; autenticado → `<Outlet />`.

- [ ] **Step 1: Tests de esquemas** (email inválido, password corta en registro, nombre solo espacios, casos válidos). Run → FAIL.
- [ ] **Step 2:** Implementar `schemas.ts`. Run → PASS.
- [ ] **Step 3: Tests de AuthProvider/RequireAuth** con `fetch` stub y `MemoryRouter`: sin token redirige a `/login` sin llamar a la API; token válido (`/auth/me` ok) renderiza la ruta protegida; `/auth/me` 401 → limpia token y redirige a `/login` (una sola vez); `logout()` limpia token y redirige; `login()` guarda token y pasa a `authenticated`; error de red al restaurar → `anonymous`. Run → FAIL.
- [ ] **Step 4:** Implementar `api/auth.ts`, `AuthProvider`, `useAuth`, `RequireAuth`. El provider registra `setUnauthorizedHandler` en un efecto y lo retira al desmontar. Run → PASS.
- [ ] **Step 5:** Suite completa `npm test`, build y lint. Commit `feat(web): auth provider, schemas and route guard`.

---

### Task 4: Tema, layout, rutas y páginas provisionales

**Files:**
- Create: `web/src/lib/theme.ts` (+ `theme.test.ts`), `web/src/components/ThemeToggle.tsx`, `web/src/components/Sidebar.tsx`, `web/src/components/AppLayout.tsx`, `web/src/pages/PlaceholderPage.tsx`, `web/src/router.tsx`
- Modify: `web/index.html` (script anti-parpadeo), `web/src/main.tsx`, `web/src/App.tsx`

**Interfaces:**
- Consumes: `useAuth`, `RequireAuth`.
- Produces: `type Theme = 'light'|'dark'|'system'`; `getTheme(): Theme` (default `system`), `applyTheme(t: Theme): void` (alterna clase `dark` en `<html>` y guarda), `router` con las rutas de Global Constraints; `main.tsx` monta `QueryClientProvider > AuthProvider > RouterProvider`. Debe existir una constante `NAV_ITEMS` (label ES, path, icono) en `Sidebar.tsx`: Resumen `/`, Movimientos, Cuentas, Categorías, Tarjetas, Suscripciones, Presupuestos.

- [ ] **Step 1: Tests de `theme`** (default `system`; `applyTheme('dark')` pone la clase y persiste; `light` la quita; `system` sigue `matchMedia`; storage que lanza no rompe). Run → FAIL.
- [ ] **Step 2:** Implementar `theme.ts`. Run → PASS.
- [ ] **Step 3:** Script inline en `index.html` que lee `localStorage.theme` y `prefers-color-scheme` y añade `dark` antes de pintar (try/catch).
- [ ] **Step 4:** `Sidebar` (NavLink con estado activo, nombre del usuario, `ThemeToggle`, botón "Cerrar sesión"), `AppLayout` (sidebar fija `md:` y barra superior con `Sheet` en móvil; `<Outlet />`), `PlaceholderPage` (título), `router.tsx` y `main.tsx`.
- [ ] **Step 5:** Suite, build y lint. Commit `feat(web): theme, layout and routing`.

---

### Task 5: Páginas de login y registro

**Files:**
- Create: `web/src/pages/LoginPage.tsx`, `web/src/pages/RegisterPage.tsx`, `web/src/pages/LoginPage.test.tsx`

**Interfaces:**
- Consumes: `loginSchema`, `registerSchema`, `useAuth`, `ApiError`, componentes shadcn (`card, input, label, button`).

- [ ] **Step 1: Tests de `LoginPage`**: muestra errores Zod en español al enviar vacío; en éxito navega a `/`; 401 muestra "Correo o contraseña incorrectos"; error de red (status 0) muestra el mensaje del servidor; el botón queda deshabilitado mientras envía; si ya hay sesión redirige a `/`. Run → FAIL.
- [ ] **Step 2:** Implementar `LoginPage` (RHF + `zodResolver`, error de API en un `role="alert"`, enlace a registro) y `RegisterPage` (mismo patrón; 409 → "Ese correo ya está registrado"; enlace a login). Ambas redirigen a `/` si ya hay sesión. Run → PASS.
- [ ] **Step 3:** Suite, build y lint. Commit `feat(web): login and register pages`.

---

### Task 6: Verificación manual y cierre

**Files:**
- Modify: `docs/PLAN.md` (marcar Fase 8), `README`/notas no necesarias.

- [ ] **Step 1:** Arrancar API (`cd api && npm run start:dev`) y web (`cd web && npm run dev`). Con las herramientas de navegador (o guiando al usuario si no están disponibles) verificar: registro de usuario nuevo, entra a `/`; recarga conserva sesión; logout vuelve a `/login`; login con contraseña mala muestra el error; email repetido en registro muestra 409; acceder a `/cuentas` sin sesión redirige a `/login`; token alterado en `localStorage` + recarga → `/login`; tema claro/oscuro/sistema persiste sin parpadeo; menú móvil (ventana estrecha) abre el `Sheet`; API apagada muestra el mensaje de conexión.
- [ ] **Step 2:** `cd web && npm test && npm run build && npm run lint` y confirmar que `api` sigue verde (`cd api && npm test`).
- [ ] **Step 3:** Marcar Fase 8 en `docs/PLAN.md`. Commit `feat: frontend base (phase 8)`.
