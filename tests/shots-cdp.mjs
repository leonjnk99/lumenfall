// Take the 4 staged screenshots via raw CDP.
// Usage: node tests/shots-cdp.mjs
// The CDP browser must already run on CDP_PORT (default 9226); see tests/chrome.sh.
// The shots run against tests/bundle.html (a single-file test copy of the game,
// built by tests/bundle.mjs) loaded via file:// — this VM's browser blocks
// http://127.0.0.1 navigations from CDP (Local Network Access checks), and
// file:// needs no network fetch at all. Each shot opens a FRESH tab.
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { connectCDP } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = `file://${path.join(ROOT, 'tests', 'bundle.html')}`;

execSync('node tests/bundle.mjs', { cwd: ROOT, stdio: 'inherit' });

const failures = [];
const cdp = await connectCDP();
try {
  const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'shots.json'), 'utf8'));
  for (const shot of spec) {
    const tab = await cdp.openTab(`${BUNDLE}${shot.query}`);
    try {
      await tab.waitFor('window.__shotReady === true', 60000);
      const out = path.join(ROOT, 'screenshots', shot.name);
      const size = await tab.screenshot(out, 88);
      const errs = tab.consoleErrors();
      const ext = tab.externalRequests('file://');
      console.log(`${shot.name}: ${size} bytes, consoleErrors=${errs.length}, external=${ext.length}`);
      if (errs.length) console.log('  errors:', errs.join(' | ').slice(0, 400));
      if (ext.length) console.log('  external:', ext.join(', ').slice(0, 300));
      if (size < 10000 || size > 262144) failures.push(`${shot.name} size ${size}`);
      if (errs.length) failures.push(`${shot.name} console errors`);
      if (ext.length) failures.push(`${shot.name} external requests`);
    } catch (e) {
      console.log(`${shot.name}: FAIL ${e.message}`);
      failures.push(shot.name);
    } finally {
      tab.close();
    }
  }
} finally {
  cdp.close();
}
console.log(failures.length === 0 ? 'SHOTS OK' : `SHOTS FAILED: ${failures.join(', ')}`);
process.exit(failures.length === 0 ? 0 : 1);
