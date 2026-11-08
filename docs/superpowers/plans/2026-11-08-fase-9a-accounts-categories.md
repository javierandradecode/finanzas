# Fase 9a — Cuentas y categorías Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pantallas `/cuentas` y `/categorias` funcionales contra la API, con las piezas compartidas de dinero, diálogos e iconos.

**Architecture:** Hooks de TanStack Query en `web/src/api/` (uno por recurso) envuelven `api()`; páginas en `web/src/pages/`, componentes de dominio en `web/src/features/{accounts,categories}/`; formularios RHF + Zod en diálogos shadcn; utilidades puras en `web/src/lib/`.

**Tech Stack:** React 19, TanStack Query, React Hook Form + Zod, shadcn/ui (Base UI), lucide-react, sonner, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-08-fase-9a-accounts-categories-design.md`

## Global Constraints

- Dinero siempre en centavos enteros; formatear solo al mostrar (`formatMoney`).
- Llamadas a la API solo desde `web/src/api/`. Textos de UI en español, código en inglés.
- Claves de consulta: `['accounts', {includeArchived}]`, `['categories', {includeArchived}]`; toda mutación invalida `['accounts']` / `['categories']`.
- Archivar = `DELETE` (204); restaurar = `PATCH {isArchived:false}`.
- shadcn usa Base UI: los disparadores usan `render={<…/>}` en lugar de `asChild`.
- Tipos de cuenta: `cash`→Efectivo, `savings`→Ahorros, `checking`→Corriente.
- `npm test`, `npm run build` y `npm run lint` sin errores al cerrar cada tarea.

## Review Focus

- `parseMoneyToCents`: `""`, `"abc"`, `"1.2.3"`, `"12.345"` → `null`; `"0,5"`→50; `"1.234,56"` y `"1,234.56"` → 123456; `"-3"` → -300; `"12,5"`→1250; `"0.1"+"0.2"` no usa float (siempre `Math.round` sobre enteros de string).
- Saldo negativo de una cuenta se ve en rojo y con signo, no como positivo.
- Categoría con icono desconocido o color fuera de paleta no rompe la pantalla.
- Error de la API en una mutación (p. ej. 400/409) muestra el mensaje en un toast y no cierra el diálogo.
- Tras archivar o restaurar, la lista se actualiza sin recargar; con "Mostrar archivadas" desactivado la archivada desaparece.
- Cuenta sin cuentas / categorías vacías muestran un estado vacío con acción.

---

### Task 1: Utilidades de dinero (TDD)

**Files:**
- Create: `web/src/lib/money.ts`, `web/src/lib/money.test.ts`

**Interfaces:**
- Produces: `formatMoney(cents: number, currency: string): string` (locale `es`); `parseMoneyToCents(text: string): number | null`.

- [ ] **Step 1: Tests** en `money.test.ts`: tabla de `parseMoneyToCents` con los casos del Review Focus (`"12.50"`→1250, `"12,50"`→1250, `"0,5"`→50, `"1.234,56"`→123456, `"1,234.56"`→123456, `"-3"`→-300, `"  7 "`→700, `"1000"`→100000, `""`/`"abc"`/`"1.2.3"`/`"12.345"`/`"-"`→`null`); `formatMoney(123456,'USD')` contiene `1.234,56` y `$`/`US$`; `formatMoney(-500,'USD')` contiene `-` y `5,00`. Run `npm test` → FAIL.
- [ ] **Step 2:** Implementar sin floats: normalizar separadores (si hay coma y punto, el último es el decimal; si solo uno y va seguido de ≠2 o 1 dígitos tras él... regla: un único separador seguido de 1–2 dígitos al final es decimal; seguido de exactamente 3 dígitos es de miles; cualquier otro caso → `null`), validar con regex, convertir con enteros. Run → PASS.
- [ ] **Step 3:** Mutación: cambiar `Math.round`/lógica de decimales y comprobar que algún test falla; restaurar. Commit `feat(web): money parsing and formatting`.

---

### Task 2: Hooks de cuentas y categorías (TDD)

**Files:**
- Create: `web/src/api/accounts.ts`, `web/src/api/accounts.test.tsx`, `web/src/api/categories.ts`, `web/src/api/categories.test.tsx`

**Interfaces:**
- Consumes: `api` de `@/api/client`.
- Produces:
  - Tipos `Account`, `AccountType`, `Category`, `Subcategory`, `CategoryType` (forma del contrato del spec).
  - `useAccounts(includeArchived: boolean)`; `useCreateAccount()` (`{type,name,initialBalanceCents?}`); `useUpdateAccount()` (`{id, name?, type?, isArchived?}`); `useArchiveAccount()` (`id: string`).
  - `useCategories(includeArchived: boolean)`; `useCreateCategory()` (`{type,name,icon,color}`); `useUpdateCategory()` (`{id,name?,icon?,color?,isArchived?}`); `useArchiveCategory()` (`id`); `useAddSubcategory()` (`{categoryId,name}`); `useUpdateSubcategory()` (`{categoryId,subId,name?,isArchived?}`); `useArchiveSubcategory()` (`{categoryId,subId}`).
  - Todas las mutaciones invalidan `['accounts']` o `['categories']`.

- [ ] **Step 1: Tests** con `fetch` stub y `QueryClientProvider` (helper `wrapper` local): `useAccounts(false)` pide `/accounts`; `useAccounts(true)` pide `/accounts?includeArchived=true`; `useCreateAccount` hace `POST /accounts` con el cuerpo; `useUpdateAccount` `PATCH /accounts/:id` sin enviar `id` en el cuerpo; `useArchiveAccount` `DELETE`; tras una mutación exitosa se refetch (fetch de lista llamado otra vez). Equivalentes para categorías, y rutas de subcategorías (`POST /categories/:id/subcategories`, `PATCH …/:subId`, `DELETE …/:subId`). Run → FAIL.
- [ ] **Step 2:** Implementar hooks con `useQuery`/`useMutation`/`useQueryClient`. Run → PASS.
- [ ] **Step 3:** Suite, build, lint. Commit `feat(web): accounts and categories api hooks`.

---

### Task 3: Componentes compartidos

**Files:**
- Create: `web/src/components/MoneyInput.tsx` (+ test), `web/src/components/ConfirmDialog.tsx` (+ test), `web/src/components/CategoryIcon.tsx` (+ test), `web/src/lib/category-options.ts`
- Modify: `web/src/App.tsx` (montar `<Toaster />`), shadcn: añadir `dialog select tabs switch badge sonner`

**Interfaces:**
- Consumes: `parseMoneyToCents`, `formatMoney`.
- Produces:
  - `MoneyInput({ value: number | null; onChange(cents: number | null): void; id?: string; placeholder?: string; 'aria-invalid'?: boolean })`: guarda el texto que se escribe; cuando el texto es inválido entrega `null`; reformatea solo al perder el foco si es válido.
  - `ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, onConfirm: () => void | Promise<void> })`.
  - `CATEGORY_ICONS: Record<string, LucideIcon>` (clave = nombre kebab de lucide; incluye `briefcase car ellipsis film graduation-cap heart-pulse home plus-circle repeat shirt shopping-bag trending-up utensils zap` más `shopping-cart plane gift wallet piggy-bank banknote coffee dumbbell smartphone book-open tag`), `CATEGORY_COLORS: string[]` (`#06b6d4 #10b981 #14b8a6 #16a34a #22c55e #3b82f6 #6366f1 #6b7280 #84cc16 #8b5cf6 #eab308 #ec4899 #ef4444 #f97316`).
  - `CategoryIcon({ name, color?, className? })`: icono desconocido → `tag`.

