# Rediseño de /cuentas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Reemplazar las tarjetas de /cuentas por total grande, barra de reparto y filas agrupadas por tipo.

**Architecture:** una función pura `groupAccounts` calcula grupos, subtotales, total y reparto; `AccountsPage` solo pinta. Sin cambios de API.

**Tech Stack:** React, Tailwind, Base UI dropdown (shadcn), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-09-cuentas-ui-design.md`

## Global Constraints

- Dinero en centavos; formatear solo con `formatMoney`. Cifras con `tabular-nums`.
- Archivadas no suman en total, subtotal ni barra.
- Textos de UI en español, código en inglés. Sin dependencias nuevas.
- Comandos: `cd web && npm test -- --run && npm run build && npm run lint`.

## Review Focus

- Todas las cuentas negativas o suma de positivos 0: sin barra ni división por cero.
- Solo archivadas visibles: total 0, grupos sin subtotal engañoso.
- Un grupo vacío no se pinta.
- Nombre largo no rompe la fila; menú accesible con teclado (`aria-label` por cuenta).
- El aviso de carga lenta no aparece si los datos llegan antes de 4 s.

### Task 1: `groupAccounts` (TDD)

**Files:** Create `web/src/features/accounts/group.ts`, `group.test.ts`.

**Interfaces:** Produces `groupAccounts(accounts: Account[]): { total: number; groups: { type: AccountType; subtotal: number; accounts: Account[] }[]; shares: { type: AccountType; percent: number }[] }`. Orden de grupos: checking, savings, cash; grupos sin cuentas se omiten; `shares` solo de subtotales > 0, `percent` entero redondeado, vacío si la suma positiva es 0.

- [ ] Escribe pruebas: agrupa y ordena; archivadas no suman pero aparecen; omite grupos vacíos; reparto 75/25; negativos fuera del reparto; sin positivos → `shares` vacío.
- [ ] Ejecuta y comprueba que fallan; implementa; ejecuta y comprueba que pasan.

### Task 2: Página y diálogo

**Files:** Modify `AccountsPage.tsx`, `AccountDialog.tsx`, `AccountsPage.test.tsx`.

- [ ] Actualiza las pruebas existentes al nuevo marcado (menú `⋯` con `aria-label="Acciones de <nombre>"`, `MemoryRouter`) y añade: fila enlaza a `/movimientos?accountId=<id>`; el reparto y los subtotales se muestran; esqueleto durante la carga y aviso tras 4 s (timers falsos); estado vacío con un solo botón "Nueva cuenta"; tipo como `radio`.
- [ ] Implementa la página según el spec y el diálogo (radiogroup + nota).
- [ ] Ejecuta toda la suite web, build y lint.

### Task 3: Verificación y cierre

- [ ] Verificar en el navegador contra la API local con un usuario de prueba (claro/oscuro, móvil, teclado, cuentas negativas y archivadas); consola limpia.
- [ ] Marcar en `docs/PLAN.md`, commit.
