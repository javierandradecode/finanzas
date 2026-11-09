# Rediseño de /cuentas (diseño)

Aprobado por el dueño del proyecto el 2026-11-09 ("realiza todo lo que sugieres", tras el análisis de frontend-design).

## Intención

Que la pantalla de cuentas responda de un vistazo a "¿cuánto tengo y dónde?" y permita ir de una cuenta a sus movimientos.

## Objetivos / no objetivos

- Objetivo: total grande; barra de reparto por tipo; filas agrupadas por tipo con subtotal; fila que enlaza a `/movimientos?accountId=…`; acciones en un menú; esqueleto de carga con aviso si tarda; estado vacío con una sola acción; archivadas legibles; tipo como grupo de radio; nota sobre el saldo inicial.
- No objetivo: paleta, tipografía o tokens nuevos; animaciones; cambios en la API; tocar otras páginas.
- Anti-objetivo: perder funciones actuales (editar, archivar con confirmación, restaurar, ver archivadas); que los archivados cuenten en el total o en la barra.

## Decisiones

- **Estructura sobre estética:** se queda dentro de los tokens actuales (Geist, esmeralda, grises). La única cosa audaz es el total.
- **Agrupación:** orden fijo corriente, ahorros, efectivo. Subtotal y total solo de cuentas activas; las archivadas se listan (si se piden) al final de su grupo y no suman.
- **Barra:** reparto por tipo sobre la suma de los subtotales positivos; si esa suma es 0 no se dibuja. Tres tonos del color primario con leyenda en texto y porcentaje (no depende solo del color).
- **Enlace:** la página de movimientos ya lee `accountId` de la URL; por defecto muestra el mes actual (se acepta).
- **Menú:** Editar y Archivar/Restaurar en un menú `⋯` por fila; Archivar sigue pidiendo confirmación.
- **Carga:** esqueleto; tras 4 s sin respuesta, "La primera carga puede tardar hasta un minuto…" (el host gratuito duerme).
- **Archivadas:** sin bajar la opacidad del texto; etiqueta "Archivada".
- **Diálogo:** tipo como `radiogroup`; nota "El saldo cambia con los movimientos; no se edita aquí." junto al saldo inicial solo al crear, y en edición se explica en una línea.

## Enfoques considerados

1. Solo retoques de CSS sobre las tarjetas: barato, no resuelve la comparación de cifras ni la navegación.
2. **Filas agrupadas + total grande (elegido):** resuelve jerarquía, comparación y navegación sin tocar el resto de la app.
3. Rediseño visual completo con identidad propia: incoherente con las demás pantallas.
