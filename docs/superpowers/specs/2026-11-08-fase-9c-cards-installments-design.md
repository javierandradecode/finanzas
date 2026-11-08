# Fase 9c — Tarjetas y compras diferidas (frontend): diseño

Tercera de cinco partes de la Fase 9 (9a cuentas y categorías ✔, 9b movimientos ✔, **9c tarjetas y compras diferidas**, 9d suscripciones, 9e presupuestos).

## Intención
Gestionar tarjetas de crédito (cupo, corte, pago, deuda), ver su estado de cuenta por período y administrar las compras a cuotas (crear, ver calendario, pagar la siguiente cuota, editar, borrar), contra la API existente.

## Objetivos
- `/tarjetas`: lista de tarjetas con uso del cupo; crear, editar, archivar y restaurar; resumen de pagos de cuotas de los próximos 12 meses.
- `/tarjetas/:id`: estado de cuenta navegable por período y compras a cuotas de esa tarjeta.
- Crear compra a cuotas con vista previa de la cuota; pagar la siguiente cuota; editar descripción/categoría; borrar si no tiene cuotas pagadas.

## No objetivos
Deshacer un pago de cuota (la API no lo permite), editar monto/cuotas/tasa de una compra, exportar o imprimir el estado de cuenta, gráficos (Fase 10), suscripciones (9d).

## Restricciones
CLAUDE.md: dinero en centavos; API solo desde `web/src/api/`; UI en español. Fechas en UTC (se envía `YYYY-MM-DD`; se muestra con `formatDateUtc`; "hoy" con `todayLocal`). Se reutilizan `MoneyInput`, `ConfirmDialog`, `NativeSelect`, `formatMoney`, `parseMoneyToCents`, `formatDateUtc`, `todayLocal`, `test/utils.tsx` (`routeFetch`, `stubFetch`, `callOf`, `makeClient`).

## Contrato API (ya existe)
- `CreditCard`: `{ _id, name, limitCents, cutoffDay (1–31), paymentDay (1–31), annualRatePercent, debtCents, availableCents (virtual = limit − debt), isArchived }`. `GET /credit-cards[?includeArchived=true]`, `POST` (`{name, limitCents ≥1, cutoffDay, paymentDay, annualRatePercent? ≥0, initialDebtCents?}`), `PATCH /:id` (los mismos salvo `initialDebtCents`; también `isArchived`), `DELETE /:id` (archiva, 204, sin restricciones).
- `GET /credit-cards/:id/statement?date=<ISO>` (cualquier fecha dentro del período; por defecto hoy UTC) → `{ cardId, period: {start, end}, paymentDueDate, purchases: Transaction[], payments: Transaction[], installmentsDue: {purchaseId, description, number, of, dueDate, principalCents, interestCents, paymentCents}[], totals: {purchasesCents, paymentsCents, installmentsDueCents}, debtCents, availableCents }`.
- `InstallmentPurchase`: `{ _id, creditCardId, description, categoryId, subcategoryId?, totalCents, installments, annualRatePercent, startDate, firstDueDate, paymentDay, paidInstallments, purchaseTransactionId, isPaidOff, schedule: {number, dueDate, principalCents, interestCents, paymentCents, remainingPrincipalCents, paid}[] }`.
  - `GET /installment-purchases[?creditCardId=]`; `POST` (`{creditCardId, description ≤200, categoryId, subcategoryId?, totalCents ≥1, installments 2–60, annualRatePercent? 0–100, startDate}`); `PATCH /:id` (`{description?, categoryId?, subcategoryId? (null limpia)}`); `DELETE /:id` (204; 409 si hay cuotas pagadas); `POST /:id/pay` (200, `{accountId, date?}`, devuelve la compra actualizada; paga la siguiente cuota: capital baja la deuda de la tarjeta, interés es gasto de la cuenta).
  - `GET /installment-purchases/projection?months=12[&creditCardId]` → `{ month 'YYYY-MM', principalCents, interestCents, paymentCents, count }[]`.
- Amortización: tasa 0 → total/n con los centavos sobrantes en la primera cuota; tasa > 0 → cuota fija francesa (tasa mensual = anual/12), la última cuota absorbe el redondeo.

