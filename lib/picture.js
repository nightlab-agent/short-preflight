'use strict';
const { spawnSync } = require('node:child_process');

// Work in display coordinates after ffmpeg's autorotation. Fixed size bounds the
// analysis cost and makes the thresholds independent of the source resolution.
const WIDTH = 360;
const HEIGHT = 640;
const FRAME_BYTES = WIDTH * HEIGHT * 3;
const SAMPLE_SECONDS = 0.5;
const MAX_SAMPLES = 360;
const EDGE_CONTRAST = 20;
// Share of tiles holding detail above which a frame is one picture edge to edge:
// our renders peaked at 0.76, a photographed circuit board read 1.00.
const FULL_BLEED = 0.85;

function frames(file, duration) {
  const step = Math.max(SAMPLE_SECONDS, duration / (MAX_SAMPLES - 1));
  const filter = `setpts=PTS-STARTPTS,select='isnan(prev_selected_t)+gt(floor(t/${step}),floor(prev_selected_t/${step}))',scale=${WIDTH}:${HEIGHT},format=rgb24,showinfo=checksum=0`;
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostdin', '-nostats', '-v', 'info', '-xerror', '-threads', '2',
    '-i', file, '-map', '0:v:0', '-an', '-sn', '-dn', '-vf', filter, '-fps_mode', 'vfr',
    '-threads', '1', '-f', 'rawvideo', 'pipe:1'],
  { maxBuffer: (MAX_SAMPLES + 1) * FRAME_BYTES, timeout: 120000, killSignal: 'SIGKILL' });
  if (r.error) throw new Error(`picture: ffmpeg: ${r.error.message}`, { cause: r.error });
  if (r.status !== 0) throw new Error(`picture: ffmpeg could not decode video: ${r.stderr.toString().slice(-1500)}`);
  const times = [...r.stderr.toString().matchAll(/\bn:\s*\d+\s+pts:\s*-?\d+\s+pts_time:([\d.e+-]+)/g)].map((m) => Number(m[1]));
  if (!times.length || r.stdout.length !== times.length * FRAME_BYTES) throw new Error('picture: incomplete sampled frames from ffmpeg');
  return { pixels: r.stdout, times, step };
}

// Integral image of sharp RGB edges. A gentle gradient has no sharp edge;
// checking all channels also retains detail with similar luminance but different hues.
function edges(pixels) {
  const mask = new Uint8Array(WIDTH * HEIGHT);
  const rows = new Uint16Array(HEIGHT);
  const cols = new Uint16Array(WIDTH);
  const tiles = new Uint16Array((WIDTH / 40) * (HEIGHT / 40));
  let total = 0;
  for (let y = 1; y < HEIGHT - 1; y++) {
    for (let x = 1; x < WIDTH - 1; x++) {
      const p = (y * WIDTH + x) * 3;
      let contrast = 0;
      for (let c = 0; c < 3; c++) {
        contrast = Math.max(contrast, Math.abs(pixels[p - 3 + c] - pixels[p + 3 + c]),
          Math.abs(pixels[p - WIDTH * 3 + c] - pixels[p + WIDTH * 3 + c]));
      }
      if (contrast >= EDGE_CONTRAST) {
        mask[y * WIDTH + x] = 1;
        rows[y]++;
        cols[x]++;
        tiles[Math.floor(y / 40) * (WIDTH / 40) + Math.floor(x / 40)]++;
        total++;
      }
    }
  }
  const stride = WIDTH + 1;
  const sums = new Uint32Array(stride * (HEIGHT + 1));
  for (let y = 0; y < HEIGHT; y++) {
    let row = 0;
    for (let x = 0; x < WIDTH; x++) {
      // Rows or columns that are almost entirely edges are likely background
      // bands. Keep localized detail elsewhere on the same frame.
      if (rows[y] < WIDTH * 0.8 && cols[x] < HEIGHT * 0.8) row += mask[y * WIDTH + x];
      sums[(y + 1) * stride + x + 1] = sums[y * stride + x + 1] + row;
    }
  }
  // Measure the background before removing long edges, so that a repeating
  // pattern does not become apparently sparse just because its rows were removed.
  // The lower fifth distinguishes widespread texture from a large foreground panel.
  const densities = [...tiles].sort((a, b) => a - b);
  const fullBleed = densities.filter((n) => n / 1600 > 0.01).length / densities.length >= FULL_BLEED;
  return { sums, total, fullBleed, background: densities[Math.floor(densities.length / 5)] / 1600 };
}

