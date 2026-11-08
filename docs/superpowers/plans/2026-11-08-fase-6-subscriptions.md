# Fase 6 — Suscripciones: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Suscripciones recurrentes que generan solas, cada día, los gastos vencidos con saldos/deuda consistentes, más el endpoint de próximos vencimientos.

**Architecture:** Cálculo de fechas recurrentes como funciones puras (`recurrence.ts`). `SubscriptionsService` (CRUD y próximos vencimientos), `SubscriptionsProcessor.processDue(now, opts)` (lógica de cobro, una transacción por vencimiento, reclamo con condición) y `SubscriptionsScheduler` (solo el `@Cron` que delega). Los gastos se crean con `TransactionsService.createWithin`.

**Tech Stack:** NestJS 11, `@nestjs/schedule`, Mongoose 9 (sesiones), class-validator, Jest, `mongodb-memory-server` (`api/test/mongo-memory.ts`, usar `mongoTestOptions`).

**Spec:** `docs/superpowers/specs/2026-11-08-fase-6-subscriptions-design.md`

## Global Constraints

- Todo en `api/`; código en inglés; controllers delgados; DTOs con `class-validator`; `ValidationPipe` global `whitelist: true`.
- Dinero en centavos enteros; fechas en UTC; fechas "de día" = medianoche UTC.
- Toda consulta filtra por `userId`; ajeno → `404`; id inválido → `400` (`ParseObjectIdPipe`); campos de id con `@Prop({ type: MongooseSchema.Types.ObjectId })` y registrados en `schema-id-types.spec.ts`.
- Pagador: exactamente uno de `accountId`/`creditCardId`. Referencias archivadas → `409`; ajenas → `404`; categoría que no es de gasto → `400`.
- Cada vencimiento = una `connection.transaction`; el avance de `nextDate` se hace con `findOneAndUpdate` condicionado al `nextDate` esperado.
- Tope de 366 vencimientos por suscripción y ejecución.
- Frecuencias: `weekly | monthly | quarterly | semiannual | yearly`; día de cobro = `anchorDay` (ajustado a fin de mes).
- Actualizar documentos con `Object.assign(doc, definedOnly(dto))` cuando aplique (los DTO traen claves `undefined`).
- Cron: `'5 0 * * *'` con `timeZone: 'UTC'`.
- TDD en la recurrencia y el procesador; el resto con tests de integración y verificación manual contra Atlas.
- Fuera de alcance: recordatorios, próximos pagos de tarjetas, montos variables.
- Commits terminan con `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- Fin de mes y año bisiesto en cada frecuencia: 31 → 28/30 → 31, 29 feb (T1).
- Ejecutar dos veces, o dos procesos a la vez → ningún cobro duplicado (T3).
- Meses de atraso → todos los cobros con su fecha original, nunca solo el último (T3).
- Falla de un cobro → `nextDate` intacto, `lastError` guardado, y la siguiente ejecución se recupera; un fallo a mitad de varios atrasos conserva los ya cobrados (T3).
- Reactivar una pausada no cobra el periodo pausado (T2).
- Pagador mal formado, ajeno o archivado → error claro y sin cambios (T2).
- `process-due` de un usuario no toca las suscripciones de otro (T3).
- El `@Cron` queda registrado con la expresión correcta (T4).

---

### Task 1: Recurrencia (TDD)

**Files:**
- Create: `api/src/subscriptions/recurrence.ts`, `api/src/subscriptions/recurrence.spec.ts`

**Interfaces:** Produces (puras, fechas = medianoche UTC; reutiliza `clampDay` de `credit-cards/billing-dates`):
- `type Frequency = 'weekly' | 'monthly' | 'quarterly' | 'semiannual' | 'yearly'`; `const FREQUENCIES: readonly Frequency[]`
- `nextOccurrence(current: Date, frequency: Frequency, anchorDay: number): Date` — semanal suma 7 días; las demás suman 1, 3, 6 o 12 meses y usan `anchorDay` ajustado al último día del mes.
- `firstOnOrAfter(from: Date, current: Date, frequency: Frequency, anchorDay: number): Date` — `current` si ya es ≥ `from`; si no, avanza con `nextOccurrence`.
- `occurrencesUntil(first: Date, until: Date, frequency: Frequency, anchorDay: number, cap?: number): Date[]` — `first` y las siguientes mientras sean ≤ `until` (cap por defecto 1000).
- `startOfUtcDay(date: Date): Date`

- [ ] **Step 1: Tests que fallan** — mensual ancla 31: `2026-01-31 → 2026-02-28 → 2026-03-31 → 2026-04-30`; mensual `2026-12-15 → 2027-01-15`; semanal `2026-03-01 → 2026-03-08` y `2026-12-28 → 2027-01-04`; trimestral ancla 30 `2026-11-30 → 2027-02-28`; semestral ancla 31 `2026-08-31 → 2027-02-28`; anual ancla 29 `2024-02-29 → 2025-02-28`, desde `2027-02-28 → 2028-02-29`; anual `2026-03-15 → 2027-03-15`. `firstOnOrAfter(2026-03-10, 2026-01-31, monthly, 31)` → `2026-03-31`; con `current` ≥ `from` devuelve `current`. `occurrencesUntil(2026-03-05, 2026-06-10, monthly, 5)` → `03-05, 04-05, 05-05, 06-05`; `until` anterior a `first` → `[]`; el `cap` limita la cantidad. `startOfUtcDay(2026-03-05T15:30Z)` → `2026-03-05T00:00Z`.
- [ ] **Step 2:** Run: `cd api; npx jest src/subscriptions/recurrence`. Expected: FAIL (módulo no existe).
- [ ] **Step 3:** Implementar con `Date.UTC`.
- [ ] **Step 4:** Run: `npx jest src/subscriptions/recurrence`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(subscriptions): recurrence helpers`.

