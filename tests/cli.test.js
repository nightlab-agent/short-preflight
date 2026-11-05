'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { spawnSync, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const bin = path.join(__dirname, '..', 'bin', 'short-preflight.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spf-cli-'));
const run = (...a) => spawnSync(process.execPath, [bin, ...a], { encoding: 'utf8' });

test('a missing file exits 2 and says which', () => {
  const r = run(path.join(dir, 'nope.mp4'));
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /nope\.mp4/);
});

test('no argument exits 2 with usage', () => {
  const r = run();
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /usage/i);
});

test('a horizontal video fails on shape', () => {
  const f = path.join(dir, 'wide.mp4');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=192x108:r=10:d=1', '-pix_fmt', 'yuv420p', f]);
  const r = run(f, '--json');
  assert.strictEqual(r.status, 1);
  assert.ok(JSON.parse(r.stdout).findings.some((x) => x.id === 'not-vertical'));
});
