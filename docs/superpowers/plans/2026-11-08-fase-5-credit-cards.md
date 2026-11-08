# Fase 5 — Tarjetas de crédito y compras diferidas: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tarjetas de crédito con deuda atómica, compras a cuotas con interés opcional, pago de cuotas, estado de cuenta por período de corte y proyección mensual.

**Architecture:** Funciones puras para fechas de facturación (`billing-dates.ts`) y calendario de cuotas (`installment-schedule.ts`), con TDD. `CreditCardsModule` (CRUD + `applyDebtDeltas` + estado de cuenta), `InstallmentPurchasesModule` (compra, pago, proyección). Los movimientos (Fase 4) se extienden con `creditCardId`/`toCreditCardId`; sus efectos pasan a `{ accounts, cards }`. Las operaciones compuestas usan `TransactionsService.createWithin(session, …)` para participar en una única `connection.transaction`.

**Tech Stack:** NestJS 11, Mongoose 9 (sesiones), class-validator, Jest, `mongodb-memory-server` (helper `api/test/mongo-memory.ts`, usar `mongoTestOptions`).

**Spec:** `docs/superpowers/specs/2026-11-08-fase-5-credit-cards-design.md`

## Global Constraints

- Todo en `api/`; código en inglés; controllers delgados; DTOs con `class-validator`; `ValidationPipe` global `whitelist: true`.
- Dinero en centavos enteros; fechas en UTC; fechas "de día" = medianoche UTC.
- Toda consulta filtra por `userId`; ajeno → `404`; id inválido → `400` (`ParseObjectIdPipe`); campos de id con `@Prop({ type: MongooseSchema.Types.ObjectId })` (nunca `Types.ObjectId`).
- Deuda y saldos solo por `$inc` atómico dentro de `connection.transaction`; leer el estado previo dentro de la transacción.
- Actualizar documentos con `Object.assign(doc, definedOnly(dto))`.
- Tarjeta: `cutoffDay`/`paymentDay` 1–31 (mes corto → último día); `limitCents` ≥ 1; `annualRatePercent` ≥ 0. Compra: `installments` 2–60, `annualRatePercent` 0–100 (default 0). Proyección `months` 1–36 (default 12).
- Cuota sin interés: `total ÷ n`, resto de centavos en la primera. Con interés: sistema francés, tasa mensual = anual/12, última cuota absorbe redondeo. El capital suma exactamente el total.
- Período: el día de corte pertenece a su período; pago = primer `paymentDay` posterior al corte; primera cuota vence ese día.
- Movimientos con `installmentPurchaseId`: `update`/`remove` directos → `409`.
- Referencias nuevas archivadas → `409`; ajenas → `404`. Sin bloqueo por cupo ni sobrepago.
- TDD en funciones puras y lógica de saldos/deuda; `.http` + prueba manual contra Atlas.
- Fuera de alcance: deshacer pago de cuota, intereses sobre compras normales, avances, pago automático, recordatorios.
- Commits terminan con `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- Capital que suma el total con montos incómodos (`100000/3`, `99999/7` a distintas tasas) (T2).
- Día de corte, febrero (corte/pago 31), cambio de año (T1).
- Dos `pay` simultáneos → uno procede, otro `409`; `paidInstallments` sube una vez (T6).
- Fallo a mitad de `pay` o de la compra → sin movimientos, deuda y contador intactos (T6).
- Editar/borrar un movimiento gestionado → `409` (T5).
- Borrar compra con cuotas pagadas → `409`; sin pagos → revierte la deuda (T6).
- Tarjeta/compra de otro usuario → `404`; tarjeta archivada para compra o gasto nuevo → `409` (T5, T6).
- Estado de cuenta: elige el período por `date`, no incluye cuotas atrasadas ni de otros meses; proyección cuenta vencidas en el mes actual (T7).

---

### Task 1: Fechas de facturación (TDD)

**Files:**
- Create: `api/src/credit-cards/billing-dates.ts`, `api/src/credit-cards/billing-dates.spec.ts`

**Interfaces:** Produces (todas puras, fechas = medianoche UTC):
- `clampDay(year: number, month: number, day: number): number` — `month` 0–11; devuelve `min(day, díasDelMes)`.
- `statementPeriodFor(date: Date, cutoffDay: number): { start: Date; end: Date }` — `end` = primer corte ≥ el día de `date`; `start` = día siguiente al corte anterior.
- `paymentDateFor(periodEnd: Date, paymentDay: number): Date` — primer `paymentDay` estrictamente posterior a `periodEnd`.
- `monthlyDueDates(firstDue: Date, paymentDay: number, count: number): Date[]` — `firstDue` y los `count − 1` meses siguientes, cada uno en `paymentDay` ajustado.

- [ ] **Step 1: Tests que fallan** — `statementPeriodFor(2026-03-10, 15)` → `2026-02-16..2026-03-15`; `(2026-03-15, 15)` → mismo período (corte inclusive); `(2026-03-16, 15)` → `2026-03-16..2026-04-15`; `(2026-12-20, 15)` → `2026-12-16..2027-01-15`; `(2026-02-10, 31)` → `2026-01-32→` es decir `2026-02-01..2026-02-28`; `(2026-03-10, 31)` → `2026-03-01..2026-03-31`; `(2024-02-20, 31)` → `..2024-02-29`. `paymentDateFor(2026-03-15, 5)` → `2026-04-05`; `(2026-03-15, 20)` → `2026-03-20`; `(2026-03-15, 15)` → `2026-04-15` (estrictamente posterior); `(2026-03-31, 31)` → `2026-04-30`; `(2026-12-31, 5)` → `2027-01-05`. `monthlyDueDates(2026-01-31, 31, 4)` → `01-31, 02-28, 03-31, 04-30`; `(2026-11-05, 5, 3)` → `11-05, 12-05, 2027-01-05`.
- [ ] **Step 2:** Run: `cd api; npx jest src/credit-cards/billing-dates`. Expected: FAIL (módulo no existe).
- [ ] **Step 3:** Implementar con `Date.UTC`; `statementPeriodFor` calcula el corte del mes de `date` y, si el día de `date` es mayor, el del mes siguiente.
- [ ] **Step 4:** Run: `npx jest src/credit-cards/billing-dates`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(credit-cards): billing date helpers`.

