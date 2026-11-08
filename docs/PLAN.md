# Plan del proyecto: Finanzas Personales

Marca cada fase con [x] al terminarla. Cada fase termina con un commit.

## Fase 0 — Preparación (manual)
- [ ] Instalar Node.js LTS, Git y Claude Code
- [ ] Crear cuenta y cluster M0 en MongoDB Atlas; usuario de base de datos y acceso de red
- [ ] Instalar MongoDB Compass y probar la conexión
- [ ] Crear la carpeta `finanzas/`, copiar `CLAUDE.md` y `docs/PLAN.md`, `git init`
- [ ] Crear repositorio en GitHub (privado)

## Fase 1 — Base del backend
- [x] Crear proyecto NestJS en `api/` con TypeScript strict, ESLint y Prettier
- [x] `@nestjs/config` con `.env` y `.env.example` (MONGODB_URI, JWT_SECRET, PORT)
- [x] Conexión a MongoDB con `@nestjs/mongoose`
- [x] `ValidationPipe` global, filtro de excepciones, prefijo `/api`, CORS para el frontend
- [x] Endpoint `GET /api/health`
- [x] Utilidad de dinero (centavos ↔ formato)

## Fase 2 — Usuarios y autenticación
- [x] Módulo `users` (schema, service)
- [x] Módulo `auth`: registro, login, JWT, guard global y decorador `@CurrentUser()`
- [x] Al registrarse se crean categorías por defecto
- [x] Probar con Postman/Insomnia o un archivo `.http`

## Fase 3 — Cuentas y categorías
- [ ] CRUD de `accounts`
- [ ] CRUD de `categories` con subcategorías embebidas
- [ ] Todo filtrado por usuario

## Fase 4 — Movimientos
- [ ] CRUD de `transactions` (ingreso, gasto, transferencia entre cuentas)
- [ ] Actualización de saldos con transacciones de MongoDB
- [ ] Listado con filtros (rango de fechas, categoría, cuenta, tipo) y paginación
- [ ] Índices: `{ userId, date }`, `{ userId, categoryId }`
- [ ] Tests de la lógica de saldos

## Fase 5 — Tarjetas de crédito y compras diferidas
- [ ] CRUD de `creditCards` (cupo, día de corte, día de pago)
- [ ] Gastos con tarjeta y cálculo de deuda y cupo disponible
- [ ] `installmentPurchases`: compras a cuotas y proyección de pagos por mes
- [ ] Endpoint de estado de cuenta por período de corte
- [ ] Tests del cálculo de cuotas y períodos

## Fase 6 — Suscripciones
- [ ] CRUD de `subscriptions` (frecuencia mensual, anual, etc.)
- [ ] Tarea diaria con `@nestjs/schedule` que genera el movimiento cuando vence
- [ ] Endpoint de próximos vencimientos

## Fase 7 — Presupuestos y reportes
- [ ] CRUD de `budgets` por categoría y mes
- [ ] Reportes con aggregation pipeline:
  - gasto por categoría en un rango
  - ingresos vs gastos por mes
  - presupuesto vs gastado
  - deuda total en tarjetas y pagos proyectados
- [ ] Endpoint de resumen para el dashboard

## Fase 8 — Base del frontend
- [ ] Crear proyecto React + Vite + TypeScript en `web/`
- [ ] Tailwind + shadcn/ui, React Router, TanStack Query
- [ ] Cliente HTTP con el token JWT
- [ ] Páginas de login y registro, rutas protegidas, layout con menú

## Fase 9 — Pantallas principales
- [ ] Movimientos: listado con filtros y formulario (React Hook Form + Zod)
- [ ] Cuentas y categorías
- [ ] Tarjetas y compras diferidas
- [ ] Suscripciones
- [ ] Presupuestos

## Fase 10 — Dashboard
- [ ] Tarjetas de resumen (saldo total, gastos del mes, deuda en tarjetas)
- [ ] Gráficos con Recharts: gasto por categoría, evolución mensual, presupuesto vs real
- [ ] Próximos pagos (tarjetas y suscripciones)

## Fase 11 — Cierre
- [ ] Revisión de seguridad (filtrado por usuario, validaciones, secretos)
- [ ] Exportar movimientos a CSV
- [ ] Despliegue: API y web en un servicio gratuito + Atlas
- [ ] README con instrucciones de instalación

## Ideas para después
- Migrar el frontend a Next.js (práctica para el mercado laboral)
- Importar movimientos desde CSV del banco
- Multi-moneda
- App móvil con React Native
