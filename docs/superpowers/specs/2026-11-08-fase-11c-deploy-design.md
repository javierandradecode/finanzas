# Fase 11c — Despliegue y README (diseño)

Aprobado por el dueño del proyecto el 2026-11-08.

## Intención

Publicar la app gratis, con los datos en MongoDB Atlas, y dejar un README que permita a cualquiera instalarla en local o desplegarla. El dueño hace los pasos que requieren cuentas y secretos; el código y la configuración quedan preparados y verificados.

## Objetivos / no objetivos

- Objetivo: `render.yaml` (blueprint) que crea API y web; configuración de producción segura (reglas de la 11a); README en la raíz; la web recupera los cobros de suscripciones aunque el host haya dormido.
- No objetivo: dominio propio, CI/CD, Docker, monitorización, multi-instancia.
- Anti-objetivo: secretos en git; una configuración que arranque en producción con valores débiles; cobros de suscripciones que se pierdan por el sueño del host.

## Hallazgo que condiciona el diseño

Los hosts gratuitos duermen el servicio tras ~15 min sin tráfico. El cron de suscripciones (00:05 UTC) vive dentro del proceso de la API, así que probablemente no se ejecutará. `POST /subscriptions/process-due` ya existe, solo cobra lo vencido para el usuario autenticado y puede llamarse varias veces.

## Enfoques considerados

1. **Render con `render.yaml` (elegido):** un Web Service Node para la API y un Static Site para la web, creados de una vez desde el repositorio.
2. Vercel/Netlify para la web + otro host para la API: dos plataformas que configurar.
3. Fly/Railway: ya no son gratuitos de forma fiable.

## Diseño

**`render.yaml` (raíz)**
- API: `runtime: node`, `rootDir: api`, `buildCommand: npm ci --include=dev && npm run build` (`nest build` necesita devDependencies), `startCommand: node dist/main`, `healthCheckPath: /api/health`, plan free.
- Variables de la API: `NODE_ENV=production`; `JWT_SECRET` con `generateValue: true`; `MONGODB_URI`, `CORS_ORIGIN` con `sync: false` (las introduce el dueño); `ALLOW_REGISTRATION` con valor `true` inicialmente (se cambia a `false` tras crear la cuenta); límites por defecto.
- Web: `runtime: static`, `rootDir: web`, `buildCommand: npm ci && npm run build`, `staticPublishPath: dist`, `VITE_API_URL` con `sync: false`.
- Rewrite `/* → /index.html` para las rutas de React Router y cabeceras de seguridad en la web: `Content-Security-Policy` (default-src 'self'; connect-src 'self' y la API; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'), `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`. Un script de prueba comprueba que el `render.yaml` es YAML válido y que no contiene secretos.
- La política exacta se afina al verificar la web compilada (fuentes, estilos en línea de Tailwind/Recharts).

**Cobros pendientes al abrir la app**
- Al montar el área autenticada (`AppLayout`), una vez por carga de página, la web llama a `useProcessDue`. Si cobró algo (`charged > 0`) muestra un aviso ("Se registraron N cobros de suscripciones") y las listas se refrescan (ya lo hace la mutación). Un error se ignora en silencio (no debe molestar al abrir la app) pero se deja en consola. No se repite al navegar entre páginas.
- Opcional y manual (README): un ping gratuito externo a `/api/health` cada 10 minutos mantiene la API despierta.

**Orden de despliegue (dependencia circular de URLs)**
1. Atlas: usuario de base de datos con permisos solo sobre `finanzas`, acceso de red `0.0.0.0/0` (riesgo aceptado en `SECURITY.md`).
2. Render: crear el blueprint desde el repositorio; escribir `MONGODB_URI`.
3. Copiar las URLs `https://….onrender.com` reales: `CORS_ORIGIN` = URL de la web, `VITE_API_URL` = URL de la API + `/api`; redesplegar.
4. Crear la cuenta propia desde la web y poner `ALLOW_REGISTRATION=false`.

**README (raíz, en español)**
- Qué es y stack; estructura del repositorio.
- Requisitos y puesta en marcha local (variables, `npm install`, `npm run start:dev`, `npm run dev`).
- Tests y comprobaciones de calidad.
- Despliegue paso a paso (el orden anterior, con la comprobación esperada en cada paso) y tabla de variables.
- Notas: el servicio gratuito duerme (primera petición lenta), cobro de suscripciones al abrir la app, copia de seguridad (exportar CSV), enlaces a `docs/SECURITY.md` y `docs/PLAN.md`.
- Se marca el README y el despliegue en `docs/PLAN.md` (el despliegue como "preparado", pendiente del paso manual del dueño: se anota en el informe, no se marca como hecho el despliegue real).

## Verificación

- Compilación de producción de API y web; tests completos.
- Arranque de la API compilada con `NODE_ENV=production` y una configuración válida (responde `/api/health`), y rechazo con configuración débil (JWT corto, CORS http) — apoyado en las reglas de la 11a.
- Web compilada servida con `vite preview` apuntando a la API local: las rutas profundas recargan (rewrite lo prueba Render; en local se comprueba el build), y la consola del navegador no muestra violaciones de CSP.
- Lo que no se puede verificar sin las cuentas del dueño (Render, Atlas externo) queda en la lista de pasos del README.

## Decisiones mías (a revisar)

- Render como host; plan free; aviso de cobros al abrir la app; CSP incluida en el blueprint; script de comprobación del `render.yaml`.
