# Fase 7 — Presupuestos y reportes: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Presupuestos por categoría y mes (con copia de mes a mes) y reportes calculados con aggregation pipelines: gasto por categoría, ingresos contra gastos, presupuesto contra gastado, deuda de tarjetas y resumen del dashboard.

**Architecture:** Utilidades puras de meses/rangos (`months.ts`, `date-range.ts`). `BudgetsModule` (CRUD + copia). `ReportsModule` con `ReportsService` que agrega sobre la colección `transactions` y compone datos de cuentas, tarjetas, presupuestos, cuotas y suscripciones mediante los services existentes.

**Tech Stack:** NestJS 11, Mongoose 9 (`aggregate`), class-validator, Jest, `mongodb-memory-server` (`api/test/mongo-memory.ts`, usar `mongoTestOptions`).

**Spec:** `docs/superpowers/specs/2026-11-08-fase-7-budgets-reports-design.md`

## Global Constraints

- Todo en `api/`; código en inglés; controllers delgados; DTOs con `class-validator`; `ValidationPipe` global `whitelist: true`.
- Dinero en centavos enteros (solo `percentUsed` es no entero); fechas y meses en UTC; mes = `YYYY-MM` (`^\d{4}-(0[1-9]|1[0-2])$`).
- Toda consulta y todo `$match` filtran por `userId` convertido a `Types.ObjectId` (los pipelines no convierten ids solos). Ajeno → `404`; id inválido → `400` (`ParseObjectIdPipe`); campos de id con `@Prop({ type: MongooseSchema.Types.ObjectId })` y registrados en `schema-id-types.spec.ts`.
- Gasto = `type: 'expense'` (cuenta o tarjeta, cualquier `source`); `transfer` nunca cuenta como gasto ni ingreso.
- Rango máximo de `income-vs-expenses`: 60 meses; `from > to` → `400`. `months` de `card-debt`: 1–36.
- Presupuesto: categoría de gasto (`400`), activa (`409`), ajena (`404`); duplicado `{ userId, categoryId, month }` → `409`.
- TDD en utilidades puras; pruebas de integración con datos sembrados para presupuestos y reportes; verificación manual contra Atlas.
- Fuera de alcance: comparaciones, ingresos por categoría, desglose por subcategoría/cuenta, pronósticos, CSV, caché.
- Commits terminan con `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- Transferencias y pagos a tarjeta excluidos del gasto y de ingresos/gastos (T3).
- Límite de mes: `23:59:59.999Z` del último día en el mes, `00:00:00Z` del siguiente en el otro (T1, T3).
- Datos de otro usuario nunca suman, ni en gasto, ni en presupuestos, ni en el resumen (T3, T4).
- Meses vacíos con ceros; sin presupuestos, `items: []` y totales en 0 (T3, T4).
- Categoría archivada después de crear su presupuesto o sus gastos: sigue apareciendo con su nombre (T3, T4).
- Copia: salta existentes y archivadas, `from === to` → `400`, dos copias simultáneas sin duplicados (T2).
- `percentUsed` con gasto 0, justo en el límite y por encima; `overBudget` solo si gasto > límite (T4).
- Rangos inválidos (`from > to`, > 60 meses, mes mal formado) → `400` (T1, T5).

---

### Task 1: Utilidades de meses y rangos (TDD)

**Files:**
- Create: `api/src/reports/months.ts`, `api/src/reports/months.spec.ts`, `api/src/common/utils/date-range.ts`, `api/src/common/utils/date-range.spec.ts`
- Modify: `api/src/transactions/transactions.service.ts` (importar `endOfRange` compartido en lugar del local)

**Interfaces:** Produces (puras, UTC):
- `MONTH_PATTERN: RegExp`; `isMonthKey(value: string): boolean`
- `monthKeyOf(date: Date): string`
- `monthRange(month: string): { start: Date; endExclusive: Date }`
- `monthsBetween(from: string, to: string): string[]` — inclusivo y ascendente; lanza `Error` si `from > to`.
- `lastMonths(count: number, now: Date): string[]` — termina en el mes de `now`, ascendente.
- `endOfRange(to: string): Date` (en `date-range.ts`) — `YYYY-MM-DD` → ese día a las `23:59:59.999Z`; cualquier otro ISO → `new Date(to)`.

- [ ] **Step 1: Tests que fallan** — `isMonthKey`: `'2026-03'` true; `'2026-13'`, `'2026-00'`, `'2026-1'`, `'26-03'`, `''` false. `monthKeyOf(2026-03-31T23:59:59.999Z)` = `'2026-03'` y `(2026-04-01T00:00:00Z)` = `'2026-04'`. `monthRange('2026-02')` → `2026-02-01..2026-03-01`; `'2024-02'` → termina `2024-03-01`; `'2026-12'` → termina `2027-01-01`. `monthsBetween('2025-11','2026-02')` → `['2025-11','2025-12','2026-01','2026-02']`; mismo mes → `[mes]`; invertido → lanza. `lastMonths(3, 2026-01-15)` → `['2025-11','2025-12','2026-01']`; `lastMonths(12, …)` tiene 12 elementos únicos ascendentes. `endOfRange('2026-03-31')` → `2026-03-31T23:59:59.999Z`; `endOfRange('2026-03-31T10:00:00Z')` → esa misma fecha.
- [ ] **Step 2:** Run: `cd api; npx jest src/reports/months src/common/utils/date-range`. Expected: FAIL (módulos no existen).
- [ ] **Step 3:** Implementar con `Date.UTC`; mover `endOfRange` de `transactions.service.ts` a `date-range.ts` y reutilizarlo.
- [ ] **Step 4:** Run: `npx jest src/reports/months src/common/utils src/transactions --forceExit`. Expected: PASS (incluye la suite de movimientos sin cambios).
- [ ] **Step 5:** Commit `feat(reports): month and range helpers`.

### Task 2: Módulo de presupuestos

**Files:**
- Create: `api/src/budgets/schemas/budget.schema.ts`, `api/src/budgets/dto/create-budget.dto.ts`, `api/src/budgets/dto/update-budget.dto.ts`, `api/src/budgets/dto/copy-budgets.dto.ts`, `api/src/budgets/dto/list-budgets.query.ts`, `api/src/budgets/budgets.service.ts`, `api/src/budgets/budgets.service.spec.ts`
- Modify: `api/src/common/schema-id-types.spec.ts`

**Interfaces:**
- Consumes: `isMonthKey`/`MONTH_PATTERN` (T1); `CategoriesService.findOne`/`findAll` (Fase 3); `ParseObjectIdPipe`.
- Produces:
  - Schema `Budget`: `userId`, `categoryId`, `month`, `limitCents`, timestamps; índice único `{ userId: 1, categoryId: 1, month: 1 }`.
  - `CreateBudgetDto { categoryId; month (@Matches(MONTH_PATTERN)); limitCents (@IsInt @Min(1)) }`; `UpdateBudgetDto { limitCents }`; `CopyBudgetsDto { from; to }` (ambos `@Matches`); `ListBudgetsQuery { month? }`.
  - `BudgetsService.findAll(userId: string, month: string): Promise<BudgetDocument[]>`, `.create(userId: string, dto): Promise<BudgetDocument>`, `.update(userId: string, id: string, dto): Promise<BudgetDocument>`, `.remove(userId: string, id: string): Promise<void>`, `.copy(userId: string, from: string, to: string): Promise<{ copied: number; skipped: Array<{ categoryId: string; reason: 'already-exists' | 'category-archived' }> }>`.

- [ ] **Step 1: Tests que fallan** (integración con réplica en memoria; llamar `await budgetModel.init()` en `beforeAll` para construir el índice único; categorías de gasto, ingreso, archivada y ajena):
  - `create` guarda el presupuesto; mismo `{categoría, mes}` otra vez → `ConflictException`; mismo mes con otra categoría y mismo categoría con otro mes → permitido; dos usuarios pueden tener presupuesto de categorías distintas el mismo mes.
  - Categoría de ingreso → `BadRequestException`; archivada → `ConflictException`; ajena → `NotFoundException`; nada se guarda en esos casos.
  - DTO por `ValidationPipe`: rechaza `limitCents` 0 y 10.5, `month` `'2026-13'`/`'2026-3'`; `UpdateBudgetDto` descarta `categoryId`/`month`.
  - `findAll` devuelve solo los del usuario y del mes pedido.
  - `update` cambia el límite; presupuesto ajeno → `NotFoundException`; `remove` borra y uno ajeno → `NotFoundException`.
  - `copy('2026-03', '2026-04')`: con 3 presupuestos en marzo, 1 categoría ya presupuestada en abril y 1 categoría archivada → `copied: 1`, `skipped` con `already-exists` y `category-archived`, el presupuesto existente de abril conserva su límite; mes origen vacío → `copied: 0, skipped: []`; `from === to` → `BadRequestException`; no copia presupuestos de otro usuario; dos `copy` simultáneos con los mismos datos → exactamente un presupuesto por categoría en abril.
- [ ] **Step 2:** Run: `npx jest src/budgets --forceExit`. Expected: FAIL.
- [ ] **Step 3:** Implementar schema, DTOs y service (duplicado por error Mongo `11000` → `ConflictException`; `copy` crea uno a uno capturando `11000` como `already-exists`). Añadir `Budget` (`userId`, `categoryId`) a `schema-id-types.spec.ts`.
- [ ] **Step 4:** Run: `npx jest src/budgets src/common --forceExit`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(budgets): monthly budgets with copy`.

