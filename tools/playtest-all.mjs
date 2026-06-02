#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const scripts = [
  'playtest.mjs',
  'gap-audit.mjs',
  'playtest-curve.mjs',
  'playtest-progression.mjs',
];

let failed = false;
for (const s of scripts) {
  const r = spawnSync(process.execPath, [resolve(dir, s)], { encoding: 'utf8' });
  process.stdout.write(r.stdout || '');
  process.stderr.write(r.stderr || '');
  if (r.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
