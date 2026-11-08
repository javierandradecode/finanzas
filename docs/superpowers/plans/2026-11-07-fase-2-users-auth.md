# Fase 2 — Usuarios y autenticación: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registro, login y `/me` con JWT, guard global con `@Public()`, `@CurrentUser()` y categorías por defecto creadas en la misma transacción que el usuario.

**Architecture:** Tres módulos Nest: `users` (schema + service), `categories` (schema mínimo + `createDefaults`), `auth` (service, controller, estrategia JWT, guard global vía `APP_GUARD`). `AuthService.register` usa `connection.transaction()` para crear usuario + categorías atómicamente.

**Tech Stack:** `@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-jwt`, `bcrypt`, Mongoose, class-validator, Jest.

**Spec:** `docs/superpowers/specs/2026-11-07-fase-2-users-auth-design.md`

## Global Constraints

- Todo en `api/`; código en inglés; un módulo Nest por dominio; controllers delgados; DTOs con `class-validator`.
- Contraseña mínimo 8 caracteres, `bcrypt` 10 rounds. Email: `trim().toLowerCase()`.
- JWT: payload `{ sub: userId, email }`, expira según `JWT_EXPIRES_IN` (default `7d`), header `Authorization: Bearer`.
- Login fallido: siempre `401` con mensaje `Invalid credentials`. Email duplicado: `409`.
- `passwordHash` nunca aparece en una respuesta.
- Registro = usuario + categorías en **una transacción** de MongoDB.
- Categorías por defecto — gastos: Alimentación, Transporte, Vivienda, Servicios, Salud, Educación, Entretenimiento, Ropa, Suscripciones, Otros gastos; ingresos: Salario, Ventas, Inversiones, Otros ingresos. Campos: `type`, `name`, `icon`, `color`.
- TDD solo en `AuthService`; el resto se verifica con `api/requests/auth.http`.
- Fuera de alcance: refresh tokens, cookies, CRUD de categorías, roles, rate limiting.
- Commits terminan con `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- Login con email inexistente vs contraseña errónea → mismo `401` y mismo mensaje (test en T3).
- Email con mayúsculas/espacios (`" Ana@X.com "`) → se normaliza; registrar otra vez `ana@x.com` → `409` (test en T3).
- Falla la creación de categorías → no queda el usuario huérfano (la transacción hace rollback; manual en T4 con `.http` no aplica, se cubre con test de T3 que verifica que el error propaga).
- Token manipulado, expirado o ausente → `401` en rutas protegidas (manual en T4).
- Body de registro con campos extra o `password` corta → `400`, y `passwordHash`/`password` no se devuelven (manual en T4).

---

### Task 1: Dependencias, entorno y módulo `users`

**Files:**
- Create: `api/src/users/schemas/user.schema.ts`, `api/src/users/users.service.ts`, `api/src/users/users.module.ts`
- Modify: `api/src/config/env.validation.ts`, `api/.env.example`, `api/.env` (añadir `JWT_EXPIRES_IN=7d`), `api/src/app.module.ts`

**Interfaces:** Produces:
- `User` schema: `email` (unique, lowercase, trim), `passwordHash`, `name`, `currency` (default `'USD'`), `timestamps: true`; tipo `UserDocument`.
- `UsersService.create(data: { email: string; passwordHash: string; name: string }, session?: ClientSession): Promise<UserDocument>`
- `UsersService.findByEmail(email: string): Promise<UserDocument | null>`
- `UsersService.findById(id: string): Promise<UserDocument | null>`
- `EnvironmentVariables.JWT_EXPIRES_IN: string` (default `'7d'`).

- [ ] **Step 1:** `cd api; npm i @nestjs/jwt @nestjs/passport passport passport-jwt bcrypt; npm i -D @types/passport-jwt @types/bcrypt`.
- [ ] **Step 2:** Añadir `JWT_EXPIRES_IN` (opcional, string, default `7d`) a `EnvironmentVariables`, `.env.example` y `.env`.
- [ ] **Step 3:** Implementar schema, `UsersService` (la sesión se pasa a `new this.model(...).save({ session })`), `UsersModule` (exporta `UsersService`); importarlo en `AppModule`.
- [ ] **Step 4:** Run: `npm run build; npm run lint`. Expected: sin errores.
- [ ] **Step 5:** Commit `feat(users): user schema and service`.

> **Aprendizaje:** `@Schema()`/`@Prop()` ≈ migración + `$fillable` de un Model Eloquent; `unique: true` crea un índice en Mongo (no hay migraciones).

### Task 2: Módulo `categories` mínimo

**Files:**
- Create: `api/src/categories/schemas/category.schema.ts`, `api/src/categories/default-categories.ts`, `api/src/categories/categories.service.ts`, `api/src/categories/categories.module.ts`
- Modify: `api/src/app.module.ts`

**Interfaces:** Produces:
- `Category` schema: `userId` (ObjectId, index), `type: 'income' | 'expense'`, `name`, `icon`, `color`, `timestamps`.
- `DEFAULT_CATEGORIES: ReadonlyArray<{ type: 'income' | 'expense'; name: string; icon: string; color: string }>` — 10 gastos + 4 ingresos exactos de Global Constraints.
- `CategoriesService.createDefaults(userId: Types.ObjectId, session?: ClientSession): Promise<void>` — `insertMany` con `{ session }`.

- [ ] **Step 1:** Implementar schema, constante, service y módulo (exporta `CategoriesService`); registrar en `AppModule`.
- [ ] **Step 2:** Run: `npm run build; npm run lint`. Expected: sin errores.
- [ ] **Step 3:** Commit `feat(categories): minimal schema and default categories`.

### Task 3: `AuthService` (TDD)

**Files:**
- Create: `api/src/auth/auth.service.ts`, `api/src/auth/auth.service.spec.ts`, `api/src/auth/dto/register.dto.ts`, `api/src/auth/dto/login.dto.ts`, `api/src/auth/auth.types.ts`

**Interfaces:**
- Consumes: `UsersService` (T1), `CategoriesService.createDefaults` (T2), `JwtService.sign`, `Connection.transaction`.
- Produces:
  - `RegisterDto { email: string (@IsEmail); password: string (@MinLength(8)); name: string (@IsNotEmpty) }`, `LoginDto { email; password }`.
  - `AuthResponse = { accessToken: string; user: { id: string; email: string; name: string; currency: string } }`; `JwtPayload = { sub: string; email: string }`; `AuthUser = { userId: string; email: string }` (en `auth.types.ts`).
  - `AuthService.register(dto: RegisterDto): Promise<AuthResponse>` y `AuthService.login(dto: LoginDto): Promise<AuthResponse>`.

- [ ] **Step 1: Tests que fallan** en `auth.service.spec.ts`, con `UsersService`, `CategoriesService`, `JwtService` y `Connection` como mocks (`connection.transaction = (fn) => fn(fakeSession)`):
  - `register` normaliza `" Ana@X.com "` → `findByEmail`/`create` reciben `ana@x.com`.
  - `register` guarda un hash bcrypt (`create` recibe `passwordHash` que no es la contraseña y `bcrypt.compare` lo valida) y llama `createDefaults(user._id, fakeSession)` con la misma sesión que `create`.
  - `register` con `findByEmail` devolviendo usuario → rechaza con `ConflictException`.
  - `register` con `createDefaults` que lanza → la promesa rechaza con ese error.
  - La respuesta de `register` y `login` no contiene `passwordHash` ni `password` (`JSON.stringify` no los incluye) y trae `accessToken` y `user.id/email/name/currency`.
  - `login` correcto firma el token con `{ sub, email }`.
  - `login` con email inexistente y con contraseña errónea → ambos rechazan con `UnauthorizedException` y mensaje `Invalid credentials`.
- [ ] **Step 2:** Run: `cd api; npx jest src/auth`. Expected: FAIL (módulo no existe).
- [ ] **Step 3:** Implementar DTOs, tipos y `AuthService`; `register` dentro de `connection.transaction`, hash con `bcrypt.hash(password, 10)`; traducir error Mongo `code === 11000` a `ConflictException`; `login` compara con `bcrypt.compare` y usa el mismo error para ambos fallos (si el usuario no existe, comparar igualmente contra un hash fijo para no revelar por tiempo).
- [ ] **Step 4:** Run: `npx jest src/auth`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(auth): auth service with register and login`.

