# Fase 1 — Base del backend: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `api/` arranca y responde `GET /api/health` conectado a MongoDB Atlas, con config validada, bootstrap global y utilidad de dinero.

**Architecture:** `AppModule` importa `ConfigModule` (global, validado al arrancar) y `MongooseModule.forRootAsync`. Un `HealthModule` expone el endpoint. Pipe, filtro, prefijo y CORS se configuran en `main.ts`. La utilidad de dinero es código puro en `common/money`.

**Tech Stack:** NestJS 11, TypeScript strict, `@nestjs/config`, `@nestjs/mongoose` + Mongoose, `class-validator`/`class-transformer`, Jest, ESLint + Prettier.

**Spec:** `docs/superpowers/specs/2026-11-07-fase-1-base-backend-design.md`

## Global Constraints

- Dinero = entero en centavos (`amountCents: number`); nunca float.
- Código en inglés; `ValidationPipe` global con `whitelist: true`.
- Prefijo global `/api`; CORS por defecto `http://localhost:5173` (`CORS_ORIGIN`).
- Forma de error: `{ statusCode, message, error }`.
- Secretos solo en `.env` (no commitear); mantener `api/.env.example` con `MONGODB_URI`, `JWT_SECRET`, `PORT`, `CORS_ORIGIN`.
- TDD solo en la utilidad de dinero; config/scaffolding sin tests (decisión del dueño).
- Entorno Windows (Git Bash/PowerShell). Commits terminan con `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Fuera de alcance: users/auth, `mongodb-memory-server`, tests e2e.

## Review Focus

- Falta `MONGODB_URI` o `JWT_SECRET` → el arranque falla nombrando la variable (verificación manual en T3).
- `PORT` no numérico → error de validación, no `NaN` (manual en T3).
- Excepción no controlada → 500 genérico, sin stack ni mensaje interno (manual en T4).
- Body con campos extra o tipos erróneos → 400 con la forma uniforme (manual en T4).
- `toCents` con `"19.999"`, `"1,50"`, `""`, `"abc"` → lanza error (test en T2).
- Atlas inalcanzable → `/api/health` responde `db: "down"` en vez de colgarse (manual en T4).

---

### Task 1: Scaffold limpio de `api/`

**Files:**
- Delete: `api/` actual (scaffold incompleto, sin `strict`, aprobado para regenerar)
- Create: `api/` nuevo

**Interfaces:** Produces: proyecto que compila con `tsconfig` `"strict": true`.

- [ ] **Step 1:** Borrar `api/` y ejecutar `npx @nestjs/cli@11 new api --package-manager npm --strict --skip-git` desde la raíz.
- [ ] **Step 2:** Confirmar `"strict": true` en `api/tsconfig.json`; si el CLI solo activó flags sueltos, sustituirlos por `strict`.
- [ ] **Step 3:** Run: `cd api; npm run build; npm test; npm run lint`. Expected: sin errores.
- [ ] **Step 4:** Commit `chore(api): scaffold NestJS project`.

> **Aprendizaje:** `nest new` ≈ `laravel new`; `main.ts` ≈ `bootstrap/app.php`; `AppModule` ≈ registro de ServiceProviders.

### Task 2: Utilidad de dinero (TDD)

**Files:**
- Create: `api/src/common/money/money.ts`, `api/src/common/money/money.spec.ts`

**Interfaces:** Produces:
- `toCents(input: string): number` — parsea decimal en texto sin float (`"19.99"` → `1999`); lanza `Error` si no cumple `^-?\d+(\.\d{1,2})?$`.
- `formatCents(cents: number, currency = 'USD', locale = 'es-EC'): string` — vía `Intl.NumberFormat`; lanza `Error` si `cents` no es entero seguro.

- [ ] **Step 1: Tests que fallan** en `money.spec.ts`: `toCents('19.99')===1999`, `'0.1'→10`, `'5'→500`, `'1234.50'→123450`, `'-5.25'→-525`; `toCents('19.999')`, `'1,50'`, `''`, `'abc'` → `toThrow()`; `formatCents(1999)` contiene `19,99` y `$`; `formatCents(0)` contiene `0,00`; `formatCents(1.5)` → `toThrow()`.
- [ ] **Step 2:** Run: `cd api; npx jest src/common/money`. Expected: FAIL (módulo no existe).
- [ ] **Step 3:** Implementar ambas funciones; `toCents` construye el entero con parte entera × 100 + decimales rellenados a 2, sin `parseFloat`.
- [ ] **Step 4:** Run: `npx jest src/common/money`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(common): money utils (cents <-> format)`.

> **Aprendizaje:** `0.1 + 0.2 !== 0.3` en JS igual que en PHP; por eso enteros. Es el equivalente a usar `bcmath`/`brick/money` en Laravel.

### Task 3: Configuración validada + conexión a Atlas

**Files:**
- Create: `api/src/config/env.validation.ts`, `api/.env.example`, `api/.env` (local, ignorado)
- Modify: `api/src/app.module.ts`

