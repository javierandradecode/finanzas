# Fase 3 — Cuentas y categorías: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CRUD de `accounts` y `categories` (con subcategorías embebidas) aislado por usuario, con archivado en lugar de borrado.

**Architecture:** `CategoriesModule` (ya existe) crece con controller, DTOs y CRUD; nuevo `AccountsModule`. Los services reciben `userId: string` del `@CurrentUser()` y lo incluyen en toda consulta. Un `ParseObjectIdPipe` común valida los `:id`.

**Tech Stack:** NestJS 11, Mongoose, class-validator, Jest.

**Spec:** `docs/superpowers/specs/2026-11-07-fase-3-accounts-categories-design.md`

## Global Constraints

- Todo en `api/`; código en inglés; controllers delgados; DTOs con `class-validator`; `ValidationPipe` global con `whitelist: true`.
- Toda consulta filtra por `userId`; recurso ajeno → `404`; `:id` inválido → `400`; duplicado entre activas → `409`.
- "Borrar" = archivar (`isArchived: true`); nunca borrado real.
- Dinero en centavos enteros (`balanceCents`, `initialBalanceCents` con `@IsInt()`).
- Duplicados sin distinguir mayúsculas: collation `{ locale: 'es', strength: 2 }`; un nombre archivado puede reutilizarse.
- Cuenta: `type` ∈ `cash | savings | checking`; `PATCH` solo `name`, `type`, `isArchived`. Categoría: `type` ∈ `income | expense`, inmutable tras crear.
- Rutas protegidas por el guard global existente (no usar `@Public()`).
- TDD en la lógica de los services (aislamiento, 409, archivado); `.http` + prueba manual para el resto.
- Fuera de alcance: movimientos, saldos dinámicos, paginación, borrado real.
- Commits terminan con `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- Pedir/editar/archivar un recurso de otro usuario → `404` (tests T2/T3/T4).
- Subcategoría de una categoría ajena → `404` (test T3).
- `PATCH /accounts/:id` con `balanceCents` en el body → el valor se ignora (test T4).
- Nombre repetido con otras mayúsculas (`"Comida"` vs `"comida"`) → `409`; reutilizar un nombre archivado → permitido (tests T2/T4).
- `:id` mal formado (`/accounts/abc`) → `400`, no `500` (T1 test + `.http`).

---

### Task 1: `ParseObjectIdPipe`

**Files:**
- Create: `api/src/common/pipes/parse-object-id.pipe.ts`, `api/src/common/pipes/parse-object-id.pipe.spec.ts`

**Interfaces:** Produces: `ParseObjectIdPipe implements PipeTransform<string, string>` — devuelve el mismo string si `Types.ObjectId.isValid(v)` y es de 24 hex; si no, lanza `BadRequestException('Invalid id')`.

- [ ] **Step 1: Tests que fallan:** un id de 24 hex válido se devuelve igual; `'abc'`, `''` y `'123456789012'` (12 chars, que Mongoose acepta como válido) lanzan `BadRequestException`.
- [ ] **Step 2:** Run: `cd api; npx jest src/common/pipes`. Expected: FAIL (módulo no existe).
- [ ] **Step 3:** Implementar el pipe validando con regex `^[0-9a-fA-F]{24}$`.
- [ ] **Step 4:** Run: `npx jest src/common/pipes`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(common): ParseObjectIdPipe`.

### Task 2: CRUD de categorías

**Files:**
- Create: `api/src/categories/categories.controller.ts`, `api/src/categories/dto/create-category.dto.ts`, `api/src/categories/dto/update-category.dto.ts`, `api/src/categories/categories.service.spec.ts`
- Modify: `api/src/categories/schemas/category.schema.ts`, `api/src/categories/categories.service.ts`, `api/src/categories/categories.module.ts`

**Interfaces:**
- Consumes: `ParseObjectIdPipe` (T1), `CurrentUser`/`AuthUser` (Fase 2).
- Produces:
  - Schema: `Category` gana `isArchived: boolean` (default `false`) y `subcategories: Subcategory[]` (`{ _id, name, isArchived }`, default `[]`); se exporta `Subcategory`.
  - `CreateCategoryDto { type: 'income' | 'expense'; name: string; icon: string; color: string }`; `UpdateCategoryDto { name?; icon?; color?; isArchived? }` (sin `type`).
  - `CategoriesService.findAll(userId: string, opts: { type?: CategoryType; includeArchived?: boolean }): Promise<CategoryDocument[]>`
  - `CategoriesService.findOne(userId: string, id: string): Promise<CategoryDocument>` (404 si no existe o es ajena)
  - `CategoriesService.create(userId: string, dto: CreateCategoryDto): Promise<CategoryDocument>` (409 si ya hay una activa con ese `name` y `type`)
  - `CategoriesService.update(userId: string, id: string, dto: UpdateCategoryDto): Promise<CategoryDocument>` (404; 409 si renombra a un duplicado activo)
  - `CategoriesService.archive(userId: string, id: string): Promise<void>`
  - Rutas `GET /categories`, `GET /categories/:id`, `POST /categories`, `PATCH /categories/:id`, `DELETE /categories/:id` (204). `createDefaults` de la Fase 2 se conserva sin cambios.