### Task 2: Suscripciones — CRUD y próximos vencimientos

**Files:**
- Create: `api/src/subscriptions/schemas/subscription.schema.ts`, `api/src/subscriptions/dto/create-subscription.dto.ts`, `api/src/subscriptions/dto/update-subscription.dto.ts`, `api/src/subscriptions/dto/upcoming.query.ts`, `api/src/subscriptions/subscriptions.service.ts`, `api/src/subscriptions/subscriptions.service.spec.ts`
- Modify: `api/src/transactions/schemas/transaction.schema.ts`, `api/src/transactions/transactions.service.ts`, `api/src/common/schema-id-types.spec.ts`

**Interfaces:**
- Consumes: T1; `AccountsService.findOne`, `CreditCardsService.findOne`, `CategoriesService.findOne`; `ParseObjectIdPipe`, `definedOnly`.
- Produces:
  - Schema `Subscription`: campos del diseño; índice `{ userId: 1, active: 1, nextDate: 1 }`. Transaction gana `subscriptionId?` (ObjectId) y `CreateTransactionInput` gana `subscriptionId?: string`; `TransactionsService.assertReferences(userId: string, after: TxShape, before: TxShape | null): Promise<void>` pasa de `private` a público.
  - `CreateSubscriptionDto { name; amountCents (@IsInt @Min(1)); frequency (@IsIn(FREQUENCIES)); nextDate: Date; accountId?; creditCardId?; categoryId; subcategoryId? }`; `UpdateSubscriptionDto` (todos opcionales; `accountId`, `creditCardId`, `subcategoryId` aceptan `null`; incluye `active`); `UpcomingQuery { days: number = 30 (1–365) }`.
  - `SubscriptionsService.create(userId: string, dto): Promise<SubscriptionDocument>`, `.findAll(userId: string)`, `.findOne(userId: string, id: string)`, `.update(userId: string, id: string, dto, now?: Date)`, `.pause(userId: string, id: string): Promise<void>`, `.upcoming(userId: string, days: number, now?: Date): Promise<UpcomingCharge[]>` con `UpcomingCharge = { subscriptionId: string; name: string; amountCents: number; date: Date; overdue: boolean; frequency: Frequency; accountId?: string; creditCardId?: string; categoryId: string }`.

