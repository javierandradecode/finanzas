# Fase 9e — Presupuestos (frontend): diseño

Última de cinco partes de la Fase 9 (9a cuentas y categorías ✔, 9b movimientos ✔, 9c tarjetas y compras diferidas ✔, 9d suscripciones ✔, **9e presupuestos**).

## Intención
Fijar un límite mensual de gasto por categoría y ver, mes a mes, cuánto se lleva gastado frente a ese límite, contra la API existente.

## Objetivos
- `/presupuestos`: selector de mes, resumen del mes, lista de presupuestos con barra de progreso, crear, editar el límite, eliminar y copiar el mes anterior.

## No objetivos
Presupuestos por subcategoría o por año, alertas o notificaciones, enlace a los movimientos de la categoría (el filtro por categoría ya existe en Movimientos), gráficos (Fase 10).

## Restricciones
CLAUDE.md: dinero en centavos; API solo desde `web/src/api/`; UI en español. Los meses son claves `YYYY-MM` (UTC en la API); el mes por defecto es el actual del calendario local del usuario. Se reutilizan `MoneyInput`, `ConfirmDialog`, `NativeSelect`, `ProgressBar`, `CategoryIcon`, `FieldError`, `formatMoney`, `formatMonth`, `useCategories`, `test/utils.tsx`.

## Contrato API (ya existe)
- `Budget`: `{ _id, categoryId, month 'YYYY-MM', limitCents ≥ 1 }`. Único por usuario, categoría y mes (repetir → 409). La categoría debe ser de gasto (si no, 400) y estar activa (si no, 409).
- `POST /budgets {categoryId, month, limitCents}`; `PATCH /budgets/:id {limitCents}` (solo el límite); `DELETE /budgets/:id` (borra de verdad, 204).
- `POST /budgets/copy {from, to}` (200) → `{ copied: number, skipped: { categoryId, reason: 'already-exists' | 'category-archived' }[] }`; `from` ≠ `to`.
- `GET /reports/budget-vs-spent?month=YYYY-MM` → `{ month, items: { budgetId, categoryId, name, icon, color, limitCents, spentCents, remainingCents (negativo si excede), percentUsed (un decimal), overBudget }[], totals: { limitCents, spentCents, overBudgetCount } }`. El gasto incluye gastos con tarjeta y compras a cuotas en su fecha de compra.

## Enfoques considerados
- **Fuente de datos:** una sola consulta, `budget-vs-spent`, alimenta resumen y lista (elegido; ya trae nombre, icono, color y el id del presupuesto) frente a combinarla con `GET /budgets`.
- **Mes elegido:** en la URL (`?month=2026-03`), como los filtros de movimientos (elegido) frente a estado local.
- **Umbrales de color:** solo visuales (verde < 80 %, ámbar 80–100 %, rojo si `overBudget`).

## Diseño
```
web/src/
├── lib/months.ts                  currentMonthKey, previousMonth, nextMonth, isMonthKey, monthFromSearch
├── api/budgets.ts                 tipos, useBudgetReport(month), useCreateBudget, useUpdateBudget, useDeleteBudget, useCopyBudgets
├── components/ProgressBar.tsx     (ampliar) prop `tone`: 'ok' | 'warn' | 'over'
├── features/budgets/
│   ├── budget-form.ts             budgetStatus, budgetSchema, copyMessage
│   └── BudgetDialog.tsx
└── pages/BudgetsPage.tsx
```
- **`lib/months.ts`:** `currentMonthKey(now = new Date())` con calendario local; `previousMonth('2026-01')` → `'2025-12'`; `nextMonth('2025-12')` → `'2026-01'`; `isMonthKey(s)`; `monthFromSearch(params, now)` devuelve `month` de la URL si es válido y, si no, el mes actual.
- **`budgetStatus(item)`:** `'over'` si `overBudget`; `'warn'` si `percentUsed ≥ 80`; si no `'ok'`.
- **`copyMessage(result)`:** `{ kind: 'success' | 'info', text }`: con `copied > 0`, éxito "N presupuesto(s) copiado(s)" más ", K ya existían" y ", M con categoría archivada" cuando corresponda; con `copied = 0`, info "No se copió nada: …" si hubo omitidos o "No había presupuestos en el mes anterior".
- **Pantalla:** selector de mes (Anterior/Siguiente, nombre con `formatMonth`; Siguiente deshabilitado más allá de 12 meses desde el mes actual); resumen (límite total, gastado, restante o excedido, `overBudgetCount` y barra global); filas con icono/color, barra con tono, texto "Gastado X de Y · queda Z" o "excedido por Z" y el porcentaje real; acciones Editar límite y Eliminar (confirmación). La barra se limita visualmente a 100 %.
- **Diálogo:** crear (categoría + límite; solo categorías de gasto activas sin presupuesto en el mes) y editar (categoría fija, solo límite). Esquema: categoría obligatoria; límite "Ingresa un monto" / "Monto no válido" / "El límite debe ser mayor que 0".
- **Botones del encabezado:** "Nuevo presupuesto" (deshabilitado con explicación si todas las categorías de gasto activas ya tienen presupuesto) y "Copiar mes anterior" (copia `previousMonth(mes visible)` al mes visible).
- **Estado vacío:** sin presupuestos, sugiere "Copiar mes anterior" o "Nuevo presupuesto".
- **Caché:** todas las mutaciones invalidan `['budgets']`; la consulta del reporte vive bajo `['budgets', 'report', month]`.
- **Errores:** `ApiError.message` en toast; el diálogo no se cierra si falla.

## Pruebas
Vitest. TDD para `months.ts`, `budget-form.ts` (estado por umbral, esquema, mensajes de copia); hooks (URL, método, cuerpo, invalidaciones); tests de página (resumen, lista y excedidos, selector de mes, diálogo solo con categorías sin presupuesto, editar, eliminar, copiar con sus tres desenlaces, 409 duplicado). Verificación manual con gastos reales que crucen el límite.

## A criterio del implementador
Disposición visual, textos vacíos, iconos.
