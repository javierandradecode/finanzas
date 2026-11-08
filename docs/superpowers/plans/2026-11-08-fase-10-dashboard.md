# Fase 10 — Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir `/` en un dashboard con tarjetas de resumen, tres gráficos (Recharts) y próximos pagos, para el mes elegido.

**Architecture:** Funciones puras (`months.ts`, `dates.ts`, `dashboard-data.ts`) con TDD; hooks de reportes en `web/src/api/reports.ts`; componentes de presentación en `features/dashboard/` que reciben datos por props (cada gráfico con tabla accesible `sr-only`); `DashboardPage` orquesta las consultas con el mes en la URL; `MonthSelector` compartido con Presupuestos.

**Tech Stack:** React 19, Recharts, TanStack Query, React Router, Tailwind/shadcn, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-08-fase-10-dashboard-design.md`

## Global Constraints

- Dinero en centavos; solo formatear al mostrar. `chartAmount(cents)` (`cents / 100`) únicamente para alimentar Recharts. API solo desde `web/src/api/`. UI en español, código en inglés.
- Mes = clave `YYYY-MM`, por defecto el actual del calendario local, en la URL (`?month=`); rangos de fechas `YYYY-MM-DD`.
- Claves de consulta bajo `['reports', …]`; sin invalidaciones cruzadas (refetch al montar).
- Colores desde tokens (`var(--primary)`, `var(--destructive)`, `var(--muted-foreground)`, `var(--border)`); solo la categoría usa su propio color.
- Cada gráfico: contenedor `role="img"` + `aria-label` y una tabla `sr-only` con los mismos datos; estado vacío propio.
- Recharts no dibuja en jsdom: los tests de gráficos verifican datos (tabla accesible, vacíos), no el SVG.
- `npm test`, `npm run build`, `npm run lint` sin errores nuevos al cerrar cada tarea.

## Review Focus

- Mes sin datos: tarjetas en 0,00, gráficos con su texto vacío, sin `NaN`, sin división por cero y sin romper Recharts.
- Dona: 7 categorías → 5 + "Otras" cuyo total completa el gasto del mes; exactamente 5 → sin "Otras"; porcentajes con un decimal que no se dividen por 0.
- Barras mensuales con mes elegido `2026-02` → rango `2025-09` a `2026-02` con etiquetas correctas cruzando el año; en un año bisiesto el rango de la dona de febrero termina el día 29.
- Neto negativo en rojo y con signo; deuda de tarjetas con su moneda.
- Fallo parcial: si un reporte devuelve 500, solo su panel muestra el error; el resto se pinta.
- Cambiar de mes cambia la URL y vuelve a pedir todas las consultas con el mes nuevo; "Mes siguiente" se deshabilita a 12 meses del actual.
- Suscripción atrasada con "Atrasado"; cuotas solo de meses con `count > 0`; presupuestos vacíos con enlace a `/presupuestos`.
- Modo oscuro: sin colores negros/blancos fijos en los gráficos.

---

### Task 1: Dependencia y funciones puras (TDD)

**Files:**
- Modify: `web/package.json` (instalar `recharts`), `web/src/lib/months.ts` (+ `months.test.ts`), `web/src/lib/dates.ts` (+ `dates.test.ts`)
- Create: `web/src/features/dashboard/dashboard-data.ts` (+ test)

**Interfaces:**
- Produces:
  - `shiftMonth(key: string, delta: number): string` (la `shift` interna de `months.ts` exportada; `previousMonth`/`nextMonth` la usan); `monthDateRange(key: string): { from: string; to: string }` (primer y último día, p. ej. `2028-02` → `2028-02-01`/`2028-02-29`).
  - `formatMonthShort(key: string): string` → `mar 26` (locale `es`, UTC).
  - `type CategorySpend = { categoryId: string; name: string; icon: string; color: string; totalCents: number; count: number }`; `topWithOthers(items: CategorySpend[], n = 5): CategorySpend[]` (primeras `n` tal cual; resto agrupado en `{ categoryId: 'others', name: 'Otras', icon: 'ellipsis', color: '#9ca3af', totalCents: suma, count: suma }`; si `items.length <= n`, devuelve la misma lista sin "Otras"); `percentOf(part: number, total: number): number` (un decimal; `0` si `total` es 0); `chartAmount(cents: number): number`; `lastMonthsRange(month: string, count = 6): { from: string; to: string }`.

- [ ] **Step 1:** `cd web && npm install recharts` y comprobar que `npm run build` sigue verde.
- [ ] **Step 2: Tests:** `shiftMonth('2026-01', -1)` → `'2025-12'`, `('2025-12', 1)` → `'2026-01'`, `('2026-03', -14)` → `'2025-01'`; `monthDateRange('2026-02')` y `('2028-02')` (29), `('2026-12')`; `formatMonthShort('2026-03')` contiene `mar` y `26`, y `'2025-12'` contiene `dic`; `topWithOthers` con 7 elementos (suma de "Otras" = suma de los 2 últimos, `count` sumado, lista de 6), con exactamente 5 (sin "Otras"), con 0 y con 2; `percentOf(25, 100)` 25, `(1, 3)` 33.3, `(5, 0)` 0; `chartAmount(12345)` 123.45; `lastMonthsRange('2026-02', 6)` → `{ from: '2025-09', to: '2026-02' }`, `('2026-11')` → `2026-06`/`2026-11`, `count = 1` → mismo mes. Run → FAIL.
- [ ] **Step 3:** Implementar. Run → PASS.
- [ ] **Step 4:** Mutación: dejar "Otras" sin sumar `count`, o desplazar mal el rango; comprobar fallos; restaurar. Suite, build, lint. Commit `feat(web): dashboard data helpers and recharts`.

---

### Task 2: Hooks de reportes (TDD)

**Files:**
- Create: `web/src/api/reports.ts`, `web/src/api/reports.test.tsx`

**Interfaces:**
- Consumes: `api`, `CategorySpend`, `UpcomingCharge`, `MonthlyProjection`.
- Produces: tipos `Summary` (contrato del spec), `SpendingReport { from: string; to: string; totalCents: number; items: CategorySpend[] }`, `MonthlyFlow { month: string; incomeCents: number; expenseCents: number; netCents: number }`, `IncomeVsExpenses { from: string; to: string; months: MonthlyFlow[] }`; `useSummary(month)`, `useSpendingByCategory(from: string, to: string)`, `useIncomeVsExpenses(from: string, to: string)` (claves `['reports', 'summary', month]`, `['reports', 'spending', from, to]`, `['reports', 'flow', from, to]`; `placeholderData: keepPreviousData`).

- [ ] **Step 1: Tests** (`stubFetch`/`callOf`): URLs `/reports/summary?month=2026-03`, `/reports/spending-by-category?from=2026-03-01&to=2026-03-31`, `/reports/income-vs-expenses?from=2025-10&to=2026-03`; devuelven los datos del servidor; un 500 deja `error` en el hook sin lanzar. Run → FAIL.
- [ ] **Step 2:** Implementar. Run → PASS.
- [ ] **Step 3:** Suite, build, lint. Commit `feat(web): report hooks`.

---

### Task 3: Selector de mes compartido (refactor con tests)

**Files:**
- Create: `web/src/components/MonthSelector.tsx` (+ `MonthSelector.test.tsx`)
- Modify: `web/src/pages/BudgetsPage.tsx` (usar el componente), `web/src/lib/months.ts` si hace falta

**Interfaces:**
- Consumes: `previousMonth`, `nextMonth`, `monthsBetween`, `currentMonthKey`, `formatMonth`.
- Produces: `MonthSelector({ month, onChange, maxAhead = 12 }: { month: string; onChange: (month: string) => void; maxAhead?: number })` con botones accesibles "Mes anterior"/"Mes siguiente" y `data-testid="month"` en el nombre del mes (mismos nombres que usa hoy la pantalla de presupuestos).

- [ ] **Step 1: Tests** (fecha del sistema fijada con `vi.useFakeTimers({ toFake: ['Date'] })`): muestra el mes en español; Anterior/Siguiente llaman `onChange` con el mes correcto (incluido `2026-01` → `2025-12` y `2026-12` → `2027-01`); Siguiente deshabilitado a `maxAhead` meses del actual y habilitado a `maxAhead − 1`; `maxAhead` configurable. Run → FAIL.
- [ ] **Step 2:** Implementar, y sustituir el bloque equivalente de `BudgetsPage`. Run → PASS (los tests de `BudgetsPage` deben seguir en verde sin cambios).
- [ ] **Step 3:** Suite, build, lint. Commit `refactor(web): shared month selector`.

---

### Task 4: Gráficos

**Files:**
- Create: `web/src/features/dashboard/SpendingDonut.tsx`, `web/src/features/dashboard/MonthlyBars.tsx`, `web/src/features/dashboard/BudgetBars.tsx` (+ `charts.test.tsx`)

**Interfaces:**
- Consumes: `topWithOthers`, `percentOf`, `chartAmount`, `formatMoney`, `formatMonthShort`, tipos de Task 1–2, `BudgetItem`, `recharts`.
- Produces:
  - `SpendingDonut({ report, currency }: { report: SpendingReport; currency: string })`: dona con `topWithOthers`, leyenda (nombre, monto, porcentaje), tabla `sr-only` (`aria-label` "Gasto por categoría"), vacío (`totalCents === 0` o sin ítems) → "Sin gastos este mes.".
  - `MonthlyBars({ flow, currency }: { flow: IncomeVsExpenses; currency: string })`: barras agrupadas ingresos/gastos por mes (`formatMonthShort`), tabla `sr-only` con ingresos, gastos y neto, vacío (todo en cero) → "Sin movimientos en estos meses.".
  - `BudgetBars({ items, currency }: { items: BudgetItem[]; currency: string })`: barras horizontales límite/gastado por categoría, rojo si `overBudget`, tabla `sr-only`, vacío → "Sin presupuestos este mes." con enlace a `/presupuestos` (usa `Link`).
  - Todos: contenedor `role="img"` con `aria-label` descriptivo, tooltips con `formatMoney`, colores por tokens; altura fija (p. ej. 260 px) para no depender del tamaño del padre.

- [ ] **Step 1: Tests** (render dentro de `MemoryRouter`; Recharts no dibuja en jsdom, se verifican las tablas y vacíos): dona con 7 categorías → la tabla tiene 6 filas con "Otras" y los montos formateados y porcentajes; con 5 → sin "Otras"; total 0 → texto vacío y sin `NaN`; barras mensuales: filas por mes con ingresos/gastos/neto formateados, etiquetas de los 6 meses incluidas las del año anterior; todo cero → vacío; barras de presupuesto: fila por categoría con límite y gastado, marca "excedido" accesible en la tabla para `overBudget`, vacío con el enlace a `/presupuestos`. Run → FAIL.
- [ ] **Step 2:** Implementar. Run → PASS.
- [ ] **Step 3:** Suite, build (el bundle crece por Recharts: anotarlo), lint. Commit `feat(web): dashboard charts`.

---

### Task 5: Tarjetas, próximos pagos y página

**Files:**
- Create: `web/src/features/dashboard/SummaryCards.tsx`, `web/src/features/dashboard/UpcomingPayments.tsx`, `web/src/pages/DashboardPage.tsx` (+ `DashboardPage.test.tsx`, tests de los dos componentes)
- Modify: `web/src/router.tsx` (`/` → `DashboardPage`), `web/src/test/utils.tsx` solo si hace falta

**Interfaces:**
- Consumes: `Summary`, hooks de Task 2, `useBudgetReport`, `MonthSelector`, gráficos de Task 4, `monthFromSearch`, `monthDateRange`, `lastMonthsRange`, `formatMoney`, `formatDateUtc`, `formatMonth`, `useAuth().user.currency`.
- Produces: `SummaryCards({ summary, currency })` (cuatro tarjetas con `data-testid` `card-balance`, `card-income`, `card-expense`, `card-debt`, y neto con signo y color en ingresos y gastos); `UpcomingPayments({ subscriptions, installments, currency })` (dos grupos con enlaces a `/suscripciones` y `/tarjetas`, "Atrasado", solo meses con `count > 0`, vacíos con texto); `DashboardPage`.

- [ ] **Step 1: Tests de componentes:** tarjetas con montos, moneda y neto positivo/negativo (clase de color), 0,00 sin `NaN`; próximos pagos con atrasados, vacíos y filtro de meses sin cuotas. Run → FAIL; implementar; PASS.
- [ ] **Step 2: Tests de página** (`MemoryRouter`, `routeFetch`, `AuthContext`, fecha del sistema fija en noviembre de 2026): (a) pide `summary` del mes actual, la dona con `from=2026-11-01&to=2026-11-30`, la evolución `from=2026-06&to=2026-11` y los presupuestos del mes; (b) muestra las tarjetas y las tablas accesibles de los tres gráficos; (c) Mes anterior cambia `?month=2026-10` y repite las consultas con el mes nuevo (rango de evolución `2026-05`–`2026-10`); (d) un 500 en `spending-by-category` deja el error solo en su panel y el resto visible; (e) mes vacío: textos vacíos y tarjetas en 0,00. Run → FAIL.
- [ ] **Step 3:** Implementar la página y enrutar `/` (cuadrícula 1 columna en móvil, 2 en escritorio; cada panel con su carga y su error). Run → PASS.
- [ ] **Step 4:** Mutaciones: usar el mes actual en vez del elegido para el rango de la dona, y no mostrar "Atrasado"; comprobar fallos; restaurar. Suite, build, lint. Commit `feat(web): dashboard page`.

---

### Task 6: Verificación manual y cierre

**Files:**
- Modify: `docs/PLAN.md`

- [ ] **Step 1:** Arrancar API y web. Con el usuario de prueba (noviembre de 2026 tiene gastos, presupuestos, suscripciones y una compra a cuotas): abrir `/` y comprobar contra `curl` (`summary`, `spending-by-category`, `income-vs-expenses`, `budget-vs-spent`) que cada cifra coincide: saldo total, ingresos, gastos, neto, deuda, categorías y "Otras" (crear 6 categorías con gasto para ver la 6.ª agrupada), barras de seis meses, presupuestos excedidos en rojo, próximos cobros y cuotas; cambiar de mes (anterior y siguiente) y ver URL y cifras; un mes sin datos; modo oscuro y móvil (gráficos legibles); detener la API un momento y comprobar que los paneles muestran error sin romper la página.
- [ ] **Step 2:** `cd web && npm test && npm run build && npm run lint`; `cd api && npm test`.
- [ ] **Step 3:** En `docs/PLAN.md` marcar los tres puntos de la Fase 10. Commit `feat: dashboard (phase 10)`. Detener los servidores de desarrollo que se hayan arrancado.