### Task 2: Calendario de cuotas (TDD)

**Files:**
- Create: `api/src/installment-purchases/installment-schedule.ts`, `api/src/installment-purchases/installment-schedule.spec.ts`

**Interfaces:** Produces:
- `interface ScheduleItem { number: number; dueDate: Date; principalCents: number; interestCents: number; paymentCents: number; remainingPrincipalCents: number }` (`remainingPrincipalCents` = capital pendiente después de esta cuota).
- `buildSchedule(input: { totalCents: number; installments: number; annualRatePercent: number; dueDates: Date[] }): ScheduleItem[]` — lanza `Error` si `dueDates.length !== installments`, `totalCents` no es entero ≥ 1 o `installments` < 1.

- [ ] **Step 1: Tests que fallan** — tasa 0: `120000/12` → 12 cuotas de `10000`, interés 0; `100000/3` → principal `[33334, 33333, 33333]`; `paymentCents === principalCents`. Tasa 12 %, `120000`, 12 cuotas: primera cuota `interestCents 1200`, `paymentCents 10662`, `principalCents 9462`, `remainingPrincipalCents 110538`; última `remainingPrincipalCents 0`. Propiedades en un bucle (totales `1, 99999, 100000, 123457, 5000000` × cuotas `2, 3, 7, 12, 60` × tasas `0, 5, 18.5, 100`): suma de `principalCents === totalCents`, todo entero y `principalCents ≥ 1`, `interestCents ≥ 0`, `paymentCents === principal + interest`, `remainingPrincipalCents` decrece y termina en 0, las `dueDate` se copian en orden. `dueDates` de largo equivocado → `toThrow()`.
- [ ] **Step 2:** Run: `npx jest src/installment-purchases/installment-schedule`. Expected: FAIL.
- [ ] **Step 3:** Implementar: tasa 0 → reparto entero con resto en la primera; tasa > 0 → cuota fija `round(total·r / (1 − (1+r)^−n))`, interés de cada mes `round(restante·r)`, capital = cuota − interés, y en la última cuota capital = restante e interés calculado normal (la cuota final puede diferir por redondeo).
- [ ] **Step 4:** Run: `npx jest src/installment-purchases/installment-schedule`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(installments): amortization schedule`.

> **Aprendizaje:** el sistema francés es la fórmula de cualquier préstamo con cuota fija; probar propiedades (la suma cuadra siempre) además de casos concretos protege contra errores de redondeo que un solo ejemplo no ve.

### Task 3: Módulo `credit-cards` (CRUD y deuda)

**Files:**
- Create: `api/src/credit-cards/schemas/credit-card.schema.ts`, `api/src/credit-cards/dto/create-credit-card.dto.ts`, `api/src/credit-cards/dto/update-credit-card.dto.ts`, `api/src/credit-cards/credit-cards.service.ts`, `api/src/credit-cards/credit-cards.service.spec.ts`, `api/src/credit-cards/credit-cards.module.ts`

**Interfaces:**
- Consumes: `ParseObjectIdPipe`, `definedOnly` (Fase 3), `AccountDeltas` (Fase 4).
- Produces:
  - Schema `CreditCard`: `userId`, `name`, `limitCents`, `cutoffDay`, `paymentDay`, `annualRatePercent` (default 0), `debtCents` (default 0), `isArchived`, timestamps; virtual `availableCents`.
  - `CreateCreditCardDto { name; limitCents (@IsInt @Min(1)); cutoffDay (@IsInt @Min(1) @Max(31)); paymentDay (idem); annualRatePercent? (@Min(0)); initialDebtCents? (@IsInt) }`; `UpdateCreditCardDto` (todos opcionales + `isArchived`, sin deuda).
  - `CreditCardsService.findAll(userId: string, includeArchived?: boolean)`, `.findOne(userId: string, id: string): Promise<CreditCardDocument>` (404), `.create(userId, dto)`, `.update(userId, id, dto)`, `.archive(userId, id): Promise<void>`, `.applyDebtDeltas(userId: string, deltas: AccountDeltas, session: ClientSession): Promise<void>` (mismo patrón que `AccountsService.applyDeltas`, `$inc: { debtCents }`, `404` si no coincide una tarjeta, sin operación con mapa vacío).
  - Duplicado de `name` activo del mismo usuario → `409` (collation `{ locale: 'es', strength: 2 }`).

- [ ] **Step 1: Tests que fallan** (patrón de `accounts.service.spec.ts` con modelo simulado): `create` fija `debtCents` desde `initialDebtCents` (`undefined → 0`); `UpdateCreditCardDto` por `ValidationPipe` descarta `debtCents`; DTO rechaza `cutoffDay: 32`, `0`, `limitCents: 0`; filtros por `userId`; ajeno → `NotFoundException`; duplicado → `ConflictException`; `archive` no borra; `applyDeltas`-equivalente: un `$inc` por tarjeta con `userId` y sesión, `NotFoundException` si `matchedCount` menor, sin llamada con mapa vacío; el JSON de una tarjeta incluye `availableCents = limitCents − debtCents`.
- [ ] **Step 2:** Run: `npx jest src/credit-cards/credit-cards.service`. Expected: FAIL.
- [ ] **Step 3:** Implementar schema (virtual `availableCents`, `toJSON: { virtuals: true }`), DTOs, service y módulo (exporta `CreditCardsService`).
- [ ] **Step 4:** Run: `npx jest src/credit-cards`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(credit-cards): CRUD and debt deltas`.

