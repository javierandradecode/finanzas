# Fase 9d — Suscripciones (frontend): diseño

Cuarta de cinco partes de la Fase 9 (9a cuentas y categorías ✔, 9b movimientos ✔, 9c tarjetas y compras diferidas ✔, **9d suscripciones**, 9e presupuestos).

## Intención
Gestionar cobros recurrentes (alta, edición, pausa y reactivación), ver los próximos cobros, entender por qué falló un cobro y poder disparar a mano el cobro de lo vencido, contra la API existente.

## Objetivos
- `/suscripciones`: resumen del costo mensual equivalente, lista de suscripciones, panel de próximos 30 días y botón "Cobrar vencidos ahora".
- Diálogo para crear y editar (cuenta o tarjeta como pagador).
- Pausar con confirmación; reactivar sin confirmación.
- Mostrar el último error de cobro de una suscripción.

## No objetivos
Historial por suscripción (los cobros ya aparecen en Movimientos con la etiqueta "Suscripción"), recordatorios, borrado real, gráficos (Fase 10).

## Restricciones
CLAUDE.md: dinero en centavos; API solo desde `web/src/api/`; UI en español. Fechas en UTC (se envía `YYYY-MM-DD`, se muestra con `formatDateUtc`, "hoy" con `todayLocal`). Se reutilizan `MoneyInput`, `NativeSelect`, `ConfirmDialog`, `CategoryIcon`, `FieldError`, `formatMoney`, `isValidDateText`, y los hooks de cuentas, tarjetas y categorías.

## Contrato API (ya existe)
- `Subscription`: `{ _id, name, amountCents ≥ 1, frequency: 'weekly'|'monthly'|'quarterly'|'semiannual'|'yearly', nextDate (UTC), anchorDay, accountId?, creditCardId?, categoryId, subcategoryId?, active, lastError?, lastErrorAt? }`. Exactamente una de `accountId`/`creditCardId`.
- `GET /subscriptions` (todas, activas y pausadas); `POST` (`{name ≤120, amountCents, frequency, nextDate, accountId|creditCardId, categoryId, subcategoryId?}`); `PATCH /:id` (todo opcional; `accountId`, `creditCardId` y `subcategoryId` aceptan `null` para limpiar; `active`); `DELETE /:id` pausa (204).
- Reactivar (`PATCH {active:true}`): si `nextDate` ya pasó salta al primer vencimiento desde hoy (no cobra el período pausado) y limpia el error.
- `GET /subscriptions/upcoming?days=30` → `{ subscriptionId, name, amountCents, date, overdue, frequency, accountId?, creditCardId?, categoryId }[]` ordenado por fecha.
- `POST /subscriptions/process-due` (200) → `{ charged: number, failed: { subscriptionId, name, error }[] }`; cobra solo lo vencido del usuario.
- Un `nextDate` pasado al crear o editar es válido: el proceso cobrará los vencimientos atrasados.
- Si un cobro falla (cuenta, tarjeta o categoría archivada…) no avanza `nextDate` y guarda `lastError`/`lastErrorAt`; se reintenta en la siguiente ejecución.

## Enfoques considerados
- **Pagador:** un único desplegable con grupos Cuentas/Tarjetas (`account:<id>`/`card:<id>`), como en movimientos (elegido), frente a dos campos.
- **Equivalente mensual:** cifra aproximada calculada en el cliente (elegido) frente a pedirla a la API (no existe y cambiaría el backend por un número informativo).
- **Eliminar:** no existe; solo pausar, igual que cuentas y categorías se archivan.

## Diseño
```
web/src/
├── api/subscriptions.ts        tipos, useSubscriptions, useUpcoming(days), useCreate/Update/Pause/ReactivateSubscription, useProcessDue
├── features/subscriptions/
│   ├── subscription-form.ts    FREQUENCY_LABELS, frequencyUnit, monthlyEquivalentCents, summarize, schema Zod, toCreatePayload, toUpdatePayload, fromSubscription
│   ├── SubscriptionDialog.tsx
│   └── UpcomingPanel.tsx
└── pages/SubscriptionsPage.tsx
```
- **`monthlyEquivalentCents(amount, frequency)`:** semanal × 52/12, mensual × 1, trimestral ÷ 3, semestral ÷ 6, anual ÷ 12, redondeado al centavo; `summarize(subs)` → `{ activeCount, monthlyCents }` solo con activas.
- **Valores del formulario:** `{ name, amountCents (null/NaN/número), frequency, nextDate 'YYYY-MM-DD', payer 'account:id'|'card:id', categoryId, subcategoryId }`. Esquema: nombre 1–120, monto > 0, fecha real, pagador y categoría obligatorios. Aviso (no error) si `nextDate` es anterior a hoy: "Se cobrarán los períodos vencidos".
- **Payloads:** crear envía solo los campos aplicables; editar envía todos, con `null` en el pagador no usado y en la subcategoría vacía.
- **Opciones del formulario:** cuentas y tarjetas activas y categorías de gasto activas; al editar se conserva la actual aunque esté archivada. Cambiar la categoría reinicia la subcategoría.
- **Lista:** nombre, monto con unidad ("9,99 $ / mes"), pagador, categoría, próximo cobro; alerta roja con `lastError` y fecha del intento; las pausadas atenuadas, al final y con etiqueta "Pausada". Acciones: Editar; Pausar (con confirmación) o Reactivar (sin confirmación).
- **Resumen:** "N suscripciones activas · ≈ X al mes".
- **Próximos 30 días:** fecha, nombre, monto y pagador; etiqueta "Atrasado" si `overdue`; vacío → "Sin cobros en los próximos 30 días."
- **Cobrar vencidos ahora:** `process-due`; toast de éxito "N cobro(s) realizado(s)", o "No había cobros vencidos" si todo es 0; los fallos → toast de error con nombre y mensaje. Invalida suscripciones, movimientos, cuentas y tarjetas.
- **Caché:** mutaciones de suscripción invalidan `['subscriptions']` (incluye `upcoming`); `process-due` además `['transactions']`, `['accounts']` y `['credit-cards']`.

## Pruebas
Vitest. TDD para `subscription-form.ts` (equivalente mensual, resumen, esquema por campo, payloads con nulls, ida y vuelta); hooks (URL, método, cuerpo, invalidaciones); tests de página (lista y orden, resumen, error de cobro, pausar con confirmación, reactivar sin ella, diálogo crear/editar con cuenta y tarjeta, cambio de pagador, panel de próximos, cobrar vencidos con éxito, sin vencidos y con fallos). Verificación manual con un `process-due` real.

## A criterio del implementador
Disposición visual, textos, iconos.