- [ ] **Step 1: Tests:** `CategoryIcon` renderiza sin lanzar con un nombre desconocido y con `utensils`; `MoneyInput` (userEvent): escribir `12,50` llama `onChange(1250)`, escribir `abc` llama `onChange(null)`; `ConfirmDialog`: al pulsar el botón de confirmar llama `onConfirm`, al cancelar no. Run → FAIL.
- [ ] **Step 2:** Instalar shadcn (`npx shadcn@latest add dialog select tabs switch badge sonner -y`) e implementar componentes y `category-options.ts`; montar `Toaster` (tema respetando clase `dark`). Run → PASS.
- [ ] **Step 3:** Suite, build, lint. Commit `feat(web): shared money input, confirm dialog and category icons`.

---

### Task 4: Pantalla de cuentas

**Files:**
- Create: `web/src/features/accounts/AccountDialog.tsx`, `web/src/features/accounts/account-schema.ts` (+ test), `web/src/pages/AccountsPage.tsx` (+ test)
- Modify: `web/src/router.tsx` (la ruta `/cuentas` usa `AccountsPage`; el resto sigue con `PlaceholderPage`)

**Interfaces:**
- Consumes: hooks de cuentas, `MoneyInput`, `ConfirmDialog`, `formatMoney`, `useAuth().user.currency`.
- Produces: `accountSchema` (Zod: `name` no vacío tras trim "Ingresa un nombre", `type` en `cash|savings|checking`), `ACCOUNT_TYPE_LABELS: Record<AccountType,string>`; `AccountDialog({ open, onOpenChange, account? })` (crear sin `account`; editar con `account`, sin campo de saldo).

