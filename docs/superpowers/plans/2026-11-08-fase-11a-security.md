# Fase 11a — Seguridad Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Demostrar el aislamiento entre usuarios con una prueba de punta a punta, endurecer la API (helmet, límite de intentos, registro cerrable, reglas de producción), revisar secretos y dependencias y documentarlo en `docs/SECURITY.md`.

**Architecture:** `setupApp(app)` centraliza la configuración que comparten `main.ts` y las pruebas; `FEATURE_MODULES` evita que el arnés de pruebas se desincronice de `AppModule`; `SecurityModule` aporta el límite de intentos; las reglas de producción viven en `validateEnv`.

**Tech Stack:** NestJS 11, `@nestjs/throttler`, `helmet`, Jest + supertest + `mongodb-memory-server`.

**Spec:** `docs/superpowers/specs/2026-11-08-fase-11a-security-design.md`

## Global Constraints

- No se cambia el comportamiento en desarrollo salvo lo especificado; las reglas estrictas aplican solo con `NODE_ENV=production`.
- Variables nuevas (`ALLOW_REGISTRATION`, `RATE_LIMIT`, `AUTH_RATE_LIMIT`) documentadas en `api/.env.example`; nunca valores reales en git.
- Nunca imprimir ni repetir un secreto encontrado en el historial; informar solo dónde está.
- TDD en las reglas de negocio de configuración; cada prueba de seguridad se valida rompiendo a propósito el código y viendo que falla.
- Tests: `cd api && npm test`; build `npm run build`; lint `npm run lint` (sin errores nuevos).
- Los pruebas con Mongo en memoria usan `startMongo()` y `mongoTestOptions` de `api/test/mongo-memory.ts`, con `jest.setTimeout(180_000)`.

## Review Focus

- Una ruta con datos que la prueba de aislamiento no recorra (comparar la lista de rutas de los controladores con la tabla de casos: si hay una ruta nueva sin caso, la prueba debe fallar).
- Referencias cruzadas: un movimiento, suscripción, presupuesto o compra de B que apunte a recursos de A no debe crearse, ni siquiera parcialmente (sin saldos ni deudas de A alterados).
- Límite de intentos: la 11.ª petición de login en un minuto da 429; un login correcto no se bloquea por intentos de otra IP; el límite general no rompe a la suite de pruebas (se sube por entorno).
- `ALLOW_REGISTRATION=false`: el registro da 403, el login de usuarios existentes sigue funcionando y no hay filtración del motivo más allá del mensaje genérico.
- `ALLOW_REGISTRATION=false` como cadena en el `.env` se interpreta como `false` (no como "cadena no vacía = true").
- Producción: cada regla falla por separado con un mensaje claro que nombra la variable, sin imprimir su valor; en desarrollo los mismos valores son aceptados.
- Entradas con operadores de Mongo en query y body: nunca 500, nunca datos ajenos.
- El límite de tamaño del body devuelve 413 y no tumba el proceso.

---

### Task 1: `setupApp`, helmet y límite de body

**Files:**
- Create: `api/src/app.setup.ts`, `api/src/app.setup.spec.ts`
- Modify: `api/src/main.ts`, `api/package.json` (dependencia `helmet`)

**Interfaces:**
- Produces: `setupApp(app: NestExpressApplication): void` que aplica prefijo `api`, `ValidationPipe({ whitelist: true, transform: true })`, `AllExceptionsFilter`, CORS con `CORS_ORIGIN`, `helmet()`, `trust proxy` (1 salto) y límite de body JSON de 100 kb; `main.ts` crea la app con `NestFactory.create<NestExpressApplication>(AppModule)` y llama a `setupApp`.

- [ ] **Step 1:** `cd api && npm install helmet`.
- [ ] **Step 2: Test** (`app.setup.spec.ts`, módulo mínimo con un controlador de prueba `GET /ping` y `POST /echo` y un `ConfigService` con `CORS_ORIGIN`): las respuestas llevan `x-content-type-options: nosniff` y `strict-transport-security`, no llevan `x-powered-by`; un POST JSON de 200 kb → 413 y la app sigue respondiendo después; un campo no declarado en el DTO se descarta; la ruta usa el prefijo `/api`; CORS responde `access-control-allow-origin` solo para el origen configurado. Run → FAIL.
- [ ] **Step 3:** Implementar `setupApp` y usarlo en `main.ts`. Run → PASS.
- [ ] **Step 4:** Mutación: quitar `helmet()` y comprobar que falla. Suite, build, lint. Commit `feat(api): shared app setup with helmet and body limit`.

