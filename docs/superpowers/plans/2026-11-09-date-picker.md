# Selector de fecha propio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Sustituir los calendarios nativos por un `DatePicker` propio y mejorar el aspecto de `NativeSelect`.

**Architecture:** `ui/popover.tsx` + `DatePicker` (react-day-picker) con valores de texto `AAAA-MM-DD`; los diálogos lo usan vía `Controller`; estilos por variables CSS ligadas a los tokens.

**Tech Stack:** react-day-picker 10, Base UI popover, React Hook Form, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-09-date-picker-design.md`

## Global Constraints

- Una fecha es siempre texto `AAAA-MM-DD`; nunca pasar por `toISOString()` ni por UTC al elegirla.
- Textos de UI en español. Una sola dependencia nueva (`react-day-picker`).
- La CSP de `render.yaml` no cambia (estilos en archivo propio).
- Comandos: `cd web && npm test -- --run && npm run build && npm run lint`.

## Review Focus

- Zona horaria: elegir el día 1 o el último del mes y las 00:00–23:59 locales no cambia el día guardado.
- Dentro de un diálogo: elegir un día no cierra el diálogo; Escape cierra el calendario y no el diálogo.
- Valor vacío / inválido: el botón muestra "Elige una fecha" y el calendario abre en el mes actual.
- "Borrar" solo aparece en los pickers borrables; vaciar ambas fechas de movimientos sigue dando "Todo el historial".
- Teclado: el botón abre con Enter/Espacio, las flechas mueven el día, Escape cierra.

### Task 1: Helpers, Popover y DatePicker (TDD)

**Files:** Modify `web/src/lib/dates.ts` (+ test); Create `web/src/components/ui/popover.tsx`, `web/src/components/DatePicker.tsx`, `DatePicker.test.tsx`; Modify `web/src/index.css`, `web/src/test/utils.tsx`.

**Interfaces:** `parseYmd(s: string): Date | undefined` (fecha local, `undefined` si no es una fecha real); `toYmd(d: Date): string` (con el calendario local); `DatePicker({ id?, value: string, onChange(value: string): void, clearable?: boolean, invalid?: boolean })`; `pickDate(label: string, ymd: string): Promise<void>` en `test/utils.tsx`.

- [ ] Pruebas: `parseYmd`/`toYmd` (ida y vuelta, 29 feb, 31 dic, fecha falsa); DatePicker (muestra la fecha o el texto vacío; abre con clic y con Enter; elegir día llama `onChange` con el texto exacto, también día 1 y último del mes; elegir cierra la ventana; "Hoy"; "Borrar" solo si `clearable` y hay valor; no cambia el valor al cerrar con Escape).
- [ ] Implementar y ejecutar.

### Task 2: Usarlo en los formularios y filtros

**Files:** Modify `TransactionDialog.tsx`, `PayInstallmentDialog.tsx`, `PurchaseDialog.tsx`, `SubscriptionDialog.tsx`, `TransactionsPage.tsx` y sus pruebas (`TransactionDialog.test.tsx`, `SubscriptionDialog.test.tsx`, `TransactionsPage.test.tsx`).

- [ ] Reemplazar los 6 `<input type="date">` (`Controller` en los diálogos; `clearable` en Desde/Hasta). Actualizar las pruebas a `pickDate` y a comprobar `data-value`.
- [ ] Suite completa, build y lint.

### Task 3: `NativeSelect`

**Files:** Modify `web/src/components/NativeSelect.tsx` (+ prueba corta: sigue siendo un `<select>` accesible con la flecha oculta a lectores).

- [ ] Prueba, implementación y suite.

### Task 4: Verificación y cierre

- [ ] Navegador (API local): abrir el calendario en el diálogo de movimientos, filtros y suscripciones; claro/oscuro; móvil 360 px; teclado; fecha lejana (2020) y día 31; consola limpia.
- [ ] `docs/PLAN.md`, commit.
