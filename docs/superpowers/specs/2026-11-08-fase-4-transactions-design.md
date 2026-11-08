# Fase 4 — Movimientos: diseño

Estado: **aprobado** por el dueño del proyecto (2026-11-08).

## Intención
Registrar ingresos, gastos y transferencias entre cuentas, manteniendo los saldos de las cuentas siempre consistentes con los movimientos. Es la fase donde se usan las transacciones de MongoDB para operaciones multi-documento.

## Goals
- `transactions` — `/api/transactions`: `userId`, `type` (`income` | `expense` | `transfer`), `amountCents` (entero ≥ 1), `date` (UTC), `accountId`, `toAccountId` (solo transferencias), `categoryId`, `subcategoryId?`, `note?`, `source` (`manual` | `subscription` | `installment`, default `manual`), timestamps.
  - `accountId`: ingreso = cuenta que recibe; gasto = cuenta que paga; transferencia = origen. Las transferencias no llevan categoría.
  - Efecto en saldos: ingreso `+amount`; gasto `−amount`; transferencia `−amount` en origen y `+amount` en destino. El saldo puede quedar negativo.
- **Editar todo** (decisión del dueño): se pueden cambiar monto, cuenta(s), tipo, categoría, fecha y nota. El servicio aplica el efecto nuevo menos el viejo. Borrar (real) revierte el efecto.
- Todo cambio de movimiento + saldos ocurre en **una transacción de MongoDB**, con `$inc` atómico por cuenta (nunca leer-modificar-escribir).
- Validaciones: cuentas y categoría del usuario (si no, `404`); una cuenta que aparece por primera vez en el movimiento debe estar activa (si no, `409`; las cuentas que ya tenía no se revalidan); categoría activa (`409`) y del mismo tipo que el movimiento (`400`); subcategoría perteneciente a esa categoría y activa; transferencia con origen = destino → `400`; forma del movimiento (transferencia sin categoría y con destino; ingreso/gasto con categoría y sin destino) → `400`.
- Listado `GET /transactions?from&to&type&accountId&categoryId&page&limit`: `accountId` coincide con origen o destino; `to` en formato solo fecha incluye todo ese día UTC; respuesta `{ items, total, page, limit }`, más reciente primero, `limit` default 20 y máximo 100 (más → `400`).
- Índices: `{ userId, date }` y `{ userId, categoryId }`.

## Non-goals
Tarjetas de crédito y cuotas (Fase 5; ahí se añade `creditCardId`), suscripciones (Fase 6), reportes, CSV, multi-moneda, bloqueo por sobregiro.

## Anti-goals
Saldos que no cuadran con los movimientos; escrituras a medias; fuga de datos entre usuarios.

## Approaches
Una sola forma sensata. Decisión de fondo elegida por el dueño: **A, editar todo** (revertir efecto viejo y aplicar el nuevo en una transacción). Descartado: B, solo campos no financieros (borrar y recrear para corregir montos).

## Decisiones tomadas por el asistente (corregibles)
- Lógica de saldos como funciones puras (`effectsOf`, `netEffects`) con TDD; el service las aplica con `bulkWrite` de `$inc` dentro de `connection.transaction`.
- Tests de integración del service con `mongodb-memory-server` en modo réplica (descarga un binario de Mongo la primera vez; dependencia de desarrollo). Cubren saldos tras crear/editar/borrar, concurrencia y rollback real.
- El filtrado del listado se verifica además con `.http` y prueba manual contra Atlas.
- Tercer índice por cuenta no se crea todavía (YAGNI).

## Verificación de la fase
`npm run build`, lint y tests en verde; con dos usuarios y Atlas: crear ingreso/gasto/transferencia y comprobar saldos, editar monto/cuenta/tipo y comprobar saldos, borrar y comprobar reversión, filtros y paginación, 404 al tocar recursos ajenos, 409 con cuenta archivada. Marcar la fase en `docs/PLAN.md` y commit.