### Task 4: Efectos y forma de movimientos con tarjetas (TDD)

**Files:**
- Modify: `api/src/transactions/transaction-effects.ts`, `api/src/transactions/transaction-effects.spec.ts`, `api/src/transactions/transaction-shape.ts`, `api/src/transactions/transaction-shape.spec.ts`

**Interfaces:** Produces (reemplaza las firmas de la Fase 4):
- `interface TxFinancials { type: TxType; amountCents: number; accountId?: string | null; toAccountId?: string | null; creditCardId?: string | null; toCreditCardId?: string | null }`
- `interface Effects { accounts: AccountDeltas; cards: AccountDeltas }` (`AccountDeltas = Map<string, number>` se conserva)
- `effectsOf(tx: TxFinancials): Effects`; `netEffects(before: TxFinancials | null, after: TxFinancials | null): Effects` (omite ceros en ambos mapas).
- `TxShape extends TxFinancials { categoryId?; subcategoryId? }`; `assertValidShape(tx: TxShape): void` con las reglas: ingreso → `accountId` requerido y sin campos de tarjeta; gasto → exactamente uno de `accountId`/`creditCardId`, sin `toAccountId`/`toCreditCardId`, con `categoryId`; transferencia → `accountId` requerido, exactamente uno de `toAccountId`/`toCreditCardId`, sin `creditCardId`, sin categoría ni subcategoría, y destino ≠ origen; `amountCents` entero ≥ 1.

