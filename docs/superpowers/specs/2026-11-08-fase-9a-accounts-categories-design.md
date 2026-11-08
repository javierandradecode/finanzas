# Fase 9a — Cuentas y categorías (frontend): diseño

Primera de cinco partes de la Fase 9 (9a cuentas y categorías, 9b movimientos, 9c tarjetas y compras diferidas, 9d suscripciones, 9e presupuestos). Cada parte tiene su rama, diseño y plan.

## Intención
Dar pantallas para gestionar cuentas y categorías contra la API existente, y dejar las piezas compartidas (dinero, diálogos, iconos, toasts, patrón de hooks) que reutilizarán 9b–9e.

## Objetivos
- `/cuentas`: listar, crear, editar (nombre/tipo), archivar y restaurar; saldo total de las activas.
- `/categorias`: pestañas Gastos/Ingresos; crear, editar, archivar y restaurar categorías; gestionar subcategorías inline.
- Piezas compartidas: `money.ts` (TDD), `MoneyInput`, `ConfirmDialog`, `CategoryIcon`, toasts, hooks de TanStack Query.

## No objetivos
Reordenar categorías, borrado real, ver movimientos de una cuenta (9b), gráficos, editar el saldo a mano (la API no lo permite).

## Restricciones
CLAUDE.md: dinero en centavos y formateo solo al mostrar; llamadas a la API solo mediante hooks en `web/src/api/`; textos en español, código en inglés; React Hook Form + Zod para formularios.

## Contrato API (ya existe)
- `Account`: `{ _id, type: 'cash'|'savings'|'checking', name, balanceCents, isArchived }`. `GET /accounts?includeArchived=true`, `POST /accounts {type,name,initialBalanceCents?}`, `PATCH /accounts/:id {name?,type?,isArchived?}`, `DELETE /accounts/:id` (archiva, 204). Restaurar = `PATCH {isArchived:false}`.
- `Category`: `{ _id, type: 'income'|'expense', name, icon, color, isArchived, subcategories: {_id,name,isArchived}[] }`. `GET /categories?type=&includeArchived=true`, `POST /categories {type,name,icon,color}`, `PATCH /categories/:id {name?,icon?,color?,isArchived?}`, `DELETE /categories/:id` (archiva). Subcategorías: `POST /categories/:id/subcategories {name}`, `PATCH …/:subId {name?,isArchived?}`, `DELETE …/:subId` (archiva). `color` es hex `#rrggbb`; `icon` es un nombre de lucide en kebab-case.
- Las respuestas usan `_id`.

## Enfoques considerados
- **UI de edición:** diálogos modales (elegido, mantiene el contexto de la lista) frente a páginas de edición (más navegación, sin beneficio aquí).
- **Icono/color:** selección entre un conjunto curado (elegido; evita hex a mano e iconos desconocidos) frente a entrada libre.
- **Estado de servidor:** TanStack Query con claves `['accounts', {includeArchived}]` y `['categories', {includeArchived}]`; cada mutación invalida el prefijo (`['accounts']`/`['categories']`).

## Diseño
- **`lib/money.ts`:** `formatMoney(cents, currency)` con `Intl.NumberFormat('es', {style:'currency'})`; `parseMoneyToCents(text): number | null` parsea sin float: acepta coma o punto decimal, separador de miles opcional (`1.234,56`, `1,234.56`), signo `-`, máximo 2 decimales, devuelve `null` si es inválido o está vacío.
- **`MoneyInput`:** `Input` de texto que muestra lo que escribe el usuario y entrega centavos (`number | null`) al formulario; compatible con RHF vía `Controller`.
- **Iconos:** `CategoryIcon({name})` mapea nombre → componente de lucide a partir de una lista curada `CATEGORY_ICONS` (los 14 de las categorías por defecto más ~10 comunes); un nombre desconocido muestra un icono genérico (`tag`). Paleta `CATEGORY_COLORS` = los 14 colores de las categorías por defecto; el selector siempre muestra el valor actual aunque no esté en la paleta.
- **Cuentas:** tarjetas con tipo (etiqueta en español: Efectivo/Ahorros/Corriente), nombre, saldo (rojo si negativo); cabecera con saldo total de activas; diálogo crear (tipo, nombre, saldo inicial opcional) y editar (sin saldo); archivar con `ConfirmDialog`; switch "Mostrar archivadas" muestra las archivadas atenuadas con "Restaurar".
- **Categorías:** `Tabs` Gastos/Ingresos (filtro en cliente sobre una sola consulta); fila con icono coloreado, nombre y contador de subcategorías, desplegable con la lista; diálogo categoría (nombre, icono, color; el tipo viene de la pestaña activa y no se edita); subcategorías: añadir, renombrar inline, archivar y restaurar; mismo switch de archivadas.
- **Errores:** `ApiError.message` en un toast; éxito con toast breve. Estados de carga ("Cargando…") y vacío con llamada a la acción.
- **shadcn nuevos:** dialog, select, tabs, switch, badge, sonner (`Toaster` en `App`).

## Pruebas
Vitest: `money.ts` (parseo y formateo, casos límite), mapeo de iconos, hooks de cuentas y categorías (URL, método y cuerpo, invalidación), `ConfirmDialog`. Verificación manual en el navegador contra la API real.

## A criterio del implementador
Disposición visual fina, textos de vacío, iconos extra del conjunto curado.