### Task 3: Reportes — gasto por categoría e ingresos contra gastos

**Files:**
- Create: `api/src/reports/reports.service.ts`, `api/src/reports/reports.service.spec.ts`

**Interfaces:**
- Consumes: T1; modelos `Transaction` y `Category`.
- Produces:
  - `ReportsService.spendingByCategory(userId: string, range?: { from?: Date; to?: Date }, now?: Date): Promise<SpendingByCategory>` con `SpendingByCategory = { from: Date; to: Date; totalCents: number; items: Array<{ categoryId: string; name: string; icon: string; color: string; totalCents: number; count: number }> }`. Default: del inicio al fin del mes de `now`. Pipeline: `$match` (`userId`, `type: 'expense'`, `date` entre `from` y `to` inclusive) → `$group` por `categoryId` (`$sum` de `amountCents` y conteo) → `$lookup` a la colección de categorías → `$sort` por total descendente y `_id`. Categoría inexistente → `name: 'Sin categoría'`.
  - `ReportsService.incomeVsExpenses(userId: string, range?: { from?: string; to?: string }, now?: Date): Promise<IncomeVsExpenses>` con `IncomeVsExpenses = { from: string; to: string; months: Array<{ month: string; incomeCents: number; expenseCents: number; netCents: number }> }`. Default: últimos 12 meses con `lastMonths`. Pipeline: `$match` (`userId`, `type` en `income`/`expense`, `date` en el rango de meses) → `$group` por `$dateToString` `%Y-%m` con `timezone: 'UTC'` y `type`; luego se rellenan con ceros los meses sin datos con `monthsBetween`. `from > to` o más de 60 meses → `BadRequestException`.

