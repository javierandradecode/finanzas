# Fase 9d — Suscripciones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pantalla `/suscripciones` para crear, editar, pausar y reactivar suscripciones, ver próximos cobros y disparar el cobro de lo vencido.

**Architecture:** Lógica pura en `features/subscriptions/subscription-form.ts` (TDD); hooks de TanStack Query en `web/src/api/subscriptions.ts`; `SubscriptionDialog` (RHF + Zod), `UpcomingPanel` y `SubscriptionsPage`.

**Tech Stack:** React 19, TanStack Query, React Hook Form + Zod, Tailwind/shadcn, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-08-fase-9d-subscriptions-design.md`

## Global Constraints

- Dinero en centavos; solo formatear al mostrar. API solo en `web/src/api/`. UI en español, código en inglés.
- Fechas: se envían `YYYY-MM-DD`; se muestran con `formatDateUtc`; "hoy" con `todayLocal()`.
- Pagador codificado `account:<id>` / `card:<id>`. Exactamente uno por suscripción.
- Claves de consulta: `['subscriptions', 'list']`, `['subscriptions', 'upcoming', days]`.
- Invalidaciones: crear/editar/pausar/reactivar → `['subscriptions']`; `process-due` → `['subscriptions']`, `['transactions']`, `['accounts']`, `['credit-cards']`.
- Pausar = `DELETE` (204) con confirmación; reactivar = `PATCH {active:true}` sin confirmación.
- Reutilizar `MoneyInput`, `NativeSelect`, `ConfirmDialog`, `FieldError`, `test/utils.tsx` (`routeFetch`, `stubFetch`, `callOf`, `makeClient`).
- `npm test`, `npm run build`, `npm run lint` sin errores nuevos al cerrar cada tarea.

## Review Focus

- Editar cambiando el pagador de cuenta a tarjeta envía `accountId: null` y `creditCardId: <id>` (y viceversa); nunca ambos.
- Equivalente mensual: semanal 1000 → 4333, trimestral 3000 → 1000, anual 1200 → 100, semestral 600 → 100; las pausadas no cuentan en el resumen.
- Suscripción con `lastError`: alerta visible con el mensaje; tras reactivar (la API limpia el error) la alerta desaparece al refrescar.
- Cuenta/tarjeta/categoría archivada de una suscripción existente: se muestra su nombre y se conserva como opción al editar.
- `nextDate` en el pasado: el formulario avisa "Se cobrarán los períodos vencidos" pero deja guardar.
- "Cobrar vencidos ahora": éxito con N > 0, ningún vencido (todo 0) y con fallos producen toasts distintos; el botón se deshabilita mientras corre (sin doble envío).
- Pausada: atenuada, al final de la lista y con "Reactivar" en lugar de "Pausar".
- Error 400/409 de la API al guardar: toast con el mensaje y el diálogo sigue abierto.

---

### Task 1: Lógica del formulario y del resumen (TDD)

**Files:**
- Create: `web/src/features/subscriptions/subscription-form.ts` (+ `subscription-form.test.ts`)

**Interfaces:**
- Produces:
  - `type Frequency = 'weekly'|'monthly'|'quarterly'|'semiannual'|'yearly'`; `FREQUENCIES: Frequency[]` (en ese orden); `FREQUENCY_LABELS: Record<Frequency,string>` (Semanal, Mensual, Trimestral, Semestral, Anual); `FREQUENCY_UNITS: Record<Frequency,string>` (`semana`, `mes`, `trimestre`, `semestre`, `año`).
  - `monthlyEquivalentCents(amountCents: number, frequency: Frequency): number` (redondeado).
  - `summarize(subs: { amountCents: number; frequency: Frequency; active: boolean }[]): { activeCount: number; monthlyCents: number }`.
  - `SubscriptionFormValues { name: string; amountCents: number|null; frequency: Frequency; nextDate: string; payer: string; categoryId: string; subcategoryId: string }`; `subscriptionSchema` (mensajes: "Ingresa un nombre", "El nombre admite hasta 120 caracteres", "Ingresa un monto", "Monto no válido", "El monto debe ser mayor que 0", "Fecha no válida", "Elige con qué se paga", "Elige una categoría"); `isPastDate(date: string, today?: string): boolean`.
  - `toCreatePayload(v): CreateSubscriptionPayload` (solo campos aplicables: `accountId` o `creditCardId`; subcategoría vacía omitida; nombre recortado); `toUpdatePayload(v): UpdateSubscriptionPayload` (todas las claves; `accountId`/`creditCardId`/`subcategoryId` no aplicables en `null`); `fromSubscription(s): SubscriptionFormValues` (`nextDate` → `iso.slice(0,10)`).

- [ ] **Step 1: Tests:** equivalentes del Review Focus más mensual (999 → 999) y semanal 100 → 433; `summarize` ignora pausadas y suma activas (lista vacía → ceros); esquema válido e inválido por campo (mensajes exactos; nombre de 121 caracteres, monto `null`/`NaN`/0, fecha `2026-02-31`, pagador vacío, categoría vacía); `isPastDate('2026-03-01','2026-03-02')` true, igual o posterior false; `toCreatePayload` con cuenta y con tarjeta (objeto exacto); `toUpdatePayload` cuenta→tarjeta (`accountId: null, creditCardId: 'k1'`) y tarjeta→cuenta, subcategoría vacía → `null`; `fromSubscription` ∘ `toUpdatePayload` conserva ids, monto y fecha. Run → FAIL.
- [ ] **Step 2:** Implementar. Run → PASS.
- [ ] **Step 3:** Mutación: cambiar el factor semanal o dejar un lado del pagador sin `null`, comprobar que falla; restaurar. Suite, build, lint. Commit `feat(web): subscription form logic and monthly summary`.

---

### Task 2: Hooks de suscripciones (TDD)

**Files:**
- Create: `web/src/api/subscriptions.ts`, `web/src/api/subscriptions.test.tsx`

**Interfaces:**
- Consumes: `api`, payloads y `Frequency` de Task 1.
- Produces: tipos `Subscription`, `UpcomingCharge { subscriptionId; name; amountCents; date: string; overdue: boolean; frequency: Frequency; accountId?; creditCardId?; categoryId }`, `ProcessSummary { charged: number; failed: { subscriptionId; name; error }[] }`; `useSubscriptions()`, `useUpcoming(days = 30)`, `useCreateSubscription()`, `useUpdateSubscription()` (`{id, ...payload}`), `usePauseSubscription()` (`id`), `useReactivateSubscription()` (`id`, envía `{ active: true }`), `useProcessDue()`.

- [ ] **Step 1: Tests** (`stubFetch`/`callOf`, espía de `invalidateQueries`): URLs (`/subscriptions`, `/subscriptions/upcoming?days=30`), `POST` con cuerpo, `PATCH` sin `id` en el cuerpo y conservando `null`, `DELETE` al pausar, `PATCH {active:true}` al reactivar, `POST /subscriptions/process-due`; invalidaciones según Global Constraints (process-due invalida las cuatro claves; las demás solo `subscriptions`). Run → FAIL.
- [ ] **Step 2:** Implementar. Run → PASS.
- [ ] **Step 3:** Suite, build, lint. Commit `feat(web): subscriptions api hooks`.

---

### Task 3: Formulario de suscripción

**Files:**
- Create: `web/src/features/subscriptions/SubscriptionDialog.tsx` (+ `SubscriptionDialog.test.tsx`)

**Interfaces:**
- Consumes: Task 1 y 2, `useAccounts(true)`, `useCreditCards(true)`, `useCategories(true)`, `MoneyInput`, `NativeSelect`.
- Produces: `SubscriptionDialog({ open, onOpenChange, subscription?: Subscription })`; monta el formulario solo cuando las tres listas ya cargaron (para que los `<select>` tengan sus opciones al editar).

- [ ] **Step 1: Tests** (`routeFetch`, `vi.mock('sonner')`): (a) crear con cuenta → `POST` con `{name, amountCents, frequency, nextDate, accountId, categoryId}` y toast "Suscripción creada"; (b) crear con tarjeta envía `creditCardId` y no `accountId`; (c) solo ofrece cuentas y tarjetas activas y categorías de gasto activas; (d) la subcategoría lista solo las de la categoría elegida y se reinicia al cambiar de categoría; (e) editar y pasar de cuenta a tarjeta → `PATCH` con `accountId: null, creditCardId: 'k1'`; (f) al editar se conservan como opciones la cuenta y la categoría archivadas de la suscripción; (g) fecha pasada muestra "Se cobrarán los períodos vencidos" y aun así guarda; (h) monto inválido, nombre vacío y pagador sin elegir muestran errores sin petición; (i) error 409 → toast con el mensaje y el diálogo sigue abierto; (j) la fecha por defecto es `todayLocal()`. Run → FAIL.
- [ ] **Step 2:** Implementar. Run → PASS.
- [ ] **Step 3:** Mutaciones: no enviar `null` al cambiar de pagador; no reiniciar la subcategoría; comprobar fallos; restaurar. Suite, build, lint. Commit `feat(web): subscription form dialog`.

---

### Task 4: Pantalla de suscripciones

**Files:**
- Create: `web/src/features/subscriptions/UpcomingPanel.tsx`, `web/src/pages/SubscriptionsPage.tsx` (+ `SubscriptionsPage.test.tsx`)
- Modify: `web/src/router.tsx` (`/suscripciones` → `SubscriptionsPage`)

**Interfaces:**
- Consumes: hooks de Task 2, `summarize`, `FREQUENCY_*`, `SubscriptionDialog`, `ConfirmDialog`, listas de cuentas/tarjetas/categorías (con archivadas) para nombres, `formatMoney`, `formatDateUtc`, `useAuth().user.currency`.
- Produces: `UpcomingPanel()`; `SubscriptionsPage` (resumen, lista, panel de próximos, "Nueva suscripción", "Cobrar vencidos ahora").

- [ ] **Step 1: Tests** (`routeFetch`, `AuthContext`, `vi.mock('sonner')`): (a) resumen "2 suscripciones activas" y el equivalente mensual correcto, ignorando la pausada; (b) lista con monto y unidad ("/ mes"), pagador y categoría (incluidos archivados), pausadas al final, atenuadas y con "Pausada"; (c) `lastError` visible con el mensaje; (d) pausar pide confirmación y envía `DELETE`; reactivar envía `PATCH {active:true}` sin confirmación; (e) estado vacío con "Nueva suscripción"; (f) panel de próximos: filas ordenadas, "Atrasado" en las vencidas, vacío con su texto; (g) "Cobrar vencidos ahora": éxito con N > 0 → toast "N cobros realizados" (singular con 1), todo 0 → "No había cobros vencidos", con fallos → `toast.error` con nombre y mensaje; el botón se deshabilita mientras corre (una sola petición con doble clic); (h) editar abre el diálogo con los datos. Run → FAIL.
- [ ] **Step 2:** Implementar y enrutar. Run → PASS.
- [ ] **Step 3:** Mutaciones: contar pausadas en el resumen; no deshabilitar el botón de cobro; comprobar fallos; restaurar. Suite, build, lint. Commit `feat(web): subscriptions screen`.

---

### Task 5: Verificación manual y cierre

**Files:**
- Modify: `docs/PLAN.md`

- [ ] **Step 1:** Arrancar API y web. Con el usuario de prueba: crear una suscripción mensual pagada con una cuenta y otra con la tarjeta; ver resumen y panel de próximos; crear una con `nextDate` de hace dos meses (aviso de períodos vencidos) y pulsar "Cobrar vencidos ahora": deben aparecer los gastos en Movimientos con la etiqueta "Suscripción", la cuenta bajar y la deuda de la tarjeta subir con las cifras exactas (comprobar con `curl`); repetir el cobro y comprobar que no duplica; archivar la cuenta pagadora y forzar un cobro vencido para ver `lastError` y su alerta; desarchivar, cobrar y ver la alerta desaparecer; pausar con confirmación y reactivar; cambiar el pagador de cuenta a tarjeta; modo oscuro y móvil legibles.
- [ ] **Step 2:** `cd web && npm test && npm run build && npm run lint`; `cd api && npm test`.
- [ ] **Step 3:** En `docs/PLAN.md` marcar `Suscripciones`. Commit `feat: subscriptions screen (phase 9d)`. Detener los servidores de desarrollo que se hayan arrancado.
