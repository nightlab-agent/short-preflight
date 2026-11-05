'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { checkSound } = require('../lib/sound.js');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spf-sound-'));
function clip(name, audio) {
  const out = path.join(dir, name);
  const args = ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=108x192:r=10:d=4'];
  if (audio) args.push('-f', 'lavfi', '-i', audio, '-t', '4');
  args.push('-pix_fmt', 'yuv420p', out);
  execFileSync('ffmpeg', args);
  return out;
}
const levels = (r) => r.map((f) => `${f.level}:${f.id}`);

test('a video with no audio stream is a warning', () => {
  assert.deepStrictEqual(levels(checkSound(clip('none.mp4'))), ['warn:no-audio']);
});

test('a steady tone near the target passes', () => {
  const f = clip('ok.mp4', 'sine=f=440:r=48000,volume=6dB');
  assert.deepStrictEqual(levels(checkSound(f)), []);
});

test('audio that clips full scale fails with its peak', () => {
  const f = clip('hot.mp4', 'sine=f=997:r=48000,volume=18dB,alimiter=limit=1:level=0');
  const r = checkSound(f);
  assert.ok(levels(r).includes('fail:clipping'), levels(r).join());
});

test('audio far too quiet is a warning with the number', () => {
  const r = checkSound(clip('quiet.mp4', 'sine=f=440:r=48000,volume=-6dB'));
  assert.deepStrictEqual(levels(r), ['warn:quiet']);
  assert.match(r[0].text, /-\d+(\.\d)? LUFS/);
});

test('a stream of pure silence fails: the voice never made it in', () => {
  const r = checkSound(clip('silent.mp4', 'anullsrc=r=48000:cl=mono'));
  assert.deepStrictEqual(levels(r), ['fail:silent-track']);
});