- [ ] **Step 1: Tests que fallan** (integración; `Transaction`/`Category` sembrados con `create` directo; dos usuarios):
  - `spendingByCategory`: gastos de dos categorías (una con subcategoría) de cuenta y de tarjeta suman por categoría con `count` correcto, orden descendente; una transferencia, un pago a tarjeta (`toCreditCardId`), un ingreso y un gasto de otro usuario no suman; el gasto de compra a cuotas (`source: installment`) cuenta completo en su fecha y un interés (`source: installment`, gasto de cuenta) también; límites: gasto del `2026-03-31T23:59:59.999Z` entra en marzo y el de `2026-04-01T00:00:00Z` no; `to` de solo fecha incluye todo ese día; una categoría archivada conserva su nombre, ícono y color; `totalCents` es la suma de los ítems; rango sin datos → `items: []`, `totalCents: 0`; default usa el mes de `now`.
  - `incomeVsExpenses`: tres meses con ingresos y gastos mezclados (más una transferencia que no cuenta) dan `incomeCents`, `expenseCents` y `netCents` exactos; un mes sin movimientos aparece con ceros; el último instante de un mes y el primero del siguiente van a meses distintos; solo cuenta al usuario; default devuelve 12 meses terminando en el de `now`; `from > to` y un rango de 61 meses → `BadRequestException`.