**Interfaces:** Produces: `validateEnv(config: Record<string, unknown>): EnvironmentVariables` con `MONGODB_URI: string`, `JWT_SECRET: string` (mín. 16 caracteres), `PORT: number` (default 3000), `CORS_ORIGIN: string` (default `http://localhost:5173`); `ConfigModule` global; `MongooseModule` conectado a `MONGODB_URI`.

- [ ] **Step 1:** `cd api; npm i @nestjs/config @nestjs/mongoose mongoose class-validator class-transformer`.
- [ ] **Step 2:** Implementar `validateEnv` con una clase decorada `EnvironmentVariables` + `plainToInstance` + `validateSync` (patrón oficial); el error debe nombrar las variables inválidas.
- [ ] **Step 3:** En `AppModule`: `ConfigModule.forRoot({ isGlobal: true, validate: validateEnv })` y `MongooseModule.forRootAsync({ inject: [ConfigService], useFactory })` usando `MONGODB_URI`.
- [ ] **Step 4:** Crear `.env.example` (valores de ejemplo) y `.env` con la URI real de Atlas **(la pone el dueño; no pedirla en el chat)**. Verificar `git check-ignore api/.env`.
- [ ] **Step 5:** Verificación manual: con `.env` sin `MONGODB_URI`, `npm run start` falla nombrando `MONGODB_URI`; con `PORT=abc` falla nombrando `PORT`; con valores válidos conecta sin errores. Expected: los tres comportamientos.
- [ ] **Step 6:** Commit `feat(api): validated env config and mongoose connection`.

> **Aprendizaje:** `ConfigModule` ≈ `config()`/`env()` pero validando al arrancar; la inyección de dependencias es como el contenedor de Laravel, pero cada módulo declara qué importa.

### Task 4: Bootstrap global + `GET /api/health`

**Files:**
- Create: `api/src/common/filters/all-exceptions.filter.ts`, `api/src/health/health.module.ts`, `api/src/health/health.controller.ts`, `api/src/health/health.service.ts`
- Modify: `api/src/main.ts`, `api/src/app.module.ts`; borrar `app.controller.ts`, `app.service.ts` y sus specs/e2e de ejemplo.

**Interfaces:**
- Consumes: `ConfigService` (T3), conexión Mongoose (T3).
- Produces: `AllExceptionsFilter` (`@Catch()`; `HttpException` conserva status/mensaje, cualquier otra → 500 `Internal server error` y stack solo en el log); `HealthService.check(): { status: 'ok' | 'degraded'; db: 'up' | 'down'; uptime: number }` (usa `@InjectConnection()` y `readyState === 1`); ruta `GET /health`.

- [ ] **Step 1:** Implementar `HealthService`, `HealthController` (delgado), `HealthModule`; importar en `AppModule` y quitar el controller/service de ejemplo.
- [ ] **Step 2:** Implementar `AllExceptionsFilter`.
- [ ] **Step 3:** En `main.ts`: `setGlobalPrefix('api')`, `useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))`, `useGlobalFilters(new AllExceptionsFilter())`, `enableCors({ origin: CORS_ORIGIN })`, `listen(PORT)`.
- [ ] **Step 4:** Run: `cd api; npm run build; npm test; npm run lint`. Expected: compila, tests de dinero en verde, lint limpio.
- [ ] **Step 5:** Verificación manual con Atlas: `npm run start:dev` y `curl http://localhost:3000/api/health` → `{"status":"ok","db":"up",...}`; `curl http://localhost:3000/health` → 404. Con una URI inalcanzable el servidor debe seguir respondiendo `db: "down"` (o fallar claro al conectar; anotar cuál ocurre).
- [ ] **Step 6:** Verificación temporal del filtro y del pipe: añadir una ruta de prueba que lanza `new Error('secret')` y otra con DTO `{ name: string }`; comprobar 500 sin `secret` en el body y 400 con la forma `{ statusCode, message, error }` ante `{ name: 123, extra: 1 }`; borrar las rutas de prueba.
- [ ] **Step 7:** Marcar los 6 ítems de la Fase 1 en `docs/PLAN.md` y commit `feat(api): global bootstrap and health endpoint (phase 1)`.

> **Aprendizaje:** `ValidationPipe` + DTOs ≈ Form Requests; el filtro de excepciones ≈ `Handler::render()`; `main.ts` aplica lo que en Laravel serían middleware globales.

---

## Self-review

- **Cobertura del diseño:** scaffold strict → T1; config/.env → T3; Mongoose → T3; prefijo/pipe/filtro/CORS → T4; health → T4; dinero → T2; verificación y marcado de fase → T4. Sin huecos.
- **Consistencia:** `validateEnv`/`EnvironmentVariables` (T3) leídos por `main.ts` y Mongoose (T3/T4); `HealthService.check` coincide con el diseño.
- **Proporción:** 4 tareas, solo T2 tiene código dictado por tests; el resto se verifica manualmente según la regla del dueño.