---

### Task 2: Reglas de producción y registro cerrable (TDD)

**Files:**
- Modify: `api/src/config/env.validation.ts`, `api/src/auth/auth.controller.ts`, `api/.env.example`
- Create: `api/src/config/env.validation.spec.ts` (ampliar si ya existe), `api/src/auth/registration.spec.ts`

**Interfaces:**
- Produces: `EnvironmentVariables` con `NODE_ENV?: string`, `ALLOW_REGISTRATION: boolean` (por defecto `true`; `'false'`/`false` → `false`, cualquier otra cosa → `true`), `RATE_LIMIT: number = 100`, `AUTH_RATE_LIMIT: number = 10`; `assertProductionSafe(env: Record<string, unknown>): void` (lanza `Error` con mensaje que nombra la variable y nunca incluye su valor) llamada desde `validateEnv` cuando `NODE_ENV === 'production'`; `POST /auth/register` lanza `ForbiddenException('Registration is closed')` si `ALLOW_REGISTRATION` es `false`.

- [ ] **Step 1: Tests de configuración:** desarrollo con `JWT_SECRET` de 16 caracteres y `CORS_ORIGIN` localhost → válido; producción con cada violación por separado (`JWT_SECRET` de 31 caracteres; `JWT_SECRET` que empieza por `change-me`; `NODE_TLS_REJECT_UNAUTHORIZED=0`; `CORS_ORIGIN` ausente, `*`, `http://app.example.com`, `https://localhost:5173`) → lanza un error cuyo mensaje contiene el nombre de la variable y NO contiene el valor; producción con valores seguros → válido; `ALLOW_REGISTRATION` `'false'` → `false`, `'true'`/ausente → `true`, `'0'`/`'no'` → `true` (solo `'false'` cierra); `RATE_LIMIT` y `AUTH_RATE_LIMIT` se convierten a número y rechazan valores < 1. Run → FAIL.
- [ ] **Step 2:** Implementar. Run → PASS.
- [ ] **Step 3: Test de registro** (Nest testing module con `AuthController` y un `AuthService` falso, o integración con el arnés de Task 4 si ya existe): con `ALLOW_REGISTRATION=false` → 403 y `AuthService.register` no se llama; con `true` → llama al servicio; el login no se ve afectado. Run → FAIL; implementar; PASS.
- [ ] **Step 4:** Documentar las variables en `.env.example` (`NODE_ENV`, `ALLOW_REGISTRATION=true`, `RATE_LIMIT=100`, `AUTH_RATE_LIMIT=10`). Mutación: quitar una regla de producción y comprobar el fallo. Suite, build, lint. Commit `feat(api): production config checks and closable registration`.

---

### Task 3: Límite de intentos

**Files:**
- Create: `api/src/security/security.module.ts`, `api/src/security/rate-limit.spec.ts`
- Modify: `api/src/auth/auth.controller.ts` (`@Throttle` en `login` y `register`), `api/package.json` (`@nestjs/throttler`)

**Interfaces:**
- Consumes: `RATE_LIMIT`, `AUTH_RATE_LIMIT` de Task 2.
- Produces: `SecurityModule` (`ThrottlerModule.forRootAsync` con dos límites de 60 s: `default` = `RATE_LIMIT` y `auth` = `AUTH_RATE_LIMIT`, y `ThrottlerGuard` como `APP_GUARD`); `login` y `register` usan el límite `auth`.