> **Aprendizaje:** `bcrypt` ≈ `Hash::make()`/`Hash::check()` de Laravel. `JwtService` ≈ el paquete `tymon/jwt-auth`.

### Task 4: Guard global, controller y verificación

**Files:**
- Create: `api/src/auth/auth.module.ts`, `api/src/auth/auth.controller.ts`, `api/src/auth/jwt.strategy.ts`, `api/src/auth/jwt-auth.guard.ts`, `api/src/auth/decorators/public.decorator.ts`, `api/src/auth/decorators/current-user.decorator.ts`, `api/requests/auth.http`
- Modify: `api/src/app.module.ts`, `api/src/health/health.controller.ts` (marcar `@Public()`), `docs/PLAN.md`

**Interfaces:**
- Consumes: `AuthService` (T3), `UsersService.findById` (T1), `ConfigService` (`JWT_SECRET`, `JWT_EXPIRES_IN`).
- Produces: `@Public()` (metadata `IS_PUBLIC_KEY`); `JwtAuthGuard extends AuthGuard('jwt')` que respeta `@Public()`, registrado con `APP_GUARD`; `JwtStrategy.validate(payload: JwtPayload): AuthUser`; `@CurrentUser(): AuthUser`; rutas `POST /auth/register`, `POST /auth/login` (públicas) y `GET /auth/me` (devuelve el usuario sin `passwordHash`).

