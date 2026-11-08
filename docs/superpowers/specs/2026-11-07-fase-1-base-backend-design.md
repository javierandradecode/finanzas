# Fase 1 — Base del backend: diseño

Estado: **aprobado** por el dueño del proyecto (2026-11-07).

## Intención
Tener `api/` arrancando y respondiendo `GET /api/health` conectado a MongoDB Atlas, con las piezas transversales listas para los módulos de las fases siguientes. Éxito = "arranca y `/api/health` responde con Atlas", nada más.

## Goals
- Proyecto NestJS 11 limpio, TypeScript `strict: true`, ESLint + Prettier.
- Configuración por `.env` validada al arrancar (`MONGODB_URI`, `JWT_SECRET`, `PORT`) + `.env.example`.
- Conexión a Atlas con `@nestjs/mongoose`.
- Bootstrap global en `main.ts`: prefijo `/api`, `ValidationPipe` con `whitelist: true`, filtro de excepciones con forma de error uniforme (sin detalles internos en 500), CORS para `http://localhost:5173`.
- `GET /api/health` → `{ status, db, uptime }`; `db` refleja el estado real de la conexión.
- Utilidad de dinero en `api/src/common/money`: `toCents(string): number` (sin float; rechaza formatos inválidos y más de 2 decimales) y `formatCents(cents, currency = 'USD', locale = 'es-EC'): string`.

## Non-goals
- `mongodb-memory-server` y tests e2e (Fase 4, con transacciones).
- Tests de config o health.
- Users, auth y cualquier módulo de dominio (Fase 2+).

## Anti-goals
- Adelantar fases. Dejar un scaffold a medias.

## Constraints (de CLAUDE.md)
Dinero en centavos enteros; código en inglés; `ValidationPipe` global con `whitelist: true`; secretos solo en `.env` (no commitear); entorno Windows (PowerShell/Git Bash). TDD solo en lógica de negocio: aquí, únicamente la utilidad de dinero.

## Approaches
Una sola forma sensata (el stack ya está fijado). Única decisión: reutilizar el `api/` existente (incompleto: sin `strict: true`, sin dependencias instaladas) o regenerarlo. **Elegido: regenerar desde cero**, porque arreglarlo cuesta más que rehacerlo.

## Decisiones tomadas por el asistente (corregibles)
- Locale `es-EC` para `formatCents`.
- CORS apunta a `http://localhost:5173` (puerto de Vite), configurable por `CORS_ORIGIN`.
- Forma de error: `{ statusCode, message, error }`.

## Pendiente del dueño
- Poner su `MONGODB_URI` de Atlas en `api/.env` (no compartirla en el chat).

## Verificación de la fase
`npm run build`, tests de la utilidad de dinero en verde, y `curl http://localhost:3000/api/health` contra Atlas devuelve `db: "up"`. Luego marcar la fase en `docs/PLAN.md` y commit.
