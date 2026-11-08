# Fase 9c — Tarjetas y compras diferidas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pantallas `/tarjetas` y `/tarjetas/:id` para gestionar tarjetas, ver su estado de cuenta y administrar compras a cuotas (crear con vista previa, pagar cuota, editar, borrar).

**Architecture:** Lógica pura en `lib/installments.ts` y `features/cards/*-form.ts` (TDD); hooks de TanStack Query en `web/src/api/`; diálogos RHF + Zod; dos páginas y paneles de dominio en `features/cards/`.

**Tech Stack:** React 19, React Router (ruta con parámetro), TanStack Query, React Hook Form + Zod, Tailwind/shadcn, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-08-fase-9c-cards-installments-design.md`

## Global Constraints

- Dinero en centavos; solo formatear al mostrar. Llamadas a la API solo en `web/src/api/`. UI en español, código en inglés.
- Fechas: se envían `YYYY-MM-DD`; se muestran con `formatDateUtc`; "hoy" con `todayLocal()`.
- Claves de consulta: `['credit-cards', {includeArchived}]`, `['credit-cards', id, 'statement', date]`, `['installment-purchases', {creditCardId}]`, `['installment-purchases', 'projection', months]`.
- Invalidaciones: mutaciones de tarjeta → `['credit-cards']`; crear/borrar compra y pagar cuota → `['installment-purchases']`, `['credit-cards']`, `['accounts']`, `['transactions']`; editar compra → `['installment-purchases']`.
- Texto de campos numéricos (días, tasa, n.º de cuotas) se convierte en el payload; la tasa acepta coma o punto (`18,5`).
- Reutilizar piezas de 9a/9b (`MoneyInput`, `ConfirmDialog`, `NativeSelect`, `FieldError`, `test/utils.tsx`).
- `npm test`, `npm run build`, `npm run lint` sin errores nuevos al cerrar cada tarea.

## Review Focus

- La vista previa coincide con la API en: 1200,00/12 sin interés (10000 c/u), 100000/3 (33334, 33333, 33333), 100000/7 (14290 + 6×14285), 120000 al 12 % en 12 cuotas (cuota 10662, primer interés 1200, capital 9462, saldo 110538, última cuota cierra en 0), y devuelve `null` (sin romper la pantalla) para monto < cuotas o monto muy pequeño con tasa alta.
- Compra con todas las cuotas pagadas: sin botón "Pagar", etiqueta "Pagada"; compra con alguna cuota pagada: Eliminar deshabilitado con la razón.
- Doble clic en "Pagar cuota": el botón se deshabilita al enviar (una sola petición); 409 de la API → toast sin cerrar el diálogo.
- Estado de cuenta: Anterior/Siguiente piden `date` = `period.start − 1 día` / `period.end + 1 día`; Siguiente deshabilitado en el período actual.
- Deuda mayor que el cupo o negativa: la barra se limita visualmente a 0–100 % y el texto muestra el valor real.
- Tarjeta archivada: se muestra atenuada, "Nueva compra a cuotas" deshabilitada, y no aparece como opción al crear compras desde otra pantalla.
- Tasa `18,5` y días fuera de 1–31 o no enteros: validación en el formulario, sin petición.
- Error de la API al crear/editar: toast con el mensaje y el diálogo sigue abierto.

---

### Task 1: Cálculo de cuotas y esquemas de formulario (TDD)

**Files:**
- Create: `web/src/lib/installments.ts` (+ test), `web/src/features/cards/card-form.ts` (+ test), `web/src/features/cards/purchase-form.ts` (+ test)

**Interfaces:**
- Produces:
  - `previewSchedule(input: { totalCents: number; installments: number; annualRatePercent: number }): SchedulePreview | null` con `SchedulePreview { items: { number: number; principalCents: number; interestCents: number; paymentCents: number; remainingPrincipalCents: number }[]; firstPaymentCents: number; totalInterestCents: number; totalPaidCents: number }`; `null` si los datos no son válidos (entero ≥ 1, n entero ≥ 1, `total >= n`, tasa ≥ 0) o si alguna cuota queda con capital < 1.
  - `parseRate(text: string): number | null` (acepta `18`, `18,5`, `18.5`; ≥ 0; hasta 2 decimales; vacío → `null`) y `parseIntText(text: string): number | null` (solo dígitos).
  - `cardSchema` (campos de texto `name`, `limitCents: number|null` con NaN, `cutoffDay`, `paymentDay`, `annualRatePercent`, `initialDebtCents: number|null`) con mensajes "Ingresa un nombre", "Monto no válido", "El cupo debe ser mayor que 0", "Elige un día entre 1 y 31", "Tasa no válida"; `type CardFormValues`; `toCardPayload(v, mode: 'create'|'update')` (create incluye `initialDebtCents` solo si hay valor; tasa vacía → 0).
  - `purchaseSchema` (`description` ≤ 200, `categoryId`, `subcategoryId`, `totalCents`, `installments` texto 2–60, `annualRatePercent` texto (vacío = 0, 0–100), `startDate` real) con mensajes "Ingresa una descripción", "Elige una categoría", "Monto no válido"/"El monto debe ser mayor que 0", "Entre 2 y 60 cuotas", "Tasa entre 0 y 100", "Fecha no válida"; `toPurchasePayload(v, creditCardId): CreatePurchasePayload`; `payInstallmentSchema` (`accountId` "Elige una cuenta", `date` real).

- [ ] **Step 1: Tests de `installments`:** los casos del Review Focus (valores exactos de items), suma de `principalCents` = total en una tabla de combinaciones (varios totales/n/tasas), `remainingPrincipalCents` de la última = 0, `firstPaymentCents` y `totalPaidCents = total + totalInterest`, inválidos → `null` (n=1.5, total 1 con n=2, `(100, 60, 100 %)`). Run → FAIL.
- [ ] **Step 2:** Implementar `previewSchedule` portando el algoritmo de `api/src/installment-purchases/installment-schedule.ts` (sin fechas; en vez de lanzar, devuelve `null`). Run → PASS.
- [ ] **Step 3: Tests de `card-form` y `purchase-form`:** válidos e inválidos por campo (mensajes exactos), `parseRate('18,5')`→18.5, `'abc'`/`'1,234'`→null; `toCardPayload` create/update (con/sin deuda inicial, tasa vacía → 0, días como número); `toPurchasePayload` (subcategoría vacía omitida, tasa vacía → 0, cuotas como número, `creditCardId` incluido). Run → FAIL; implementar; PASS.
- [ ] **Step 4:** Mutación: cambiar el reparto del sobrante a la última cuota y comprobar que falla; restaurar. Suite, build, lint. Commit `feat(web): installment preview and card/purchase form schemas`.

---

### Task 2: Hooks de tarjetas y compras (TDD)

**Files:**
- Modify: `web/src/api/credit-cards.ts` (añadir mutaciones y estado de cuenta)
- Create: `web/src/api/installment-purchases.ts`, `web/src/api/cards-api.test.tsx`

**Interfaces:**
- Consumes: `api`, payloads de Task 1, tipo `Transaction`.
- Produces:
  - En `credit-cards.ts`: `useCreateCard()`, `useUpdateCard()` (`{id, ...fields, isArchived?}`), `useArchiveCard()` (`id`), tipo `Statement` (contrato del spec) y `useStatement(cardId: string, date?: string)` (clave `['credit-cards', cardId, 'statement', date ?? 'today']`, `date` en la query solo si se da; `placeholderData: keepPreviousData`).
  - En `installment-purchases.ts`: tipos `InstallmentPurchase`, `ScheduleRow`, `MonthlyProjection`, `CreatePurchasePayload`; `usePurchases(creditCardId?: string)`, `useCreatePurchase()`, `useUpdatePurchase()` (`{id, description?, categoryId?, subcategoryId?: string|null}`), `useDeletePurchase()` (`id`), `usePayInstallment()` (`{id, accountId, date?}`), `useProjection(months = 12)`.

- [ ] **Step 1: Tests** (`stubFetch`/`callOf`, `QueryClient` con espía de `invalidateQueries`): URLs, métodos y cuerpos de cada hook (`/credit-cards/:id/statement` con y sin `?date=`; `PATCH` sin `id` en el cuerpo; `POST /installment-purchases/:id/pay`; `GET /installment-purchases?creditCardId=..`; `GET /installment-purchases/projection?months=12`); invalidaciones según Global Constraints. Run → FAIL.
- [ ] **Step 2:** Implementar. Run → PASS.
- [ ] **Step 3:** Suite, build, lint. Commit `feat(web): cards and installment purchases api hooks`.

---

### Task 3: Pantalla de tarjetas

**Files:**
- Create: `web/src/components/ProgressBar.tsx`, `web/src/features/cards/CardDialog.tsx`, `web/src/features/cards/ProjectionPanel.tsx`, `web/src/pages/CardsPage.tsx` (+ `CardsPage.test.tsx`)
- Modify: `web/src/router.tsx` (`/tarjetas` → `CardsPage`)

**Interfaces:**
- Consumes: `cardSchema`, `toCardPayload`, hooks de tarjetas y proyección, `MoneyInput`, `ConfirmDialog`, `Switch`, `formatMoney`.
- Produces: `ProgressBar({ value: number; max: number; className? })` (porcentaje limitado a 0–100, `role="progressbar"` con `aria-valuenow`), `CardDialog({ open, onOpenChange, card? })`, `ProjectionPanel()`, `CardsPage`.

- [ ] **Step 1: Tests de página** (`routeFetch`, `vi.mock('sonner')`, `AuthContext` con moneda USD, `MemoryRouter`): (a) lista con deuda, disponible, "Corte día 5 · Pago día 20" y barra con `aria-valuenow` correcto; deuda > cupo → barra al 100 % y texto con el valor real; (b) estado vacío con "Nueva tarjeta"; (c) crear con `1.500,00` de cupo, días `5`/`20`, tasa `18,5` y deuda inicial vacía → `POST` con `limitCents: 150000`, `annualRatePercent: 18.5` y sin `initialDebtCents`; (d) día 32 y tasa `abc` muestran errores sin petición; (e) editar sin campo de deuda inicial → `PATCH` sin `initialDebtCents`; (f) archivar con confirmación (`DELETE`), "Mostrar archivadas" pide `?includeArchived=true` y "Restaurar" envía `PATCH {isArchived:false}`; (g) error 400 → toast y diálogo abierto; (h) la proyección lista mes, n.º de cuotas y total, y "Sin cuotas pendientes" si está vacía; (i) "Ver detalle" enlaza a `/tarjetas/:id`. Run → FAIL.
- [ ] **Step 2:** Implementar y enrutar. Run → PASS.
- [ ] **Step 3:** Mutaciones: quitar el tope visual 100 % y no omitir `initialDebtCents` vacío; comprobar fallos; restaurar. Suite, build, lint. Commit `feat(web): cards screen`.

---

### Task 4: Detalle de tarjeta: estado de cuenta y compras a cuotas

**Files:**
- Create: `web/src/features/cards/StatementPanel.tsx`, `web/src/features/cards/PurchaseDialog.tsx`, `web/src/features/cards/PurchaseCard.tsx`, `web/src/features/cards/PayInstallmentDialog.tsx`, `web/src/pages/CardDetailPage.tsx` (+ `CardDetailPage.test.tsx`)
- Modify: `web/src/router.tsx` (ruta `tarjetas/:id` → `CardDetailPage`, dentro del layout protegido)

**Interfaces:**
- Consumes: `useStatement`, hooks de compras, `previewSchedule`, `purchaseSchema`, `toPurchasePayload`, `payInstallmentSchema`, `useAccounts`, `useCategories`, `useCreditCards`, `formatMoney`, `formatDateUtc`, `todayLocal`, `useParams`.
- Produces: `StatementPanel({ cardId })` (período, compras, pagos, cuotas por vencer, totales, fecha límite, Anterior/Siguiente), `PurchaseDialog({ open, onOpenChange, cardId, purchase? })` (crear con vista previa; editar solo descripción/categoría/subcategoría), `PurchaseCard({ purchase, onPay, onEdit, onDelete })`, `PayInstallmentDialog({ open, onOpenChange, purchase })`, `CardDetailPage`.

- [ ] **Step 1: Tests de página** (`MemoryRouter` en `/tarjetas/k1`, `routeFetch`): (a) cabecera con nombre, deuda y disponible; (b) estado de cuenta muestra compras, pagos, cuotas por vencer, totales y fecha límite; Anterior pide `date` = día anterior al `period.start`; Siguiente deshabilitado cuando el período contiene hoy (fecha del sistema fijada con `vi.useFakeTimers({ toFake: ['Date'] })`); (c) compra con "3 de 12 pagadas", barra, y calendario expandible con filas pagadas marcadas; (d) crear compra: la vista previa muestra la cuota y se actualiza al cambiar monto/cuotas/tasa, `POST` con el cuerpo del contrato; monto/cuotas inválidos muestran errores sin petición y sin romper la vista previa; (e) pagar cuota: lista solo cuentas activas, muestra el desglose de capital e interés de la próxima cuota, un doble clic envía una sola petición, `POST /installment-purchases/:id/pay` con `accountId` y `date`, 409 → toast y diálogo abierto; (f) compra totalmente pagada: sin "Pagar", con "Pagada"; (g) Eliminar deshabilitado con razón si hay cuotas pagadas, y con confirmación envía `DELETE` si no las hay; (h) editar solo permite descripción/categoría/subcategoría (sin campos de monto) y envía `PATCH`; (i) tarjeta archivada: "Nueva compra a cuotas" deshabilitada. Run → FAIL.
- [ ] **Step 2:** Implementar y enrutar. Run → PASS.
- [ ] **Step 3:** Mutaciones: no deshabilitar el botón al enviar el pago, y permitir "Pagar" con `isPaidOff`; comprobar fallos; restaurar. Suite, build, lint. Commit `feat(web): card detail with statement and installment purchases`.

---

### Task 5: Verificación manual y cierre

**Files:**
- Modify: `docs/PLAN.md`

- [ ] **Step 1:** Arrancar API y web. Con el usuario de prueba y sus cuentas: crear una tarjeta (cupo 1.500, corte 5, pago 20, deuda inicial 0); ver su barra y estado de cuenta; registrar un gasto con tarjeta en `/movimientos` (9b) y comprobar que sube la deuda y aparece en el estado de cuenta; crear una compra a cuotas de 1.200,00 a 12 cuotas sin interés y otra al 12 % (la vista previa debe dar 100,00 por cuota y 106,62 con 12,00 de interés en la primera); ver la deuda subir; pagar la primera cuota desde una cuenta y comprobar saldo de la cuenta, deuda y cupo; intentar borrar la compra pagada (bloqueado) y borrar otra sin pagos (la deuda se revierte); navegar el estado de cuenta a meses anteriores; pagar la tarjeta con una transferencia (9b) y ver la deuda bajar; archivar/restaurar la tarjeta; proyección de 12 meses; modo oscuro y móvil legibles. Comprobar cifras con la API (`curl`).
- [ ] **Step 2:** `cd web && npm test && npm run build && npm run lint`; `cd api && npm test`.
- [ ] **Step 3:** En `docs/PLAN.md` marcar `Tarjetas y compras diferidas`. Commit `feat: cards and installment purchases screens (phase 9c)`. Detener los servidores de desarrollo que se hayan arrancado.