- [ ] **Step 1:** Implementar decoradores, estrategia (`ExtractJwt.fromAuthHeaderAsBearerToken`, `secretOrKey` desde `ConfigService`), guard y `AuthModule` (`JwtModule.registerAsync` con secret y `expiresIn`; `APP_GUARD`); controller delgado; marcar `register`, `login` y `HealthController.check` con `@Public()`; importar `AuthModule` en `AppModule`.
- [ ] **Step 2:** Crear `api/requests/auth.http` con: register, login, `/me` con token, `/me` sin token, register duplicado, register con password corta y campo extra.
- [ ] **Step 3:** Run: `cd api; npm run build; npm test; npm run lint`. Expected: sin errores, tests de dinero y auth en verde.
- [ ] **Step 4:** Verificación manual con Atlas (`npm run start:dev`, usando curl o el `.http`): register → 201 con `accessToken` y sin `passwordHash`; login → 200; `/me` con token → 200; `/me` sin token y con token alterado → 401; register repetido (también con otras mayúsculas) → 409; password corta → 400; `/api/health` sigue público (200). Comprobar con Compass que el usuario tiene 14 categorías. Expected: todos los resultados anteriores.
- [ ] **Step 5:** Marcar los 4 ítems de la Fase 2 en `docs/PLAN.md` y commit `feat(auth): jwt guard, register/login/me (phase 2)`.

> **Aprendizaje:** el guard global ≈ middleware `auth` aplicado a todo el grupo de rutas; `@Public()` es la excepción, como sacar rutas del grupo. `@CurrentUser()` ≈ `$request->user()`.

---

## Self-review

- **Cobertura del diseño:** users → T1; categorías por defecto → T2; register/login/me, transacción, errores → T3/T4; guard global, `@Public`, `@CurrentUser`, `.http` → T4; `JWT_EXPIRES_IN` → T1; verificación en Atlas → T4.
- **Consistencia:** `AuthResponse`, `JwtPayload`, `AuthUser` definidos en T3 y usados en T4; `createDefaults(userId, session)` y `create(data, session)` coinciden con T3.
- **Proporción:** 4 tareas; solo T3 lleva tests, según el diseño.
