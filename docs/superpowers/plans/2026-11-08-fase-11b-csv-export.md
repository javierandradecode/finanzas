# Fase 11b — Exportar a CSV Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Descargar en CSV los movimientos que cumplen los filtros activos de la página Movimientos.

**Architecture:** Un formateador CSV puro (`common/utils/csv.ts`) + `TransactionsService.exportCsv` + ruta `GET /transactions/export`; en la web, una función de descarga con `fetch`+blob y un botón en la página.

**Tech Stack:** NestJS 11, Jest + supertest + mongodb-memory-server; React, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-08-fase-11b-csv-export-design.md`

## Global Constraints

- Dinero en centavos hasta el último momento: solo `exportCsv` convierte a decimal (`cents / 100`, 2 decimales, punto).
- Cabecera exacta: `fecha,tipo,monto,cuenta,cuenta destino,tarjeta,categoría,subcategoría,nota,origen`.
- Archivo: UTF-8 con BOM (`﻿`), CRLF, nombre `movimientos-YYYY-MM-DD.csv`. Tope 50 000 filas (400 si se supera).
- Siempre filtrar por `userId`. Código en inglés, textos de UI en español.
- Comandos: `cd api && npm test && npm run build && npm run lint`; `cd web && npm test -- --run && npm run build && npm run lint` (lint web: solo el aviso conocido de TransactionDialog).

## Review Focus

- Nota/nombre que empieza por `=`, `+`, `-`, `@`: sale con comilla simple delante; una nota con coma, comillas o salto de línea se escapa y la fila sigue siendo una sola fila lógica.
- Sin movimientos: el CSV tiene BOM y cabecera, no está vacío ni da error.
- Filtros inválidos (`from=abc`, `accountId=x`) dan 400, no 500; `page`/`limit` en la query se ignoran.
- Movimiento cuya cuenta/categoría fue archivada: sigue saliendo con su nombre; id desconocido: celda vacía.
- Usuario B exporta: nunca aparece nada de A (también en la prueba de aislamiento).
- Web: error de la API (p. ej. 400 por tope) se muestra; doble clic no lanza dos descargas.

---

### Task 1: Formateador CSV

**Files:**
- Create: `api/src/common/utils/csv.ts`, `api/src/common/utils/csv.spec.ts`

**Interfaces:**
- Produces: `export const CSV_BOM = '﻿'`; `export type CsvCell = string | number | undefined`; `export function toCsv(rows: CsvCell[][]): string` — BOM + filas unidas por `\r\n` (con `\r\n` final).

- [ ] **Step 1: Escribe `csv.spec.ts` (falla)** con estos casos y aserciones exactas: empieza por `CSV_BOM`; filas separadas por `\r\n` y termina en `\r\n`; `'a,b'` → `"a,b"`; `'di "hola"'` → `"di ""hola"""`; `'l1\nl2'` → entre comillas; `undefined` → celda vacía; número `-12.5` → `-12.50` y `0` → `0.00` (sin comilla, no es texto); textos `=SUM(A1)`, `+1`, `-1+1`, `@x`, `\tx`, `\rx` → empiezan por `'` (y se entrecomillan si además lo requieren); `'ok-guion'` y `'3 - 2'` no se tocan; `toCsv([])` es solo el BOM.
- [ ] **Step 2: Ejecuta** `cd api && npx jest src/common/utils/csv.spec.ts`. Expected: FAIL (módulo no existe).
- [ ] **Step 3: Implementa `toCsv`** con una función interna `cell(c: CsvCell): string` (números con `toFixed(2)`, texto con guardia de fórmulas y escape RFC 4180: entrecomillar si contiene `,`, `"`, `\r` o `\n`).
- [ ] **Step 4: Ejecuta** el mismo comando. Expected: PASS. Mutación: quitar la guardia de fórmulas y ver que falla el caso de inyección; restaurar.
- [ ] **Step 5: Commit** `feat: CSV formatter with formula-injection guard`.

### Task 2: Endpoint `GET /transactions/export`

**Files:**
- Modify: `api/src/transactions/dto/list-transactions.query.ts`, `api/src/transactions/transactions.service.ts`, `api/src/transactions/transactions.controller.ts`
- Create: `api/src/transactions/transactions-export.spec.ts`

**Interfaces:**
- Consumes: `toCsv`, `CsvCell` (Task 1); `AccountsService.findAll(userId, true)`, `CreditCardsService.findAll(userId, true)`, `CategoriesService.findAll(userId, { includeArchived: true })`.
- Produces: `export class TransactionFilters` (from, to, type, accountId, categoryId con sus validadores; `ListTransactionsQuery extends TransactionFilters` y conserva `page`/`limit`); `TransactionsService.exportCsv(userId: string, q: TransactionFilters): Promise<string>`; constante `EXPORT_MAX_ROWS = 50_000` exportada del servicio.

