# Fase 10 — Dashboard: diseño

## Intención
Que la pantalla de inicio (`/`) responda de un vistazo "¿cómo voy este mes?": cuánto tengo, cuánto entró y salió, en qué se va el dinero, cómo voy contra los presupuestos y qué pagos vienen, usando los reportes que la API ya calcula.

## Objetivos
- Tarjetas de resumen: saldo total, ingresos del mes, gastos del mes, deuda en tarjetas.
- Gráficos con Recharts: gasto por categoría, evolución mensual (ingresos contra gastos) y presupuesto contra real.
- Próximos pagos: cobros de suscripciones y cuotas de tarjetas.
- Selector de mes (en la URL) compartido con Presupuestos.

## No objetivos
Exportar a CSV (Fase 11), filtros por cuenta, comparar con el mes anterior, reportes imprimibles, cambiar el backend.

## Restricciones
CLAUDE.md: dinero en centavos y formatear solo al mostrar (Recharts recibe `cents / 100` solo para dibujar; los datos conservan los centavos); API solo desde `web/src/api/`; UI en español. Meses `YYYY-MM`; fechas de rango como `YYYY-MM-DD`. Colores desde los tokens del tema para que funcione el modo oscuro (salvo el color propio de cada categoría).

## Contrato API (ya existe)
- `GET /reports/summary?month=` → `{ month, totalBalanceCents, cardDebtCents, incomeCents, expenseCents, netCents, topCategories (5), budgets: {limitCents, spentCents, overBudgetCount}, upcomingSubscriptions: UpcomingCharge[] (14 días), installmentProjection: MonthlyProjection[] (3 meses) }`.
- `GET /reports/spending-by-category?from=&to=` → `{ from, to, totalCents, items: { categoryId, name, icon, color, totalCents, count }[] }` ordenado de mayor a menor; `from/to` ISO, un `to` sin hora cubre todo el día (UTC).
- `GET /reports/income-vs-expenses?from=YYYY-MM&to=YYYY-MM` → `{ from, to, months: { month, incomeCents, expenseCents, netCents }[] }` (todos los meses del rango, también los vacíos; máximo 60).
- `GET /reports/budget-vs-spent?month=` ya tiene hook (`useBudgetReport`, 9e).
- El gasto cuenta gastos de cuenta y de tarjeta (compras a cuotas en su fecha de compra); las transferencias no cuentan.

## Enfoques considerados
- **Fuente:** `summary` para tarjetas y próximos pagos; reportes específicos para los gráficos (el top 5 de `summary` no basta para una dona completa ni para la evolución). Cada panel tiene su propia consulta, así un fallo no tumba el resto.
- **Gráficos accesibles:** cada gráfico se envuelve en `role="img"` con `aria-label` y lleva una tabla `sr-only` con los mismos datos (también sirve para probar sin depender del SVG, que jsdom no dibuja).
- **Próximos pagos:** dos grupos dentro de una tarjeta (suscripciones de 14 días y cuotas de 3 meses), no una lista fusionada: las cuotas se proyectan por mes y no tienen un día exacto comparable.
- **Frescura:** las consultas viven bajo la clave `['reports', …]` y se vuelven a pedir al montar el dashboard (TanStack Query, `staleTime` 0); no se añaden invalidaciones cruzadas.

## Diseño
```
web/src/
├── lib/months.ts            (ampliar) shiftMonth, monthDateRange
├── lib/dates.ts             (ampliar) formatMonthShort
├── api/reports.ts           useSummary, useSpendingByCategory, useIncomeVsExpenses
├── components/MonthSelector.tsx   extraído de BudgetsPage
├── features/dashboard/
│   ├── dashboard-data.ts    topWithOthers, chartAmount, lastMonthsRange
│   ├── SummaryCards.tsx
│   ├── SpendingDonut.tsx
│   ├── MonthlyBars.tsx
│   ├── BudgetBars.tsx
│   └── UpcomingPayments.tsx
└── pages/DashboardPage.tsx  (ruta `/`)
```
- **`MonthSelector({ month, onChange, maxAhead = 12 })`:** flechas "Mes anterior"/"Mes siguiente" y el nombre del mes; Siguiente deshabilitado a `maxAhead` meses del actual. `BudgetsPage` lo usa sin cambiar su comportamiento.
- **`shiftMonth(key, delta)`** (la función interna de `months.ts`, exportada); **`monthDateRange(key)`** → `{ from: 'YYYY-MM-01', to: 'YYYY-MM-<último día>' }`; **`formatMonthShort('2026-03')`** → `mar 26`.
- **`topWithOthers(items, n = 5)`:** conserva las `n` primeras (ya ordenadas) y agrupa el resto en `{ categoryId: 'others', name: 'Otras', color: neutro, totalCents, count }`; con ≤ `n` no añade "Otras". **`lastMonthsRange(month, count = 6)`** → `{ from, to }` con `to = month`. **`chartAmount(cents)`** → `cents / 100`.
- **Tarjetas:** Saldo total; Ingresos (verde); Gastos; Deuda en tarjetas; las de ingresos y gastos llevan el neto del mes como subtítulo ("Neto +X"/"Neto −X", rojo si es negativo).
- **Dona:** `topWithOthers` sobre `spending-by-category` del mes (`monthDateRange`), leyenda con nombre, monto y porcentaje (sin dividir por cero cuando el total es 0), tooltip con moneda del usuario; vacío → "Sin gastos este mes."
- **Barras mensuales:** 6 meses terminando en el elegido (cruzan el año), ingresos y gastos lado a lado con etiquetas `formatMonthShort`; vacío (todo cero) → "Sin movimientos en estos meses."
- **Presupuesto contra real:** barras horizontales por categoría (límite y gastado), el gastado en rojo si `overBudget`; sin presupuestos → mensaje con enlace a `/presupuestos`.
- **Próximos pagos:** suscripciones (fecha, nombre, monto, "Atrasado" si corresponde, enlace a `/suscripciones`) y cuotas (solo meses con `count > 0`, enlace a `/tarjetas`); vacíos con su texto.
- **Página:** selector de mes en la URL (`monthFromSearch`), cuadrícula responsiva (1 columna en móvil, 2 en escritorio), estados de carga y error por panel.

## Pruebas
Vitest. TDD para `topWithOthers`, `lastMonthsRange`, `monthDateRange`, `shiftMonth`, `formatMonthShort`, `chartAmount`. Tests de componente (tabla accesible y estados vacíos de cada gráfico, tarjetas con signos y moneda, próximos pagos), de `MonthSelector` (y que las pruebas de Presupuestos sigan en verde) y de página (peticiones por mes, cambio de mes en la URL, fallo parcial de un panel). Verificación manual en el navegador contra la API, comprobando que las cifras coinciden con `curl`.

## A criterio del implementador
Tamaños y espaciados de los gráficos, textos vacíos, iconos de las tarjetas.
