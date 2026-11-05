'use strict';
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// Real renders are kept as stills, one every 2.5 s, and rebuilt into a clip for a test.
function realClip(name, dir) {
  const file = path.join(dir, `${name}.mp4`);
  if (!fs.existsSync(file)) {
    execFileSync('ffmpeg', ['-nostdin', '-y', '-v', 'error', '-framerate', '0.4', '-i', path.join(__dirname, 'fixtures', name, '%02d.png'),
      '-f', 'lavfi', '-i', 'sine=f=440:r=48000,volume=6dB', '-t', '20', '-r', '30',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', file]);
  }
  return file;
}

module.exports = { realClip };
