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

const clip = (name, size, extra = []) => {
  const f = path.join(dir, name);
  execFileSync('ffmpeg', ['-nostdin', '-y', '-v', 'error', '-f', 'lavfi', '-i', `color=c=0x16192d:s=${size}:r=10:d=1`,
    '-vf', 'drawtext=text=Read this:fontsize=24:fontcolor=white:x=(w-tw)/2:y=(h-th)/2', '-pix_fmt', 'yuv420p', ...extra, f]);
  return f;
};

test('a square video is not a shape fail, but warns that the zones assume 9:16', () => {
  const r = run(clip('square.mp4', '360x360'), '--json');
  const ids = JSON.parse(r.stdout).findings.map((x) => x.id);
  assert.ok(!ids.includes('not-vertical'), ids.join());
  assert.ok(ids.includes('not-nine-sixteen'), ids.join());
});

test('a 9:16 video has no shape finding', () => {
  const ids = JSON.parse(run(clip('tall.mp4', '360x640'), '--json').stdout).findings.map((x) => x.id);
  assert.ok(!ids.includes('not-nine-sixteen'), ids.join());
});

test('a rotated phone video counts as vertical, and its picture is checked', () => {
  const coded = clip('coded.mp4', '640x360');
  const f = path.join(dir, 'rotated.mp4');
  execFileSync('ffmpeg', ['-nostdin', '-y', '-v', 'error', '-display_rotation', '90', '-i', coded, '-c', 'copy', f]);
  const d = JSON.parse(run(f, '--json').stdout);
  assert.deepStrictEqual([d.width, d.height], [360, 640]);
  assert.ok(!d.findings.some((x) => x.id === 'not-vertical'));
  assert.deepStrictEqual(d.notChecked, []);
});

test('a video that stops decoding exits 2, never a verdict', () => {
  const whole = clip('whole.mp4', '360x640', ['-movflags', '+faststart']);
  const f = path.join(dir, 'cut.mp4');
  const b = fs.readFileSync(whole);
  fs.writeFileSync(f, b.subarray(0, Math.floor(b.length * 0.7)));
  const r = run(f);
  assert.strictEqual(r.status, 2, r.stdout + r.stderr);
  assert.ok(!/at .*:\d+:\d+/.test(r.stderr), r.stderr);
});

test('ffprobe present but ffmpeg missing exits 2, never a verdict', () => {
  const f = clip('sound.mp4', '360x640', ['-f', 'mp4']);
  const withSound = path.join(dir, 'with-sound.mp4');
  execFileSync('ffmpeg', ['-nostdin', '-y', '-v', 'error', '-i', f, '-f', 'lavfi', '-i', 'sine=d=1', '-c:v', 'copy', '-shortest', withSound]);
  const only = path.join(dir, 'only-ffprobe');
  fs.mkdirSync(only);
  const probe = execFileSync('which', ['ffprobe'], { encoding: 'utf8' }).trim();
  fs.symlinkSync(probe, path.join(only, 'ffprobe'));
  const r = spawnSync(process.execPath, [bin, withSound], { encoding: 'utf8', env: { PATH: only } });
  assert.strictEqual(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /ffmpeg/);
  assert.ok(!/at .*:\d+:\d+/.test(r.stderr), r.stderr);
});
