# Rediseño de /movimientos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Convertir /movimientos en un libro por días con filtros compactos y resumen del período.

**Architecture:** un endpoint de resumen en la API (misma `buildFilter`); en la web, helpers puros (mes, agrupar por día, filtros) probados primero y una página que solo los compone.

**Tech Stack:** NestJS + Mongoose (aggregate), Jest + mongodb-memory-server; React, Tailwind, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-09-movimientos-ui-design.md`

## Global Constraints

- Dinero en centavos; formatear con `formatMoney`. Todo filtrado por `userId`.
- El resumen usa exactamente los filtros de la lista y excluye transferencias.
- `range` solo vive en la URL de la web; nunca llega a la API.
- Textos de UI en español, código en inglés. Sin dependencias nuevas.
- Comandos: `cd api && npm test && npm run build && npm run lint`; `cd web && npm test -- --run && npm run build && npm run lint`.

## Review Focus

- Resumen: sin movimientos → ceros; solo transferencias → ceros; usuario sin datos no ve nada ajeno; filtro por cuenta cuenta gastos con tarjeta solo si el filtro lo incluye.
- Fechas: vaciar ambas fechas → "todo el historial" (no vuelve al mes); `range=all` no se envía a la API ni al export; mes de 28/29/30/31 días y cambio de año con ‹ ›.
- Un día partido entre dos páginas no muestra neto engañoso.
- Movimientos gestionados (cuota) no ofrecen editar/eliminar.
- "Guardar y añadir otro" no deja el diálogo con datos del movimiento anterior (monto, nota, categoría).

### Task 1: API — `GET /transactions/summary`

**Files:** Modify `api/src/transactions/transactions.service.ts`, `transactions.controller.ts`, `api/src/security/isolation.spec.ts`; Create `api/src/transactions/transactions-summary.spec.ts`.

**Interfaces:** Produces `TransactionsService.summary(userId: string, q: TransactionFilters): Promise<{ incomeCents: number; expenseCents: number }>` y la ruta `GET /api/transactions/summary` (antes de `:id`).

- [ ] Pruebas (patrón de `transactions-export.spec.ts`): requiere token; suma ingresos y gastos de un rango y excluye transferencias; respeta `type`, `accountId` y `categoryId`; sin movimientos → `{0,0}`; usuario B no ve a A. Casos de aislamiento en `isolation.spec.ts` (B y vacío).
- [ ] Ejecutar (fallan), implementar con `aggregate([{ $match: filter }, { $group: { _id: '$type', total: { $sum: '$amountCents' } } }])`, ejecutar (pasan), suite completa de la API, build y lint.

### Task 2: Helpers puros de la web (TDD)

**Files:** Create `web/src/features/transactions/month.ts`, `day-groups.ts` (+ tests), `web/src/lib/use-slow.ts`; Modify `web/src/lib/dates.ts` (+ test), `filters.ts`, `filters.test.ts`, `AccountsPage.tsx` (usa `use-slow`).

**Interfaces:** `monthOf(from?, to?): string | null` ("YYYY-MM" si es un mes completo); `monthRange(key): { from; to }`; `shiftMonth(key, delta): string`; `groupByDay<T extends { date: string }>(items: T[]): { day: string; items: T[] }[]`; `formatDayUtc(iso, now?): string`; `filtersFromSearch` lee `range=all`; `filtersToSearch` escribe `range=all` cuando no hay fechas; `filtersToQuery` y `filtersToExportQuery` nunca incluyen `range`; `useSlow(active, ms?)`.

- [ ] Pruebas primero para cada helper (meses de 28/29/30/31 días, diciembre↔enero, rango no mensual → `null`, agrupación conserva orden, día UTC, año solo si no es el actual, `range=all` ida y vuelta, vaciar ambas fechas, `range` ausente de las consultas a la API).
- [ ] Implementar; ejecutar la suite web.

### Task 3: Hook, componentes y filas

**Files:** Modify `web/src/api/transactions.ts` (`useTransactionsSummary(filters)`), `TransactionRow.tsx`; Create `web/src/components/Segmented.tsx` (+ test); Modify `AccountDialog.tsx` para usar `Segmented`.

**Interfaces:** `Segmented<T extends string>({ label, value, options: {value: T; label: string}[], onChange })` (radios nativos, `radiogroup` con `aria-label`); `useTransactionsSummary(filters: TxFilters)` → `{ incomeCents; expenseCents }` con clave `['transactions','summary', …]`.

- [ ] Pruebas: Segmented (roles, selección, flechas); fila (menú con `aria-label`, gestionadas sin menú, gasto sin clase destructiva y con "-", ingreso en verde).
- [ ] Implementar; actualizar pruebas de cuentas al componente compartido.

### Task 4: Página y diálogo

**Files:** Modify `TransactionsPage.tsx`, `TransactionDialog.tsx`, sus tests.

- [ ] Pruebas: encabezados por día; resumen mostrado; ‹ › cambian `from`/`to`; vaciar fechas → "Todo el historial"; chips de cuenta/categoría con ✕; tipo segmentado filtra; estados vacíos (tres casos) y sin paginación; esqueleto + aviso tras 4 s; borrar y editar desde el menú; diálogo: tipo como radios y "Guardar y añadir otro" (crea, mantiene abierto, conserva tipo/fecha/origen, vacía monto/nota/categoría).
- [ ] Implementar la página y el diálogo según el spec; suite web, build y lint.

### Task 5: Verificación y cierre

- [ ] Navegador con la API local y un usuario de prueba con datos de varios meses: claro/oscuro, 360 px, teclado, enlace desde /cuentas, export CSV con filtros, consola limpia.
- [ ] `docs/PLAN.md`, commit, y aviso de lo pendiente del dueño (merge/push).
