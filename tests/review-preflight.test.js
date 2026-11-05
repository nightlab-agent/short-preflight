'use strict';
// Each failure case sits beside a comparison that must pass.
const test = require('node:test');
const assert = require('node:assert');
const { spawnSync, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { realClip } = require('./real-clip.js');
const bin = path.join(__dirname, '..', 'bin', 'short-preflight.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spf-review-'));
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
const run = (args, opts = {}) => spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', cwd: dir, ...opts });
const ff = (...a) => execFileSync('ffmpeg', ['-nostdin', '-y', '-v', 'error', ...a], { cwd: dir });
const p = (n) => path.join(dir, n);
const tone = ['-f', 'lavfi', '-i', 'sine=f=440:r=48000,volume=6dB'];
const text = 'drawtext=text=Read this:fontsize=24:fontcolor=white:x=90:y=260';
const shim = (name, body) => {
  const d = p(name); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'ffmpeg'), `#!/bin/sh\n${body}\nexec /usr/bin/ffmpeg "$@"\n`, { mode: 0o755 });
  fs.symlinkSync('/usr/bin/ffprobe', path.join(d, 'ffprobe'));
  return { env: { ...process.env, PATH: `${d}:/bin` } };
};

// A status-bar label appears only at 15 s, so the tail decides the verdict.
function lateLabel(name) {
  ff('-f', 'lavfi', '-i', 'color=c=0x16192d:s=360x640:r=30:d=20', ...tone, '-t', '20',
    '-vf', `${text},drawtext=text=READ THIS:fontsize=18:fontcolor=white:x=10:y=4:enable='gte(t,15)'`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', name);
}
const cut = (src, name, share) => { const b = fs.readFileSync(p(src)); fs.writeFileSync(p(name), b.subarray(0, Math.floor(b.length * share))); };

test('truncation: the whole file fails on the late label', () => {
  lateLabel('late.mp4');
  assert.strictEqual(run(['late.mp4']).status, 1);
});
test('truncation: a cut mp4 never gets exit 0 at any cut point', () => {
  lateLabel('late2.mp4');
  const passed = [];
  for (let s = 40; s <= 96; s += 4) {
    cut('late2.mp4', 'c.mp4', s / 100);
    if (run(['c.mp4']).status === 0) passed.push(s);
  }
  assert.deepStrictEqual(passed, [], `cut at these percent gave exit 0: ${passed}`);
});
test('truncation: a cut mkv of the same render is not a PASS', () => {
  lateLabel('late3.mp4');
  ff('-i', 'late3.mp4', '-c', 'copy', 'late3.mkv');
  cut('late3.mkv', 'c.mkv', 0.6);
  const r = run(['c.mkv']);
  assert.strictEqual(r.status, 2, r.stdout + r.stderr);
});
test('damage: a real render with its second half zeroed is not a PASS', () => {
  ff('-i', realClip('real-passes', dir), '-c', 'copy', '-movflags', '+faststart', 'z.mp4');
  const b = fs.readFileSync(p('z.mp4'));
  b.fill(0, Math.floor(b.length / 2));
  fs.writeFileSync(p('z.mp4'), b);
  const r = run(['z.mp4']);
  assert.strictEqual(r.status, 2, r.stdout + r.stderr);
});

function audioMkv(name) {
  ff('-f', 'lavfi', '-i', 'color=c=0x16192d:s=360x640:r=10:d=2', ...tone, '-t', '2', '-vf', text, '-c:a', 'aac', '-pix_fmt', 'yuv420p', name);
}
test('unread stream: a video track ffmpeg cannot finish exits 2', () => {
  audioMkv('v.mp4');
  const r = run(['v.mp4'], shim('killv', 'case "$*" in *rawvideo*) kill -9 $$;; esac'));
  assert.strictEqual(r.status, 2, r.stdout + r.stderr);
});
test('unread stream: an audio track ffmpeg cannot read exits 2, not PASS', () => {
  audioMkv('a.mkv');
  const b = fs.readFileSync(p('a.mkv'));
  b.write('A_ZZZ', b.indexOf('A_AAC'));
  fs.writeFileSync(p('a.mkv'), b);
  const r = run(['a.mkv']);
  assert.strictEqual(r.status, 2, r.stdout + r.stderr);
});
test('unread stream: ffmpeg killed while measuring sound exits 2, not PASS', () => {
  audioMkv('k.mp4');
  const r = run(['k.mp4'], shim('killa', 'case "$*" in *ebur128*) kill -9 $$;; esac'));
  assert.strictEqual(r.status, 2, r.stdout + r.stderr);
});

function coverPng() {
  ff('-f', 'lavfi', '-i', 'color=c=0x16192d:s=360x640:d=1', '-vf', text, '-frames:v', '1', 'cover.png');
}
test('audio only: an mp3 with no cover exits 2', () => {
  ff('-f', 'lavfi', '-i', 'sine=f=440:d=2', 'plain.mp3');
  assert.strictEqual(run(['plain.mp3']).status, 2);
});
test('audio only: an mp3 with cover art exits 2, not PASS', () => {
  coverPng();
  ff('-f', 'lavfi', '-i', 'sine=f=440:d=2', 'song.mp3');
  ff('-i', 'song.mp3', '-i', 'cover.png', '-map', '0', '-map', '1', '-c:a', 'copy', '-c:v', 'mjpeg', '-disposition:v', 'attached_pic', 'tagged.mp3');
  const r = run(['tagged.mp3']);
  assert.strictEqual(r.status, 2, r.stdout + r.stderr);
});

test('no ffmpeg: a silent-less clip without audio exits 2 cleanly', () => {
  ff('-f', 'lavfi', '-i', 'color=c=0x16192d:s=360x640:r=10:d=1', '-pix_fmt', 'yuv420p', 'mute.mp4');
  const d = p('probeonly1'); fs.mkdirSync(d); fs.symlinkSync('/usr/bin/ffprobe', path.join(d, 'ffprobe'));
  assert.strictEqual(run(['mute.mp4'], { env: { PATH: d } }).status, 2);
});
test('no ffmpeg: a clip with audio exits 2 with no stack trace', () => {
  audioMkv('b.mp4');
  const d = p('probeonly2'); fs.mkdirSync(d); fs.symlinkSync('/usr/bin/ffprobe', path.join(d, 'ffprobe'));
  const r = run(['b.mp4'], { env: { PATH: d } });
  assert.strictEqual(r.status, 2, r.stderr.slice(0, 200));
  assert.ok(!/\n\s+at /.test(r.stderr));
});

test('names: ./ form of a colon name is checked', () => {
  audioMkv('colon.mp4'); fs.copyFileSync(p('colon.mp4'), p('2026-11-05T12:30:00.mp4'));
  assert.strictEqual(run(['./2026-11-05T12:30:00.mp4']).status, 0);
});
test('names: a colon name is checked, not called not-a-video', () => {
  const r = run(['2026-11-05T12:30:00.mp4']);
  assert.strictEqual(r.status, 0, r.stderr);
});
test('names: file:x.mp4 is judged on its own bytes, not on x.mp4', () => {
  audioMkv('file-own.mp4');
  ff('-f', 'lavfi', '-i', 'color=c=black:s=640x360:r=10:d=1', '-pix_fmt', 'yuv420p', 'x.mp4');
  fs.copyFileSync(p('file-own.mp4'), p('file:x.mp4'));
  assert.strictEqual(run(['file:x.mp4']).status, 0);
});

test('shape: a coded wide file fails', () => {
  ff('-f', 'lavfi', '-i', 'color=c=white:s=640x360:r=10:d=1', '-pix_fmt', 'yuv420p', 'w.mp4');
  assert.strictEqual(run(['w.mp4']).status, 1);
});
test('shape: 360x640 at 4:1 pixels displays 9:4 wide and fails', () => {
  ff('-f', 'lavfi', '-i', 'color=c=0x16192d:s=360x640:r=10:d=1', ...tone, '-t', '1', '-vf', `${text},setsar=4/1`, '-pix_fmt', 'yuv420p', 's.mp4');
  assert.strictEqual(run(['s.mp4']).status, 1);
});

test('old ffmpeg: a tool that knows -fps_mode checks the file', () => {
  audioMkv('o.mp4');
  assert.strictEqual(run(['o.mp4']).status, 0);
});
test('old ffmpeg (shim of 4.x): no -fps_mode still checks the file', () => {
  const r = run(['o.mp4'], shim('old', 'case "$*" in *-fps_mode*) echo "Unrecognized option \'fps_mode\'." >&2; exit 1;; esac'));
  assert.strictEqual(r.status, 0, r.stderr);
});