## Enfoques considerados
- **Vista previa de la cuota:** calculada en el cliente (elegido; no hay endpoint de simulación) con un port de `buildSchedule` verificado contra los mismos casos que `installment-schedule.spec.ts`. Alternativa descartada: añadir un endpoint (cambia el backend solo para una vista previa).
- **Detalle:** ruta propia `/tarjetas/:id` (elegido; hay demasiado contenido para un diálogo) frente a panel expandible en la lista.
- **Campos numéricos del formulario:** días, tasa y número de cuotas se editan como texto y se convierten en el payload (evita los problemas de `valueAsNumber`); el dinero usa `MoneyInput`.
- **Estado de cuenta:** un período a la vez, navegable con anterior/siguiente calculados con `period.start − 1 día` y `period.end + 1 día` sobre el parámetro `date`.

## Diseño
```
web/src/
├── lib/installments.ts            previewSchedule(input) → { items, firstPaymentCents, totalInterestCents, totalPaidCents } | null
├── api/credit-cards.ts            (ampliar) useCreateCard, useUpdateCard, useArchiveCard, useStatement(cardId, date?)
├── api/installment-purchases.ts   tipos, usePurchases(cardId), useCreatePurchase, useUpdatePurchase, useDeletePurchase, usePayInstallment, useProjection(months)
├── components/ProgressBar.tsx
├── features/cards/
│   ├── card-form.ts               schema Zod + toCardPayload (+ tests)
│   ├── CardDialog.tsx
│   ├── ProjectionPanel.tsx
│   ├── StatementPanel.tsx
│   ├── purchase-form.ts           schema Zod + toPurchasePayload; paySchema (+ tests)
│   ├── PurchaseDialog.tsx         con vista previa en vivo
│   ├── PurchaseCard.tsx           progreso, calendario expandible, acciones
│   └── PayInstallmentDialog.tsx
└── pages/CardsPage.tsx, CardDetailPage.tsx
```
- **`previewSchedule`:** mismo algoritmo que la API (tasa 0 reparte con sobrante en la primera; tasa > 0 cuota fija redondeada, interés = round(saldo × tasa mensual), última cuota = saldo restante); devuelve `null` si los datos son inválidos o el monto es demasiado pequeño para amortizar (la API lanza en esos casos).
- **Lista de tarjetas:** nombre, barra de uso del cupo (deuda/cupo, tope visual 100 %, rojo si ≥ 90 %), deuda y disponible, "Corte día X · Pago día Y", tasa; acciones Ver detalle, Editar, Archivar/Restaurar (switch "Mostrar archivadas"). Saldo a favor (deuda negativa) se muestra tal cual.
- **Proyección:** panel con los próximos 12 meses (mes, n.º de cuotas, total a pagar); vacío → "Sin cuotas pendientes".
- **Detalle:** cabecera (nombre, deuda, disponible), `StatementPanel` (compras, pagos y cuotas por vencer del período, totales, fecha límite de pago, botones Anterior/Siguiente; Siguiente deshabilitado en el período actual) y lista de compras con "Nueva compra a cuotas" (deshabilitado si la tarjeta está archivada).
- **Compra a cuotas:** barra "pagadas de total", cuota estimada, calendario expandible (número, fecha, capital, interés, pago, estado pagada); acciones: Pagar siguiente cuota (oculta si `isPaidOff`; etiqueta "Pagada" y atenuada), Editar (descripción, categoría, subcategoría), Eliminar (deshabilitado con la razón si `paidInstallments > 0`).
- **Pagar cuota:** diálogo con cuenta de origen (cuentas activas), fecha (hoy local por defecto) y desglose de capital + interés + total de la próxima cuota; el botón se deshabilita mientras envía; 409 → toast.
- **Caché:** tarjetas invalidan `['credit-cards']` (incluye estado de cuenta); compras/pagos invalidan `['installment-purchases']`, `['credit-cards']`, `['accounts']` y `['transactions']`.
- **Rutas:** `/tarjetas` y `/tarjetas/:id` (el enlace del menú sigue activo dentro del detalle).

## Pruebas
Vitest. TDD para `previewSchedule` (casos de la API: 1200,00/12 sin interés; sobrantes 100000/3 y 100000/7; 1200,00 al 12 % en 12 cuotas = 10662/9462/1200/110538; suma de capital = total; casos inválidos y "demasiado pequeño"), `card-form.ts` y `purchase-form.ts`; hooks (URL, método, cuerpo, invalidaciones); tests de página para tarjetas (lista, crear, archivar), detalle (estado de cuenta y navegación de período, compras, calendario, pagar, eliminar bloqueado, editar). Verificación manual con deuda y saldos reales.

## A criterio del implementador
Disposición visual, textos vacíos, iconos, formato exacto del calendario.