- [ ] **Step 1: Tests que fallan** (integración con réplica en memoria; usuarios u1/u2, cuenta A, tarjeta K, categorías de gasto/ingreso, cuenta/tarjeta/categoría archivadas y ajenas):
  - `create`: normaliza `nextDate` `2026-03-31T15:00:00Z` a medianoche UTC y guarda `anchorDay 31`, `active true`.
  - Pagador: ambos o ninguno → `BadRequestException`; cuenta/tarjeta ajena → `NotFoundException`; archivada → `ConflictException`; categoría de ingreso → `BadRequestException`; categoría ajena → `NotFoundException`.
  - DTO por `ValidationPipe`: rechaza `amountCents` 0 y 10.5, `frequency` inválida y `days` 0/366.
  - `update`: cambia nombre y monto; cambiar `nextDate` recalcula `anchorDay`; cambiar de cuenta a tarjeta (`accountId: null, creditCardId: K`); una instancia de DTO con solo `name` (claves `undefined`) no pisa los demás campos; pagador inválido tras la fusión → `BadRequestException`.
  - `pause` pone `active: false` sin borrar. Reactivar con `nextDate` pasado (`now = 2026-06-20`, mensual, `nextDate 2026-03-15`) salta a `2026-07-15`, limpia `lastError`/`lastErrorAt` y no crea movimientos; con `nextDate` futuro no lo cambia.
  - `findAll`/`findOne`/`update`/`pause` de otro usuario → vacío / `NotFoundException`.
  - `upcoming` (`now = 2026-03-20`, `days: 30`): mensual `nextDate 2026-04-05` → 1 cobro `2026-04-05`; semanal desde `2026-03-23` → 5 cobros (23, 30 mar, 6, 13, 20 abr); suscripción con `nextDate 2026-03-10` sin procesar → aparece `overdue: true` primero; pausada y de otro usuario no aparecen; orden por fecha y luego nombre.
