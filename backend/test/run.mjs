// Runs the backend test suites against a temporary server and fresh database.
// Usage: node test/run.mjs   (from backend/)
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const backend = join(here, '..');
const dir = mkdtempSync(join(tmpdir(), 'myledger-test-'));
const env = { ...process.env, DB_PATH: join(dir, 'test.db'), JWT_SECRET: 'testsecret', PORT: '5055', NODE_ENV: 'development' };
const suites = ['baseline', 'boundaries', 'managed', 'flow', 'staffcreate', 'addremove'];

const server = spawn(process.execPath, ['app.js'], { cwd: backend, env, stdio: ['ignore', 'pipe', 'pipe'] });
let serverErrors = '';
server.stderr.on('data', d => { serverErrors += d; });
const stop = () => server.kill();

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch('http://localhost:5055/api/health')).ok) return; } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('server did not start');
}

function runSuite(name) {
  return new Promise(resolve => {
    const p = spawn(process.execPath, [join(here, name + '.mjs')], { cwd: backend, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { out += d; });
    p.on('close', code => {
      const failed = code !== 0 || /^FAIL|TypeError|Error:/m.test(out);
      resolve({ name, failed, out });
    });
  });
}

try {
  const busy = await fetch('http://localhost:5055/api/health').then(r => r.ok, () => false);
  if (busy) throw new Error('port 5055 is already in use. Stop the running server first.');
  await waitForServer();
  let bad = 0;
  for (const s of suites) {
    const r = await runSuite(s);
    const passes = (r.out.match(/^PASS/gm) || []).length;
    const fails = (r.out.match(/^FAIL/gm) || []).length;
    console.log(`${r.failed ? 'FAIL' : 'ok  '} ${s.padEnd(12)} pass=${passes} fail=${fails}`);
    if (r.failed) { bad++; console.log(r.out.split('\n').filter(l => /^FAIL|Error/.test(l)).slice(0, 8).join('\n')); }
  }
  if (process.env.SHOW_SERVER) console.log(serverErrors.slice(0, 3000));
  console.log(bad ? `\n${bad} suite(s) failed` : '\nall suites passed');
  process.exitCode = bad ? 1 : 0;
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  stop();
}