- [ ] **Step 1:** `cd api && npm install @nestjs/throttler`.
- [ ] **Step 2: Test** (módulo de prueba con `SecurityModule`, `AuthController` y `AuthService` falso, `AUTH_RATE_LIMIT=3`, `RATE_LIMIT=1000`): la 4.ª petición a `/auth/login` en el minuto → 429 con cabecera `retry-after`; `/auth/register` comparte el contador `auth` y también limita; un endpoint normal no se ve afectado por los intentos de login; peticiones con distinta IP (cabecera `X-Forwarded-For` con `trust proxy` activo vía `setupApp`) tienen contadores separados. Run → FAIL.
- [ ] **Step 3:** Implementar y registrar `SecurityModule`. Run → PASS.
- [ ] **Step 4:** Mutación: quitar `@Throttle` de `login`. Suite, build, lint. Commit `feat(api): rate limiting for auth and general traffic`.

---

### Task 4: Arnés de pruebas y prueba de aislamiento

**Files:**
- Create: `api/src/app.modules.ts`, `api/test/app-harness.ts`, `api/src/security/isolation.spec.ts`
- Modify: `api/src/app.module.ts` (usa `FEATURE_MODULES`; incluir `SecurityModule`)

**Interfaces:**
- Produces:
  - `FEATURE_MODULES`: arreglo con todos los módulos de dominio (Health, Users, Categories, Accounts, Transactions, CreditCards, InstallmentPurchases, Subscriptions, Budgets, Reports, Auth, Security).
  - `bootApp(env?: Record<string, string>): Promise<{ app: NestExpressApplication; http: () => supertest.Agent; stop: () => Promise<void> }>`: arranca Mongo en memoria con `startMongo()`, un módulo raíz con `ConfigModule` (con `validate: validateEnv`, variables de prueba: `JWT_SECRET` de 32+ caracteres, `RATE_LIMIT=100000`, más `env`), `MongooseModule.forRootAsync` con `mongoTestOptions` y `FEATURE_MODULES`; aplica `setupApp`; `stop()` cierra app y Mongo.
  - Ayudantes de la prueba: `register(http, email)` → `{ token, user }`; `as(token)` agrega `Authorization`.

- [ ] **Step 1:** Extraer `FEATURE_MODULES` y escribir el arnés; comprobar con un test mínimo que `GET /api/health` y un registro + `GET /api/auth/me` funcionan.
- [ ] **Step 2: Prueba de aislamiento** (`isolation.spec.ts`): A crea cuenta (con saldo), categorías de gasto e ingreso (con subcategoría), tarjeta, movimientos (gasto con cuenta, gasto con tarjeta, ingreso, transferencia, pago de tarjeta), compra a cuotas, suscripción y presupuesto; se anotan los saldos, deuda y conteos de A. Con B:
  - **Por id:** `GET/PATCH/DELETE` de cuenta, categoría, tarjeta, movimiento, compra, suscripción y presupuesto; `POST` de subcategoría, `PATCH`/`DELETE` de subcategoría de A, `GET /credit-cards/:id/statement`, `POST /installment-purchases/:id/pay` → todos 404.
  - **Listados y reportes de B:** vacíos o en cero (cuentas, categorías propias por defecto solo las suyas, movimientos con `total: 0`, tarjetas, compras, suscripciones, `upcoming`, presupuestos, `projection`, y los cinco reportes).
  - **Referencias cruzadas:** `POST /transactions` (gasto con la cuenta de A, con la tarjeta de A, categoría de A; transferencia hacia la cuenta de A), `POST /subscriptions`, `POST /budgets`, `POST /budgets/copy` entre meses con presupuestos de A, `POST /installment-purchases` con tarjeta y categoría de A, y `POST /installment-purchases/:id/pay` con la cuenta de A y una compra de B → 404 o 400, nunca 2xx.
  - **`POST /subscriptions/process-due` de B** → `charged: 0` y los datos de A sin cambios.
  - **Al final** se vuelven a leer los datos de A: mismos saldos, deuda, conteos y campos que antes.
  - **Cobertura de rutas:** la prueba construye la lista de rutas a partir de los controladores registrados (`app.getHttpServer()._events.request._router` o el `DiscoveryService`/`RouterExplorer`; el implementador elige el mecanismo) y falla si alguna ruta (salvo `health`, `auth/register`, `auth/login` y `auth/me`) no está en la tabla de casos.
- [ ] **Step 3:** Run; todo debe pasar. Cualquier fallo es un bug real: escribir un test mínimo que lo reproduzca, corregir el servicio y repetir.
- [ ] **Step 4:** Mutación: quitar el filtro por `userId` de una consulta de un servicio (p. ej. `AccountsService.findOne`) y de otra de un reporte, comprobar que la prueba falla; restaurar. Suite, build, lint. Commit `test(api): cross-user isolation across every endpoint`.

