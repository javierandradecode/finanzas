# Fase 4 — Movimientos: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CRUD y listado de movimientos (ingreso, gasto, transferencia) que mantienen los saldos de las cuentas consistentes mediante transacciones de MongoDB.

**Architecture:** Lógica de saldos y reglas de forma como funciones puras (`transaction-effects.ts`, `transaction-shape.ts`). `TransactionsService` valida referencias, calcula el efecto neto y lo aplica con `$inc` atómicos vía `AccountsService.applyDeltas` dentro de `connection.transaction`. Tests de integración con `mongodb-memory-server` en réplica.

**Tech Stack:** NestJS 11, Mongoose (sesiones/transacciones), class-validator, Jest, `mongodb-memory-server`.

**Spec:** `docs/superpowers/specs/2026-11-08-fase-4-transactions-design.md`

## Global Constraints

- Todo en `api/`; código en inglés; controllers delgados; DTOs con `class-validator`; `ValidationPipe` global con `whitelist: true`.
- Dinero en centavos enteros (`amountCents` ≥ 1). Fechas en UTC. Sin sobregiro bloqueado.
- Toda consulta filtra por `userId`; recurso ajeno → `404`; `:id` inválido → `400` (`ParseObjectIdPipe`).
- Todo cambio movimiento+saldos en una sola `connection.transaction`; saldos solo vía `$inc` atómico, nunca leer-modificar-escribir.
- Actualizar documentos con `Object.assign(doc, definedOnly(dto))` (los DTO traen claves `undefined`).
- Errores: cuenta/categoría ajena `404`; cuenta nueva archivada `409`; categoría archivada `409`; tipo de categoría distinto `400`; forma inválida `400`; `limit` > 100 `400`.
- Índices: `{ userId: 1, date: -1 }` y `{ userId: 1, categoryId: 1 }`.
- TDD en la lógica de saldos y service; `.http` + prueba manual para filtros contra Atlas.
- Fuera de alcance: tarjetas/cuotas, suscripciones, reportes, CSV, multi-moneda.
- Commits terminan con `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- Editar solo el monto en la misma cuenta ajusta el saldo por la diferencia (T4).
- Cambiar tipo gasto→ingreso mueve el saldo `2 × monto` (T1, T4).
- Cambiar de cuenta quita el efecto de la vieja y lo pone en la nueva (T4).
- Fallo a mitad de operación no deja movimiento ni saldos cambiados (T3, rollback real).
- Cinco creaciones simultáneas suman exactamente en el saldo (T3).
- Transferencia con origen = destino, o con categoría → `400` (T1).
- Movimiento/cuenta/categoría de otro usuario → `404` (T3, T4, T5).
- `to=2026-03-31` incluye movimientos de ese día hasta las 23:59 UTC; página fuera de rango → `items: []` con `total` correcto (T5).

---

### Task 1: Lógica pura de saldos y forma (TDD)

**Files:**
- Create: `api/src/transactions/transaction-effects.ts`, `api/src/transactions/transaction-effects.spec.ts`, `api/src/transactions/transaction-shape.ts`, `api/src/transactions/transaction-shape.spec.ts`

**Interfaces:** Produces:
- `type TxType = 'income' | 'expense' | 'transfer'`
- `interface TxFinancials { type: TxType; amountCents: number; accountId: string; toAccountId?: string | null }`
- `type AccountDeltas = Map<string, number>` (accountId → cents)
- `effectsOf(tx: TxFinancials): AccountDeltas`
- `netEffects(before: TxFinancials | null, after: TxFinancials | null): AccountDeltas` — efecto(after) − efecto(before); omite cuentas con delta 0; `null` = no existía.
- `interface TxShape extends TxFinancials { categoryId?: string | null; subcategoryId?: string | null }`
- `assertValidShape(tx: TxShape): void` — lanza `BadRequestException` si: transferencia sin `toAccountId`, con `toAccountId === accountId`, o con `categoryId`/`subcategoryId`; ingreso/gasto sin `categoryId` o con `toAccountId`; `subcategoryId` sin `categoryId`; `amountCents` no entero o < 1.

- [ ] **Step 1: Tests que fallan** — `effectsOf`: ingreso 5000 en A → `{A:+5000}`; gasto 3000 en A → `{A:-3000}`; transferencia 2000 A→B → `{A:-2000, B:+2000}`. `netEffects`: `(null, gasto 3000 A)` → `{A:-3000}`; `(gasto 3000 A, null)` → `{A:+3000}`; mismo gasto A de 3000 a 5000 → `{A:-2000}`; sin cambios → mapa vacío; gasto 3000 A → ingreso 3000 A → `{A:+6000}`; gasto 3000 A → gasto 3000 B → `{A:+3000, B:-3000}`; transferencia A→B 2000 a transferencia A→C 2000 → `{B:-2000, C:+2000}`. `assertValidShape`: acepta ingreso con categoría, transferencia con destino; rechaza cada caso de la lista de arriba y `amountCents` 0, `-5` y `10.5`.
- [ ] **Step 2:** Run: `cd api; npx jest src/transactions`. Expected: FAIL (módulos no existen).
- [ ] **Step 3:** Implementar ambos módulos (funciones puras sin dependencias de Mongoose; solo `BadRequestException` de Nest).
- [ ] **Step 4:** Run: `npx jest src/transactions`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(transactions): pure balance effects and shape rules`.

