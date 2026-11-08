# Fase 5 — Tarjetas de crédito y compras diferidas: diseño

Estado: **aprobado** por el dueño del proyecto (2026-11-08).

## Intención
Llevar tarjetas de crédito (cupo, deuda, corte y pago) y compras a cuotas con interés opcional, con deuda consistente y atómica como los saldos de la Fase 4.

## Goals
**Tarjetas** — `/api/credit-cards`: `name`, `limitCents`, `cutoffDay` (1–31), `paymentDay` (1–31), `annualRatePercent` (informativa, ≥ 0), `debtCents`, `isArchived`, timestamps. Respuesta incluye `availableCents = limitCents − debtCents`. La deuda arranca en `initialDebtCents` (default 0) y solo cambia con movimientos. `DELETE` archiva. Días 29–31 usan el último día del mes cuando el mes es más corto.

**Movimientos (cambios a la Fase 4)**
- Gasto: a una cuenta **o** a una tarjeta (`creditCardId`); en tarjeta sube la deuda.
- Pago de tarjeta: transferencia con `toCreditCardId` (origen = cuenta); baja saldo de la cuenta y deuda. Ingresos solo a cuentas.
- Sin bloqueo por cupo ni por sobrepago (la deuda puede quedar negativa).
- Referencias nuevas a cuenta/tarjeta archivada → `409`; ajenas → `404`.
- Movimientos con `installmentPurchaseId` no se editan ni borran directamente (`409`); se gestionan desde la compra.

**Compras a cuotas** — `/api/installment-purchases`: `creditCardId`, `description`, `categoryId`, `subcategoryId?`, `totalCents`, `installments` (2–60), `annualRatePercent` (0–100, default 0), `startDate`, `firstDueDate` y `paymentDay` (instantáneas al crear, para que editar la tarjeta no mueva el calendario), `paidInstallments`, `purchaseTransactionId`.
- Crear (una transacción de MongoDB): la compra + un gasto por `totalCents` en la tarjeta (`source: installment`). La deuda sube el total desde el día 1.
- Calendario (función pura): sin interés `total ÷ n` con el resto de centavos en la primera cuota; con interés, cuota fija (sistema francés, tasa mensual = anual/12) y la última cuota absorbe el redondeo. El capital siempre suma exactamente el total. Cada cuota: `number`, `dueDate`, `principalCents`, `interestCents`, `paymentCents`, `remainingPrincipalCents`.
- Pagar la próxima cuota: `POST /installment-purchases/:id/pay` `{ accountId, date? }`, una transacción: transferencia cuenta→tarjeta por el capital, gasto por el interés (si > 0) en la cuenta con la categoría de la compra, y `paidInstallments + 1` con condición optimista (dos pagos simultáneos → solo uno procede, el otro `409`). Con todas pagadas → `409`.
- Editar: solo `description`, `categoryId`, `subcategoryId` (también actualiza la categoría del gasto de compra). Borrar: solo si `paidInstallments = 0`; revierte la deuda; si no → `409`.

**Períodos y estado de cuenta**
- El período de una compra: el primer día de corte ≥ su fecha (el día de corte pertenece a su propio período); se paga en el primer `paymentDay` posterior al corte. La primera cuota vence ese día; las demás cada mes (con ajuste de fin de mes).
- `GET /credit-cards/:id/statement?date=` (default hoy): período `{start, end}`, `paymentDueDate`, `purchases`, `payments`, `installmentsDue` (cuotas impagas con vencimiento posterior al fin del período y hasta la fecha de pago; las atrasadas no se incluyen), totales y `debtCents`/`availableCents` actuales.
- `GET /installment-purchases/projection?months=12&creditCardId=` (1–36 meses): por mes `YYYY-MM`, suma de capital, interés y pago de las cuotas impagas; las vencidas impagas se cuentan en el mes actual.

## Non-goals
Deshacer un pago de cuota, intereses sobre compras normales, avances en efectivo, pago automático, recordatorios, tarjeta como origen de transferencia.

## Anti-goals
Deuda o saldos que no cuadran con los movimientos; escrituras a medias; calendarios que cambian solos al editar la tarjeta; fuga entre usuarios.

## Approaches
- Interés: **C, tasa por compra con 0 por defecto** (elegido por el dueño; descartados: sin interés, y tasa fija de la tarjeta).
- Deuda de compras a cuotas: **opción 2, deuda completa desde el día 1** con el calendario como proyección y pago explícito de cuotas (elegido por el dueño; descartado: generar un gasto por cuota al vencer, que requiere tareas programadas).

## Decisiones tomadas por el asistente (corregibles)
- El día de corte pertenece a su período; la primera cuota vence en el primer `paymentDay` posterior al corte.
- El interés se registra como gasto en la categoría de la compra.
- Resto de centavos en la primera cuota (tasa 0); cuota final absorbe redondeo (tasa > 0).
- `installments` 2–60, tasa 0–100, `months` 1–36.
- Fechas "de día" se manejan como medianoche UTC.

## Verificación de la fase
Build, lint y tests en verde; con dos usuarios y Atlas: crear tarjeta, gasto con tarjeta (deuda sube), pago a tarjeta (baja), compra a cuotas (deuda sube el total), pagar cuotas (saldos, deuda y contador correctos, interés como gasto), borrar compra sin pagos, protección de movimientos gestionados, estado de cuenta y proyección coherentes, 404/409 esperados. Marcar la fase en `docs/PLAN.md` y commit.