- [ ] **Step 1: Tests que fallan** en `categories.service.spec.ts` (modelo Mongoose mockeado; tests de lo que el service decide):
  - `findAll` consulta con `userId` y excluye archivadas por defecto; con `includeArchived` no filtra `isArchived`; con `type` filtra por tipo.
  - `findOne`/`update`/`archive` sobre un id que el modelo no devuelve para ese `userId` → `NotFoundException`.
  - `create` con duplicado activo → `ConflictException`; sin duplicado → crea con `userId` del usuario autenticado.
  - `update` renombrando a un nombre ya usado por otra activa → `ConflictException`.
  - `archive` hace `isArchived = true` y guarda; no llama a ningún método de borrado.
- [ ] **Step 2:** Run: `cd api; npx jest src/categories`. Expected: FAIL.
- [ ] **Step 3:** Ampliar schema; implementar service (toda consulta incluye `userId`; el chequeo de duplicado usa `findOne({ userId, type, name, isArchived: false }).collation({ locale: 'es', strength: 2 })`, excluyendo el propio `_id` en `update`), DTOs (`@IsIn`, `@IsString`, `@IsNotEmpty`, `@IsBoolean`, `@IsOptional`) y controller delgado con `@CurrentUser()` y `ParseObjectIdPipe`; registrar el controller en `CategoriesModule`.
- [ ] **Step 4:** Run: `npx jest src/categories`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(categories): CRUD with archive`.

> **Aprendizaje:** filtrar por `userId` en el service es el equivalente a un *global scope* de Eloquent (`where('user_id', auth()->id())`), pero aquí es explícito en cada consulta.

### Task 3: Subcategorías

**Files:**
- Create: `api/src/categories/dto/create-subcategory.dto.ts`, `api/src/categories/dto/update-subcategory.dto.ts`
- Modify: `api/src/categories/categories.service.ts`, `api/src/categories/categories.controller.ts`, `api/src/categories/categories.service.spec.ts`

**Interfaces:**
- Consumes: `CategoriesService.findOne` (T2).
- Produces:
  - `CreateSubcategoryDto { name: string }`; `UpdateSubcategoryDto { name?: string; isArchived?: boolean }`.
  - `CategoriesService.addSubcategory(userId: string, categoryId: string, dto: CreateSubcategoryDto): Promise<CategoryDocument>`
  - `CategoriesService.updateSubcategory(userId: string, categoryId: string, subId: string, dto: UpdateSubcategoryDto): Promise<CategoryDocument>`
  - `CategoriesService.archiveSubcategory(userId: string, categoryId: string, subId: string): Promise<void>`
  - Rutas `POST /categories/:id/subcategories`, `PATCH /categories/:id/subcategories/:subId`, `DELETE /categories/:id/subcategories/:subId` (204).

- [ ] **Step 1: Tests que fallan:**
  - `addSubcategory` sobre categoría ajena/inexistente → `NotFoundException`.
  - `addSubcategory` con nombre ya usado por una subcategoría activa de esa categoría (otras mayúsculas) → `ConflictException`; con el nombre de una archivada → agrega.
  - `updateSubcategory`/`archiveSubcategory` con `subId` inexistente en esa categoría → `NotFoundException`.
  - `archiveSubcategory` pone `isArchived = true` y la subcategoría sigue en el arreglo conservando su `_id`.
- [ ] **Step 2:** Run: `npx jest src/categories`. Expected: FAIL en los nuevos tests.
- [ ] **Step 3:** Implementar los tres métodos sobre el documento obtenido con `findOne` (comparar nombres con `localeCompare(..., 'es', { sensitivity: 'accent' })` ignorando mayúsculas) y las tres rutas con `ParseObjectIdPipe` en ambos params.
- [ ] **Step 4:** Run: `npx jest src/categories`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(categories): subcategories`.

### Task 4: CRUD de cuentas

