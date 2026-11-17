// Build a TEST-ONLY single-file copy of the game (dev harness, not the entry).
// The shipped entry stays modular ES modules under game/src/. This bundler
// concatenates those same files (imports/exports stripped, same order) into
// one inline <script> inside a copy of index.html, so the game can be driven
// in this VM's browser via file:// — the browser's Local Network Access check
// blocks http://127.0.0.1 navigations from CDP, and file:// has no network fetch
// at all. The code is byte-identical apart from import/export lines.
// Usage: node tests/bundle.mjs   -> writes tests/bundle.html
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORDER = [
  'config.js', 'random.js', 'input.js', 'audio.js', 'particles.js',
  'weapons.js', 'upgrades.js', 'enemies.js', 'player.js', 'world.js',
  'ui.js', 'render.js', 'shots.js', 'main.js',
];

function strip(src, name) {
  let out = src;
  // Remove import statements (may span lines): import ... from '...';
  out = out.replace(/^\s*import\s[\s\S]*?from\s+['"][^'"]+['"]\s*;\s*$/gm, '');
  // Remove bare re-export lists: export { A, B };
  out = out.replace(/^\s*export\s*\{[\s\S]*?\}\s*;\s*$/gm, '');
  // Un-export declarations.
  out = out.replace(/^(\s*)export\s+(function|const|let|var|class)\s/gm, '$1$2 ');
  if (/^\s*(import|export)\b/m.test(out)) {
    throw new Error(`${name}: import/export survived stripping`);
  }
  return out.trim();
}

const parts = ORDER.map((f) => {
  const src = fs.readFileSync(path.join(ROOT, 'game', 'src', f), 'utf8');
  return `\n// ---- ${f} ----\n` + strip(src, f);
});
const bundle = parts.join('\n');
if (bundle.includes('</script')) throw new Error('bundle contains a closing script tag');
const html = fs.readFileSync(path.join(ROOT, 'game', 'index.html'), 'utf8');
const tag = '<script type="module" src="./src/main.js"></script>';
if (!html.includes(tag)) throw new Error('index.html script tag not found');
const out = html.replace(tag, `<script type="module">\n${bundle}\n</script>`);
const outPath = path.join(ROOT, 'tests', 'bundle.html');
fs.writeFileSync(outPath, out);
console.log(`wrote ${outPath} (${out.length} bytes)`);
