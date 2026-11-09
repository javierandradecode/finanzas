# Seguridad — revisión de la Fase 11a

Revisión hecha el 2026-11-08 sobre la API (`api/`) y la web (`web/`). Es una revisión del código y de la configuración, no una auditoría externa ni una prueba de intrusión.

## Resumen

- **Aislamiento entre usuarios:** demostrado con una prueba de punta a punta sobre las 53 rutas de la API (49 con datos de usuario y 4 públicas o triviales; incluye la exportación CSV de la 11b). No se encontró ninguna fuga.
- **Se endureció:** cabeceras de seguridad (`helmet`), límite de intentos, registro cerrable, comprobaciones de arranque en producción y errores 4xx correctos para cuerpos inválidos o demasiado grandes.
- **Secretos:** ninguno en los 115 commits del historial (en el momento de la revisión).
- **Dependencias:** 0 vulnerabilidades en lo que se despliega (API y web). Quedan avisos moderados solo en herramientas de desarrollo.
- **Riesgos aceptados:** ver la sección correspondiente (el principal es el token guardado en `localStorage`).

## Controles revisados

| Control | Evidencia | Resultado |
|---|---|---|
| Cada usuario solo ve y modifica lo suyo (también en `GET /transactions/export`, que añade una celda de texto por fórmulas: ver `common/utils/csv.ts`) | `api/src/security/isolation.spec.ts`: dos usuarios con datos de todo tipo; el B recorre cada ruta con ids de A (404), listados y reportes (vacíos o sin datos de A), referencias cruzadas al crear o editar (400/404) y `process-due` (no cobra lo de A); al final los datos de A son idénticos. Falla si aparece una ruta nueva sin caso. | Sin fugas |
| La prueba de aislamiento detecta fallos reales | Se quitó a propósito el filtro por `userId` en `AccountsService.findOne` y en `ReportsService`: la prueba falló en las rutas esperadas. | Verificado |
| Entradas hostiles (operadores de MongoDB, arrays, ids mal formados) | `api/src/security/hostile-input.spec.ts` (41 casos) en query y body; nunca 5xx ni datos ajenos. Se verificó rompiendo `@IsMongoId` y `@IsEmail` a propósito. | Correcto |
| Asignación masiva (`userId`, `balanceCents`, `source`) | Mismo archivo: los campos no declarados se descartan. | Correcto, ver hallazgo 5 |
| Contraseñas | bcrypt con 10 rondas; el login compara contra un hash falso si el correo no existe (no delata qué correos existen por tiempo de respuesta). | Correcto |
| Autenticación | JWT en un guard global; solo `@Public()` lo salta; sin token → 401 (cubierto en el arnés). | Correcto |
| Límite de intentos | `api/src/security/rate-limit.spec.ts`: 429 tras `AUTH_RATE_LIMIT` intentos de login o registro por IP; límite general `RATE_LIMIT`. | Añadido |
| Cabeceras de seguridad | `helmet()`; verificado en `api/src/app.setup.spec.ts`. | Añadido |
| CORS | Un solo origen, tomado de `CORS_ORIGIN`; en producción debe ser `https://…` y no localhost ni `*`. | Correcto |
| Tamaño del cuerpo | Máximo 100 kb; devuelve 413 sin tumbar el proceso. | Añadido |
| Configuración de producción | `assertProductionSafe` (`api/src/config/env.validation.ts`): secreto JWT de al menos 32 caracteres y distinto del ejemplo, TLS sin desactivar, `CORS_ORIGIN` seguro. Los mensajes nombran la variable pero nunca su valor. | Añadido |
| Registro abierto | `ALLOW_REGISTRATION=false` cierra `POST /auth/register` (403); el login sigue funcionando. | Añadido |
| Secretos en git | `node scripts/scan-git-secrets.js` sobre todo el historial: URIs de MongoDB con contraseña, `JWT_SECRET`, claves privadas, tokens de GitHub/AWS/`sk-`. Solo se versionaron los `.env.example`. | Sin hallazgos |
| Dependencias | `npm audit --omit=dev` en `api/` y `web/`. | 0 vulnerabilidades |

## Hallazgos y correcciones