- [ ] **Step 1: Escribe `transactions-export.spec.ts` (falla)** con `bootApp`/`signUp` (`jest.setTimeout(240_000)`): crea cuentas (una luego archivada), tarjeta, categoría con subcategoría y movimientos de los tres tipos y fuentes. Casos: 401 sin token; `Content-Type` empieza por `text/csv`, `Content-Disposition` coincide con `/attachment; filename="movimientos-\d{4}-\d{2}-\d{2}\.csv"/`; el cuerpo empieza por BOM+cabecera exacta; fila de gasto: fecha `YYYY-MM-DD`, tipo `gasto`, monto `-12.50`, nombres de cuenta/categoría/subcategoría, origen `manual`; ingreso positivo; transferencia con `cuenta destino`; gasto con tarjeta en `tarjeta`; cuenta archivada sigue con nombre; filtros (`type`, `from/to`, `accountId`, `categoryId`) reducen filas; orden por fecha descendente; `page=2&limit=1` se ignora; sin movimientos → solo cabecera; nota `=1+1` sale como `'=1+1`; nota con coma y salto de línea sigue siendo una celda; `from=abc` y `accountId=x` → 400; B exporta y no ve nada de A; con el tope bajado (`jest.replaceProperty` o equivalente sobre la constante exportada) y más filas que el tope → 400 con mensaje que menciona "filtros".
- [ ] **Step 2: Ejecuta** `cd api && npx jest src/transactions/transactions-export.spec.ts`. Expected: FAIL (404 en la ruta).
- [ ] **Step 3: Extrae** `TransactionFilters` y una función privada `buildFilter(userId, q): QueryFilter<Transaction>` en el servicio, usada por `findAll` y `exportCsv` (`findAll` debe seguir pasando sus pruebas actuales).
- [ ] **Step 4: Implementa `exportCsv`**: cuenta con `countDocuments(filter)` y lanza `BadRequestException` si supera el tope; lee con `.sort({ date: -1, _id: -1 }).lean()`; construye mapas id→nombre; traduce tipo/origen; monto `cents/100` con signo negativo solo para `expense`.
- [ ] **Step 5: Implementa la ruta** `@Get('export')` en el controlador **antes** de `@Get(':id')`, con `@Res({ passthrough: true })` para fijar `Content-Type: text/csv; charset=utf-8` y `Content-Disposition`; nombre con la fecha UTC de hoy.
- [ ] **Step 6: Ejecuta** el spec nuevo y luego `npm test` completo. Expected: PASS, suite verde. Mutación: quitar el filtro `userId` en `buildFilter` → el caso de B debe fallar; restaurar.
- [ ] **Step 7: Commit** `feat: export transactions as CSV`.

### Task 3: Aislamiento

**Files:**
- Modify: `api/src/security/isolation.spec.ts`

**Interfaces:** Consumes: ruta de Task 2; helpers `asB`, `asE`, `empty`, `noneOfA` del archivo.

- [ ] **Step 1: Ejecuta** `cd api && npx jest src/security/isolation.spec.ts`. Expected: FAIL en "has a case for every route" por `GET /api/transactions/export` sin caso.
- [ ] **Step 2: Añade el caso** `GET /api/transactions/export` junto a los de transacciones: E (sin datos) recibe solo la cabecera; B recibe un CSV que no contiene ningún nombre ni nota de A (reutiliza los valores sembrados para A).
- [ ] **Step 3: Ejecuta** el spec. Expected: PASS (53 rutas). Mutación: filtro `userId` fuera de `buildFilter` → falla; restaurar.
- [ ] **Step 4: Commit** `test: cover CSV export in the isolation suite`.

### Task 4: Botón en la web

**Files:**
- Modify: `web/src/api/client.ts` (añadir `apiDownload`), `web/src/api/transactions.ts`, `web/src/features/transactions/filters.ts`, `web/src/pages/TransactionsPage.tsx`
- Test: `web/src/api/client.test.ts`, `web/src/features/transactions/filters.test.ts`, `web/src/pages/TransactionsPage.test.tsx` (ampliar los existentes)

**Interfaces:**
- Produces: `apiDownload(path: string): Promise<{ blob: Blob; filename: string }>` (mismo token, mismo manejo de 401/errores que `api`; nombre desde `Content-Disposition`, por defecto `movimientos.csv`); `filtersToExportQuery(f: TxFilters): string` (filtros no vacíos, sin `page`; `''` si no hay filtros); `useExportTransactions()` → mutación con `isPending` que descarga con `apiDownload('/transactions/export' + query)` y dispara la descarga con un `<a download>` temporal y `URL.createObjectURL`/`revokeObjectURL`.

- [ ] **Step 1: Escribe pruebas (fallan):** `apiDownload` manda `Authorization`, devuelve blob y nombre, lanza `ApiError` con el mensaje de la API en 400, llama al manejador 401; `filtersToExportQuery` omite `page` y vacíos; en la página, clic en "Exportar CSV" hace `GET /transactions/export?from=…&to=…` con los filtros de la URL, crea el enlace de descarga con el nombre recibido, el botón queda deshabilitado mientras dura, y un error de la API muestra su mensaje en un toast.
- [ ] **Step 2: Ejecuta** `cd web && npx vitest run src/api/client.test.ts src/features/transactions src/pages/TransactionsPage.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implementa** lo descrito en Interfaces y añade el botón (variante `outline`, texto "Exportar CSV") junto a "Nuevo movimiento".
- [ ] **Step 4: Ejecuta** el comando anterior y luego `npm test -- --run`, `npm run build`, `npm run lint`. Expected: PASS, build ok, lint sin errores nuevos. Mutación: omitir `Authorization` en `apiDownload` y no deshabilitar el botón → las pruebas deben fallar; restaurar.
- [ ] **Step 5: Commit** `feat: export transactions button`.

### Task 5: Verificación y cierre

**Files:** Modify: `docs/PLAN.md` (marcar "Exportar movimientos a CSV"), `docs/SECURITY.md` (fila de la exportación en la tabla de controles y 53 rutas).

- [ ] **Step 1:** `cd api && npm test && npm run build && npm run lint`; `cd web && npm test -- --run && npm run build && npm run lint`. Expected: todo verde.
- [ ] **Step 2: Verificación real en el navegador** (API local contra Atlas con un usuario de prueba propio): crear movimientos con nota `=1+1` y una con coma, exportar, abrir el archivo y comprobar BOM, cabecera, comillas y que la nota de fórmula lleva `'`.
- [ ] **Step 3: Commit** `feat: CSV export (phase 11b)`.
