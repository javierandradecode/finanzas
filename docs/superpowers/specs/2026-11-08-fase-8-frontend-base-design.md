# Fase 8 — Base del frontend: diseño

## Intención
Dar al dueño (viene de Laravel, aprende React) una interfaz con la que iniciar sesión y navegar, sobre la que las Fases 9–10 añadirán pantallas con datos. Esta fase entrega el esqueleto: proyecto, cliente HTTP con JWT, login/registro, rutas protegidas y layout con menú.

## Objetivos
- Proyecto `web/` con React + Vite + TypeScript (strict), Tailwind v4, shadcn/ui, React Router, TanStack Query.
- Cliente HTTP con el token JWT y manejo de 401.
- Páginas de login y registro (React Hook Form + Zod), rutas protegidas, layout con barra lateral.
- Tema claro/oscuro/sistema con acento verde.

## No objetivos
Pantallas con datos (Fase 9), dashboard y gráficos (Fase 10), refresh tokens, recuperar contraseña, i18n, E2E.

## Restricciones (de CLAUDE.md)
Código en inglés, textos de UI en español. Llamadas a la API solo mediante hooks en `web/src/api/`. ESLint + Prettier. Variables en `.env` con `.env.example` actualizado. Dinero en centavos (se formatea solo al mostrar; aún no hay montos en esta fase).

## Enfoques considerados
- **Cliente HTTP A — `fetch` nativo con wrapper (elegido):** ~30 líneas, sin dependencias; añade `Authorization`, lanza `ApiError` con el mensaje de la API y en 401 cierra sesión.
- **B — Axios con interceptores:** equivalente a middleware, pero una dependencia para lo que `fetch` ya hace.
- **Token:** `localStorage` (decisión del asistente, aceptada). Riesgo: XSS puede leerlo. Cookies `httpOnly` exigirían cambiar la API; se revisará si se endurece.
- **Menú:** barra lateral fija en escritorio, `Sheet` deslizable en móvil (decisión del usuario).
- **Tema:** claro/oscuro/sistema, acento verde (decisión del usuario).

## Diseño
```
web/src/
├── api/        client.ts (fetch + JWT + ApiError), auth.ts (useLogin/useRegister/useMe)
├── components/ ui/ (shadcn), AppLayout, Sidebar, ThemeToggle
├── features/auth/  AuthProvider, RequireAuth, schemas.ts (Zod)
├── pages/      LoginPage, RegisterPage, PlaceholderPage
└── lib/        utils.ts (cn), theme.ts, token.ts
```
- **Contrato API:** `POST /auth/login` (200) y `POST /auth/register` devuelven `{ accessToken, user: { id, email, name, currency } }`; `GET /auth/me` devuelve el `user`. Errores: 401 credenciales, 409 email repetido, 400 validación (`message` puede ser string o string[]).
- **Sesión:** token en `localStorage` (`token.ts`: get/set/clear con try/catch). `AuthProvider` expone `{ user, status: 'loading'|'authenticated'|'anonymous', login, logout }`. Al montar, si hay token llama `GET /auth/me`; si falla, limpia y queda anónimo. Un 401 en cualquier llamada ejecuta un callback registrado por el provider (`setUnauthorizedHandler`) que limpia sesión y la caché de TanStack Query.
- **Rutas:** `/login`, `/register` públicas (si hay sesión redirigen a `/`). Bajo `RequireAuth` + `AppLayout`: `/` Resumen, `/movimientos`, `/cuentas`, `/categorias`, `/tarjetas`, `/suscripciones`, `/presupuestos`, todas `PlaceholderPage` con título hasta la Fase 9. `*` redirige a `/`. `RequireAuth` muestra un indicador mientras `status==='loading'` y redirige a `/login` si anónimo.
- **Layout:** `Sidebar` con enlaces (`NavLink`, activo resaltado), nombre del usuario, `ThemeToggle` y "Cerrar sesión". En `<md` el sidebar se oculta y una barra superior abre un `Sheet` con el mismo contenido.
- **Tema:** clase `dark` en `<html>`; preferencia `light|dark|system` en `localStorage`; script inline en `index.html` la aplica antes de pintar (sin parpadeo). Tokens de shadcn con `--primary` verde.
- **Formularios:** Zod en español: email válido, contraseña ≥ 8 (registro), nombre obligatorio. Errores de API se muestran en el formulario (401 → "Correo o contraseña incorrectos", 409 → "Ese correo ya está registrado").
- **Entorno:** `web/.env` con `VITE_API_URL=http://localhost:3000/api`; `web/.env.example` versionado. Vite en 5173 (CORS ya permitido en la API).

## Pruebas
Vitest + Testing Library + jsdom sólo donde hay lógica: wrapper HTTP (cabecera, `ApiError`, 401, 204), esquemas Zod, `token.ts`, `RequireAuth`/`AuthProvider` (redirige sin sesión, restaura sesión, logout). El resto se verifica a mano en el navegador contra la API real.

## A criterio del implementador
Versiones exactas, componentes shadcn concretos, iconos (lucide-react) y estilos finos, siempre que respeten lo anterior.
