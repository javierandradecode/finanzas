# Fase 11a — Seguridad: diseño

Primera de tres partes de la Fase 11 (11a seguridad, 11b exportar a CSV, 11c despliegue y README).

## Intención
Comprobar con evidencia que cada usuario solo puede ver y tocar sus propios datos, cerrar los huecos de endurecimiento evidentes antes de exponer la API a internet y dejar documentado lo que se revisó y los riesgos aceptados.

## Objetivos
- Prueba automática de aislamiento entre usuarios sobre todos los endpoints con datos.
- `helmet`, límite de intentos (login y registro más estricto), registro cerrable y validación de configuración de producción.
- Revisión del historial de git en busca de secretos y `npm audit` de API y web.
- `docs/SECURITY.md` con lo revisado, lo corregido y los riesgos aceptados.

## No objetivos
Refresh tokens, 2FA, recuperación de contraseña, revocación de JWT, CSP del frontend (va en la configuración de despliegue, 11c), cambiar el token de `localStorage` a cookies `httpOnly`.

## Estado de partida (revisado)
- Bien: bcrypt (10 rondas) con comparación contra hash falso cuando el correo no existe; JWT en guard global con `@Public()`; `ValidationPipe({ whitelist, transform })`; `validateEnv` al arrancar; filtro de excepciones sin trazas; `.env` fuera de git (solo `.env.example`).
- Falta: cabeceras de seguridad, límite de intentos, prueba de aislamiento de punta a punta (≈50 rutas, ≈60 accesos a MongoDB), reglas de configuración para producción, registro cerrable, revisión de secretos en el historial y de dependencias.
- `JwtStrategy.validate` no consulta si el usuario existe; no hay borrado de usuarios, así que el riesgo es nulo hoy (se documenta).

## Decisiones (mías, salvo las aprobadas por el usuario)
- **Aprobado por el usuario:** el diseño completo del chat (prueba de aislamiento, endurecimiento, revisión de secretos y dependencias, informe).
- **Token en `localStorage`:** riesgo aceptado y documentado (cookies `httpOnly` exigirían CSRF y cambios de API que no compensan en una app personal).
- **JWT de 7 días:** se mantiene (sin refresh tokens acortarlo obligaría a iniciar sesión a diario).
- **Límites:** 10 peticiones/minuto por IP en login y registro, 100/minuto en el resto; configurables con `AUTH_RATE_LIMIT` y `RATE_LIMIT`. Detrás de un proxy se activa `trust proxy` para usar la IP real.
- **Registro:** `ALLOW_REGISTRATION` (por defecto `true`); en `false`, `POST /auth/register` devuelve 403 y el login sigue funcionando.
- **Producción** (`NODE_ENV=production`): el arranque falla si `JWT_SECRET` < 32 caracteres o empieza por `change-me`; si `NODE_TLS_REJECT_UNAUTHORIZED=0`; si `CORS_ORIGIN` no es `https://…`, es `*` o apunta a localhost. En desarrollo no cambia nada.
- **Hallazgo de secretos:** si el escaneo del historial encuentra uno real, se informa al usuario sin repetir el valor y se recomienda rotarlo; reescribir el historial de git es decisión suya.

## Diseño
```
api/
├── src/
│   ├── app.setup.ts              setupApp(app): prefijo, pipes, filtro, CORS, helmet, trust proxy, límite de body
│   ├── app.modules.ts            FEATURE_MODULES (compartido por AppModule y por las pruebas)
│   ├── security/
│   │   ├── security.module.ts    ThrottlerModule (límites por env) + guard global
│   │   └── isolation.spec.ts     prueba de aislamiento entre usuarios
│   └── config/env.validation.ts  (ampliar) ALLOW_REGISTRATION, RATE_LIMIT, AUTH_RATE_LIMIT, reglas de producción
├── test/app-harness.ts           arranca la app completa con Mongo en memoria y opciones aptas para Jest
└── .env.example                  (ampliar)
docs/SECURITY.md
```
- **`setupApp`:** lo usan `main.ts` y las pruebas, para que se pruebe la misma configuración que corre en producción.
- **Prueba de aislamiento:** crea A y B; A crea cuenta, categorías (con subcategoría), tarjeta, movimientos (gasto, ingreso, transferencia y pago de tarjeta), compra a cuotas, suscripción y presupuesto. Con el token de B, todas las rutas por id (GET, PATCH, DELETE, y las de acciones como pagar cuota, estado de cuenta y subcategorías) responden 404; los listados y reportes (resumen, gasto por categoría, ingresos y gastos, presupuesto contra real, deuda de tarjetas, próximos cobros, proyección) salen vacíos o en cero; crear con referencias de A (cuenta, tarjeta, categoría, subcategoría) da 404 o 400; `process-due` de B no cobra nada de A; y después se comprueba que los datos de A siguen intactos.
- **Entradas hostiles:** `?type[$ne]=expense`, `?accountId[$ne]=x`, `?month[$gt]=`, `?includeArchived[]=` y cuerpos con operadores (`{"email":{"$ne":null}}`) responden 400 o se ignoran, sin devolver nunca datos ajenos ni lanzar 500.
- **Producción:** `assertProductionSafe(env)` se invoca desde `validateEnv`.
- **Informe:** tabla "control → evidencia (prueba o comando) → resultado".

## Pruebas
Jest. TDD para las reglas de configuración (casos válidos e inválidos, en producción y en desarrollo) y la conversión de `ALLOW_REGISTRATION`; pruebas de integración con Mongo en memoria para registro cerrado, límite de intentos (429 al exceder), cabeceras de `helmet` y límite de tamaño de body; y la prueba de aislamiento. Se verifica cada prueba rompiendo a propósito el código (por ejemplo, quitando el filtro por `userId` de una consulta) y comprobando que falla.

## A criterio del implementador
Estructura interna de la tabla de casos de aislamiento, nombres de las variables de límite, formato del informe.
