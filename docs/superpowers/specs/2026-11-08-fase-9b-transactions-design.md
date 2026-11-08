# Fase 9b — Movimientos (frontend): diseño

Segunda de cinco partes de la Fase 9 (9a cuentas y categorías ✔, **9b movimientos**, 9c tarjetas y compras diferidas, 9d suscripciones, 9e presupuestos).

## Intención
Pantalla para ver, filtrar, crear, editar y borrar movimientos (ingresos, gastos y transferencias) contra la API existente, respetando sus reglas de forma y los saldos que mueve.

## Objetivos
- `/movimientos`: listado paginado con filtros persistidos en la URL.
- Diálogo de formulario con campos según el tipo (gasto, ingreso, transferencia), crear y editar.
- Borrar con confirmación; movimientos generados por cuotas protegidos.
- Hook de solo lectura de tarjetas de crédito (el formulario lo necesita).

## No objetivos
Búsqueda por texto, exportar, adjuntos, estado de cuenta de tarjetas (9c), crear suscripciones (9d), gráficos (Fase 10).

## Restricciones
CLAUDE.md: dinero en centavos; llamadas a la API solo en `web/src/api/`; UI en español. Fechas en UTC: se envían como fecha sin hora (`YYYY-MM-DD`, la API las toma como medianoche UTC) y se muestran en UTC. Se reutilizan las piezas de 9a (`MoneyInput`, `ConfirmDialog`, `CategoryIcon`, `formatMoney`, `parseMoneyToCents`, `test/utils.tsx`).

## Contrato API (ya existe)
- `Transaction`: `{ _id, type: 'income'|'expense'|'transfer', amountCents (>0), date (ISO), accountId?, toAccountId?, creditCardId?, toCreditCardId?, categoryId?, subcategoryId?, note?, source: 'manual'|'subscription'|'installment', subscriptionId?, installmentPurchaseId? }` (ids como string).
- `GET /transactions?from&to&type&accountId&categoryId&page&limit` → `{ items, total, page, limit }`, orden fecha descendente; `from/to` ISO inclusivos (un `to` sin hora cubre todo el día); `accountId` coincide con origen o destino; `limit` ≤ 100.
- `POST /transactions` (body del tipo), `PATCH /transactions/:id` (`undefined` = no tocar, `null` = limpiar), `DELETE /transactions/:id` (borra y revierte saldos; 204).
- Reglas de forma: gasto = categoría + exactamente una de `accountId`/`creditCardId`; ingreso = `accountId` + categoría, sin tarjeta ni destino; transferencia = `accountId` (origen) + exactamente una de `toAccountId`/`toCreditCardId` (distinta del origen), sin categoría. `subcategoryId` exige `categoryId`. Cuenta/tarjeta/categoría/subcategoría archivadas → 409 al crear o mover referencias.
- Movimientos con `installmentPurchaseId`: editar o borrar devuelve 409 (se gestionan desde la compra, 9c).
- `GET /credit-cards` → `{ _id, name, limitCents, cutoffDay, paymentDay, annualRatePercent, debtCents, isArchived }` (también `?includeArchived=true`).

## Enfoques considerados
- **Selects:** `<select>` nativo con estilo Tailwind (elegido: simple, bueno en móvil, fácil de probar) frente al `Select` de shadcn/Base UI.
- **Cuenta o tarjeta:** un único desplegable con grupos "Cuentas" y "Tarjetas" cuyo valor se codifica `account:<id>` / `card:<id>` (elegido) frente a dos campos condicionales.
- **Filtros:** en la URL con `useSearchParams` (elegido; recargar y compartir conservan la vista) frente a estado local.
- **Defaults de fecha:** el día de hoy y el mes actual se calculan con el calendario local del usuario (no UTC) para que de noche no caiga en el día siguiente; lo enviado sigue siendo fecha sin hora.

## Diseño
```
web/src/
├── api/credit-cards.ts      useCreditCards(includeArchived)
├── api/transactions.ts      tipos, useTransactions(filters), useCreate/Update/DeleteTransaction
├── lib/dates.ts             todayLocal(), monthRangeLocal(now), formatDateUtc(iso)
├── components/NativeSelect.tsx
├── features/transactions/
│   ├── transaction-form.ts  schema Zod, toCreatePayload, toUpdatePayload, fromTransaction
│   ├── filters.ts           filtersFromSearch, filtersToSearch, filtersToQuery
│   ├── TransactionDialog.tsx
│   └── TransactionRow.tsx
└── pages/TransactionsPage.tsx
```
- **Valores del formulario:** `{ type, amountCents (number|null|NaN), date 'YYYY-MM-DD', source 'account:id'|'card:id', destination (transferencia), categoryId, subcategoryId, note }`.
- **Esquema (mensajes en español):** monto obligatorio y > 0; fecha real `YYYY-MM-DD`; `source` obligatorio y, para ingreso y transferencia, de tipo cuenta; transferencia exige `destination` distinto de `source`; gasto e ingreso exigen categoría; la nota admite 500 caracteres.
- **Payloads:** crear envía solo los campos aplicables; editar envía todos, con `null` en los no aplicables (permite cambiar de tipo) y nota vacía → `null`.
- **Cambio de tipo en el formulario:** reinicia categoría y subcategoría y descarta `source`/`destination` no válidos para el nuevo tipo.
- **Opciones de selects:** cuentas y tarjetas activas, categorías activas del tipo correspondiente y subcategorías activas de la categoría elegida; al editar se conserva la opción actual aunque esté archivada.
- **Listado:** filtros (desde, hasta, tipo, cuenta, categoría) en la URL; sin `from` ni `to` rige el mes actual; "Limpiar" vuelve a ese estado. Nombres de cuentas, tarjetas y categorías vienen de listas con archivadas incluidas. Fila: icono/color de categoría (flecha en transferencias), título = nota o nombre de categoría o "Transferencia", subtítulo con medio de pago o "Origen → Destino" y fecha (UTC); monto con signo y color (`+` ingreso, `-` gasto, neutro transferencia); etiquetas "Cuota" y "Suscripción"; los de cuota sin Editar/Borrar y con texto explicativo. Paginación Anterior/Siguiente, "Página X de Y", total; 20 por página; cambiar un filtro vuelve a la página 1.
- **Caché:** crear/editar/borrar invalidan `['transactions']`, `['accounts']` y `['credit-cards']`.
- **Errores:** `ApiError.message` en toast; el diálogo no se cierra si falla.

## Pruebas
Vitest. TDD para `transaction-form.ts` (esquema por tipo, payloads, round-trip `fromTransaction`) y `filters.ts` y `dates.ts`; hooks (URL, método, cuerpo, invalidaciones); tests de página para el listado (filtros → petición, paginación, cuota sin acciones, vacío) y el diálogo (tres tipos, cambio de tipo, errores de API, editar, borrar). Verificación manual con saldos reales contra la API.

## A criterio del implementador
Disposición visual fina, textos de vacío, iconos.