- [ ] **Step 1: Tests que fallan** — actualizar las expectativas existentes a `effectsOf(...).accounts`/`.cards`; casos nuevos: gasto en tarjeta 3000 → `cards {C: +3000}`, `accounts` vacío; transferencia cuenta A → tarjeta C 2000 → `accounts {A: −2000}`, `cards {C: −2000}`; neto gasto A → mismo gasto en tarjeta C → `accounts {A: +3000}`, `cards {C: +3000}`; formas inválidas: gasto con cuenta y tarjeta a la vez, gasto sin ninguna, ingreso con tarjeta, transferencia con `creditCardId`, transferencia con `toAccountId` y `toCreditCardId`, transferencia sin destino.
- [ ] **Step 2:** Run: `npx jest src/transactions/transaction-`. Expected: FAIL.
- [ ] **Step 3:** Implementar los cambios.
- [ ] **Step 4:** Run: `npx jest src/transactions/transaction-`. Expected: PASS (el resto de la suite puede fallar a compilar hasta T5; no commitear con rojo: hacer T5 Step 3 mínimo de compilación antes del commit si hace falta).
- [ ] **Step 5:** Commit `feat(transactions): credit card effects and shape rules`.

### Task 5: Movimientos con tarjeta, protección y `createWithin`

**Files:**
- Modify: `api/src/transactions/schemas/transaction.schema.ts`, `api/src/transactions/dto/create-transaction.dto.ts`, `api/src/transactions/dto/update-transaction.dto.ts`, `api/src/transactions/transactions.service.ts`, `api/src/transactions/transactions.service.spec.ts`, `api/src/transactions/transactions.module.ts`

**Interfaces:**
- Consumes: `CreditCardsService.findOne`, `.applyDebtDeltas` (T3); `Effects`, `netEffects` (T4).
- Produces:
  - Schema: `accountId` pasa a opcional; nuevos `creditCardId?`, `toCreditCardId?` (ref `CreditCard`), `installmentPurchaseId?` (todos `MongooseSchema.Types.ObjectId`).
  - DTOs: `creditCardId?`, `toCreditCardId?` (`@IsMongoId`; en `UpdateTransactionDto` aceptan `null`); `accountId` opcional en create.
  - `TransactionsService.createWithin(session: ClientSession, userId: string, input: CreateTransactionDto & { source?: TxSource; installmentPurchaseId?: string }): Promise<TransactionDocument>` — valida forma y referencias y aplica efectos sobre cuentas y tarjetas, **sin** abrir transacción propia.
  - `TransactionsService.removeWithin(session: ClientSession, userId: string, id: string): Promise<void>` — revierte efectos, sin transacción propia ni protección.
  - `create` = `connection.transaction` + `createWithin`; `update`/`remove` públicos lanzan `ConflictException` si el movimiento tiene `installmentPurchaseId`.

- [ ] **Step 1: Tests que fallan** (integración, ampliar el spec existente con tarjeta `K` de `limitCents 100000`, `debtCents 0`; tarjeta archivada y ajena): gasto 3000 en `K` → `debtCents 3000`, `availableCents 97000`, saldo de cuentas intacto; transferencia 2000 de A a `K` (`toCreditCardId`) → A −2000, deuda 1000; sobrepagar deja deuda negativa; editar un gasto de cuenta A a tarjeta `K` (`accountId: null`, `creditCardId`) → A recupera y la deuda sube; borrar un gasto de tarjeta revierte la deuda; tarjeta ajena → `NotFoundException`; tarjeta archivada nueva → `ConflictException`, pero editar la nota de un gasto cuya tarjeta se archivó después funciona; `applyDebtDeltas` que falla (`jest.spyOn`) → ni movimiento ni deuda cambian; `createWithin` con `installmentPurchaseId` guarda el vínculo y `source: 'installment'`; `update` y `remove` de ese movimiento → `ConflictException`; `removeWithin` sí lo borra y revierte; 5 gastos de tarjeta simultáneos suman exacto en `debtCents`.
- [ ] **Step 2:** Run: `npx jest src/transactions/transactions.service --forceExit`. Expected: FAIL en los tests nuevos.
- [ ] **Step 3:** Implementar: extender `shapeOf`/`assertReferences` con tarjetas (mismas reglas: ajena 404, archivada nueva 409), aplicar `Effects` (`accounts.applyDeltas` + `cards.applyDebtDeltas`), extraer `createWithin`/`removeWithin`, protección de gestionados; importar `CreditCardsModule` en `TransactionsModule` y exportar `TransactionsService`.
- [ ] **Step 4:** Run: `npx jest --forceExit`. Expected: toda la suite en verde (incluye los tests de Fase 4 adaptados).
- [ ] **Step 5:** Commit `feat(transactions): credit card expenses, payments and managed transactions`.

