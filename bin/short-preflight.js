#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { checkSound } = require('../lib/sound.js');
const { zones } = require('../lib/zones.json');

const USAGE = 'usage: short-preflight <video> [--json]\nExit: 0 clean or warnings, 1 a fail, 2 could not check.\n';

function probe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,sample_aspect_ratio:stream_disposition=attached_pic:stream_side_data=rotation:format=duration', '-of', 'json', file], { encoding: 'utf8' });
  if (r.error && r.error.code === 'ENOENT') die('ffprobe not found: install ffmpeg');
  if (r.error) die(r.error.message);
  if (r.status !== 0) die(`${file}: not a video ffprobe can read`);
  const d = JSON.parse(r.stdout);
  if (!d.streams || !d.streams[0]) die(`${file}: no video track`);
  const s = d.streams[0];
  // Cover art on an audio file shows up as a video stream of one still.
  if (s.disposition && s.disposition.attached_pic) die(`${file}: no video track, only cover art`);
  // Account for non-square pixels before applying a phone video's rotation mark.
  const [sarWidth, sarHeight] = (s.sample_aspect_ratio || '1:1').split(':').map(Number);
  const width = s.width * (sarWidth > 0 && sarHeight > 0 ? sarWidth / sarHeight : 1);
  const turned = (s.side_data_list || []).some((x) => Math.abs(x.rotation) === 90);
  return { width: turned ? s.height : width, height: turned ? width : s.height, duration: Number(d.format.duration) };
}

function die(msg) {
  process.stderr.write(`short-preflight: ${msg}\n`);
  process.exit(2);
}

function loadPicture() {
  try {
    return require('../lib/picture.js').checkPicture;
  } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') return null;
    throw e;
  }
}

function main(argv) {
  const json = argv.includes('--json');
  const files = argv.filter((a) => a !== '--json');
  if (files.length !== 1 || files[0].startsWith('-')) {
    process.stderr.write(USAGE);
    process.exit(2);
  }
  // An absolute path keeps a literal filename such as file:clip.mp4 out of ffmpeg's protocol parser.
  const file = path.resolve(files[0]);
  if (!fs.existsSync(file)) die(`${file}: no such file`);
  const info = probe(file);
  const findings = [];
  if (info.width > info.height) findings.push({ level: 'fail', id: 'not-vertical', text: `${info.width}x${info.height} is not vertical` });
  else if (Math.abs(info.width / info.height - 9 / 16) > 0.01) findings.push({ level: 'warn', id: 'not-nine-sixteen', text: `${info.width}x${info.height} is not 9:16, so zone positions are approximate` });
  try {
    findings.push(...checkSound(file));
  } catch (e) {
    if (e.code === 'ENOENT') die('ffmpeg not found: install ffmpeg');
    die(`${file}: could not read the whole sound: ${e.message.split('\n')[0]}`);
  }
  const checkPicture = loadPicture();
  const notChecked = [];
  if (checkPicture && info.width <= info.height) {
    try {
      findings.push(...checkPicture(file, zones, info));
    } catch (e) {
      die(`${file}: could not read the whole picture: ${e.message.split('\n')[0]}`);
    }
  }
  else notChecked.push('picture');
  const failed = findings.some((f) => f.level === 'fail');
  if (json) {
    process.stdout.write(JSON.stringify({ file: path.basename(file), ...info, ok: !failed, notChecked, findings }, null, 2) + '\n');
  } else {
    for (const f of findings) process.stdout.write(`${f.level.toUpperCase()} ${f.text}\n`);
    for (const n of notChecked) process.stdout.write(`NOT CHECKED ${n}\n`);
    process.stdout.write(failed ? 'FAIL\n' : 'PASS\n');
  }
  process.exit(failed ? 1 : 0);
}

main(process.argv.slice(2));
