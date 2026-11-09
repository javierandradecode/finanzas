# Fase 11b — Exportar movimientos a CSV (diseño)

Aprobado por el dueño del proyecto el 2026-11-08.

## Intención

Poder sacar los movimientos de la app a una hoja de cálculo (Excel, Google Sheets) y tener un respaldo propio. El botón "Exportar CSV" de la página Movimientos descarga **todos** los movimientos que cumplen los filtros activos, no solo la página visible.

## Objetivos / no objetivos

- Objetivo: CSV legible por personas (nombres, no ids), correcto en Excel (tildes, números) y seguro (sin inyección de fórmulas, solo datos del usuario autenticado).
- No objetivo: importar CSV, exportar a Excel/PDF, elegir columnas, exportar otras entidades.
- Anti-objetivo: que una exportación grande tumbe la API; que una celda de texto ejecute una fórmula al abrirla.

## Enfoques considerados

1. **Endpoint en la API que devuelve CSV (elegido).** Reutiliza los filtros del listado, una sola petición, la lógica de formato se prueba en el servidor.
2. Armar el CSV en el navegador pidiendo todas las páginas: muchas peticiones y filtros duplicados.
3. Enlace directo a la URL de descarga: obligaría a poner el token en la URL, lo que no se permite.

## Diseño

**API**
- `GET /api/transactions/export` (declarado antes de `:id`). Mismos filtros que el listado (`from`, `to`, `type`, `accountId`, `categoryId`), sin `page` ni `limit`. Siempre filtra por el usuario autenticado. Orden: fecha descendente, igual que el listado.
- Respuesta `200 text/csv; charset=utf-8` con `Content-Disposition: attachment; filename="movimientos-YYYY-MM-DD.csv"` (fecha de hoy, UTC).
- Tope de 50 000 filas: si hay más, `400` con un mensaje que pide afinar los filtros (se cuenta antes de leer).
- Los filtros se comparten con el listado mediante una clase base (`TransactionFilters`) y una función única que construye el filtro de Mongo, para que listado y exportación no diverjan.
- Nombres: se cargan las cuentas, tarjetas y categorías del usuario (incluidas las archivadas) y se resuelven en memoria.

**Formato del CSV**
- UTF-8 con BOM, separador coma, comillas dobles con escape según RFC 4180, líneas terminadas en CRLF.
- Columnas (cabecera en español): `fecha, tipo, monto, cuenta, cuenta destino, tarjeta, categoría, subcategoría, nota, origen`.
- `fecha`: `YYYY-MM-DD` (UTC). `tipo`: `ingreso | gasto | transferencia`. `origen`: `manual | suscripción | cuota`.
- `monto`: decimal con punto y 2 decimales, sin símbolo ni separador de miles; gasto en negativo, ingreso y transferencia en positivo. Es el único sitio donde los centavos se convierten a decimal.
- `cuenta destino` es la cuenta o la tarjeta de destino de una transferencia; `tarjeta` es la tarjeta que pagó un gasto.
- Protección contra inyección de fórmulas: una celda de **texto** que empieza por `=`, `+`, `-`, `@`, tabulador o retorno de carro lleva una comilla simple delante. Los montos son números y no se tocan.

**Web**
- Botón "Exportar CSV" junto a "Nuevo movimiento". Hace `fetch` con el `Authorization` del cliente, recibe el blob y lo descarga con un enlace temporal; usa el nombre de archivo de `Content-Disposition`. Mientras descarga queda deshabilitado; si falla muestra un aviso (toast) con el mensaje de la API.
- Exporta con los filtros de la URL actual, sin `page`.

## Pruebas

- Unitarias del formateador (escape, comillas, saltos de línea, BOM, CRLF, inyección, montos) escritas primero.
- Del servicio/endpoint con el arnés de la 11a: filtros, tope, 401 sin token, nombres resueltos, el usuario B no ve nada de A.
- La ruta nueva se añade a `isolation.spec.ts` (que falla si hay una ruta sin caso).
- Web: el botón pide la URL con los filtros y el token, descarga y gestiona errores.
- Cada prueba nueva se valida rompiendo el código a propósito.

## Decisiones mías (a revisar)

- Tope 50 000 filas; nombre de archivo con fecha; gasto en negativo; `origen` y `tipo` traducidos al español.