> **Aprendizaje:** separar la regla de negocio en funciones puras permite probarla sin base de datos; el service solo orquesta (como un *Action* o *Service* de Laravel sin tocar Eloquent).

### Task 2: Infraestructura de tests con réplica en memoria

**Files:**
- Create: `api/test/mongo-memory.ts`, `api/test/mongo-memory.spec.ts`
- Modify: `api/package.json` (devDependency), `api/tsconfig.build.json` si hace falta para excluir `test`

**Interfaces:** Produces: `startMongo(): Promise<{ uri: string; stop(): Promise<void> }>` — levanta `MongoMemoryReplSet` de 1 nodo y devuelve su URI.

- [ ] **Step 1:** `cd api; npm i -D mongodb-memory-server`.
- [ ] **Step 2: Test que falla** (`api/test/mongo-memory.spec.ts`, con `jest.setTimeout(180000)`): conecta Mongoose a `uri`, abre `connection.transaction`, inserta un documento en una colección, lanza un error dentro y verifica que el documento no existe (rollback); luego otra transacción que termina bien deja el documento. Si el spec en `api/test/` no lo recoge Jest (rootDir es `src`), moverlo a `api/src/test-smoke/mongo-memory.spec.ts` importando el helper desde `../../test/mongo-memory`.
- [ ] **Step 3:** Run: `npx jest mongo-memory`. Expected: FAIL (helper no existe). La primera ejecución exitosa descargará el binario de MongoDB (puede tardar varios minutos).
- [ ] **Step 4:** Implementar `startMongo`.
- [ ] **Step 5:** Run: `npx jest mongo-memory`. Expected: PASS. Confirmar `npm run build` sin incluir `test/` en `dist`.
- [ ] **Step 6:** Commit `test: in-memory mongo replica set helper`.

### Task 3: Esquema, creación y borrado con saldos

**Files:**
- Create: `api/src/transactions/schemas/transaction.schema.ts`, `api/src/transactions/dto/create-transaction.dto.ts`, `api/src/transactions/transactions.service.ts`, `api/src/transactions/transactions.service.spec.ts`
- Modify: `api/src/accounts/accounts.service.ts`, `api/src/accounts/accounts.service.spec.ts`

**Interfaces:**
- Consumes: `netEffects`, `assertValidShape`, `AccountDeltas` (T1); `startMongo` (T2); `AccountsService.findOne` (Fase 3); `CategoriesService.findOne` (Fase 3).
- Produces:
  - Schema `Transaction`: campos del diseño; índices `{ userId: 1, date: -1 }` y `{ userId: 1, categoryId: 1 }`; tipo `TransactionDocument`.
  - `CreateTransactionDto { type; amountCents; date: Date; accountId: string; toAccountId?: string; categoryId?: string; subcategoryId?: string; note?: string (máx. 500) }` (`@IsMongoId`, `@IsISO8601` con `@Transform` a `Date`).
  - `AccountsService.applyDeltas(userId: string, deltas: AccountDeltas, session: ClientSession): Promise<void>` — `bulkWrite` de `updateOne({ _id, userId }, { $inc: { balanceCents } })`; lanza `NotFoundException` si alguna cuenta no coincidió.
  - `TransactionsService.create(userId: string, dto: CreateTransactionDto): Promise<TransactionDocument>`, `.findOne(userId: string, id: string): Promise<TransactionDocument>`, `.remove(userId: string, id: string): Promise<void>`.