- [ ] **Step 2:** Run: `npx jest src/reports/reports.service --forceExit`. Expected: FAIL.
- [ ] **Step 3:** Implementar ambos métodos con `this.txModel.aggregate([...])` convirtiendo `userId` a `Types.ObjectId` y usando `this.categoryModel.collection.name` para el `$lookup`.
- [ ] **Step 4:** Run: `npx jest src/reports --forceExit`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(reports): spending by category and income vs expenses`.

> **Aprendizaje:** el aggregation pipeline es una cadena de etapas: `$match` ≈ `where`, `$group` ≈ `groupBy` + `sum`, `$lookup` ≈ `join`. Se ejecuta dentro de MongoDB, así que no se traen miles de documentos a Node para sumarlos.

### Task 4: Reportes — presupuesto contra gastado, deuda de tarjetas y resumen

**Files:**
- Modify: `api/src/reports/reports.service.ts`, `api/src/reports/reports.service.spec.ts`, `api/src/subscriptions/subscriptions.module.ts` (exportar `SubscriptionsService`)

**Interfaces:**
- Consumes: T1–T3; `BudgetsService.findAll` (T2); `CategoriesService.findAll(userId, { includeArchived: true })`; `AccountsService.findAll`; `CreditCardsService.findAll`; `InstallmentPurchasesService.projection` (Fase 5); `SubscriptionsService.upcoming` (Fase 6).
- Produces:
  - `ReportsService.budgetVsSpent(userId: string, month?: string, now?: Date): Promise<BudgetVsSpent>` con `BudgetVsSpent = { month: string; items: Array<{ budgetId: string; categoryId: string; name: string; icon: string; color: string; limitCents: number; spentCents: number; remainingCents: number; percentUsed: number; overBudget: boolean }>; totals: { limitCents: number; spentCents: number; overBudgetCount: number } }`. `spentCents` = suma de gastos de esa categoría en el mes (todas sus subcategorías, cuenta o tarjeta); `remainingCents = limit − spent`; `percentUsed = Math.round(spent × 1000 / limit) / 10`; `overBudget = spent > limit`; items de mayor a menor `percentUsed`; `totals.spentCents` suma solo las categorías presupuestadas.
  - `ReportsService.cardDebt(userId: string, months?: number): Promise<CardDebtReport>` con `CardDebtReport = { totalDebtCents: number; totalLimitCents: number; totalAvailableCents: number; cards: Array<{ cardId: string; name: string; debtCents: number; limitCents: number; availableCents: number }>; projectedPayments: MonthlyProjection[] }` (solo tarjetas activas; `months` default 12).
  - `ReportsService.summary(userId: string, month?: string, now?: Date): Promise<DashboardSummary>` con `DashboardSummary = { month: string; totalBalanceCents: number; cardDebtCents: number; incomeCents: number; expenseCents: number; netCents: number; topCategories: SpendingByCategory['items']; budgets: BudgetVsSpent['totals']; upcomingSubscriptions: UpcomingCharge[]; installmentProjection: MonthlyProjection[] }` (saldo = suma de cuentas activas, incluidas las negativas; top 5; suscripciones a 14 días; cuotas a 3 meses).

- [ ] **Step 1: Tests que fallan** (integración, ampliando el montaje con cuentas, tarjetas, presupuestos, suscripciones y compras a cuotas sembrados):
  - `budgetVsSpent`: presupuesto de 50000 con 20000 gastados (una parte con subcategoría y otra de tarjeta) → `remainingCents 30000`, `percentUsed 40`, `overBudget false`; gasto 0 → `percentUsed 0`; exactamente en el límite → `percentUsed 100`, `overBudget false`; 62500 sobre 50000 → `remainingCents −12500`, `percentUsed 125`, `overBudget true`; `33333` sobre `100000` → `percentUsed 33.3`; orden por `percentUsed` descendente; gasto de otra categoría, de otro mes y de otro usuario no suman; categoría archivada conserva su nombre; sin presupuestos → `items: []` y totales 0; `totals.overBudgetCount` correcto; mes mal formado → `BadRequestException`.
  - `cardDebt`: dos tarjetas con deudas y cupos distintos, una archivada excluida → totales y `availableCents` correctos; `projectedPayments` tiene `months` elementos y refleja una compra a cuotas sembrada; otro usuario no aparece.
  - `summary`: con cuentas (una negativa y una archivada excluida), tarjetas, gastos e ingresos del mes, presupuestos, una suscripción próxima y una compra a cuotas, todos los campos coinciden con los cálculos manuales; `topCategories` tiene como máximo 5; mes sin datos → ceros y arreglos vacíos; usuario vacío → todo en cero.
- [ ] **Step 2:** Run: `npx jest src/reports/reports.service --forceExit`. Expected: FAIL en los tests nuevos.
- [ ] **Step 3:** Implementar los tres métodos (`budgetVsSpent` con una agregación `$group` por categoría y la unión con los presupuestos en el service; `summary` reutiliza los métodos anteriores con `Promise.all`); exportar `SubscriptionsService` desde `SubscriptionsModule`.
- [ ] **Step 4:** Run: `npx jest src/reports src/subscriptions --forceExit`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(reports): budget vs spent, card debt and dashboard summary`.

### Task 5: Controllers, módulos y cierre

**Files:**
- Create: `api/src/budgets/budgets.controller.ts`, `api/src/budgets/budgets.module.ts`, `api/src/reports/reports.controller.ts`, `api/src/reports/reports.module.ts`, `api/src/reports/dto/reports.queries.ts`, `api/src/reports/dto/reports.queries.spec.ts`, `api/requests/budgets-reports.http`
- Modify: `api/src/app.module.ts`, `docs/PLAN.md`

