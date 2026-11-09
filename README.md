# Finanzas Personales

Aplicación web para llevar tus finanzas personales: cuentas, categorías, movimientos (ingresos, gastos y transferencias), tarjetas de crédito con compras a cuotas, suscripciones que se cobran solas, presupuestos mensuales, un resumen con gráficos y exportación de movimientos a CSV. Cada usuario ve únicamente sus propios datos.

- **API:** NestJS 11 + TypeScript + Mongoose (carpeta `api/`)
- **Web:** React + Vite + TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, Recharts (carpeta `web/`)
- **Base de datos:** MongoDB (Atlas, plan gratuito M0)
- **Autenticación:** JWT; contraseñas con bcrypt

Reglas del dominio: el dinero se guarda como enteros en centavos, las fechas en UTC y todo documento pertenece a un usuario. Más detalle en [`CLAUDE.md`](CLAUDE.md), el plan por fases en [`docs/PLAN.md`](docs/PLAN.md) y la revisión de seguridad en [`docs/SECURITY.md`](docs/SECURITY.md).

## Estructura

```
finanzas/
├── api/          # NestJS (un módulo por dominio)
├── web/          # React + Vite
├── docs/         # PLAN.md, SECURITY.md, diseños y planes de cada fase
├── scripts/      # scan-git-secrets.js, check-render-yaml.js
└── render.yaml   # despliegue en Render (API + web)
```

## Requisitos

- Node.js 22 y npm
- Una base MongoDB. Lo más simple es un clúster gratuito en [MongoDB Atlas](https://www.mongodb.com/atlas) (o MongoDB Community en tu máquina)

## Puesta en marcha en local

1. **API**

   ```bash
   cd api
   npm install
   cp .env.example .env      # y edita los valores (ver "Variables")
   npm run start:dev         # http://localhost:3000/api
   ```

   Comprobación: `GET http://localhost:3000/api/health` responde `{"status":"ok","db":"up",...}`.

2. **Web** (en otra terminal)

   ```bash
   cd web
   npm install
   cp .env.example .env      # VITE_API_URL=http://localhost:3000/api
   npm run dev               # http://localhost:5173
   ```

3. Abre `http://localhost:5173`, crea tu cuenta y empieza. Al registrarte se crean las categorías por defecto.

## Tests y calidad

```bash
cd api && npm test && npm run build && npm run lint
cd web && npm test && npm run build && npm run lint
node scripts/scan-git-secrets.js      # busca secretos en todo el historial de git
node scripts/check-render-yaml.js     # valida render.yaml
```

Los tests de la API usan una MongoDB en memoria: no necesitan Atlas ni `.env`.

## Variables de entorno

**API** (`api/.env`; en producción se configuran en el panel del hosting):

| Variable | Obligatoria | Descripción |
|---|---|---|
| `MONGODB_URI` | sí | Cadena de conexión de Atlas, con la base `finanzas` |
| `JWT_SECRET` | sí | Secreto para firmar los tokens. En producción: mínimo 32 caracteres y distinto del ejemplo |
| `JWT_EXPIRES_IN` | no (`7d`) | Duración de la sesión |
| `PORT` | no (`3000`) | Puerto (Render lo fija solo) |
| `CORS_ORIGIN` | sí | URL de la web. En producción debe ser `https://…` y no apuntar a localhost |
| `NODE_ENV` | no | Con `production` la API se niega a arrancar con una configuración insegura |
| `ALLOW_REGISTRATION` | no (`true`) | `false` (palabra exacta) cierra el registro de usuarios nuevos |
| `RATE_LIMIT` / `AUTH_RATE_LIMIT` | no (`100` / `10`) | Peticiones por minuto y por IP: toda la API / login y registro |

**Web** (`web/.env`; se lee al compilar):

| Variable | Descripción |
|---|---|
| `VITE_API_URL` | URL de la API incluyendo `/api` |

Nunca subas un `.env` a git (ya está en `.gitignore`).

## Despliegue gratuito (Render + Atlas)

`render.yaml` define los dos servicios: la API (Web Service de Node) y la web (Static Site con las rutas de React Router y las cabeceras de seguridad, incluida una política de contenido). Las URLs de cada servicio dependen de la otra, así que se hace en este orden:

1. **Atlas.** En tu clúster:
   - *Database Access*: crea un usuario con una contraseña larga y aleatoria y permisos de lectura y escritura solo sobre la base `finanzas`.
   - *Network Access*: permite `0.0.0.0/0` (el plan gratuito de Render no tiene IP fija; la protección es la contraseña y TLS).
   - Copia la cadena de conexión `mongodb+srv://…`.
2. **Render.** *New → Blueprint*, elige este repositorio. Render lee `render.yaml` y te pide los valores marcados como manuales:
   - API: `MONGODB_URI` (la cadena de Atlas). Deja `CORS_ORIGIN` vacío por ahora si aún no conoces la URL de la web.
   - Web: `VITE_API_URL` (vacío por ahora si aún no conoces la URL de la API).
   - `JWT_SECRET` lo genera Render solo.
3. **URLs reales.** Cuando terminen los dos primeros despliegues, anota las URLs `https://….onrender.com`. Edita `CORS_ORIGIN` (URL de la web, sin barra final) en la API y `VITE_API_URL` (URL de la API + `/api`) en la web, y despliega de nuevo ambos servicios.
   - Comprobación: `https://<tu-api>.onrender.com/api/health` responde `{"status":"ok","db":"up",...}`.
4. **Tu cuenta.** Abre la web, regístrate e inicia sesión. Después cambia `ALLOW_REGISTRATION` a `false` en la API y guarda: nadie más podrá crear cuentas (tu login sigue funcionando).
5. **Después de cada cambio de variables** Render redespliega la API sola; la web hay que redesplegarla si cambias `VITE_API_URL` (se incorpora al compilar).

Notas del plan gratuito:

- **El servicio duerme** tras unos 15 minutos sin tráfico: la primera petición tarda hasta un minuto. Si quieres evitarlo, un servicio de pings gratuito (por ejemplo cron-job.org) puede llamar a `/api/health` cada 10 minutos.
- **Suscripciones.** El cobro automático corre a las 00:05 UTC dentro de la API; si el servicio está dormido a esa hora no se ejecuta. Por eso la web, al abrirse, cobra lo vencido (verás un aviso como "Se registró 1 cobro de suscripción"). Los cobros no se pierden: se registran con la fecha que correspondía.
- **Copia de seguridad.** Exporta tus movimientos con el botón "Exportar CSV" de la página Movimientos, y activa las copias de Atlas si tu plan las ofrece.
- **Si sospechas que se filtró un secreto**, sigue los pasos de [`docs/SECURITY.md`](docs/SECURITY.md#si-se-sospecha-una-filtración).

## Seguridad en pocas líneas

Todos los datos se filtran por el usuario autenticado (probado de punta a punta sobre cada ruta), hay límite de intentos, cabeceras de seguridad, registro cerrable y comprobaciones de arranque en producción. Los riesgos aceptados (token en `localStorage`, sesiones de 7 días sin revocación, sin 2FA) están explicados en [`docs/SECURITY.md`](docs/SECURITY.md).
