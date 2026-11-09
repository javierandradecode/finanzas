// Comprueba que render.yaml tiene lo que la API y la web necesitan en producción.
// Uso: node scripts/check-render-yaml.js   (sin dependencias: el YAML es simple y se lee por líneas)
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'render.yaml');
if (!fs.existsSync(file)) {
  console.error('FAIL render.yaml no existe');
  process.exit(1);
}
const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

/** Splits text into blocks that start at lines matching `start`. */
const blocks = (src, start) => {
  const out = [];
  for (const line of src.split('\n')) {
    if (start.test(line)) out.push([line]);
    else if (out.length) out[out.length - 1].push(line);
  }
  return out.map((b) => b.join('\n'));
};
const scalar = (block, key) => {
  const m = new RegExp(`^\\s+(?:- )?${key}:\\s*(.+?)\\s*$`, 'm').exec(block);
  return m ? m[1].replace(/^["']|["']$/g, '') : undefined;
};

const problems = [];
const need = (cond, msg) => {
  if (!cond) problems.push(msg);
};

const services = blocks(text, /^ {2}- type:/);
const api = services.find((s) => /rootDir:\s*api\b/.test(s));
const web = services.find((s) => /rootDir:\s*web\b/.test(s));
need(api, 'falta el servicio de la API (rootDir: api)');
need(web, 'falta el servicio de la web (rootDir: web)');

const envs = (service) =>
  Object.fromEntries(
    blocks(service, /^ {6}- key:/).map((b) => {
      // an env var ends where the next, less indented key (routes, headers...) starts
      const lines = b.split('\n');
      const end = lines.findIndex(
        (l, i) => i > 0 && /^ {0,7}[^\s#]/.test(l), // field lines of a var have 8 spaces
      );
      return [scalar(b, 'key'), lines.slice(0, end === -1 ? undefined : end).join('\n')];
    }),
  );

if (api) {
  need(/^ {2}- type: web\b/.test(api), 'la API debe ser type: web');
  need(scalar(api, 'runtime') === 'node', 'la API debe usar runtime: node');
  need(
    (scalar(api, 'buildCommand') || '').includes('--include=dev'),
    'buildCommand de la API debe instalar devDependencies (--include=dev): nest build las necesita',
  );
  need(scalar(api, 'startCommand') === 'node dist/main', 'startCommand de la API debe ser node dist/main');
  need(scalar(api, 'healthCheckPath') === '/api/health', 'healthCheckPath debe ser /api/health');
  const e = envs(api);
  need(e.NODE_ENV && scalar(e.NODE_ENV, 'value') === 'production', 'NODE_ENV debe valer production');
  need(e.JWT_SECRET && /generateValue:\s*true/.test(e.JWT_SECRET), 'JWT_SECRET debe usar generateValue: true');
  for (const k of ['MONGODB_URI', 'CORS_ORIGIN']) {
    need(e[k] && /sync:\s*false/.test(e[k]) && !/value:/.test(e[k]), `${k} debe ser sync: false y sin value`);
  }
  need(e.ALLOW_REGISTRATION, 'falta ALLOW_REGISTRATION');
}

if (web) {
  need(scalar(web, 'runtime') === 'static', 'la web debe usar runtime: static');
  need(scalar(web, 'staticPublishPath') === 'dist', 'staticPublishPath debe ser dist');
  const e = envs(web);
  need(
    e.VITE_API_URL && /sync:\s*false/.test(e.VITE_API_URL) && !/value:/.test(e.VITE_API_URL),
    'VITE_API_URL debe ser sync: false y sin value',
  );
  need(
    /source:\s*\/\*\s*\n\s*destination:\s*\/index\.html/.test(web),
    'falta el rewrite /* → /index.html',
  );
  for (const h of ['Content-Security-Policy', 'X-Content-Type-Options', 'Referrer-Policy']) {
    need(new RegExp(`name:\\s*${h}\\b`).test(web), `falta la cabecera ${h}`);
  }
}

// Ningún valor con forma de secreto en el archivo.
for (const [name, re] of [
  ['URI de MongoDB con contraseña', /mongodb(\+srv)?:\/\/[^\s:@\/<>"']+:(?!<)[^\s@\/<>"']+@/],
  ['clave privada', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['token', /gh[pousr]_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}|\bsk-[A-Za-z0-9]{20,}/],
]) {
  need(!re.test(text), `render.yaml parece contener un secreto (${name})`);
}

if (problems.length) {
  console.error(problems.map((p) => `FAIL ${p}`).join('\n'));
  process.exit(1);
}
console.log('render.yaml OK');