- [ ] **Step 2:** Run: `npx jest src/subscriptions/subscriptions.service --forceExit`. Expected: FAIL.
- [ ] **Step 3:** Implementar schema, DTOs y service. El pagador se valida armando un `TxShape` de gasto con `assertValidShape` + `TransactionsService.assertReferences`. Añadir `subscriptions` a `schema-id-types.spec.ts` (`userId`, `accountId`, `creditCardId`, `categoryId`, `subcategoryId`) y `subscriptionId` a la lista de Transaction.
- [ ] **Step 4:** Run: `npx jest src/subscriptions src/common src/transactions --forceExit`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(subscriptions): CRUD and upcoming charges`.

### Task 3: Procesador de cobros (TDD)

**Files:**
- Create: `api/src/subscriptions/subscription-processor.service.ts`, `api/src/subscriptions/subscription-processor.service.spec.ts`

**Interfaces:**
- Consumes: T1, T2 (`Subscription` schema), `TransactionsService.createWithin` (Fase 5).
- Produces: `SubscriptionsProcessor.processDue(now: Date, opts?: { userId?: string }): Promise<ProcessSummary>` con `ProcessSummary = { charged: number; failed: Array<{ subscriptionId: string; name: string; error: string }> }`. Cada vencimiento: transacción con `findOneAndUpdate({ _id, userId, active: true, nextDate: occurrence }, { $set: { nextDate: next }, $unset: { lastError: '', lastErrorAt: '' } })` y `createWithin({ type: 'expense', amountCents, date: occurrence, accountId | creditCardId, categoryId, subcategoryId, note: name, source: 'subscription', subscriptionId })`. Si el reclamo no coincide → detenerse sin error. Si falla → `updateOne` fuera de la transacción con `lastError` (mensaje) y `lastErrorAt`, agregar a `failed` y pasar a la siguiente suscripción.

- [ ] **Step 1: Tests que fallan** (integración, mismo montaje que T2; cuenta A con saldo 100000, tarjeta K):
  - Una suscripción mensual de 1500 con `nextDate 2026-03-15`, `now 2026-03-15T10:00Z` → 1 gasto (`source subscription`, `subscriptionId`, `date 2026-03-15T00:00Z`, `note` = nombre, monto 1500, `categoryId`), saldo de A −1500, `nextDate 2026-04-15`, `charged 1`.
  - No vencida (`nextDate` mañana) y pausada → `charged 0` y sin movimientos.
  - Atraso de varios meses (`nextDate 2026-01-15`, `now 2026-04-20`) → 4 gastos con fechas `01-15, 02-15, 03-15, 04-15`, saldo −4×monto, `nextDate 2026-05-15`; semanal con 2 semanas de atraso → 3 cobros.
  - Ancla 31 mensual desde `2026-01-31`, `now 2026-04-30` → fechas `01-31, 02-28, 03-31, 04-30`.
  - Idempotencia: ejecutar dos veces seguidas → la segunda `charged 0` y sin movimientos nuevos.
  - Concurrencia: `Promise.all` de dos `processDue` sobre la misma suscripción con 3 vencimientos pendientes → exactamente 3 gastos, fechas distintas, saldo exacto.
  - Tarjeta como pagador → `debtCents` sube y el saldo de cuentas no cambia.
  - Cuenta archivada → `charged 0`, `failed` con la suscripción, `nextDate` intacto, sin movimientos, `lastError` y `lastErrorAt` guardados; tras desarchivar la cuenta, la siguiente ejecución cobra y limpia `lastError`.
  - Fallo a mitad (`jest.spyOn(transactions, 'createWithin')`: primera llamada real, segunda rechaza) con 3 vencimientos → 1 cobro persistido, `nextDate` avanzó solo uno, `failed` con 1 entrada y `lastError`; la siguiente ejecución completa los 2 restantes.
  - Una suscripción que falla no impide procesar otra del mismo usuario.
  - `processDue(now, { userId: u1 })` no toca las suscripciones de u2; sin `userId` procesa las de ambos.
  - Tope: con `nextDate` 400 días atrás y frecuencia semanal se generan como máximo 366 cobros en esa ejecución (usar una constante exportada `MAX_CATCH_UP`).
- [ ] **Step 2:** Run: `npx jest src/subscriptions/subscription-processor --forceExit`. Expected: FAIL.
- [ ] **Step 3:** Implementar el procesador: consulta de vencidas (`active: true`, `nextDate <= startOfUtcDay(now)`, `userId` opcional), bucle por suscripción hasta `MAX_CATCH_UP`, estado local de `nextDate` entre vencimientos.
- [ ] **Step 4:** Run: `npx jest src/subscriptions --forceExit`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(subscriptions): due charges processor`.

> **Aprendizaje:** separar `processDue` del `@Cron` es como probar un *Job* de Laravel llamando a `handle()` directamente, sin esperar al scheduler.

### Task 4: Scheduler, controller, módulo y cierre

**Files:**
- Create: `api/src/subscriptions/subscriptions.scheduler.ts`, `api/src/subscriptions/subscriptions.scheduler.spec.ts`, `api/src/subscriptions/subscriptions.controller.ts`, `api/src/subscriptions/subscriptions.module.ts`, `api/requests/subscriptions.http`
- Modify: `api/src/app.module.ts`, `api/package.json` (dependencia `@nestjs/schedule`; si Jest no puede cargarla, añadirla a `transformIgnorePatterns` como `@nestjs/jwt`), `docs/PLAN.md`