- [ ] **Step 1: Tests que fallan** — `accounts.service.spec.ts`: `applyDeltas` llama `bulkWrite` con un `$inc` por cuenta filtrando por `userId` y propaga la sesión, y lanza `NotFoundException` si `bulkWrite` reporta menos `matchedCount` que cuentas. `transactions.service.spec.ts` (integración, módulo de Nest con `MongooseModule.forRoot(uri)`, `jest.setTimeout(180000)`; dos usuarios, cuentas A y B con saldos iniciales, categorías de gasto e ingreso):
  - crear gasto 3000 en A → saldo A baja 3000; ingreso 5000 → sube 5000; transferencia 2000 A→B → A −2000 y B +2000.
  - cuenta ajena, categoría ajena → `NotFoundException`; cuenta archivada → `ConflictException`; categoría archivada → `ConflictException`; categoría de tipo distinto (gasto con categoría de ingreso) → `BadRequestException`; subcategoría de otra categoría → `BadRequestException`; en todos los casos los saldos no cambian y no se crea el movimiento.
  - fallo a mitad: con `jest.spyOn(accounts, 'applyDeltas').mockRejectedValueOnce(new Error('boom'))`, `create` rechaza y no existe el movimiento ni cambió el saldo.
  - 5 `create` simultáneos (`Promise.all`) de gasto 1000 → saldo baja exactamente 5000.
  - `remove` de un gasto revierte el saldo y elimina el documento; `remove`/`findOne` de movimiento de otro usuario → `NotFoundException`.
- [ ] **Step 2:** Run: `cd api; npx jest src/accounts src/transactions`. Expected: FAIL en los tests nuevos.
- [ ] **Step 3:** Implementar schema, DTO, `applyDeltas` y el service: `create` valida forma (`assertValidShape`), resuelve cuentas/categoría/subcategoría (404/409/400 según Global Constraints) y dentro de `connection.transaction` inserta el documento (con `{ session }`) y llama `applyDeltas(userId, netEffects(null, after), session)`; `remove` carga el movimiento del usuario y dentro de la transacción lo borra y aplica `netEffects(before, null)`.
- [ ] **Step 4:** Run: `npx jest src/accounts src/transactions`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(transactions): create and delete with atomic balances`.

> **Aprendizaje:** `connection.transaction(fn)` ≈ `DB::transaction()` de Laravel, pero hay que pasar la `session` explícitamente a cada operación; si olvidas una, esa operación queda fuera de la transacción.

### Task 4: Edición con reversión y reaplicación de saldos

**Files:**
- Create: `api/src/transactions/dto/update-transaction.dto.ts`
- Modify: `api/src/transactions/transactions.service.ts`, `api/src/transactions/transactions.service.spec.ts`

**Interfaces:**
- Consumes: todo lo de T1 y T3.
- Produces: `UpdateTransactionDto` (todos los campos de create opcionales; `toAccountId`, `categoryId`, `subcategoryId` aceptan `null` para limpiarse) y `TransactionsService.update(userId: string, id: string, dto: UpdateTransactionDto): Promise<TransactionDocument>` — fusiona el estado actual con el DTO, valida con `assertValidShape` y las reglas de referencias (cuentas que ya tenía el movimiento no se revalidan como activas), y en una transacción guarda el documento y aplica `netEffects(before, after)`.

- [ ] **Step 1: Tests que fallan** (integración): editar solo el monto de un gasto de 3000 a 5000 → saldo baja 2000 adicionales; solo la nota → saldos intactos; gasto → ingreso mismo monto → saldo cambia `+2 × monto`; cambiar `accountId` de A a B → A recupera el monto y B lo paga; transferencia A→B cambiada a destino C → B revertido y C recibe; gasto → transferencia (con `toAccountId` y `categoryId: null`) → saldos correctos; transferencia → gasto sin dar categoría → `BadRequestException` sin cambios; mover a una cuenta archivada → `ConflictException`, pero editar la nota de un movimiento cuya cuenta ya está archivada funciona; movimiento ajeno → `NotFoundException`; fallo simulado de `applyDeltas` → el documento conserva sus valores anteriores y los saldos no cambian; un `PATCH` que solo trae `note` (DTO como instancia con claves `undefined`) no pisa los demás campos.
- [ ] **Step 2:** Run: `npx jest src/transactions`. Expected: FAIL en los tests nuevos.
- [ ] **Step 3:** Implementar `update` y el DTO.
- [ ] **Step 4:** Run: `npx jest src/transactions`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(transactions): edit with balance reconciliation`.

### Task 5: Listado con filtros y paginación

**Files:**
- Create: `api/src/transactions/dto/list-transactions.query.ts`
- Modify: `api/src/transactions/transactions.service.ts`, `api/src/transactions/transactions.service.spec.ts`

