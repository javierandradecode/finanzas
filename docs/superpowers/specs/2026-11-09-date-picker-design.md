# Selector de fecha propio y selectores más cuidados (diseño)

Aprobado por el dueño del proyecto el 2026-11-09 ("mejora el diseño de algunos elementos, ejemplo los calendarios"), con estas dos elecciones: calendario con `react-day-picker` y selectores nativos con mejor aspecto.

## Intención

El calendario que se abre al tocar un campo de fecha lo dibuja el navegador: cambia entre Chrome, Safari y Firefox, no usa los colores de la app y desentona en modo oscuro. Que los 6 campos de fecha usen un calendario propio, coherente con el resto de la interfaz, y que los `<select>` se vean como los demás campos.

## Objetivos / no objetivos

- Objetivo: componente `DatePicker` (botón con la fecha en texto → ventana con calendario en español, semana desde el lunes, flechas de mes, listas de mes y año, "Hoy" y, en los filtros, "Borrar"); sustituye los 6 `<input type="date">`; `NativeSelect` con flecha propia y altura/bordes coherentes.
- No objetivo: cambiar la lista desplegable de los selects (sigue siendo la del sistema, mejor en móvil); selector de rangos; hora; otros formularios.
- Anti-objetivo: errores de zona horaria (las fechas siguen siendo texto `AAAA-MM-DD`, nunca pasan por UTC); perder el teclado o los lectores de pantalla; que un diálogo se cierre al usar el calendario dentro de él.

## Decisiones

- **Librería:** `react-day-picker` v10 (única dependencia nueva; trae `date-fns`). Idioma `es`, `weekStartsOn: 1`, `captionLayout: "dropdown"` con años de 2000 a +10 para llegar rápido a fechas lejanas.
- **Estilo:** hoja de estilos de la librería más variables `--rdp-*` en `index.css` enlazadas a los tokens de la app (primario esmeralda, bordes, fondo), así sigue claro/oscuro sin código extra.
- **Ventana emergente:** `Popover` de Base UI (nuevo `ui/popover.tsx` con el mismo patrón que el menú).
- **API:** `DatePicker({ id, value, onChange, clearable?, invalid? })` con `value` en `AAAA-MM-DD` o `''`. El botón lleva `id` (la etiqueta del formulario lo enfoca) y `data-value` con el texto ISO. Se elige con la fecha local del calendario, sin conversión a UTC.
- **Formularios:** `register(...)` pasa a `Controller` en los 4 diálogos; en filtros de movimientos las fechas son borrables (vaciar ambas = todo el historial).
- **Selects:** `NativeSelect` envuelve el `<select>` con `appearance-none`, flecha `ChevronDown` y espacio a la derecha. Misma API.
- **Pruebas:** un ayudante `pickDate(label, 'AAAA-MM-DD')` en `web/src/test/utils.tsx` abre el calendario, elige año y mes en las listas y pulsa el día.

## Enfoques considerados

1. Solo estilar el `<input type="date">`: imposible; el calendario abierto no es estilable.
2. **`react-day-picker` + Popover (elegido).**
3. Calendario hecho a mano: sin dependencia, pero más riesgo en teclado y accesibilidad.
