// Busca en TODO el historial de git cadenas con forma de secreto y muestra dónde están (commit y archivo), nunca el valor.
// Uso: node scripts/scan-git-secrets.js
const { execSync } = require('child_process');
const out = execSync('git log --all -p --format=COMMIT:%H -- . ":(exclude)package-lock.json" ":(exclude)api/package-lock.json" ":(exclude)web/package-lock.json"', { maxBuffer: 1 << 29 }).toString('utf8');
const rules = [
  ['mongodb uri with a password', /mongodb(\+srv)?:\/\/[^\s:@\/<>"']+:(?!<)[^\s@\/<>"']+@/],
  ['JWT_SECRET with a real-looking value', /JWT_SECRET\s*=\s*(?!change-me|<|$|"?\$)[^\s#]{8,}/],
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['github token', /gh[pousr]_[A-Za-z0-9]{30,}/],
  ['aws access key', /AKIA[0-9A-Z]{16}/],
  ['generic api key (sk-...)', /\bsk-[A-Za-z0-9]{20,}/],
];
const found = [];
let commit = '', file = '';
for (const line of out.split('\n')) {
  if (line.startsWith('COMMIT:')) { commit = line.slice(7, 14); continue; }
  if (line.startsWith('diff --git')) { file = line.split(' b/')[1] || ''; continue; }
  if (!line.startsWith('+') || line.startsWith('+++')) continue;
  for (const [name, re] of rules) if (re.test(line)) found.push(`${commit} ${file} :: ${name}`);
}
const unique = [...new Set(found)];
console.log(unique.length ? unique.join('\n') : 'NO MATCHES');
console.log('commits scanned:', out.split('\n').filter((l) => l.startsWith('COMMIT:')).length);
