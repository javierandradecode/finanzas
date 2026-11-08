# Fase 3 — Cuentas y categorías: diseño

Estado: **aprobado** por el dueño del proyecto (2026-11-07).

## Intención
Que cada usuario gestione sus cuentas y categorías (con subcategorías embebidas), siempre aisladas por usuario. Sienta la base de referencias que usarán los movimientos de la Fase 4.

## Goals
- `accounts` — `/api/accounts`: campos `userId`, `type` (`cash` | `savings` | `checking`), `name`, `balanceCents` (entero), `isArchived`, timestamps.
  - Crear acepta `initialBalanceCents` (entero, default 0) que fija `balanceCents`. Editar solo permite `name`, `type`, `isArchived`; el saldo no se edita a mano (la Fase 4 lo mueve con los movimientos).
  - `DELETE` archiva; `PATCH { isArchived: false }` restaura. Listar solo activas salvo `?includeArchived=true`.
- `categories` — `/api/categories`: se añaden `isArchived` y `subcategories: [{ _id, name, isArchived }]` al schema existente.
  - CRUD con `?type=` e `?includeArchived=`. `type` no se puede cambiar tras crear. `DELETE` archiva.
  - Subcategorías con `_id` estable y rutas propias: `POST /categories/:id/subcategories`, `PATCH /categories/:id/subcategories/:subId` (`name`, `isArchived`), `DELETE` (archiva).
- Todo filtrado por `userId`. Recurso de otro usuario → `404` (no `403`). `:id` mal formado → `400`. Nombre repetido entre activas del mismo usuario (y mismo `type` en categorías; mismo nombre de subcategoría dentro de su categoría) → `409`, comparación sin distinguir mayúsculas.

## Non-goals
Movimientos, saldos dinámicos, moneda por cuenta, reordenar, paginación, borrado real.

## Anti-goals
Filtrar datos entre usuarios; permitir que el saldo se descuadre por una edición manual; romper referencias históricas al borrar.

## Approaches
Una sola forma sensata (stack y modelo fijados en CLAUDE.md). Única decisión de fondo: qué hacer al "borrar". **Elegido por el dueño: archivar** (`isArchived`), para que los movimientos futuros conserven sus referencias. Descartado: borrado real con bloqueo si hay movimientos (más simple hoy, pero obliga a lógica extra en la Fase 4).

## Decisiones tomadas por el asistente (corregibles)
- Tests Jest de services para: aislamiento por usuario, `409` por duplicado, archivar no elimina, `PATCH` de cuenta ignora `balanceCents` (vía `ValidationPipe` con `whitelist`). El resto se verifica con `.http` y prueba manual con dos usuarios. Sin `mongodb-memory-server` todavía.
- Duplicados con collation `{ locale: 'es', strength: 2 }`; un nombre archivado se puede reutilizar.
- `ParseObjectIdPipe` propio en `common/pipes` para el `400` de ids inválidos.
- `initialBalanceCents` puede ser negativo (cuenta corriente con sobregiro).

## Verificación de la fase
`npm run build`, lint y tests en verde; con dos usuarios y el `.http`: CRUD completo, archivar/restaurar, 404 al pedir recursos del otro usuario, 400 con id inválido, 409 con duplicado, `PATCH` con `balanceCents` ignorado. Marcar la fase en `docs/PLAN.md` y commit.