function count(sums, box) {
  const [x0, y0, x1, y1] = box;
  const stride = WIDTH + 1;
  return sums[y1 * stride + x1] - sums[y0 * stride + x1] - sums[y1 * stride + x0] + sums[y0 * stride + x0];
}

function cells(zone) {
  const [left, top, right, bottom] = zone.box;
  const [cols, rows] = zone.grid;
  const out = [];
  const bounds = [Math.ceil(WIDTH * left) + 1, Math.ceil(HEIGHT * top) + 1,
    Math.floor(WIDTH * right) - 1, Math.floor(HEIGHT * bottom) - 1];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      // Keep both ends of an edge inside the zone. Otherwise detail immediately
      // outside a boundary bleeds in (notably the real passing render's top panel).
      out.push([
        Math.max(bounds[0], Math.round(WIDTH * (left + (right - left) * x / cols))),
        Math.max(bounds[1], Math.round(HEIGHT * (top + (bottom - top) * y / rows))),
        Math.min(bounds[2], Math.round(WIDTH * (left + (right - left) * (x + 1) / cols))),
        Math.min(bounds[3], Math.round(HEIGHT * (top + (bottom - top) * (y + 1) / rows)))
      ]);
    }
  }
  return out;
}

// Heuristic, not OCR or face recognition: text, outlines and facial features can
// all produce localized edges. Suppress texture shared across most of the frame
// unless a cell has twice its edge density. This suppresses uniform full-bleed
// texture; localized scenery can still trigger, and subtle
// foreground detail over a busy background can be missed.
function checkPicture(file, zones, info) {
  if (!Number.isFinite(info.duration) || info.duration <= 0) throw new Error('picture: a positive video duration is required');
  const { pixels, times, step } = frames(file, info.duration);
  const regions = zones.map((zone) => ({ zone, cells: cells(zone), seconds: 0, first: null, plain: false }));
  const out = [];
  for (let i = 0; i < times.length; i++) {
    const { sums, total, fullBleed, background } = edges(pixels.subarray(i * FRAME_BYTES, (i + 1) * FRAME_BYTES));
    if (i === 0 && total < 80) {
      out.push({ level: 'fail', id: 'empty-first-frame', text: 'nearly empty first frame at 0.0 s: too little visible detail' });
    }
    const threshold = Math.max(0.003, background * 2);
    for (const region of regions) {
      const occupied = region.cells.some((box) => {
        const area = (box[2] - box[0]) * (box[3] - box[1]);
        const n = count(sums, box);
        return n >= 12 && n / area > threshold;
      });
      if (occupied) {
        if (region.first === null) region.first = times[i];
        if (!fullBleed) region.plain = true;
        region.seconds += Math.max(0, Math.min(info.duration, times[i + 1] ?? info.duration) - times[i]);
      }
    }
  }
  for (const { zone, seconds, first, plain } of regions) {
    if (first === null) continue;
    // Only ever flagged on frames filled edge to edge: that may be scenery, so a person looks.
    const note = plain ? '' : '; the picture fills the frame, so this may be scenery: look at it';
    out.push({ level: plain ? zone.level : 'warn', id: `zone-${zone.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '')}`,
      text: `${zone.name}: detail in ~${seconds.toFixed(1)} s of sampled video; first at ${first.toFixed(1)} s (${step.toFixed(1)} s sampling)${note}` });
  }
  return out;
}

module.exports = { checkPicture };