**Interfaces:**
- Produces: `ListTransactionsQuery { from?: string; to?: string; type?: TxType; accountId?: string; categoryId?: string; page: number = 1; limit: number = 20 }` (`@Type(() => Number)`, `@Min(1)`, `limit` `@Max(100)`, ids `@IsMongoId`, fechas `@IsISO8601`); `Page<T> = { items: T[]; total: number; page: number; limit: number }`; `TransactionsService.findAll(userId: string, q: ListTransactionsQuery): Promise<Page<TransactionDocument>>`.

- [ ] **Step 1: Tests que fallan** (integración con movimientos sembrados de dos usuarios): solo devuelve los del usuario; `from`/`to` inclusivos y `to: '2026-03-31'` incluye un movimiento del 31 a las 23:59:59 UTC pero no del 1 de abril; filtros `type`, `categoryId`; `accountId` encuentra movimientos donde la cuenta es origen o destino; orden `date` desc con `_id` desc como desempate; con 25 movimientos, `page=2&limit=10` devuelve 10 items y `total: 25`; `page=9` devuelve `items: []` y `total: 25`; validación del DTO: `limit=101` y `page=0` rechazan con `BadRequestException` usando `ValidationPipe`.
- [ ] **Step 2:** Run: `npx jest src/transactions`. Expected: FAIL.
- [ ] **Step 3:** Implementar `findAll` (`find` + `countDocuments` con el mismo filtro, `sort({ date: -1, _id: -1 })`, `skip`/`limit`); si `to` es solo fecha (`YYYY-MM-DD`), usar el fin de ese día UTC.
- [ ] **Step 4:** Run: `npx jest src/transactions`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(transactions): filtered, paginated list`.

### Task 6: Controller, módulo, verificación y cierre

**Files:**
- Create: `api/src/transactions/transactions.controller.ts`, `api/src/transactions/transactions.module.ts`, `api/requests/transactions.http`
- Modify: `api/src/app.module.ts`, `docs/PLAN.md`

**Interfaces:**
- Consumes: `TransactionsService` completo (T3–T5), `CurrentUser`, `ParseObjectIdPipe`.
- Produces: rutas `GET /transactions`, `GET /transactions/:id`, `POST /transactions` (201), `PATCH /transactions/:id`, `DELETE /transactions/:id` (204). `TransactionsModule` importa `AccountsModule`, `CategoriesModule` y registra el schema; importado en `AppModule`.

- [ ] **Step 1:** Implementar controller (delgado), módulo y registro en `AppModule`; crear `transactions.http` con: ingreso, gasto, transferencia, edición de monto, edición de cuenta, borrado, filtros por fecha/tipo/cuenta/categoría, paginación, id inválido, cuenta archivada.
- [ ] **Step 2:** Run: `cd api; npm run build; npm test; npm run lint`. Expected: sin errores, todos los tests en verde.
- [ ] **Step 3:** Verificación manual contra Atlas (reiniciar `start:dev`; dos usuarios con prefijo `verif-`): crear cuentas A (10000) y B (0); gasto 3000 en A → A=7000; ingreso 5000 en A → 12000; transferencia 2000 A→B → A=10000, B=2000; editar el gasto a 4500 → A=8500; cambiarlo a cuenta B → A=11500 y B=−2500 (se permite); borrar la transferencia → A=12000... (recalcular y comprobar contra `GET /accounts`); usuario B pide/edita/borra un movimiento de A → 404; cuenta archivada → 409; `limit=101` → 400; filtros y paginación devuelven lo esperado; `accounts.balanceCents` coincide con la suma de efectos de los movimientos restantes. Expected: todos los saldos cuadran.
- [ ] **Step 4:** Marcar los 5 ítems de la Fase 4 en `docs/PLAN.md` y commit `feat: transactions with atomic balances (phase 4)`.

---

## Self-review

- **Cobertura del diseño:** efectos y forma → T1; infraestructura de réplica → T2; schema, índices, create/delete, validaciones, atomicidad y concurrencia → T3; edición total → T4; listado/filtros/paginación → T5; rutas, `.http` y verificación contra Atlas → T6.
- **Consistencia:** `AccountDeltas`/`netEffects` (T1) usados en T3/T4; `applyDeltas` (T3) usado en T4; `ListTransactionsQuery`/`Page` (T5) usados por el controller (T6); `userId: string` en todos los services.
- **Proporción:** 6 tareas; TDD completo en la lógica de saldos, el service se prueba contra una réplica real y el filtrado fino se confirma a mano en Atlas.