**Files:**
- Create: `api/src/accounts/schemas/account.schema.ts`, `api/src/accounts/dto/create-account.dto.ts`, `api/src/accounts/dto/update-account.dto.ts`, `api/src/accounts/accounts.service.ts`, `api/src/accounts/accounts.service.spec.ts`, `api/src/accounts/accounts.controller.ts`, `api/src/accounts/accounts.module.ts`
- Modify: `api/src/app.module.ts`

**Interfaces:**
- Consumes: `ParseObjectIdPipe` (T1), `CurrentUser` (Fase 2).
- Produces:
  - `Account` schema: `userId` (ObjectId, index), `type` (`cash | savings | checking`), `name`, `balanceCents` (Number, entero), `isArchived` (default `false`), timestamps.
  - `CreateAccountDto { type; name; initialBalanceCents?: number }` (`@IsInt()` opcional); `UpdateAccountDto { name?; type?; isArchived? }`.
  - `AccountsService.findAll(userId: string, includeArchived?: boolean)`, `.findOne(userId, id)`, `.create(userId, dto): Promise<AccountDocument>` (fija `balanceCents = dto.initialBalanceCents ?? 0`), `.update(userId, id, dto)`, `.archive(userId, id): Promise<void>`; 404/409 como en categorías (duplicado por `userId` + `name`, activas).
  - Rutas `GET /accounts` (`?includeArchived=true`), `GET /accounts/:id`, `POST /accounts`, `PATCH /accounts/:id`, `DELETE /accounts/:id` (204).

- [ ] **Step 1: Tests que fallan** en `accounts.service.spec.ts`:
  - `create` fija `balanceCents` desde `initialBalanceCents` (`150050` → `150050`; sin el campo → `0`; `-2000` se acepta).
  - Un `UpdateAccountDto` pasado por `new ValidationPipe({ whitelist: true }).transform({ name: 'X', balanceCents: 999 }, { type: 'body', metatype: UpdateAccountDto })` no contiene `balanceCents`.
  - `CreateAccountDto` rechaza `initialBalanceCents: 10.5` (validación con `validate()`).
  - `findAll` filtra por `userId` y excluye archivadas salvo `includeArchived`.
  - `findOne`/`update`/`archive` de cuenta ajena → `NotFoundException`.
  - `create`/`update` con nombre duplicado activo (otras mayúsculas) → `ConflictException`; con nombre de una archivada → permitido.
  - `archive` pone `isArchived = true` sin borrar.
- [ ] **Step 2:** Run: `cd api; npx jest src/accounts`. Expected: FAIL.
- [ ] **Step 3:** Implementar schema, DTOs, service, controller y módulo (mismo patrón que categorías); importar `AccountsModule` en `AppModule`.
- [ ] **Step 4:** Run: `npx jest src/accounts`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(accounts): CRUD with archive`.

### Task 5: Verificación con dos usuarios y cierre

**Files:**
- Create: `api/requests/accounts-categories.http`
- Modify: `docs/PLAN.md`

**Interfaces:** Consumes: todas las rutas de T2–T4 y `POST /auth/register`.

- [ ] **Step 1:** Crear `accounts-categories.http` con: crear/listar/editar/archivar/restaurar cuenta; lo mismo para categoría y subcategoría; `/accounts/abc`; `PATCH` con `balanceCents`; duplicado con otras mayúsculas.
- [ ] **Step 2:** Run: `cd api; npm run build; npm test; npm run lint`. Expected: sin errores, todos los tests en verde.
- [ ] **Step 3:** Verificación manual con el servidor corriendo (reiniciar `start:dev` si no recargó), registrando dos usuarios A y B (emails con prefijo `verif-`): A crea cuenta con `initialBalanceCents: 150050` → 201 y `balanceCents` igual; A lista categorías → 14 por defecto; B pide la cuenta/categoría de A → 404; B edita/archiva la de A → 404; `/accounts/abc` → 400; `PATCH` con `balanceCents` → saldo sin cambios; duplicado con otras mayúsculas → 409; archivar y reutilizar nombre → 201; archivadas ausentes del listado y presentes con `?includeArchived=true`. Expected: todos los resultados anteriores.
- [ ] **Step 4:** Marcar los 3 ítems de la Fase 3 en `docs/PLAN.md` y commit `feat: accounts and categories CRUD (phase 3)`.

---

## Self-review

- **Cobertura del diseño:** cuentas → T4; categorías + archivado + `type` inmutable → T2; subcategorías → T3; `400` por id → T1; aislamiento, 404, 409, saldo no editable → tests T2–T4 y verificación T5.
- **Consistencia:** `ParseObjectIdPipe` (T1) usado en T2–T4; `CategoriesService.findOne` (T2) consumido por T3; `userId: string` en todos los services.
- **Proporción:** 5 tareas; TDD solo en la lógica de los services, el resto se verifica a mano.
