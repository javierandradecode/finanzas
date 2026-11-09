# Rediseño de /movimientos (diseño)

Aprobado por el dueño del proyecto el 2026-11-09 ("lo apruebo", tras el análisis de frontend-design), incluido el endpoint de resumen.

## Intención

Que /movimientos funcione como un libro de movimientos: se ve de un vistazo qué pasó cada día, cuánto entró y salió en el período filtrado, y filtrar es rápido (mes y tipo a un clic).

## Objetivos / no objetivos

- Objetivo: lista agrupada por día; navegador de mes + tipo segmentado + "Más filtros" + chips de filtros activos; resumen del período (ingresos, gastos, neto) del filtro completo; filas sin tarjeta con menú `⋯`; estados vacíos con salida; esqueleto de carga con aviso de primera carga lenta; "Guardar y añadir otro"; tipo como radios; ancho máximo.
- No objetivo: paleta/tipografía nuevas, animaciones, tarjetas de estadísticas, cambiar el modelo de datos o el contrato de `GET /transactions`.
- Anti-objetivo: un resumen que sume solo la página visible; perder el filtro por URL (enlaces desde /cuentas); romper el export CSV; que un usuario vea datos de otro.

## Decisiones

- **Backend:** `GET /transactions/summary` con los mismos filtros que la lista (`from`, `to`, `type`, `accountId`, `categoryId`) devuelve `{ incomeCents, expenseCents }` solo del usuario autenticado. Las transferencias no cuentan. Reutiliza `buildFilter`. Se declara antes de `:id`. Se añade a las pruebas de aislamiento.
- **Fechas en la URL:** vaciar las dos fechas ya no vuelve al mes actual. "Todo el historial" se escribe `range=all` en la URL; solo la web lo usa (no viaja a la API). Sin parámetros de fecha ni `range`, sigue valiendo el mes actual.
- **Navegador de mes:** si `from`/`to` son el primer y último día de un mismo mes se muestra "noviembre de 2026" con ‹ ›; si no, "Rango personalizado" o "Todo el historial", con ‹ › desactivados y un botón "Este mes".
- **Agrupar por día:** por el día UTC del movimiento, en el orden que da la API. El encabezado lleva solo la fecha ("martes 3 de noviembre", con año si no es el actual). **Mía:** no se muestra el neto diario porque un día puede quedar partido entre dos páginas y la cifra sería engañosa.
- **Filas:** importe a la derecha con `tabular-nums`; gastos en el color de texto normal con "-", ingresos en verde. Menú `⋯` con `aria-label="Acciones de <título>"`; Eliminar sigue pidiendo confirmación. Los movimientos gestionados por una compra a cuotas no tienen menú y lo indican en su línea secundaria.
- **Vacío:** con tipo/cuenta/categoría activos: "No hay movimientos con estos filtros" + "Quitar filtros"; solo por fechas: "No hay movimientos en <período>" + "Ver todo el historial"; en todo el historial sin filtros: "Aún no registras movimientos". Sin paginación cuando no hay filas.
- **Componentes compartidos:** `Segmented` (radios nativos con aspecto de botones) para el tipo en filtros y diálogo (y en el diálogo de cuentas); `useSlow` pasa a `lib/` para cuentas y movimientos.
- **Diálogo:** "Guardar y añadir otro" solo al crear; conserva tipo, fecha y origen y vacía monto, categoría, subcategoría y nota.
- **Ancho:** `max-w-4xl`.

## Enfoques considerados

1. Retoques sobre la lista de tarjetas: no resuelve fechas ni resumen.
2. **Libro por días + filtros compactos + resumen (elegido).**
3. Tabla densa de escritorio: pierde el móvil y el aspecto de la app.
