'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { checkPicture } = require('../lib/picture.js');
const { zones } = require('../lib/zones.json');

const dir = fs.mkdtempSync(path.join(__dirname, 'picture-'));
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
const center = 'drawtext=text=Read this:fontsize=24:fontcolor=white:x=90:y=260';
function clip(name, filters = center, { source = 'color=c=0x16192d:s=360x640:r=10:d=4', duration = 4 } = {}) {
  const file = path.join(dir, name);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', source, '-vf', filters,
    '-t', String(duration), '-fps_mode', 'vfr', '-c:v', 'libx264', '-preset', 'ultrafast', '-threads', '2', '-pix_fmt', 'yuv420p', file]);
  return file;
}
function info(file) {
  const data = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file], { encoding: 'utf8' }));
  return { ...data.streams[0], duration: Number(data.format.duration) };
}
const check = (file, regions = zones) => checkPicture(file, regions, info(file));
const zoneFindings = (findings) => findings.filter((f) => f.id !== 'empty-first-frame');
const right = (findings) => findings.filter((f) => f.text.startsWith('right buttons:'));

test('central text on a flat background passes', () => {
  assert.deepStrictEqual(check(clip('central.mp4')), []);
});

test('flat fills and a gentle gradient have no zone content but fail an empty opening', () => {
  for (const [name, filters] of [['black', 'null'], ['white', 'drawbox=c=white:t=fill'],
    ['gradient', "geq=r='20+20*Y/H':g='25+20*Y/H':b='40+20*Y/H'"]]) {
    const findings = check(clip(`${name}.mp4`, filters));
    assert.deepStrictEqual(findings.map((f) => [f.level, f.id]), [['fail', 'empty-first-frame']], name);
  }
});

test('the actual first frame is checked, even when text arrives before the next sample', () => {
  const findings = check(clip('late-opening.mp4', `${center}:enable='gte(t,0.1)'`));
  assert.deepStrictEqual(findings.map((f) => f.id), ['empty-first-frame']);
});

test('nearly empty opening with only a tiny speck fails', () => {
  const findings = check(clip('speck.mp4', 'drawbox=x=180:y=320:w=2:h=2:c=white:t=fill'));
  assert.ok(findings.some((f) => f.id === 'empty-first-frame'));
});

test('a small outline in one cell reports the zone once, with covered seconds and first second', () => {
  const file = clip('outline.mp4', `${center},drawbox=x=321:y=464:w=18:h=16:c=white:t=2:enable='gte(t,1.5)*lt(t,3.5)'`);
  const findings = check(file);
  assert.strictEqual(findings.length, 1, JSON.stringify(findings));
  assert.strictEqual(right(findings).length, 1);
  assert.strictEqual(findings[0].level, 'fail');
  assert.match(findings[0].text, /~2\.0 s.*first at 1\.5 s/);
});

test('text in each zone keeps that zone level and a distinct stable id', () => {
  const positions = [[302, 380], [40, 584], [40, 5], [245, 40], [5, 40]];
  const ids = new Set();
  for (let i = 0; i < zones.length; i++) {
    const [x, y] = positions[i];
    const findings = check(clip(`zone-${i}.mp4`, `${center},drawtext=text=READ:fontsize=12:fontcolor=white:x=${x}:y=${y}`));
    const finding = findings.find((f) => f.text.startsWith(`${zones[i].name}:`));
    assert.ok(finding, JSON.stringify({ zone: zones[i].name, findings }));
    assert.strictEqual(finding.level, zones[i].level);
    ids.add(finding.id);
  }
  assert.strictEqual(ids.size, zones.length);
});

test('uses supplied fractional boxes and grids, not hardcoded zone names', () => {
  const regions = [{ name: 'custom area', box: [0, 0.2, 1, 0.8], grid: [6, 6], level: 'warn' }];
  const findings = check(clip('custom.mp4', 'drawbox=x=280:y=420:w=12:h=12:c=white:t=2'), regions);
  assert.strictEqual(findings.length, 1, JSON.stringify(findings));
  assert.strictEqual(findings[0].level, 'warn');
  assert.match(findings[0].text, /^custom area:.*~4\.0 s.*first at 0\.0 s/);
});

test('small detail on an internal grid seam is still inside the zone', () => {
  const regions = [{ name: 'seam', box: [0, 0, 1, 1], grid: [2, 8], level: 'fail' }];
  const file = clip('seam.mp4', 'drawbox=x=179:y=290:w=2:h=60:c=white:t=fill');
  assert.ok(check(file, regions).some((f) => f.text.startsWith('seam:')));
});

test('facial features in the button column count as localized detail', () => {
  // A drawn face exercises visual features without pretending to test face recognition.
  const file = clip('face.mp4', `${center},drawbox=x=308:y=412:w=40:h=48:c=0xd7ab88:t=fill,drawbox=x=316:y=424:w=5:h=5:c=black:t=fill,drawbox=x=335:y=424:w=5:h=5:c=black:t=fill,drawbox=x=320:y=446:w=16:h=3:c=black:t=fill`);
  assert.strictEqual(right(check(file)).length, 1);
});

test('a full-bleed repeating background continuing under the zones does not fail', () => {
  const file = clip('background.mp4', 'null', {
    source: "nullsrc=s=360x640:r=10:d=4,geq=lum='80+40*sin(X*0.25)+40*sin(Y*0.25)':cb=128:cr=128"
  });
  assert.deepStrictEqual(check(file), []);
});