**Interfaces:**
- Consumes: T1–T4.
- Produces rutas:
  - `GET /budgets`, `POST /budgets`, `PATCH /budgets/:id`, `DELETE /budgets/:id` (204), **`POST /budgets/copy`** (200, declarada antes de `:id`).
  - `GET /reports/spending-by-category`, `/income-vs-expenses`, `/budget-vs-spent`, `/card-debt`, `/summary`.
  - DTOs de consulta: `SpendingQuery { from?, to? }` (`@IsISO8601`), `MonthRangeQuery { from?, to? }` (`@Matches(MONTH_PATTERN)`), `MonthQuery { month? }`, `CardDebtQuery { months: number = 12 (1–36) }`.

- [ ] **Step 1: Tests que fallan** (`reports.queries.spec.ts`, con `ValidationPipe`): `SpendingQuery` acepta `2026-03-01` y `2026-03-31T10:00:00Z` y rechaza `'abc'`; `MonthRangeQuery`/`MonthQuery` rechazan `'2026-13'` y `'2026-3'`; `CardDebtQuery` rechaza `months` 0 y 37 y por defecto vale 12.
- [ ] **Step 2:** Run: `npx jest src/reports/dto`. Expected: FAIL.
- [ ] **Step 3:** Implementar DTOs, controllers delgados (`@CurrentUser()`, `ParseObjectIdPipe`; convertir `from`/`to` de texto a `Date` con `new Date`/`endOfRange` antes de llamar al service), `BudgetsModule` (exporta `BudgetsService`) y `ReportsModule` (importa Budgets, Accounts, Categories, CreditCards, InstallmentPurchases, Subscriptions y registra los modelos `Transaction` y `Category`); registrarlos en `AppModule`; crear `budgets-reports.http` con presupuestos (crear, listar, editar, copiar, borrar, duplicado 409) y los cinco reportes con y sin parámetros, más los casos 400.
- [ ] **Step 4:** Run: `cd api; npm run build; npm test; npm run lint`. Expected: sin errores, suite completa en verde.
- [ ] **Step 5:** Verificación manual contra Atlas (reiniciar `start:dev`; dos usuarios `verif-`): cuenta A (100000) y B; tarjeta K; categorías de gasto "Alimentación" y "Transporte"; sembrar con la API de movimientos: gasto 30000 en A (Alimentación, marzo), gasto 20000 en K (Alimentación, marzo), gasto 5000 en A (Transporte, marzo), ingreso 80000 (marzo), transferencia 10000 A→B y pago de 10000 a K (no deben contar), gasto 7000 en abril, compra a 6 cuotas de 60000 en K con fecha de marzo (cuenta completa en marzo) → comprobar que `spending-by-category` de marzo da Alimentación 50000 + compra según su categoría, `income-vs-expenses` por mes cuadra con la suma manual, y la transferencia y el pago de tarjeta no aparecen; crear presupuestos de marzo (Alimentación 40000, Transporte 10000), `budget-vs-spent` marca Alimentación `overBudget` y Transporte al 50 %, `POST /budgets/copy` marzo→abril copia 2 y una segunda llamada copia 0 con 2 `already-exists`; `card-debt` y `summary` coinciden con los saldos de `GET /accounts` y `GET /credit-cards`; el usuario B ve todo vacío; `from > to` y `month=2026-13` → 400; presupuesto duplicado → 409. Expected: todas las cifras cuadran con los movimientos.
- [ ] **Step 6:** Marcar los 3 ítems de la Fase 7 en `docs/PLAN.md` y commit `feat: budgets and reports (phase 7)`.

---

## Self-review

- **Cobertura del diseño:** utilidades de meses → T1; presupuestos y copia → T2; gasto por categoría e ingresos/gastos → T3; presupuesto contra gastado, deuda de tarjetas y resumen → T4; rutas, DTOs de consulta y verificación en Atlas → T5.
- **Consistencia:** `monthRange`/`monthsBetween`/`lastMonths`/`endOfRange` (T1) usados por T3–T5; `BudgetsService.findAll` (T2) por T4; `SpendingByCategory['items']` (T3) por `summary` (T4); `MonthlyProjection` y `UpcomingCharge` vienen de las Fases 5 y 6.
- **Proporción:** 5 tareas; TDD en utilidades puras, integración con datos sembrados para los pipelines y verificación manual.