**Interfaces:**
- Consumes: T2, T3.
- Produces: `SubscriptionsScheduler.handleCron(): Promise<void>` con `@Cron('5 0 * * *', { timeZone: 'UTC' })` — llama `processDue(new Date())`, registra con `Logger` un resumen (cobrados/fallidos) y **no relanza** errores. Rutas: `GET /subscriptions`, `GET /subscriptions/upcoming?days=`, `POST /subscriptions/process-due` (200, devuelve `ProcessSummary` del usuario autenticado), `POST /subscriptions` (201), `GET/PATCH/DELETE /subscriptions/:id` (`DELETE` 204 pausa). `upcoming` y `process-due` declarados **antes** de `:id`. `ScheduleModule.forRoot()` en `AppModule`.

- [ ] **Step 1:** `cd api; npm i @nestjs/schedule`.
- [ ] **Step 2: Tests que fallan** (`subscriptions.scheduler.spec.ts`): con un procesador simulado, `handleCron()` llama `processDue` una vez con una `Date` cercana a ahora y sin `userId`; si `processDue` rechaza, `handleCron()` no lanza; un módulo de prueba con `ScheduleModule.forRoot()`, el scheduler y el procesador simulado, tras `app.init()`, deja exactamente 1 cron en `SchedulerRegistry.getCronJobs()` (cerrar la app al terminar para detener el job).
- [ ] **Step 3:** Run: `npx jest src/subscriptions/subscriptions.scheduler --forceExit`. Expected: FAIL.
- [ ] **Step 4:** Implementar scheduler, controller (delgado, `@CurrentUser()`, `ParseObjectIdPipe`), módulo (importa Accounts, CreditCards, Categories, Transactions; provee service, processor, scheduler) y registrarlo en `AppModule` junto a `ScheduleModule.forRoot()`; crear `subscriptions.http` con: crear (cuenta y tarjeta), listar, próximos, `process-due`, pausar, reactivar, errores 400/404/409.
- [ ] **Step 5:** Run: `cd api; npm run build; npm test; npm run lint`. Expected: sin errores, suite completa en verde.
- [ ] **Step 6:** Verificación manual contra Atlas (reiniciar `start:dev`; usuarios `verif-`): cuenta A (100000) y tarjeta K; suscripción mensual de 1500 en A con `nextDate` hace 3 meses → `POST /subscriptions/process-due` crea 3–4 gastos con sus fechas (comprobar con `GET /transactions`), saldo de A baja en consecuencia y `nextDate` queda en el futuro; segunda llamada → `charged 0`; suscripción semanal en tarjeta K → la deuda sube; `GET /subscriptions/upcoming?days=30` lista los próximos cobros; pausar y reactivar (sin cobros nuevos al reactivar); archivar la cuenta A y dejar una suscripción vencida → `failed` con mensaje, `lastError` visible en `GET /subscriptions/:id` y saldos intactos; desarchivar y repetir → se cobra y `lastError` desaparece; otro usuario → 404. Expected: saldos, deuda y fechas cuadran en cada paso; el log del servidor no muestra errores.
- [ ] **Step 7:** Marcar los 3 ítems de la Fase 6 en `docs/PLAN.md` y commit `feat: subscriptions with daily charge generation (phase 6)`.

---

## Self-review

- **Cobertura del diseño:** frecuencias y fechas → T1; CRUD, pausa/reactivación y próximos vencimientos → T2; generación, atrasos, idempotencia, concurrencia y fallos → T3; cron, `process-due`, rutas y verificación en Atlas → T4.
- **Consistencia:** `Frequency`/`nextOccurrence` (T1) usados por T2 y T3; `assertReferences` público (T2) usado por el service; `createWithin` con `subscriptionId` (T2) usado por T3; `ProcessSummary` (T3) devuelto por el controller (T4).
- **Proporción:** 4 tareas; TDD en la recurrencia y el procesador, integración en el resto.
