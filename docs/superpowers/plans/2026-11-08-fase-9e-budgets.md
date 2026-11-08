# Fase 9e — Presupuestos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pantalla `/presupuestos` para fijar límites mensuales por categoría de gasto y ver el avance del mes, con crear, editar, eliminar y copiar el mes anterior.

**Architecture:** Lógica pura en `lib/months.ts` y `features/budgets/budget-form.ts` (TDD); hooks de TanStack Query en `web/src/api/budgets.ts`; `BudgetDialog` (RHF + Zod) y `BudgetsPage` con el mes en la URL.

**Tech Stack:** React 19, React Router (`useSearchParams`), TanStack Query, React Hook Form + Zod, Tailwind/shadcn, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-08-fase-9e-budgets-design.md`

## Global Constraints

- Dinero en centavos; solo formatear al mostrar. API solo en `web/src/api/`. UI en español, código en inglés.
- Mes = clave `YYYY-MM`; por defecto el mes actual del calendario local; en la URL como `?month=`; un valor inválido cae al mes actual.
- Claves de consulta: `['budgets', 'report', month]`; toda mutación invalida `['budgets']`.
- Eliminar presupuesto borra de verdad (con confirmación); editar solo cambia el límite.
- El gasto mostrado viene de `budget-vs-spent` (incluye tarjeta y cuotas en su fecha de compra); no se recalcula en el cliente.
- Reutilizar `MoneyInput`, `ConfirmDialog`, `NativeSelect`, `ProgressBar`, `CategoryIcon`, `FieldError`, `test/utils.tsx` (`routeFetch`, `stubFetch`, `callOf`, `makeClient`).
- `npm test`, `npm run build`, `npm run lint` sin errores nuevos al cerrar cada tarea.

## Review Focus

- Diciembre → enero: `nextMonth('2025-12')` = `'2026-01'` y `previousMonth('2026-01')` = `'2025-12'`; `?month=2026-13` o `?month=abc` caen al mes actual.
- Umbrales: 79,9 % → verde, 80 % → ámbar, 100 % sin exceder → ámbar, excedido → rojo; la barra nunca pasa de 100 % visual pero el texto muestra el porcentaje real y "excedido por X".
- Copiar: con N copiados (singular/plural), con omitidos por "ya existían" y por categoría archivada, con 0 copiados y todos omitidos, y con 0 y nada que copiar; los textos son distintos.
- Crear: el desplegable solo ofrece categorías de gasto activas sin presupuesto en el mes; si no queda ninguna el botón se deshabilita con su explicación; un 409 (duplicado) da toast sin cerrar el diálogo.
- Un presupuesto de una categoría luego archivada se sigue mostrando (el reporte trae su nombre) y se puede editar o eliminar.
- Límite 0, negativo, vacío o `abc`: errores del formulario, sin petición.
- Mes sin presupuestos y mes con gasto 0: estado vacío y barra en 0 %, sin división por cero ni `NaN %`.
- "Siguiente" se deshabilita más allá de 12 meses desde el mes actual.

---

### Task 1: Lógica de meses y de presupuestos (TDD)

**Files:**
- Create: `web/src/lib/months.ts` (+ test), `web/src/features/budgets/budget-form.ts` (+ test)

**Interfaces:**
- Produces:
  - `currentMonthKey(now = new Date()): string` (`YYYY-MM`, calendario local); `isMonthKey(s: string): boolean` (`^\d{4}-(0[1-9]|1[0-2])$`); `previousMonth(key: string): string`; `nextMonth(key: string): string`; `monthsBetween(from: string, to: string): number` (diferencia en meses, con signo); `monthFromSearch(params: URLSearchParams, now?: Date): string` (lee `month`; inválido o ausente → mes actual).
  - Tipos `BudgetItem { budgetId; categoryId; name; icon; color; limitCents; spentCents; remainingCents; percentUsed; overBudget }`, `CopyResult { copied: number; skipped: { categoryId: string; reason: 'already-exists' | 'category-archived' }[] }`.
  - `budgetStatus(item: { overBudget: boolean; percentUsed: number }): 'ok' | 'warn' | 'over'`.
  - `budgetSchema` (campos `categoryId: string`, `limitCents: number | null`; mensajes "Elige una categoría", "Ingresa un monto", "Monto no válido", "El límite debe ser mayor que 0"); `type BudgetFormValues`.
  - `copyMessage(result: CopyResult): { kind: 'success' | 'info'; text: string }`.

- [ ] **Step 1: Tests de `months`:** `currentMonthKey(new Date(2026, 0, 31, 23, 0))` → `'2026-01'` (local, no UTC); `previousMonth('2026-01')` → `'2025-12'`, `nextMonth('2025-12')` → `'2026-01'`, `previousMonth('2026-03')`, `nextMonth('2026-03')`; `isMonthKey` acepta `2026-03` y rechaza `2026-13`, `2026-00`, `2026-3`, `abc`; `monthsBetween('2026-03','2027-03')` = 12 y `('2026-03','2025-12')` = −3; `monthFromSearch` con `month=2026-05`, con `month=2026-13`, `month=abc` y sin parámetro (mes actual). Run → FAIL.
- [ ] **Step 2:** Implementar `months.ts`. Run → PASS.
- [ ] **Step 3: Tests de `budget-form`:** `budgetStatus` en 79.9 → `ok`, 80 → `warn`, 100 con `overBudget:false` → `warn`, `overBudget:true` → `over` (aunque `percentUsed` sea 100.1); esquema válido e inválido por campo (mensajes exactos, `null`, `NaN`, 0, −5); `copyMessage`: `{copied:1}` → éxito "1 presupuesto copiado", `{copied:3, skipped:[2 already-exists, 1 category-archived]}` → éxito "3 presupuestos copiados, 2 ya existían, 1 con categoría archivada", `{copied:0, skipped:[2 already-exists]}` → info que empieza con "No se copió nada" e incluye "2 ya existían", `{copied:0, skipped:[]}` → info "No había presupuestos en el mes anterior". Run → FAIL; implementar; PASS.
- [ ] **Step 4:** Mutación: cambiar el umbral 80 por 90 y el singular de `copyMessage`; comprobar fallos; restaurar. Suite, build, lint. Commit `feat(web): month helpers and budget logic`.

---

### Task 2: Hooks de presupuestos (TDD)

**Files:**
- Create: `web/src/api/budgets.ts`, `web/src/api/budgets.test.tsx`

**Interfaces:**
- Consumes: `api`, `BudgetItem`, `CopyResult`.
- Produces: tipo `BudgetReport { month: string; items: BudgetItem[]; totals: { limitCents: number; spentCents: number; overBudgetCount: number } }`; `useBudgetReport(month: string)` (`GET /reports/budget-vs-spent?month=`, `placeholderData: keepPreviousData`); `useCreateBudget()` (`{categoryId, month, limitCents}`); `useUpdateBudget()` (`{id, limitCents}`); `useDeleteBudget()` (`id`); `useCopyBudgets()` (`{from, to}` → `CopyResult`).

- [ ] **Step 1: Tests** (`stubFetch`/`callOf`, espía de `invalidateQueries`): URL del reporte con el mes; `POST /budgets` con cuerpo; `PATCH /budgets/:id` con `{limitCents}` y sin `id` en el cuerpo; `DELETE`; `POST /budgets/copy` devuelve el resultado; todas invalidan `['budgets']`. Run → FAIL.
- [ ] **Step 2:** Implementar. Run → PASS.
- [ ] **Step 3:** Suite, build, lint. Commit `feat(web): budgets api hooks`.

---

### Task 3: Barra con tono y diálogo de presupuesto

**Files:**
- Modify: `web/src/components/ProgressBar.tsx` (prop `tone?: 'ok' | 'warn' | 'over'`; mantiene `danger` para compatibilidad con 9c), `web/src/pages/CardsPage.tsx` solo si hace falta para mantener tests verdes
- Create: `web/src/features/budgets/BudgetDialog.tsx` (+ `BudgetDialog.test.tsx`)

**Interfaces:**
- Consumes: `budgetSchema`, hooks de Task 2, `useCategories(true)`, `MoneyInput`, `NativeSelect`, `CategoryIcon`.
- Produces: `ProgressBar` acepta `tone` (`ok` → `bg-primary`, `warn` → ámbar, `over` → `bg-destructive`); `BudgetDialog({ open, onOpenChange, month, takenCategoryIds, item? })` (crear sin `item`: categoría de gasto activa no incluida en `takenCategoryIds` + límite; editar con `item`: categoría fija y solo límite).

- [ ] **Step 1: Tests** (`routeFetch`, `vi.mock('sonner')`): (a) crear → `POST /budgets` con `{categoryId, month, limitCents}` y toast "Presupuesto creado"; (b) solo ofrece categorías de gasto activas sin presupuesto (ni de ingreso, ni archivadas, ni las de `takenCategoryIds`); (c) límite vacío, `abc` y 0 muestran error sin petición; (d) editar muestra la categoría fija sin selector, precarga el límite y envía `PATCH {limitCents}`; (e) 409 → toast con el mensaje y el diálogo sigue abierto; (f) `ProgressBar` con `tone` aplica la clase de color correspondiente (`warn` ≠ `ok` ≠ `over`) y `danger` sigue funcionando. Run → FAIL.
- [ ] **Step 2:** Implementar. Run → PASS.
- [ ] **Step 3:** Suite (los tests de 9c deben seguir en verde), build, lint. Commit `feat(web): budget dialog and progress bar tones`.

---

### Task 4: Pantalla de presupuestos

**Files:**
- Create: `web/src/pages/BudgetsPage.tsx` (+ `BudgetsPage.test.tsx`)
- Modify: `web/src/router.tsx` (`/presupuestos` → `BudgetsPage`)

**Interfaces:**
- Consumes: `useBudgetReport`, `useDeleteBudget`, `useCopyBudgets`, `monthFromSearch`, `previousMonth`, `nextMonth`, `monthsBetween`, `currentMonthKey`, `budgetStatus`, `copyMessage`, `BudgetDialog`, `ConfirmDialog`, `ProgressBar`, `CategoryIcon`, `useCategories(true)`, `formatMonth`, `formatMoney`, `useAuth().user.currency`.
- Produces: `BudgetsPage` (selector de mes en la URL, resumen, lista, "Nuevo presupuesto", "Copiar mes anterior").

- [ ] **Step 1: Tests** (`MemoryRouter`, `routeFetch`, `AuthContext`, fecha del sistema fijada con `vi.useFakeTimers({ toFake: ['Date'] })`): (a) pide el reporte del mes actual y muestra el nombre del mes; (b) resumen con límite total, gastado, restante y excedidos; (c) filas con "Gastado X de Y · queda Z" y, para una excedida, "excedido por Z" y barra de tono `over`; 80 % → `warn`; 50 % → `ok`; barra con `aria-valuenow` limitado a 100 y porcentaje real en el texto; (d) gasto 0 sin `NaN`; (e) Anterior/Siguiente cambian `?month=` y piden el mes correcto, incluido el cruce de año; `?month=abc` cae al actual; Siguiente deshabilitado a 12 meses del actual; (f) estado vacío con las dos sugerencias; (g) "Nuevo presupuesto" abre el diálogo con las categorías sin presupuesto y queda deshabilitado con explicación si no hay ninguna; (h) editar límite → `PATCH`; (i) eliminar con confirmación → `DELETE`, toast "Presupuesto eliminado"; (j) copiar: éxito, con omitidos, todo omitido y nada que copiar producen los toasts de `copyMessage` (`success` o `info`), y la llamada usa `{from: mes anterior, to: mes visible}`; (k) un presupuesto de categoría archivada se muestra y se puede eliminar. Run → FAIL.
- [ ] **Step 2:** Implementar y enrutar. Run → PASS.
- [ ] **Step 3:** Mutaciones: no limitar la barra a 100, usar el mes actual en vez del visible al copiar, no deshabilitar "Siguiente"; comprobar fallos; restaurar. Suite, build, lint. Commit `feat(web): budgets screen`.

---

### Task 5: Verificación manual y cierre

**Files:**
- Modify: `docs/PLAN.md`

- [ ] **Step 1:** Arrancar API y web. Con el usuario de prueba (ya tiene gastos de noviembre en Alimentación, Entretenimiento, Gimnasio…): crear un presupuesto de Alimentación con un límite menor que lo gastado (debe verse excedido en rojo con las cifras exactas del reporte, comprobadas con `curl`) y otro de Gimnasio con límite holgado (verde); uno cercano al 80–100 % (ámbar); registrar un gasto nuevo desde Movimientos y ver subir la barra tras volver; editar un límite; navegar a diciembre y copiar noviembre (verificar toast y filas); repetir la copia (omitidos); archivar una categoría con presupuesto y comprobar que sigue visible; eliminar un presupuesto; probar un duplicado (409); modo oscuro y móvil legibles.
- [ ] **Step 2:** `cd web && npm test && npm run build && npm run lint`; `cd api && npm test`.
- [ ] **Step 3:** En `docs/PLAN.md` marcar `Presupuestos` (Fase 9). Commit `feat: budgets screen (phase 9e)`. Detener los servidores de desarrollo que se hayan arrancado.