---

### Task 5: Entradas hostiles

**Files:**
- Create: `api/src/security/hostile-input.spec.ts`

**Interfaces:**
- Consumes: `bootApp` de Task 4.

- [ ] **Step 1: Test:** con un usuario A que tiene datos y un usuario B, enviar con el token de B y comprobar `status < 500` y que ningún cuerpo 2xx contiene datos de A: `GET /categories?type[$ne]=expense`, `GET /accounts?includeArchived[]=true`, `GET /transactions?accountId[$ne]=x`, `?categoryId[$gt]=`, `?type[$regex]=.`, `?from[$gt]=`, `?page[$ne]=1`, `GET /budgets?month[$ne]=x`, `GET /reports/summary?month[$gt]=`, `GET /reports/spending-by-category?from[$ne]=x`, `GET /subscriptions/upcoming?days[$gt]=1`; cuerpos: `POST /auth/login` con `{ "email": { "$ne": null }, "password": { "$ne": null } }` → 400/401; `POST /transactions` con `accountId: { "$ne": null }`; `PATCH` con `{ "$set": {...} }`; ids con formato inválido (`/accounts/not-an-id`) → 400 o 404, nunca 500.
- [ ] **Step 2:** Run. Si hay algún 500 o filtración, es un bug: test mínimo que lo reproduzca, corregir y repetir.
- [ ] **Step 3:** Mutación: quitar un `@IsMongoId()` de un DTO de consulta y comprobar que algún caso falla (o documentar por qué otra capa lo cubre). Suite, build, lint. Commit `test(api): hostile query and body inputs`.

---

### Task 6: Secretos en el historial y dependencias

**Files:**
- Modify: según los hallazgos (`package.json`/lockfiles); los resultados se anotan en Task 7.

- [ ] **Step 1: Secretos.** Buscar en todo el historial (`git log --all -p`) cadenas con forma de secreto: `mongodb+srv://` con usuario y contraseña (distintas del marcador `<user>:<password>`), `JWT_SECRET=` con valor distinto de `change-me…`, claves privadas (`BEGIN .* PRIVATE KEY`), tokens (`ghp_`, `sk-`, `AKIA`); comprobar que ningún `.env` fue versionado alguna vez (`git log --all --diff-filter=A --name-only | grep -i "\.env$"`) y que `.gitignore` los cubre. NO imprimir valores: reportar solo archivo, commit y tipo.
- [ ] **Step 2: Dependencias.** `cd api && npm audit --omit=dev` y `cd web && npm audit --omit=dev`; para cada vulnerabilidad alta o crítica: actualizar con `npm audit fix` cuando no rompa nada (verificando tests y build) o documentar la razón de aceptarla (por ejemplo, solo afecta a herramientas de desarrollo).
- [ ] **Step 3:** Si hubo cambios de dependencias: suites y builds completos. Commit `chore: dependency audit fixes` (solo si hay cambios).

---

### Task 7: Informe y cierre

**Files:**
- Create: `docs/SECURITY.md`
- Modify: `docs/PLAN.md`

- [ ] **Step 1:** Escribir `docs/SECURITY.md`: tabla "control → evidencia → resultado" (aislamiento, entradas hostiles, hash de contraseñas, límite de intentos, helmet, configuración de producción, registro cerrable, secretos en git, `npm audit`), hallazgos corregidos (con la prueba que los cubre) y riesgos aceptados (token en `localStorage`, JWT de 7 días sin revocación ni refresh, sin 2FA ni recuperación de contraseña, `JwtStrategy` no comprueba que el usuario exista, acceso de red de Atlas abierto cuando se despliegue), y qué hacer ante una sospecha de filtración (rotar `JWT_SECRET` y la contraseña de Atlas).
- [ ] **Step 2:** `cd api && npm test && npm run build && npm run lint`; `cd web && npm test && npm run build`.
- [ ] **Step 3:** En `docs/PLAN.md` marcar `Revisión de seguridad`. Commit `feat: security review and hardening (phase 11a)`.
