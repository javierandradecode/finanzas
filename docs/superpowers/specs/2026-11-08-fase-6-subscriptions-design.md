# Fase 6 — Suscripciones: diseño

Estado: **aprobado** por el dueño del proyecto (2026-11-08).

## Intención
Registrar cobros recurrentes (suscripciones) que se convierten solos en gastos cuando llega su fecha, usando el mismo mecanismo atómico de saldos y deuda de las fases anteriores.

## Goals
**Suscripciones** — `/api/subscriptions`: `name`, `amountCents` (entero ≥ 1), `frequency` (`weekly` | `monthly` | `quarterly` | `semiannual` | `yearly`), `nextDate` (próximo cobro, medianoche UTC), `anchorDay` (día del mes de la primera fecha, para volver al 31 tras febrero), pagador (exactamente una de `accountId` / `creditCardId`), `categoryId`, `subcategoryId?`, `active` (default true), `lastError?`, `lastErrorAt?`, timestamps.
- `DELETE` la pausa (`active = false`); `PATCH { active: true }` la reactiva. Al reactivar, si `nextDate` ya pasó salta al primer vencimiento desde hoy (sin cobrar la pausa) y limpia `lastError`.
- Cambiar `nextDate` recalcula `anchorDay`. Referencias validadas como en movimientos: ajenas `404`; cuenta/tarjeta/categoría archivada `409`; categoría de tipo distinto a gasto `400`.

**Generación de cobros**
- `processDue(now, { userId? })` procesa las suscripciones activas con `nextDate ≤ hoy (UTC)`. Cada vencimiento es **una transacción de MongoDB**: reclama el vencimiento avanzando `nextDate` con condición (`nextDate` igual al esperado) y crea el gasto con `TransactionsService.createWithin` (`source: subscription`, `subscriptionId`, fecha = la del vencimiento, nota = nombre). Saldo o deuda se actualizan en la misma transacción.
- Si el servidor estuvo caído, genera **todos** los cobros atrasados con su fecha original (tope de seguridad de 366 por suscripción y ejecución).
- Idempotente y a prueba de ejecuciones simultáneas: si otro proceso ya reclamó el vencimiento, se detiene sin error ni duplicado.
- Si un cobro falla (cuenta, tarjeta o categoría archivada, etc.): ese vencimiento no se hace, `nextDate` no avanza, se guarda `lastError`/`lastErrorAt` y se reintenta en la siguiente ejecución. Los vencimientos anteriores ya cobrados se conservan.
- `@Cron('5 0 * * *', { timeZone: 'UTC' })` ejecuta `processDue(new Date())` para todos los usuarios y registra un resumen en el log. `POST /subscriptions/process-due` ejecuta solo los vencimientos del usuario autenticado y devuelve `{ charged, failed: [{ subscriptionId, name, error }] }`.
- Los gastos generados son movimientos normales (editables y borrables), enlazados por `subscriptionId`.

**Próximos vencimientos** — `GET /subscriptions/upcoming?days=30` (1–365): cada cobro de las suscripciones activas desde su `nextDate` hasta hoy + `days`, ordenado por fecha: `{ subscriptionId, name, amountCents, date, overdue, frequency, accountId?, creditCardId?, categoryId }`. Los atrasados aún sin procesar llevan `overdue: true`.

## Non-goals
Avisos y recordatorios, próximos pagos de tarjetas (dashboard, Fase 10), cobros con montos variables, pruebas gratuitas, historial propio de cobros (los movimientos son el historial).

## Anti-goals
Cobros duplicados, cobros perdidos por una falla puntual, backfill de periodos pausados, fuga entre usuarios.

## Approaches
Una sola forma sensata. Decisión de fondo: separar la lógica (`processDue`) de la programación (`@Cron`) para probarla con fechas simuladas sin esperar un día.

## Decisiones tomadas por el asistente (corregibles)
- Frecuencias: semanal, mensual, trimestral, semestral y anual.
- Falla de un cobro: reintentar en cada ejecución diaria (no pausar), con `lastError`.
- Reactivar no cobra el periodo pausado.
- Hora de la tarea: 00:05 UTC.
- Duplicados de nombre permitidos.
- `anchorDay`: el día de la primera fecha (29 de febrero cobra el 28 en años no bisiestos y vuelve al 29).

## Verificación de la fase
Build, lint y tests en verde; con Atlas y `process-due`: una suscripción mensual con tres meses de atraso genera tres gastos con sus fechas y los saldos cuadran; ejecutarla de nuevo no duplica; tarjeta como pagador sube la deuda; pausa/reactivación sin backfill; cuenta archivada produce `lastError` sin cambios y se recupera al desarchivar; `upcoming` coherente; 404/409/400 esperados. Marcar la fase en `docs/PLAN.md` y commit.