- [ ] **Step 1: Tests:** schema (nombre vacío/espacios inválido, tipo inválido); `AccountsPage` con `fetch` stub: muestra cuentas con saldo formateado y saldo total de activas; saldo negativo con clase de color de error; estado vacío con botón "Nueva cuenta"; crear envía `POST` con `initialBalanceCents` en centavos (`"100,50"` → 10050); error 400 de la API muestra toast y mantiene el diálogo; archivar pide confirmación y envía `DELETE`; con el switch "Mostrar archivadas" se pide `?includeArchived=true` y aparece "Restaurar" que envía `PATCH {isArchived:false}`. Run → FAIL.
- [ ] **Step 2:** Implementar. Run → PASS.
- [ ] **Step 3:** Suite, build, lint. Commit `feat(web): accounts screen`.

---

### Task 5: Pantalla de categorías

**Files:**
- Create: `web/src/features/categories/CategoryDialog.tsx`, `web/src/features/categories/SubcategoryList.tsx`, `web/src/features/categories/category-schema.ts` (+ test), `web/src/pages/CategoriesPage.tsx` (+ test)
- Modify: `web/src/router.tsx` (`/categorias` → `CategoriesPage`)

**Interfaces:**
- Consumes: hooks de categorías, `CategoryIcon`, `CATEGORY_ICONS`, `CATEGORY_COLORS`, `ConfirmDialog`.
- Produces: `categorySchema` (nombre no vacío, `icon` y `color` obligatorios, `color` regex `^#[0-9a-fA-F]{6}$`); `CategoryDialog({ open, onOpenChange, type: CategoryType, category? })`; `SubcategoryList({ category })`.

- [ ] **Step 1: Tests:** schema; `CategoriesPage` con `fetch` stub: pestaña Gastos muestra solo gastos y Ingresos solo ingresos; crear categoría en la pestaña activa envía `type` correspondiente, nombre, icono y color elegidos; categoría con icono desconocido y color fuera de paleta se renderiza; añadir subcategoría (`POST …/subcategories`), renombrar (`PATCH`), archivar (`DELETE`) y restaurar (`PATCH {isArchived:false}`); archivar categoría pide confirmación; switch de archivadas pide `?includeArchived=true`; estado vacío por pestaña. Run → FAIL.
- [ ] **Step 2:** Implementar. Run → PASS.
- [ ] **Step 3:** Suite, build, lint. Commit `feat(web): categories screen`.

---

### Task 6: Verificación manual y cierre

**Files:**
- Modify: `docs/PLAN.md`

- [ ] **Step 1:** Arrancar API y web. En el navegador, con un usuario de prueba nuevo: ver categorías por defecto; crear cuentas (con saldo inicial `1.234,56`, otra negativa), editar nombre/tipo, archivar, mostrar archivadas y restaurar; saldo total correcto; crear categoría de gasto e ingreso con icono/color, editar, archivar/restaurar; subcategorías añadir/renombrar/archivar/restaurar; error de la API visible en toast (p. ej. nombre vacío evitado por Zod; forzar uno con la API apagada → "No se pudo conectar con el servidor"); modo oscuro legible; menú móvil sigue funcionando.
- [ ] **Step 2:** `cd web && npm test && npm run build && npm run lint`; `cd api && npm test`.
- [ ] **Step 3:** En `docs/PLAN.md`, bajo la Fase 9, marcar `Cuentas y categorías`. Commit `feat: accounts and categories screens (phase 9a)`. Detener servidores de desarrollo que se hayan arrancado.
