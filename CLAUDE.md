# Finanzas Personales

Sistema para registrar ingresos y gastos personales: cuentas, categorías, tarjetas de crédito con compras diferidas, suscripciones, presupuestos y reportes.

**Objetivo secundario: aprendizaje.** El dueño del proyecto viene de Laravel/PHP y está aprendiendo TypeScript, NestJS, MongoDB y React. Explica brevemente las decisiones importantes y los conceptos nuevos (decoradores, inyección de dependencias, hooks, aggregation pipeline), comparándolos con Laravel cuando ayude.

## Stack

- **Backend:** NestJS 11 + TypeScript (strict) + Mongoose → carpeta `api/`
- **Base de datos:** MongoDB Atlas (cluster M0 gratuito); local opcional con MongoDB Community
- **Frontend:** React + Vite + TypeScript → carpeta `web/`
- **Frontend libs:** React Router, TanStack Query, React Hook Form + Zod, Recharts, Tailwind CSS + shadcn/ui
- **Auth:** JWT (`@nestjs/jwt` + Passport), contraseñas con bcrypt
- **Tareas programadas:** `@nestjs/schedule`
- **Entorno:** Windows. Usa comandos compatibles con PowerShell o Git Bash.

## Estructura

```
finanzas/
├── CLAUDE.md
├── docs/PLAN.md        # plan por fases (fuente de verdad del avance)
├── api/                # NestJS
│   └── src/
│       ├── common/     # pipes, filtros, decoradores, utils de dinero
│       ├── auth/
│       ├── users/
│       └── <módulo>/   # module, controller, service, schema, dto/
└── web/                # React + Vite
    └── src/
        ├── api/        # cliente HTTP y hooks de TanStack Query
        ├── components/
        ├── features/   # una carpeta por dominio (movimientos, tarjetas…)
        ├── pages/
        └── lib/
```

## Reglas del dominio (obligatorias)

- **El dinero se guarda como entero en centavos** (`amountCents: number`). Nunca usar float para montos. Formatear solo al mostrar.
- Moneda por defecto: USD (configurable por usuario).
- **Todo documento pertenece a un usuario** (`userId`). Toda consulta filtra por el usuario autenticado; nunca devolver datos de otro usuario.
- Las operaciones que tocan varios documentos (ej. crear movimiento + actualizar saldo de cuenta) usan **transacciones de MongoDB** (sesiones de Mongoose).
- Las fechas se guardan en UTC.

## Modelo de datos (colecciones)

- `users`: email, passwordHash, nombre, moneda
- `accounts`: tipo (efectivo, ahorros, corriente), nombre, saldo en centavos
- `categories`: tipo (ingreso | gasto), nombre, icono, color, subcategorías embebidas. Se crean categorías por defecto al registrar un usuario.
- `transactions`: fecha, tipo (ingreso | gasto | transferencia), amountCents, accountId o creditCardId, categoryId, subcategoría, nota, origen (manual | suscripción | cuota)
- `creditCards`: nombre, cupo, día de corte, día de pago, tasa
- `installmentPurchases`: compra diferida con tarjeta (monto total, número de cuotas, cuotas pagadas, fecha de inicio)
- `subscriptions`: nombre, monto, frecuencia, próxima fecha, cuenta o tarjeta, categoría, activa
- `budgets`: categoría, mes, límite en centavos

## Convenciones de código

- Código (variables, clases, rutas API) en **inglés**; textos de la interfaz en **español**.
- Backend: un módulo de Nest por dominio. Lógica en services, controllers delgados. DTOs con `class-validator`. `ValidationPipe` global con `whitelist: true`.
- Frontend: componentes funcionales con hooks. Llamadas a la API solo a través de hooks en `web/src/api/`.
- ESLint + Prettier en ambos proyectos.
- Tests: Jest para services del backend con lógica (saldos, cuotas, reportes).
- Variables sensibles solo en `.env` (nunca commitear). Mantener `.env.example` actualizado.

## Forma de trabajo (con Superpowers)

- `docs/PLAN.md` es la **hoja de ruta general**: define el orden de las fases. No adelantar fases sin que se pida.
- Cada fase se trabaja con el flujo de Superpowers: **brainstorming** → diseño aprobado → **writing-plans** → ejecución con checkpoints → verificación.
- En el brainstorming, partir de lo que ya está decidido en este archivo (stack, modelo de datos, reglas del dominio). Preguntar solo lo que falte o no esté claro; no reabrir decisiones ya tomadas salvo que haya un problema real.
- Usar TDD en la lógica de negocio (saldos, cuotas, períodos de corte, reportes). En configuración y scaffolding no hace falta.
- Al terminar una fase: verificar que compila y que los tests pasan, marcar la fase en `docs/PLAN.md` y hacer commit.
- Si una decisión no está cubierta aquí, preguntar en lugar de asumir.
