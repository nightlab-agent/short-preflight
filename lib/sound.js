'use strict';
const { spawnSync } = require('node:child_process');

const QUIET_LUFS = -20;
const CLIP_DBTP = 0;
const NEAR_CLIP_DBTP = -1;
const SILENT_DBFS = -60;

function ebur128(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-v', 'level+info', '-i', file, '-map', '0:a:0', '-af', 'ebur128=peak=true', '-f', 'null', '-'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, AV_LOG_FORCE_NOCOLOR: '1' } });
  if (r.error) throw r.error;
  // Decoder errors can leave a plausible summary and exit status 0.
  if (/(?:^|[\r\n])(?:\[[^\]\r\n]*\][ \t]*)?\[(?:error|fatal)\]/.test(r.stderr)) throw new Error('sound: ffmpeg could not decode audio');
  if (r.status !== 0) throw new Error('sound: ffmpeg stopped before it finished');
  const summary = r.stderr.slice(r.stderr.lastIndexOf('Summary:'));
  const lufs = /I:\s+(-?[\d.]+|-inf|nan) LUFS/.exec(summary);
  const peak = /Peak:\s+(-?[\d.]+|-inf|nan) dBFS/.exec(summary);
  if (!lufs || !peak) return null;
  const num = (s) => (/^-?[\d.]+$/.test(s) ? Number(s) : -Infinity);
  return { lufs: num(lufs[1]), peak: num(peak[1]) };
}

function hasAudio(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  if (r.error) throw r.error;
  return r.status === 0 && r.stdout.trim() !== '';
}

function checkSound(file) {
  if (!hasAudio(file)) return [{ level: 'warn', id: 'no-audio', text: 'no audio track' }];
  const m = ebur128(file);
  if (!m) return [{ level: 'warn', id: 'sound-unread', text: 'could not measure the audio' }];
  if (m.peak <= SILENT_DBFS) {
    return [{ level: 'fail', id: 'silent-track', text: 'the audio track is silent or nearly silent from start to end' }];
  }
  const out = [];
  if (m.peak >= CLIP_DBTP) out.push({ level: 'fail', id: 'clipping', text: `audio reaches full scale (true peak ${m.peak.toFixed(1)} dBFS)` });
  else if (m.peak > NEAR_CLIP_DBTP) out.push({ level: 'warn', id: 'near-clipping', text: `true peak ${m.peak.toFixed(1)} dBFS, above -1` });
  // A short audible track can leave R128 at its -70 LUFS floor.
  if (m.lufs <= -70) out.push({ level: 'warn', id: 'sound-unread', text: 'could not measure integrated audio loudness' });
  else if (m.lufs < QUIET_LUFS) out.push({ level: 'warn', id: 'quiet', text: `quiet at ${m.lufs.toFixed(1)} LUFS` });
  return out;
}

module.exports = { checkSound };
