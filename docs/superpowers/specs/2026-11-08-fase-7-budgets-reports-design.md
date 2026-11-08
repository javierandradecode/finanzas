# Fase 7 — Presupuestos y reportes: diseño

Estado: **aprobado** por el dueño del proyecto (2026-11-08).

## Intención
Fijar límites de gasto por categoría y mes, y calcular reportes con el aggregation pipeline de MongoDB (gasto por categoría, ingresos contra gastos, presupuesto contra gastado, deuda de tarjetas y un resumen para el dashboard de la Fase 10).

## Goals
**Presupuestos** — `/api/budgets`: `categoryId`, `month` (`YYYY-MM`), `limitCents` (entero ≥ 1), timestamps. Índice único `{ userId, categoryId, month }`.
- La categoría debe ser de gasto (`400`), del usuario (`404`) y estar activa (`409`). Duplicado → `409`.
- `GET /budgets?month=` (default mes actual UTC), `POST /budgets`, `PATCH /budgets/:id` (solo `limitCents`), `DELETE /budgets/:id` (borrado real, 204).
- `POST /budgets/copy { from, to }`: copia los presupuestos de `from` a `to`, saltando las categorías que ya tienen presupuesto en `to` (`already-exists`) y las archivadas (`category-archived`). Devuelve `{ copied, skipped: [{ categoryId, reason }] }`. `from === to` → `400`; mes origen vacío → `copied: 0`. A prueba de copias simultáneas (sin duplicados).

**Reportes** — `/api/reports/…`, solo lectura, filtrados por usuario, meses en UTC. **Gasto** = movimientos tipo gasto (de cuenta o tarjeta, incluida la compra a cuotas completa en su fecha de compra y los intereses al pagarse); transferencias y pagos a tarjeta no cuentan.
- `GET spending-by-category?from&to` (ISO 8601, `to` solo fecha cubre todo el día UTC; default: mes actual): `{ from, to, totalCents, items: [{ categoryId, name, icon, color, totalCents, count }] }` de mayor a menor; nombres también de categorías archivadas.
- `GET income-vs-expenses?from&to` (meses `YYYY-MM`; default últimos 12 incluyendo el actual; máximo 60; `from > to` → `400`): `{ from, to, months: [{ month, incomeCents, expenseCents, netCents }] }` con ceros en meses vacíos.
- `GET budget-vs-spent?month` (default mes actual): `{ month, items: [{ budgetId, categoryId, name, icon, color, limitCents, spentCents, remainingCents, percentUsed, overBudget }], totals: { limitCents, spentCents, overBudgetCount } }`. El gasto de una categoría incluye todas sus subcategorías. `percentUsed` = porcentaje con un decimal (única cifra no entera; no es dinero). Items de mayor a menor `percentUsed`.
- `GET card-debt?months=12` (1–36): `{ totalDebtCents, totalLimitCents, totalAvailableCents, cards: [{ cardId, name, debtCents, limitCents, availableCents }], projectedPayments }` donde `projectedPayments` es la proyección de cuotas de la Fase 5.
- `GET summary?month` (default mes actual): `{ month, totalBalanceCents` (cuentas activas)`, cardDebtCents` (tarjetas activas)`, incomeCents, expenseCents, netCents, topCategories` (5 mayores gastos del mes)`, budgets: { limitCents, spentCents, overBudgetCount }, upcomingSubscriptions` (próximos 14 días)`, installmentProjection` (próximos 3 meses)` }`.

## Non-goals
Comparación con el período anterior, ingresos por categoría, desglose por subcategoría o cuenta, pronósticos, exportar CSV (Fase 11), caché, presupuestos que se repiten solos.

## Anti-goals
Mezclar datos de usuarios; contar traspasos como gasto; meses desplazados por zona horaria; totales que no cuadran con los movimientos.

## Approaches
Presupuesto: **C, un documento por categoría y mes más endpoint de copia** (elegido por el dueño; descartados: sin copiar, y presupuesto recurrente hasta cambio). Una sola forma sensata para los reportes: `aggregate()` sobre `transactions` con `$match` → `$group` (+ `$lookup` de nombres), sin duplicar datos.

## Decisiones tomadas por el asistente (corregibles)
- `DELETE` de presupuesto es borrado real.
- `budget-vs-spent` hace dos consultas (presupuestos del mes y gasto agregado por categoría) y las une en el service.
- Defaults: mes actual o últimos 12 meses; top 5 categorías; rango máximo 60 meses; proyección de resumen 3 meses.
- Los ids deben convertirse a `ObjectId` a mano en los `$match` de los pipelines.
- El frontend debe enviar fechas sin hora para que los meses no se corran por zona horaria.

## Verificación de la fase
Build, lint y tests en verde; con Atlas y dos usuarios: gastos, ingresos, transferencia, pago de tarjeta y compra a cuotas sembrados a mano y totales de cada reporte comprobados contra la suma de los movimientos; presupuestos creados, copiados al mes siguiente (con saltos) y comparados con el gasto; otro usuario ve todo vacío; 400/404/409 esperados. Marcar la fase en `docs/PLAN.md` y commit.
