'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { checkPicture } = require('../lib/picture.js');
const { zones } = require('../lib/zones.json');

const bin = path.join(__dirname, '..', 'bin', 'short-preflight.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spf-review-'));
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
function clip(name, { size = '360x640', sar = '1', duration = 1, audio = 'sine=f=440:r=48000,volume=6dB' } = {}) {
  const file = path.join(dir, name);
  execFileSync('ffmpeg', ['-nostdin', '-y', '-v', 'error', '-f', 'lavfi', '-i', `color=c=0x16192d:s=${size}:r=10:d=${duration}`,
    '-f', 'lavfi', '-i', audio, '-t', String(duration),
    '-vf', `drawtext=text=Read this:fontsize=24:fontcolor=white:x=90:y=260,setsar=sar=${sar}:max=10000`,
    '-c:v', 'libx264', '-threads', '2', '-pix_fmt', 'yuv420p', '-c:a', 'aac', file]);
  return file;
}
const run = (file, env = process.env) => spawnSync(process.execPath, [bin, file, '--json'], { encoding: 'utf8', env });

test('an ordinary audiovisual file passes', () => {
  const r = run(clip('ordinary.mp4'));
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.deepStrictEqual(JSON.parse(r.stdout).findings, []);
});

for (const stream of ['a:0', 'v:0']) {
  test(`one corrupt ${stream} packet exits 2 instead of passing a partial decode`, () => {
    const file = clip(`corrupt-${stream[0]}.mp4`);
    const packets = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', stream,
      '-show_packets', '-show_entries', 'packet=pos,size', '-of', 'json', file])).packets;
    const packet = packets[Math.floor(packets.length / 2)];
    const bytes = fs.readFileSync(file);
    bytes.fill(0xff, Number(packet.pos), Number(packet.pos) + Number(packet.size));
    fs.writeFileSync(file, bytes);
    if (stream === 'v:0') assert.throws(() => checkPicture(file, zones, { duration: 1 }), /decode video/);
    for (const env of [process.env, { ...process.env, AV_LOG_FORCE_COLOR: '1' }]) {
      const r = run(file, env);
      assert.strictEqual(r.status, 2, r.stdout + r.stderr);
      assert.strictEqual(r.stdout, '', 'an incomplete check must not print a verdict');
    }
  });
}

test('a landscape display fails even when its stored dimensions are portrait', () => {
  const wide = run(clip('wide-display.mp4', { sar: '4' }));
  assert.strictEqual(wide.status, 1, wide.stdout + wide.stderr);
  assert.ok(JSON.parse(wide.stdout).findings.some((f) => f.id === 'not-vertical'));
});

test('a 9:16 display passes even when its stored dimensions are landscape', () => {
  const tall = run(clip('tall-display.mp4', { size: '640x360', sar: '81/256' }));
  assert.strictEqual(tall.status, 0, tall.stdout + tall.stderr);
  assert.ok(!JSON.parse(tall.stdout).findings.some((f) => f.id.startsWith('not-')));
});

test('a short silent track still fails', () => {
  const r = run(clip('short-silence.mp4', { duration: 0.2, audio: 'anullsrc=r=48000:cl=mono' }));
  assert.strictEqual(r.status, 1, r.stdout + r.stderr);
  assert.ok(JSON.parse(r.stdout).findings.some((f) => f.id === 'silent-track'));
});

test('a short audible tone is not called silent or assigned an unmeasured loudness', () => {
  const r = run(clip('short-tone.mp4', { duration: 0.2 }));
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  const ids = JSON.parse(r.stdout).findings.map((f) => f.id);
  assert.ok(!ids.includes('silent-track') && !ids.includes('quiet'), ids.join());
  assert.ok(ids.includes('sound-unread'), ids.join());
});

test('missing ffmpeg with an audio track exits 2 without a stack trace', () => {
  const file = clip('missing-ffmpeg.mp4');
  const name = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
  const probe = process.env.PATH.split(path.delimiter).map((p) => path.join(p, name)).find((p) => fs.existsSync(p));
  assert.ok(probe, 'ffprobe must be available to generate the comparison');
  const onlyProbe = path.join(dir, 'only-probe');
  fs.mkdirSync(onlyProbe);
  fs.copyFileSync(probe, path.join(onlyProbe, name));
  fs.chmodSync(path.join(onlyProbe, name), 0o755);
  const r = run(file, { ...process.env, PATH: onlyProbe });
  assert.strictEqual(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /ffmpeg/);
  assert.ok(!/at .*:\d+:\d+/.test(r.stderr), r.stderr);
});

test('a literal file: filename checks that file, not the protocol target', { skip: process.platform === 'win32' }, () => {
  const target = clip('target.mp4');
  assert.strictEqual(run(target).status, 0);
  const file = path.join(dir, 'file:target.mp4');
  execFileSync('ffmpeg', ['-nostdin', '-y', '-v', 'error', '-i', target,
    '-vf', 'drawbox=x=321:y=464:w=18:h=16:c=white:t=2', '-threads', '2', file]);
  for (const name of ['./file:target.mp4', 'file:target.mp4']) {
    const r = spawnSync(process.execPath, [bin, name, '--json'], { cwd: dir, encoding: 'utf8' });
    assert.strictEqual(r.status, 1, r.stdout + r.stderr);
    assert.ok(JSON.parse(r.stdout).findings.some((f) => f.id === 'zone-right-buttons'));
  }
});