1. **Un cuerpo demasiado grande devolvía 500.** Los errores de lectura del cuerpo (por ejemplo, más de 100 kb) llegaban al filtro de excepciones como errores desconocidos y salían como "Internal server error" con un `ERROR` en el log. Ahora responden 413 (o el 4xx que corresponda). Cubierto en `app.setup.spec.ts`.
2. **`multer` (alto, DoS por `fileFilter`).** Llega por `@nestjs/platform-express`. La API no sube archivos, así que no era alcanzable, pero se forzó `multer@2.5.0` con un `overrides` en `api/package.json` (la corrección de raíz exige saltar a Nest 12). Retirar el `override` cuando Nest 11 publique la corrección.
3. **`shadcn` estaba en dependencias de producción.** Es una herramienta de línea de comandos (solo aporta un CSS en la compilación) y arrastraba 6 avisos. Pasó a `devDependencies`.
4. **Faltaban controles básicos** de la lista anterior: cabeceras, límite de intentos, registro cerrable y comprobaciones de producción.
5. **`ValidationPipe({ whitelist: true })` es la única barrera contra la asignación masiva.** Se comprobó que sin esa opción un cliente podría cambiar `userId` y `balanceCents` al editar una cuenta, o `userId` y `source` al crear un movimiento, porque los servicios copian lo que reciben del DTO. Hoy está activa y hay pruebas que fallan si se desactiva (`hostile-input.spec.ts`). Mejora futura posible: que los servicios copien solo campos explícitos (defensa en profundidad).

## Riesgos aceptados

- **Token en `localStorage`.** Un script malicioso que se ejecutara en la página (XSS) podría leerlo. Pasar a cookies `httpOnly` exigiría protección CSRF y cambios en la API; no compensa en una app personal. Mitigación: React escapa el contenido por defecto, no hay `dangerouslySetInnerHTML` y la web desplegada lleva una política de contenido (CSP) restrictiva definida en `render.yaml` (sin scripts en línea; `web/src/csp.test.ts` lo vigila). La CSP se probó en el navegador con la web compilada: sin violaciones al recorrer las páginas.
- **JWT de 7 días sin revocación ni refresh.** Si el token se filtra, sirve hasta que caduque (la única forma de invalidar todos es cambiar `JWT_SECRET`). `JwtStrategy.validate` tampoco comprueba que el usuario siga existiendo; hoy no hay borrado de usuarios.
- **Sin 2FA ni recuperación de contraseña.**
- **Límite de intentos por IP, en memoria.** Con varias instancias cada una cuenta aparte; con una sola instancia (el caso previsto) es suficiente.
- **Acceso de red de Atlas abierto a cualquier IP** cuando se despliegue en un servicio gratuito sin IP fija. La protección es la contraseña de la base de datos (larga, aleatoria) y TLS.
- **Avisos moderados en herramientas de desarrollo** (28 en `api/`, 6 en `web/`: Nest CLI, Jest, shadcn y similares). No se despliegan ni procesan datos de usuarios. Ninguno es alto ni crítico.

## Observaciones sobre el entorno de desarrollo (no es código del proyecto)

- En la máquina donde se desarrolla, `NODE_TLS_REJECT_UNAUTHORIZED=0` está activo para todos los procesos de Node, no solo para este proyecto (npm lo avisa en cada ejecución). Desactiva la verificación de certificados de cualquier conexión HTTPS que haga Node. Se recomienda quitarlo y, si hace falta por un proxy con certificado propio, usar `NODE_EXTRA_CA_CERTS` con el certificado de la empresa. El arranque en producción de esta API ya rechaza esa variable.
- npm está configurado con el registro por `http://`, que el servidor ya no acepta (`npm audit` falla con 426). Se recomienda `npm config set registry https://registry.npmjs.org/`. Las auditorías de esta revisión se hicieron indicando `--registry=https://registry.npmjs.org/` en cada comando.

## Cómo repetirlo

```bash
cd api && npm test                                   # incluye aislamiento, entradas hostiles, límite de intentos, configuración
node scripts/scan-git-secrets.js                     # secretos en todo el historial (muestra dónde, nunca el valor)
node scripts/check-render-yaml.js                    # render.yaml sin secretos y con lo necesario
cd api && npm audit --omit=dev --registry=https://registry.npmjs.org/
cd web && npm audit --omit=dev --registry=https://registry.npmjs.org/
```

## Si se sospecha una filtración

1. Cambia la contraseña del usuario de base de datos en Atlas y actualiza `MONGODB_URI` en el alojamiento.
2. Cambia `JWT_SECRET` (cierra todas las sesiones abiertas) y vuelve a desplegar.
3. Si el secreto estuvo en git, rotarlo es suficiente; reescribir el historial es opcional y destructivo.
