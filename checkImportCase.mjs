// Run from the FRONTEND root before deploying:   node checkImportCase.mjs
// Windows doesn't care about upper/lower case in file names, Linux (Vercel, Render, ...) does.
// Lists every relative import whose spelling doesn't match the real file name exactly.
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve('src');
const EXTENSIONS = ['', '.js', '.jsx', '.ts', '.tsx', '.json', '.css'];
const IMPORT_RE = /(?:import|export)\s[^'"`]*?from\s*['"](\.{1,2}\/[^'"]+)['"]|import\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)|import\s*['"](\.{1,2}\/[^'"]+)['"]/g;

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });

// resolves one path segment at a time against the real directory listing, case-sensitively
const resolveExact = (base, rel) => {
  const parts = path.normalize(rel).split(path.sep).filter(Boolean);
  let current = base;
  for (let i = 0; i < parts.length; i += 1) {
    if (parts[i] === '..') {
      current = path.dirname(current);
      continue;
    }
    if (parts[i] === '.') continue;
    const names = fs.existsSync(current) && fs.statSync(current).isDirectory() ? fs.readdirSync(current) : [];
    const last = i === parts.length - 1;
    const candidates = last ? EXTENSIONS.map((ext) => parts[i] + ext) : [parts[i]];
    const exact = candidates.find((c) => names.includes(c));
    if (exact) {
      current = path.join(current, exact);
      continue;
    }
    const wrongCase = names.find((n) => candidates.some((c) => c.toLowerCase() === n.toLowerCase()));
    if (wrongCase) return { ok: false, actual: path.join(current, wrongCase) };
    return { ok: false, missing: true };
  }
  if (fs.existsSync(current) && fs.statSync(current).isDirectory()) {
    const index = EXTENSIONS.slice(1).map((e) => `index${e}`).find((n) => fs.readdirSync(current).includes(n));
    if (index) return { ok: true };
    return { ok: false, missing: true };
  }
  return { ok: true };
};

let problems = 0;
for (const file of walk(SRC).filter((f) => /\.(jsx?|tsx?)$/.test(f))) {
  const code = fs.readFileSync(file, 'utf8');
  for (const match of code.matchAll(IMPORT_RE)) {
    const spec = match[1] || match[2] || match[3];
    const result = resolveExact(path.dirname(file), spec);
    if (result.ok) continue;
    problems += 1;
    const where = path.relative(process.cwd(), file);
    if (result.actual) {
      console.log(`CASE   ${where}\n       imports "${spec}"\n       real file is ${path.relative(process.cwd(), result.actual)}\n`);
    } else {
      console.log(`MISSING ${where}\n        imports "${spec}" — no such file\n`);
    }
  }
}

console.log(problems === 0 ? 'OK — every relative import matches a file exactly' : `${problems} problem(s) — fix them before deploying`);
process.exit(problems === 0 ? 0 : 1);