### Task 6: Compras a cuotas

**Files:**
- Create: `api/src/installment-purchases/schemas/installment-purchase.schema.ts`, `api/src/installment-purchases/dto/create-installment-purchase.dto.ts`, `api/src/installment-purchases/dto/update-installment-purchase.dto.ts`, `api/src/installment-purchases/dto/pay-installment.dto.ts`, `api/src/installment-purchases/installment-purchases.service.ts`, `api/src/installment-purchases/installment-purchases.service.spec.ts`, `api/src/installment-purchases/installment-purchases.module.ts`

**Interfaces:**
- Consumes: `buildSchedule` (T2), `statementPeriodFor`/`paymentDateFor`/`monthlyDueDates` (T1), `CreditCardsService.findOne` (T3), `TransactionsService.createWithin`/`removeWithin` (T5), `CategoriesService.findOne` (Fase 3).
- Produces:
  - Schema `InstallmentPurchase`: campos del diseño (`startDate`, `firstDueDate`, `paymentDay`, `paidInstallments` default 0, `purchaseTransactionId`).
  - `CreateInstallmentPurchaseDto { creditCardId; description; categoryId; subcategoryId?; totalCents (@IsInt @Min(1)); installments (@IsInt @Min(2) @Max(60)); annualRatePercent? (@Min(0) @Max(100)); startDate: Date }`; `UpdateInstallmentPurchaseDto { description?; categoryId?; subcategoryId? }`; `PayInstallmentDto { accountId: string; date?: Date }`.
  - `InstallmentPurchaseView = InstallmentPurchaseDocument-like & { schedule: Array<ScheduleItem & { paid: boolean }>; isPaidOff: boolean }`.
  - `InstallmentPurchasesService.create(userId, dto): Promise<InstallmentPurchaseView>`, `.findAll(userId, opts: { creditCardId?: string }): Promise<InstallmentPurchaseView[]>`, `.findOne(userId, id): Promise<InstallmentPurchaseView>`, `.update(userId, id, dto): Promise<InstallmentPurchaseView>`, `.remove(userId, id): Promise<void>`, `.payNext(userId, id, dto: PayInstallmentDto): Promise<InstallmentPurchaseView>`.
  - `firstDueDate` = `paymentDateFor(statementPeriodFor(startDate, card.cutoffDay).end, card.paymentDay)`; `paymentDay` = el de la tarjeta al crear.

- [ ] **Step 1: Tests que fallan** (integración con réplica en memoria; tarjeta de corte 15 y pago 5; cuenta A con saldo; categoría de gasto):
  - `create` 120000 a 12 cuotas, tasa 0, `startDate 2026-03-10` → deuda de la tarjeta 120000, un movimiento de gasto (`source installment`, `installmentPurchaseId`, `creditCardId`), `firstDueDate 2026-04-05`, `schedule` de 12 cuotas de 10000 con `paid: false`; con `startDate 2026-03-16` → `firstDueDate 2026-05-05`.
  - Tarjeta ajena → `NotFoundException`; archivada → `ConflictException`; categoría de ingreso → `BadRequestException`; sin cambios en ninguno de esos casos.
  - Rollback: `applyDebtDeltas` que falla → no queda compra ni movimiento ni deuda.
  - `payNext` (120000 al 12 % a 12 cuotas): primera cuota → cuenta A baja `10662`, deuda baja `9462`, aparece un gasto de interés `1200` en A con la categoría de la compra y un traspaso de `9462`, `paidInstallments 1`, `schedule[0].paid`; sin interés (tasa 0) crea solo el traspaso; cuenta archivada o ajena → `ConflictException`/`NotFoundException`; con todas pagadas → `ConflictException`; fallo simulado a mitad (`createWithin` del interés rechaza una vez) → ni movimientos, ni saldos, ni contador cambian.
  - Dos `payNext` simultáneos (`Promise.all`) → exactamente uno resuelve, el otro `ConflictException`; `paidInstallments 1`, deuda y saldo reflejan un solo pago.
  - `remove` sin pagos → borra compra y movimiento y la deuda vuelve a 0; con una cuota pagada → `ConflictException`.
  - `update` de `description` y `categoryId` actualiza la compra y la categoría del gasto de compra, sin tocar saldos ni deuda; nunca cambia montos.
  - Compra/tarjeta de otro usuario en `findOne`/`update`/`remove`/`payNext` → `NotFoundException`.
