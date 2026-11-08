# Fase 2 — Usuarios y autenticación: diseño

Estado: **pendiente de aprobación**.

## Intención
Que una persona se registre e inicie sesión con email y contraseña, y que toda la API quede protegida por defecto. Esto habilita la regla de CLAUDE.md "toda consulta filtra por el usuario autenticado" en las fases siguientes.

## Goals
- Módulo `users`: schema (`email` único en minúsculas, `passwordHash`, `name`, `currency` default `USD`, timestamps) + `UsersService`.
- Módulo `auth`:
  - `POST /api/auth/register` (`email`, `password`, `name`) → crea usuario y devuelve `{ accessToken, user }`.
  - `POST /api/auth/login` (`email`, `password`) → `{ accessToken, user }`.
  - `GET /api/auth/me` → usuario autenticado.
- Guard JWT **global**; las rutas públicas se marcan con `@Public()` (`register`, `login`, `health`).
- Decorador `@CurrentUser()` que entrega `{ userId, email }` desde el token.
- Al registrarse se crean las categorías por defecto, y usuario + categorías se crean en **una transacción de MongoDB**.
- Archivo `api/requests/auth.http` para probar a mano.

## Non-goals
- Refresh tokens, cookies `httpOnly`, recuperación de contraseña, verificación de email, roles, rate limiting.
- CRUD de categorías (Fase 3). Aquí solo el schema y `CategoriesService.createDefaults`.

## Anti-goals
- Filtrar `passwordHash` en cualquier respuesta. Revelar si un email existe al fallar el login.

## Approaches
- **Categorías:** schema mínimo en Fase 2 y CRUD en Fase 3 (elegido por el dueño; descartados: mover el ítem a Fase 3, o adelantar el módulo completo).
- **Token:** un solo JWT de 7 días en header `Authorization: Bearer` (elegido por el dueño; descartados: JWT corto + refresh token, cookie `httpOnly`). Se pueden añadir después cambiando solo `AuthService` y el cliente HTTP.

## Decisiones tomadas por el asistente (corregibles)
- Contraseña: mínimo 8 caracteres, hash con `bcrypt` (10 rounds).
- Email se normaliza a minúsculas y sin espacios; duplicado → `409`.
- Login fallido: siempre `401` con el mismo mensaje ("Invalid credentials"), exista o no el email.
- Payload del JWT: `sub` (userId) y `email`. Expiración vía `JWT_EXPIRES_IN` (default `7d`), variable nueva en `.env.example` y en la validación.
- Categorías por defecto (`type`, `name`, `icon`, `color`; sin subcategorías en esta fase):
  - Gastos: Alimentación, Transporte, Vivienda, Servicios, Salud, Educación, Entretenimiento, Ropa, Suscripciones, Otros gastos.
  - Ingresos: Salario, Ventas, Inversiones, Otros ingresos.
  - Los iconos son nombres de ícono en texto (p. ej. `utensils`) y los colores hex; se ajustan en la Fase 3/9.
- Tests (Jest, con TDD) para la lógica de `AuthService`: registro con email duplicado, normalización de email, `passwordHash` ausente en la respuesta, login con contraseña errónea y con email inexistente devuelven el mismo error. Config y wiring se verifican con el `.http`.
- Dependencias: `@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-jwt`, `bcrypt` (+ tipos).

## Pendiente del builder
Estructura interna de carpetas (`users/`, `auth/`, `categories/` con `schemas/` y `dto/` según CLAUDE.md), nombres exactos de DTOs y mensajes de validación.

## Verificación de la fase
`npm run build`, lint y tests en verde; con el `.http`: registrar, login, `/me` con token (200), `/me` sin token (401), registro duplicado (409), y confirmar en Atlas/Compass que el usuario y sus categorías por defecto existen. Marcar la fase en `docs/PLAN.md` y commit.
