# Fase 9b — Movimientos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pantalla `/movimientos` con listado filtrable y paginado, y formulario para crear, editar y borrar ingresos, gastos y transferencias.

**Architecture:** Lógica pura y testeable en `features/transactions/` (esquema Zod, payloads, filtros) y `lib/dates.ts`; hooks de TanStack Query en `web/src/api/`; `TransactionDialog` (RHF + Zod) y `TransactionsPage` (filtros en la URL).

**Tech Stack:** React 19, React Router (`useSearchParams`), TanStack Query, React Hook Form + Zod, Tailwind/shadcn, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-08-fase-9b-transactions-design.md`

## Global Constraints

- Dinero en centavos; formatear solo al mostrar. Llamadas a la API solo en `web/src/api/`. UI en español, código en inglés.
- Fechas: se envían `YYYY-MM-DD`; se muestran con `timeZone: 'UTC'`; "hoy" y "mes actual" se calculan con el calendario local.
- Valores de `source`/`destination`: `account:<id>` o `card:<id>`.
- Claves de consulta: `['transactions', filters]`; toda mutación de movimientos invalida `['transactions']`, `['accounts']` y `['credit-cards']`.
- Movimientos con `installmentPurchaseId` no ofrecen editar ni borrar.
- Reutilizar `MoneyInput` (`null` vacío, `NaN` inválido), `ConfirmDialog`, `CategoryIcon`, `formatMoney`, `test/utils.tsx` de la 9a.
- `npm test`, `npm run build`, `npm run lint` sin errores nuevos al cerrar cada tarea.

## Review Focus

- Cambiar de gasto a transferencia al editar: se envían `null` en `creditCardId`, `categoryId` y `subcategoryId`; la API no recibe campos sobrantes.
- Origen igual a destino en una transferencia: error en el formulario, sin petición.
- Un ingreso o transferencia con "tarjeta" como origen no pasa la validación.
- Movimiento de cuota en el listado: sin botones Editar/Borrar.
- Día correcto: un gasto a las 20:00 locales en UTC-5 se propone con la fecha local de hoy y se muestra con ese mismo día (no el siguiente).
- Cuenta/categoría archivada de un movimiento antiguo: se muestra su nombre en la fila y se conserva como opción al editar.
- Cambiar un filtro estando en la página 3 vuelve a la página 1; una página fuera de rango (`?page=99`) muestra el estado vacío, sin romper.
- Error 409/400 de la API al guardar: toast con el mensaje y el diálogo sigue abierto.

---

### Task 1: Fechas, esquema del formulario y filtros (TDD)

**Files:**
- Create: `web/src/lib/dates.ts` (+ `dates.test.ts`), `web/src/features/transactions/transaction-form.ts` (+ test), `web/src/features/transactions/filters.ts` (+ test)

**Interfaces:**
- Produces:
  - `todayLocal(now = new Date()): string` → `YYYY-MM-DD` con componentes locales; `monthRangeLocal(now = new Date()): { from: string; to: string }` primer y último día del mes local; `formatDateUtc(iso: string): string` → p. ej. `15 mar 2026` (locale `es`, `timeZone: 'UTC'`).
  - Tipos `TxType = 'income'|'expense'|'transfer'`, `TransactionFormValues { type; amountCents: number|null; date: string; source: string; destination: string; categoryId: string; subcategoryId: string; note: string }`.
  - `transactionSchema` (Zod, `superRefine` por tipo, mensajes: "Ingresa un monto", "Monto no válido", "El monto debe ser mayor que 0", "Fecha no válida", "Elige una cuenta" / "Elige una cuenta o tarjeta", "Elige un destino", "El destino debe ser distinto del origen", "Elige una categoría", "La nota admite hasta 500 caracteres").
  - `toCreatePayload(values): CreatePayload` (solo campos aplicables, `undefined` omitidos, nota vacía omitida) y `toUpdatePayload(values): UpdatePayload` (todas las claves; no aplicables en `null`; nota vacía → `null`); ids se extraen de `account:`/`card:`.
  - `fromTransaction(tx: { type; amountCents; date; accountId?; toAccountId?; creditCardId?; toCreditCardId?; categoryId?; subcategoryId?; note? }): TransactionFormValues` (`date` → `iso.slice(0,10)`).
  - `type TxFilters = { from: string; to: string; type?: TxType; accountId?: string; categoryId?: string; page: number }`; `filtersFromSearch(params: URLSearchParams, now?: Date): TxFilters` (sin `from` ni `to` → mes actual; `page` inválida o < 1 → 1; `type` inválido → ignorado); `filtersToSearch(f: TxFilters): URLSearchParams`; `filtersToQuery(f: TxFilters, limit = 20): string` (cadena `?from=…&to=…&…&page=…&limit=20`).

- [ ] **Step 1: Tests de `dates`:** `todayLocal(new Date(2026,2,15,20,0))` → `'2026-03-15'` (hora local, no UTC); `monthRangeLocal(new Date(2026,1,10))` → `{from:'2026-02-01', to:'2026-02-28'}` y 2028 febrero → día 29; `formatDateUtc('2026-03-15T00:00:00.000Z')` contiene `15` y `2026` aunque la zona local sea anterior a UTC. Run → FAIL.
- [ ] **Step 2:** Implementar `dates.ts`. Run → PASS.
- [ ] **Step 3: Tests de `transaction-form`:** gasto válido con `account:a1` y con `card:c1`; ingreso con `card:` → error en `source`; transferencia sin destino, con destino igual a origen y con destino tarjeta válido; gasto/ingreso sin categoría → "Elige una categoría"; transferencia no exige categoría; monto `null`, `NaN`, `0`, `-5` → errores; fecha `2026-02-31` y `''` inválidas; nota de 501 caracteres. `toCreatePayload` para cada tipo (gasto con cuenta, gasto con tarjeta, ingreso, transferencia a cuenta, transferencia a tarjeta) comparando objeto exacto; `toUpdatePayload` de gasto→transferencia contiene `creditCardId: null, categoryId: null, subcategoryId: null`; nota vacía → `null`; `fromTransaction` ∘ `toUpdatePayload` conserva ids y monto para cada tipo (round-trip). Run → FAIL.
- [ ] **Step 4:** Implementar `transaction-form.ts`. Run → PASS.
- [ ] **Step 5: Tests de `filters`:** sin parámetros → mes actual y `page 1`; `?page=0`, `?page=abc` → 1; `?type=foo` ignorado; `filtersToSearch` omite vacíos y round-trip con `filtersFromSearch`; `filtersToQuery` incluye `limit=20` y solo los filtros presentes. Run → FAIL; implementar `filters.ts`; PASS.
- [ ] **Step 6:** Mutación: quitar `null` de un campo en `toUpdatePayload` y comprobar que falla un test; restaurar. Suite, build, lint. Commit `feat(web): transaction form schema, payloads and filters`.

---

### Task 2: Hooks de movimientos y tarjetas (TDD)

**Files:**
- Create: `web/src/api/credit-cards.ts` (+ test), `web/src/api/transactions.ts` (+ test)

**Interfaces:**
- Consumes: `api`, `TxFilters`/`filtersToQuery`, `CreatePayload`/`UpdatePayload`.
- Produces: tipo `CreditCard` (contrato del spec); `useCreditCards(includeArchived: boolean)`; tipos `Transaction`, `TransactionPage { items: Transaction[]; total: number; page: number; limit: number }`; `useTransactions(filters: TxFilters)` (clave `['transactions', filters]`, `placeholderData: keepPreviousData`); `useCreateTransaction()`, `useUpdateTransaction()` (`{ id, ...payload }`), `useDeleteTransaction()` (`id`), que invalidan `['transactions']`, `['accounts']` y `['credit-cards']`.

- [ ] **Step 1: Tests** (con `stubFetch`/`callOf`): `useCreditCards(false)` → `/credit-cards`, `(true)` → `?includeArchived=true`; `useTransactions` pide la URL de `filtersToQuery`; crear → `POST /transactions` con el cuerpo; actualizar → `PATCH /transactions/:id` sin `id` en el cuerpo y conservando `null`; borrar → `DELETE`; tras una mutación se piden de nuevo las listas de movimientos, cuentas y tarjetas (observar `invalidateQueries` con un `QueryClient` espía). Run → FAIL.
- [ ] **Step 2:** Implementar. Run → PASS.
- [ ] **Step 3:** Suite, build, lint. Commit `feat(web): transactions and credit cards api hooks`.

---

### Task 3: Formulario de movimiento

**Files:**
- Create: `web/src/components/NativeSelect.tsx`, `web/src/features/transactions/TransactionDialog.tsx` (+ `TransactionDialog.test.tsx`)

**Interfaces:**
- Consumes: `transactionSchema`, `toCreatePayload`, `toUpdatePayload`, `fromTransaction`, `todayLocal`, hooks de movimientos, `useAccounts(false)`, `useCreditCards(false)`, `useCategories(false)`, `MoneyInput`.
- Produces: `NativeSelect` (`<select>` con el estilo de `Input`, acepta `ref` y props nativas); `TransactionDialog({ open, onOpenChange, transaction?: Transaction })` (crear sin `transaction`).

- [ ] **Step 1: Tests** (providers + `routeFetch` como en 9a, `vi.mock('sonner')`): (a) crear gasto con cuenta → `POST` con `{type:'expense', amountCents, date, accountId, categoryId, note}` y toast "Movimiento creado"; (b) gasto con tarjeta envía `creditCardId` y no `accountId`; (c) ingreso solo lista cuentas (no tarjetas) y categorías de ingreso; (d) transferencia oculta categoría, origen = destino muestra "El destino debe ser distinto del origen" y no hace `POST`; (e) cambiar el tipo reinicia la categoría; (f) la fecha por defecto es la de hoy local; (g) editar un gasto como transferencia envía `PATCH` con `creditCardId: null, categoryId: null, subcategoryId: null`; (h) al editar, una categoría archivada del movimiento sigue como opción seleccionada; (i) error 409 de la API → toast con el mensaje y el diálogo sigue abierto; (j) la subcategoría solo lista las de la categoría elegida. Run → FAIL.
- [ ] **Step 2:** Implementar `NativeSelect` y `TransactionDialog` (botones de tipo con `aria-pressed`; `source`/`destination` como `NativeSelect` con `<optgroup>` Cuentas/Tarjetas; `key` por movimiento para reiniciar el formulario). Run → PASS.
- [ ] **Step 3:** Mutaciones: quitar el reinicio de categoría al cambiar de tipo y quitar los `null` del update, comprobar fallos; restaurar. Suite, build, lint. Commit `feat(web): transaction form dialog`.

---

### Task 4: Pantalla de movimientos

**Files:**
- Create: `web/src/features/transactions/TransactionRow.tsx`, `web/src/pages/TransactionsPage.tsx` (+ `TransactionsPage.test.tsx`)
- Modify: `web/src/router.tsx` (`/movimientos` → `TransactionsPage`)

**Interfaces:**
- Consumes: `useTransactions`, `useDeleteTransaction`, `useAccounts(true)`, `useCreditCards(true)`, `useCategories(true)`, `filtersFromSearch`/`filtersToSearch`, `TransactionDialog`, `ConfirmDialog`, `CategoryIcon`, `formatMoney`, `formatDateUtc`, `useAuth().user.currency`.
- Produces: `TransactionRow({ tx, names, onEdit, onDelete })`; `TransactionsPage` (filtros desde/hasta/tipo/cuenta/categoría en la URL con `useSearchParams`, "Limpiar", paginación).

- [ ] **Step 1: Tests** (`MemoryRouter` con rutas, `routeFetch`): (a) la petición inicial usa el mes actual y `page=1&limit=20`; (b) fila de gasto con signo `-` y clase de color, ingreso con `+`, transferencia "Origen → Destino" sin signo; (c) etiquetas "Cuota" y "Suscripción"; el de cuota no tiene Editar ni Borrar y muestra su texto explicativo; (d) nombre de una cuenta/categoría archivada se muestra; (e) cambiar el tipo agrega `type=` a la petición y a la URL y vuelve a la página 1 desde la 3; (f) "Siguiente" pide `page=2`, "Página 1 de 3" y el total se muestran; `?page=99` con respuesta vacía muestra el estado vacío; (g) estado vacío con botón "Nuevo movimiento"; (h) borrar pide confirmación, envía `DELETE` y toast "Movimiento eliminado"; error 409 → toast; (i) "Limpiar" restablece el mes actual. Run → FAIL.
- [ ] **Step 2:** Implementar fila y página; enrutar `/movimientos`. Run → PASS.
- [ ] **Step 3:** Mutaciones: no resetear página al cambiar filtro; mostrar Editar en cuotas; comprobar fallos; restaurar. Suite, build, lint. Commit `feat(web): transactions screen`.

---

### Task 5: Verificación manual y cierre

**Files:**
- Modify: `docs/PLAN.md`

- [ ] **Step 1:** Arrancar API y web. Con el usuario de prueba y sus cuentas: crear un ingreso (ver saldo subir en `/cuentas`), un gasto con cuenta, una transferencia entre cuentas, editar el monto y comprobar el ajuste de saldos, cambiar un gasto a transferencia, borrar y ver el saldo revertirse; filtrar por tipo, cuenta, categoría y rango de fechas; paginar (crear al menos 21 movimientos con la API o `curl`); fecha del último día del mes cae en ese mes; error visible (monto inválido, transferencia a la misma cuenta); modo oscuro y móvil legibles. Los gastos con tarjeta quedan para probarse cuando exista la 9c (crear una tarjeta por API si se quiere comprobar ya).
- [ ] **Step 2:** `cd web && npm test && npm run build && npm run lint`; `cd api && npm test`.
- [ ] **Step 3:** En `docs/PLAN.md` marcar `Movimientos: listado con filtros y formulario`. Commit `feat: transactions screen (phase 9b)`. Detener los servidores de desarrollo que se hayan arrancado.