- [ ] **Step 2:** Run: `npx jest src/installment-purchases/installment-purchases.service --forceExit`. Expected: FAIL.
- [ ] **Step 3:** Implementar. `create`/`payNext`/`remove` dentro de `connection.transaction`; `payNext` aplica `findOneAndUpdate({ _id, userId, paidInstallments: current }, { $inc: { paidInstallments: 1 } }, { session })` y lanza `ConflictException` si no coincide; la vista calcula `schedule` con `buildSchedule` + `monthlyDueDates(firstDueDate, paymentDay, installments)`.
- [ ] **Step 4:** Run: `npx jest src/installment-purchases --forceExit`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(installments): purchases, payments and schedule`.

### Task 7: Estado de cuenta y proyección

**Files:**
- Create: `api/src/credit-cards/statement.service.ts`, `api/src/credit-cards/statement.service.spec.ts`
- Modify: `api/src/installment-purchases/installment-purchases.service.ts`, `api/src/installment-purchases/installment-purchases.service.spec.ts`, `api/src/credit-cards/credit-cards.module.ts`

**Interfaces:**
- Consumes: T1–T6.
- Produces:
  - `StatementService.build(userId: string, cardId: string, date: Date): Promise<Statement>` donde `Statement = { cardId: string; period: { start: Date; end: Date }; paymentDueDate: Date; purchases: TransactionDocument[]; payments: TransactionDocument[]; installmentsDue: Array<{ purchaseId: string; description: string; number: number; of: number; dueDate: Date; principalCents: number; interestCents: number; paymentCents: number }>; totals: { purchasesCents: number; paymentsCents: number; installmentsDueCents: number }; debtCents: number; availableCents: number }`. `purchases` = gastos con `creditCardId` en el período (incluye el gasto de una compra a cuotas); `payments` = transferencias con `toCreditCardId` en el período; `installmentsDue` = cuotas impagas con vencimiento > `period.end` y ≤ `paymentDueDate`.
  - `InstallmentPurchasesService.projection(userId: string, opts: { months?: number; creditCardId?: string }, now?: Date): Promise<Array<{ month: string; principalCents: number; interestCents: number; paymentCents: number; count: number }>>` — un elemento por mes `YYYY-MM` desde el mes de `now`, `months` meses; las cuotas impagas vencidas se cuentan en el primer mes.

- [ ] **Step 1: Tests que fallan** (integración): estado de cuenta de la tarjeta (corte 15, pago 5) con gastos el 2026-03-10, 2026-03-15, 2026-03-16 y 2026-02-14, un pago el 2026-03-12 y una compra a cuotas del 2026-03-10: `date 2026-03-12` → período `2026-02-16..2026-03-15`, `purchases` con 2 gastos (03-10 y 03-15), `payments` con 1, `paymentDueDate 2026-04-05`, `installmentsDue` con la primera cuota (vence 04-05), totales correctos, `debtCents`/`availableCents` actuales; `date 2026-03-16` → período siguiente con el gasto del 03-16; cuota atrasada (vencida antes) no aparece; tarjeta ajena → `NotFoundException`. Proyección con `now = 2026-03-20`: 2 compras (12 cuotas sin interés de 120000 y 6 cuotas al 12 % de 60000) → `months: 3` devuelve 3 elementos `2026-03`, `2026-04`, `2026-05` con sumas por mes; una cuota impaga vencida en febrero suma en `2026-03`; cuotas ya pagadas no cuentan; `creditCardId` filtra; `months` fuera de 1–36 se rechaza en el DTO de consulta de T8.
- [ ] **Step 2:** Run: `npx jest src/credit-cards/statement src/installment-purchases --forceExit`. Expected: FAIL en los tests nuevos.
- [ ] **Step 3:** Implementar `StatementService` (consulta sobre `Transaction` y `InstallmentPurchase` vía `forFeature`, calendarios con `buildSchedule`) y `projection`.
- [ ] **Step 4:** Run: `npx jest --forceExit`. Expected: suite completa en verde.
- [ ] **Step 5:** Commit `feat(credit-cards): statement and installment projection`.

### Task 8: Controllers, módulos, verificación y cierre

**Files:**
- Create: `api/src/credit-cards/credit-cards.controller.ts`, `api/src/installment-purchases/installment-purchases.controller.ts`, `api/src/installment-purchases/dto/projection.query.ts`, `api/src/credit-cards/dto/statement.query.ts`, `api/requests/credit-cards.http`
- Modify: `api/src/app.module.ts`, `docs/PLAN.md`

**Interfaces:** Produces rutas:
- `GET/POST /credit-cards`, `GET/PATCH/DELETE /credit-cards/:id`, `GET /credit-cards/:id/statement?date=` (`StatementQuery { date?: Date }`, default hoy UTC).
- `GET /installment-purchases` (`?creditCardId=`), `GET /installment-purchases/projection?months=&creditCardId=` (**declarada antes de `:id`**; `ProjectionQuery { months: number = 12 (1–36); creditCardId? }`), `GET/PATCH/DELETE /installment-purchases/:id`, `POST /installment-purchases` (201), `POST /installment-purchases/:id/pay` (200). `InstallmentPurchasesModule` y `CreditCardsModule` importados en `AppModule`.

- [ ] **Step 1:** Implementar controllers (delgados, `@CurrentUser()`, `ParseObjectIdPipe`), DTOs de consulta y módulos; crear `credit-cards.http` con: crear tarjeta, gasto con tarjeta, pago a tarjeta, compra a cuotas (con y sin interés), pagar cuota, estado de cuenta, proyección, borrar compra, y los casos 400/404/409.
- [ ] **Step 2:** Run: `cd api; npm run build; npm test; npm run lint`. Expected: sin errores, suite completa en verde.
- [ ] **Step 3:** Verificación manual contra Atlas (reiniciar `start:dev`; usuarios `verif-`): cuenta A (100000) y tarjeta K (cupo 300000, corte 15, pago 5) → gasto de tarjeta 30000 (deuda 30000, disponible 270000); pago a K de 10000 desde A (A=90000, deuda 20000); compra a 6 cuotas de 120000 sin interés (deuda 140000; calendario de 6 × 20000); `pay` primera cuota desde A (A=70000, deuda 120000, `paidInstallments 1`); segunda compra de 60000 a 3 cuotas al 12 % y `pay` (A baja capital + interés, el interés aparece como gasto en `GET /transactions`); `PATCH`/`DELETE` del gasto de compra → 409; borrar la segunda compra con una cuota pagada → 409 y borrar una compra sin pagos revierte la deuda; dos `pay` simultáneos (dos `curl` en paralelo) → uno 200 y otro 409; estado de cuenta y proyección coherentes con el calendario; otro usuario → 404; tarjeta archivada → 409 al comprar. Expected: deuda, cupo y saldos cuadran en cada paso.
- [ ] **Step 4:** Marcar los 5 ítems de la Fase 5 en `docs/PLAN.md` y commit `feat: credit cards and installment purchases (phase 5)`.

---

## Self-review

- **Cobertura del diseño:** tarjetas y deuda → T3; cambios a movimientos y protección → T4/T5; calendario y fechas → T1/T2; compra, pago, edición y borrado → T6; estado de cuenta y proyección → T7; rutas y verificación en Atlas → T8.
- **Consistencia:** `Effects`/`netEffects` (T4) usados por T5; `createWithin`/`removeWithin` (T5) consumidos por T6; `applyDebtDeltas` (T3) por T5; `buildSchedule`/fechas (T1, T2) por T6 y T7; `userId: string` en todos los services.
- **Proporción:** 8 tareas; TDD en fechas, calendario, efectos y deuda; el resto con pruebas de integración y verificación manual.