test('broad background bands continuing across the frame are not zone content', () => {
  const filters = `drawbox=x=0:y=550:w=360:h=60:c=0x50627c:t=fill,drawbox=x=315:y=0:w=30:h=640:c=0x50627c:t=fill,${center}`;
  const file = clip('bands.mp4', filters);
  assert.deepStrictEqual(check(file), []);
  const foreground = clip('bands-outline.mp4', `${filters},drawbox=x=320:y=440:w=18:h=18:c=white:t=2`);
  assert.strictEqual(right(check(foreground)).length, 1);
});

test('text over a continuing textured background still counts', () => {
  const file = clip('background-label.mp4', 'drawtext=text=READ THIS:fontsize=18:fontcolor=white:x=10:y=4', {
    source: "nullsrc=s=360x640:r=10:d=4,geq=lum='60+10*sin(X*0.25)+10*sin(Y*0.25)':cb=128:cr=128"
  });
  assert.ok(check(file).some((f) => f.text.startsWith('status bar:')));
});

test('the real failing render fails status bar and right buttons', () => {
  const findings = check(path.join(__dirname, 'fixtures', 'real-fails-zones.mp4'));
  for (const name of ['status bar', 'right buttons']) {
    assert.strictEqual(findings.filter((f) => f.level === 'fail' && f.text.startsWith(`${name}:`)).length, 1, JSON.stringify(findings));
  }
  assert.ok(!findings.some((f) => f.id === 'empty-first-frame'));
});

test('the real passing render has no picture finding, including whole-video warnings', () => {
  assert.deepStrictEqual(check(path.join(__dirname, 'fixtures', 'real-passes.mp4')), []);
});

test('other resolutions and 4K use the same fractional coordinates', () => {
  for (const [w, h] of [[180, 320], [2160, 3840]]) {
    const file = clip(`size-${w}.mp4`, `drawtext=text=READ:fontsize=h/25:fontcolor=white:x=w*0.83:y=h*0.65`, {
      source: `color=c=0x16192d:s=${w}x${h}:r=2:d=1`, duration: 1
    });
    assert.strictEqual(right(check(file)).length, 1, `${w}x${h}`);
  }
});

test('rotation metadata is applied before locating content', () => {
  const upright = clip('upright.mp4', `${center},drawbox=x=320:y=440:w=24:h=24:c=white:t=3`);
  const sideways = path.join(dir, 'sideways.mp4');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', upright, '-vf', 'transpose=1', '-threads', '2', sideways]);
  const rotated = path.join(dir, 'rotated.mp4');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-display_rotation', '90', '-i', sideways, '-c', 'copy', rotated]);
  const metadata = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream_side_data', '-of', 'json', rotated]));
  assert.strictEqual(metadata.streams[0].side_data_list[0].rotation, 90);
  assert.deepStrictEqual(check(rotated), check(upright));
});

test('variable frame rate reports presentation seconds rather than frame numbers', () => {
  const file = clip('vfr.mkv', `${center},drawbox=x=320:y=440:w=24:h=24:c=white:t=3:enable='gte(t,2)',select='if(lt(t,2),not(mod(n,2)),1)'`);
  const frames = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
    'frame=best_effort_timestamp_time', '-of', 'json', file])).frames;
  const gaps = frames.slice(1).map((frame, i) => Number(frame.best_effort_timestamp_time) - Number(frames[i].best_effort_timestamp_time));
  assert.ok(gaps.some((gap) => gap > 0.15) && gaps.some((gap) => gap < 0.15), 'fixture must really have variable frame rate');
  const findings = right(check(file));
  assert.strictEqual(findings.length, 1);
  assert.match(findings[0].text, /~2\.0 s.*first at 2\.0 s/);
});

test('unreadable media fails explicitly instead of returning a clean result', () => {
  const file = path.join(dir, 'broken.mp4');
  fs.writeFileSync(file, 'not a video');
  assert.throws(() => checkPicture(file, zones, { width: 360, height: 640, duration: 1 }), /picture|ffmpeg/i);
});

test('repeated calls and two simultaneous processes give identical results without changing the input', async () => {
  const file = clip('repeat.mp4', `${center},drawbox=x=320:y=440:w=24:h=24:c=white:t=3`);
  const before = fs.readFileSync(file);
  const expected = check(file);
  assert.deepStrictEqual(check(file), expected);
  const script = `const {checkPicture}=require('./lib/picture.js'); process.stdout.write(JSON.stringify(checkPicture(process.argv[1],${JSON.stringify(zones)},${JSON.stringify(info(file))})));`;
  const run = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', script, file], { cwd: path.join(__dirname, '..') });
    let output = '';
    let errors = '';
    child.stdout.on('data', (data) => { output += data; });
    child.stderr.on('data', (data) => { errors += data; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(JSON.parse(output)) : reject(new Error(errors)));
  });
  assert.deepStrictEqual(await Promise.all([run(), run()]), [expected, expected]);
  assert.deepStrictEqual(fs.readFileSync(file), before);
});

test('a 60 second 1080p Short is checked in less than 20 seconds', () => {
  const file = path.join(dir, 'minute.mp4');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-stream_loop', '-1', '-i', path.join(__dirname, 'fixtures', 'real-passes.mp4'),
    '-t', '60', '-an', '-c:v', 'copy', file]);
  const started = performance.now();
  const findings = check(file);
  const elapsed = performance.now() - started;
  assert.deepStrictEqual(findings, []);
  assert.ok(elapsed < 20000, `picture check took ${(elapsed / 1000).toFixed(2)} s`);
});
