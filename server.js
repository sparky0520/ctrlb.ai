import express from 'express';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import { mkdirSync, existsSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, 'output');
if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

const app = express();
app.use(express.json({ limit: '1mb' }));

// jobId → { totalFrames, stages, outputPath, stage, framesRendered, done, error }
const jobs = new Map();

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

// ── Thumbnail helpers ──────────────────────────────────────────────────────────

function fmtTimeSec(s) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// Extract one JPEG frame from srcPath at time t (seconds)
function extractFrame(srcPath, t, outPath) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-ss', t.toFixed(3),
      '-i', srcPath,
      '-vframes', '1',
      '-f', 'image2',
      '-q:v', '3',
      '-loglevel', 'error',
      '-y', outPath,
    ]);
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`)));
  });
}

// Pick up to 3 interesting composition timecodes from the config
function pickCandidates(config) {
  const dur = config.duration ?? 34;
  const ACCENTS = ['#3d7eff', '#1f8a5b', '#e0a93d'];
  const POSITIONS = ['bl', 'center', 'br'];

  const textItems = (config.clips ?? []).filter(c => c.type === 'text');
  const zoomItems = (config.clips ?? []).filter(c => c.type === 'zoom');

  const times = [];
  for (const t of textItems) times.push(t.at + t.dur * 0.5);
  for (const z of zoomItems) times.push(z.at + z.dur * 0.5);
  for (const fb of [dur * 0.25, dur * 0.5, dur * 0.75]) {
    if (times.length >= 3) break;
    if (!times.some(t => Math.abs(t - fb) < 2)) times.push(fb);
  }

  return times.slice(0, 3).map((t, i) => ({
    compTime: t,
    frame: fmtTimeSec(t),
    pos: POSITIONS[i] || 'center',
    accent: ACCENTS[i] || '#3d7eff',
  }));
}

const DEFAULT_CAPS = [
  "Ship faster\nwith Acme",
  "We rebuilt\nour workflow",
  "From 30 min\n→ 30 sec",
];

async function generateCaptions(config) {
  if (!openai) return DEFAULT_CAPS;
  const textVals = (config.clips ?? []).filter(c => c.type === 'text').map(c => c.value).join(', ');
  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: `Video titled "${config.composition}", duration ${config.duration}s, text overlays: "${textVals}". ` +
          `Generate exactly 3 punchy 2-line YouTube thumbnail captions (2-5 words total each, split across 2 lines with \\n). ` +
          `Return JSON: {"captions": ["line1\\nline2", "line1\\nline2", "line1\\nline2"]}`,
      }],
      response_format: { type: 'json_object' },
      max_tokens: 150,
      temperature: 0.7,
    });
    const data = JSON.parse(resp.choices[0].message.content);
    const caps = data.captions;
    if (Array.isArray(caps) && caps.length === 3) return caps;
  } catch (_) {}
  return DEFAULT_CAPS;
}

function fmtBytes(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + ' GB';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + ' MB';
  return (n / 1e3).toFixed(0) + ' KB';
}

// FFmpeg drawtext needs colons and single-quotes escaped
function esc(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:');
}

// On Windows the gyan.dev FFmpeg build has no fontconfig; fontconfig needs a config file.
// Work around by supplying a drive-relative path (no colon) which FFmpeg resolves on the current drive.
const FONT_ARGS = process.platform === 'win32'
  ? 'fontfile=/Windows/Fonts/arial.ttf:'
  : '';

// Build the complete FFmpeg args for the config
function buildFFmpegArgs(config, outputPath) {
  const [W, H] = config.size;
  const fps    = config.fps;

  const videoClip  = config.clips.find(c => c.type === 'video');
  const zoomClips  = config.clips.filter(c => c.type === 'zoom');
  const textClips  = config.clips.filter(c => c.type === 'text');
  const colorClips = config.clips.filter(c => c.type === 'color');

  const [trimIn, trimOut] = videoClip.trim;
  const speed       = videoClip.speed ?? 1;
  const vol         = videoClip.volume ?? 1;
  const clipDuration = (trimOut - trimIn) / speed;
  const totalFrames  = Math.round(fps * clipDuration);

  // Audio files that physically exist
  const audioItems = (config.audio ?? []).filter(a => {
    return existsSync(path.join(__dirname, 'public', a.src));
  });

  // ── Input args ────────────────────────────────────────────────────────────
  const inputArgs = [
    '-ss', String(trimIn),
    '-t',  String(clipDuration),
    '-i',  path.join(__dirname, 'public', videoClip.src),
  ];
  let nextInputIdx = 1;
  for (const a of audioItems) {
    inputArgs.push('-i', path.join(__dirname, 'public', a.src));
    a._inputIdx = nextInputIdx++;
  }

  // ── filter_complex ────────────────────────────────────────────────────────
  const fComplexParts = [];
  let vLabel = '0:v';
  let step = 0;

  // 1. Speed + scale to output size
  const ptsPart = speed !== 1 ? `setpts=${(1 / speed).toFixed(4)}*PTS,` : '';
  fComplexParts.push(`[${vLabel}]${ptsPart}scale=${W}:${H}[v${step}]`);
  vLabel = `v${step++}`;

  // 2. Zoom clips — crop the zoomed region then overlay it during the zoom window
  for (const zoom of zoomClips) {
    const t0 = zoom.at;
    const t1 = zoom.at + zoom.dur;
    const sc = zoom.scale;
    const [fx, fy] = zoom.focus;

    const cw = Math.round(W / sc);
    const ch = Math.round(H / sc);
    const cx = Math.min(Math.round(fx * (W - cw)), W - cw);
    const cy = Math.min(Math.round(fy * (H - ch)), H - ch);

    fComplexParts.push(`[${vLabel}]split[${vLabel}_b][${vLabel}_zs]`);
    fComplexParts.push(`[${vLabel}_zs]crop=${cw}:${ch}:${cx}:${cy},scale=${W}:${H}[zo${step}]`);
    fComplexParts.push(`[${vLabel}_b][zo${step}]overlay=enable='between(t,${t0},${t1})':x=0:y=0[v${step}]`);
    vLabel = `v${step++}`;
  }

  // 3. Text overlays
  for (const t of textClips) {
    const t0 = t.at;
    const t1 = t.at + t.dur;
    const fs  = t.preset === 'title-card' ? Math.round(H * 0.055) : Math.round(H * 0.04);
    const y   = t.preset === 'title-card' ? `h*0.82` : `(h-text_h)/2`;
    fComplexParts.push(
      `[${vLabel}]drawtext=${FONT_ARGS}text='${esc(t.value)}':enable='between(t,${t0},${t1})'` +
      `:fontsize=${fs}:fontcolor=white:x=(w-text_w)/2:y=${y}:shadowx=2:shadowy=2[v${step}]`
    );
    vLabel = `v${step++}`;
  }

  // 4. Color card overlays (drawbox fills frame; drawtext adds CTA if present)
  for (const cc of colorClips) {
    const t0 = cc.at;
    const t1 = cc.at + cc.dur;
    fComplexParts.push(
      `[${vLabel}]drawbox=x=0:y=0:w=iw:h=ih:color=${cc.color}:t=fill:enable='between(t,${t0},${t1})'[v${step}]`
    );
    vLabel = `v${step++}`;
    if (cc.value) {
      fComplexParts.push(
        `[${vLabel}]drawtext=${FONT_ARGS}text='${esc(cc.value)}':enable='between(t,${t0},${t1})'` +
        `:fontsize=${Math.round(H * 0.05)}:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:shadowx=2:shadowy=2[v${step}]`
      );
      vLabel = `v${step++}`;
    }
  }

  const vOut = `[${vLabel}]`;

  // 5. Audio mixing — original audio + any additional tracks
  const aMixInputs = [];
  fComplexParts.push(`[0:a]volume=${vol}[a_vid]`);
  aMixInputs.push('[a_vid]');

  for (const a of audioItems) {
    const delayMs = Math.round(a.at * 1000);
    fComplexParts.push(
      `[${a._inputIdx}:a]adelay=${delayMs}|${delayMs},volume=${a.volume}[a_${a._inputIdx}]`
    );
    aMixInputs.push(`[a_${a._inputIdx}]`);
  }

  let aOut;
  if (aMixInputs.length === 1) {
    // Rename the single stream to aout
    fComplexParts[fComplexParts.indexOf('[0:a]volume=' + vol + '[a_vid]')] =
      `[0:a]volume=${vol}[aout]`;
    aOut = '[aout]';
  } else {
    fComplexParts.push(
      `${aMixInputs.join('')}amix=inputs=${aMixInputs.length}:duration=first:normalize=0[aout]`
    );
    aOut = '[aout]';
  }

  const args = [
    ...inputArgs,
    '-filter_complex', fComplexParts.join(';'),
    '-map', vOut,
    '-map', aOut,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
    '-c:a', 'aac', '-ar', '44100',
    '-movflags', '+faststart',
    '-progress', 'pipe:1',
    '-loglevel', 'error',
    '-y',
    outputPath,
  ];

  return { args, totalFrames };
}

// ── POST /thumbs — extract 3 frames + captions ────────────────────────────
app.post('/thumbs', async (req, res) => {
  const config = req.body ?? {};
  const videoClip = (config.clips ?? []).find(c => c.type === 'video');
  if (!videoClip) return res.status(400).json({ error: 'No video clip in config' });

  const srcPath = path.join(__dirname, 'public', videoClip.src);
  if (!existsSync(srcPath)) return res.status(400).json({ error: `Source not found: ${videoClip.src}` });

  const [trimIn, trimOut] = videoClip.trim ?? [0, 10];
  const speed = videoClip.speed ?? 1;

  const [candidates, captions] = await Promise.all([
    Promise.resolve(pickCandidates(config)),
    generateCaptions(config),
  ]);

  const thumbs = [];
  for (let i = 0; i < candidates.length; i++) {
    const cand = candidates[i];
    // Map composition time to source video time
    const srcTime = Math.min(Math.max(trimIn + cand.compTime * speed, trimIn), trimOut - 0.1);
    const filename = `thumb_${randomUUID().slice(0, 8)}.jpg`;
    const outPath = path.join(OUTPUT_DIR, filename);
    try {
      await extractFrame(srcPath, srcTime, outPath);
      thumbs.push({ ...cand, url: `/thumbs/${filename}`, cap: captions[i] ?? DEFAULT_CAPS[i] });
    } catch (err) {
      thumbs.push({ ...cand, url: null, cap: captions[i] ?? DEFAULT_CAPS[i] });
    }
  }

  res.json({ thumbs });
});

// ── GET /thumbs/:filename — serve extracted JPEG ──────────────────────────
app.get('/thumbs/:filename', (req, res) => {
  const filename = req.params.filename;
  if (!filename.endsWith('.jpg')) return res.status(400).end();
  const p = path.join(OUTPUT_DIR, filename);
  if (!existsSync(p)) return res.status(404).end();
  res.setHeader('Content-Type', 'image/jpeg');
  res.sendFile(p);
});

// ── POST /render ───────────────────────────────────────────────────────────
app.post('/render', (req, res) => {
  const config = req.body ?? {};
  const videoClip = (config.clips ?? []).find(c => c.type === 'video');
  if (!videoClip) return res.status(400).json({ error: 'No video clip in config' });

  const [trimIn, trimOut] = videoClip.trim ?? [0, 10];
  const speed       = videoClip.speed ?? 1;
  const totalFrames = Math.round((config.fps ?? 30) * (trimOut - trimIn) / speed);

  const jobId      = randomUUID();
  const outputPath = path.join(OUTPUT_DIR, `${jobId}.mp4`);
  const stages     = ['Parsing config.json', `FFmpeg · encoding ${totalFrames} frames`];

  jobs.set(jobId, { config, totalFrames, stages, outputPath, stage: 0, framesRendered: 0, done: false, error: null });
  startRender(jobId, config, outputPath);

  res.json({ jobId, totalFrames, stages });
});

// ── Real FFmpeg render ─────────────────────────────────────────────────────
async function startRender(jobId, config, outputPath) {
  const job = jobs.get(jobId);
  if (!job) return;

  await new Promise(r => setTimeout(r, 500)); // "Parsing" stage
  if (!jobs.has(jobId)) return;
  job.stage = 1;

  const videoClip = config.clips.find(c => c.type === 'video');
  const srcPath   = path.join(__dirname, 'public', videoClip.src);
  if (!existsSync(srcPath)) { job.error = `Source file not found: ${videoClip.src}`; return; }

  let { args } = buildFFmpegArgs(config, outputPath);

  const proc = spawn('ffmpeg', args);

  let buf = '';
  proc.stdout.on('data', chunk => {
    buf += chunk.toString();
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (line.startsWith('frame=')) {
        const n = parseInt(line.slice(6), 10);
        if (!isNaN(n)) job.framesRendered = n;
      } else if (line.startsWith('progress=end')) {
        job.done = true;
      }
    }
  });

  let stderrBuf = '';
  proc.stderr.on('data', chunk => { stderrBuf += chunk.toString(); });

  proc.on('close', code => {
    if (code === 0) {
      job.done = true;
      job.framesRendered = job.totalFrames;
    } else {
      // Surface the last meaningful ffmpeg error line
      const errLine = stderrBuf.trim().split('\n').filter(l => l.trim()).pop() ?? `FFmpeg exited ${code}`;
      job.error = errLine;
    }
  });
}

// ── GET /render/:jobId/events — SSE progress stream ───────────────────────
app.get('/render/:jobId/events', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = data => res.write(`data: ${JSON.stringify(data)}\n\n`);

  const timer = setInterval(() => {
    if (job.error) {
      clearInterval(timer);
      send({ type: 'error', message: job.error });
      res.end();
      return;
    }
    if (job.done) {
      clearInterval(timer);
      let fileSize = null;
      try { fileSize = fmtBytes(statSync(job.outputPath).size); } catch (_) {}
      send({ type: 'done', downloadUrl: `/render/${req.params.jobId}/download`, previewUrl: `/render/${req.params.jobId}/preview`, fileSize });
      res.end();
      return;
    }
    const { stage, framesRendered, totalFrames, stages } = job;
    const progress = stage === 0 ? 0.02 : Math.min(0.98, framesRendered / Math.max(1, totalFrames));
    send({ type: 'progress', stage, stageName: stages[stage], frame: framesRendered, totalFrames, progress });
  }, 100);

  req.on('close', () => clearInterval(timer));
});

// ── GET /render/:jobId/download ────────────────────────────────────────────
app.get('/render/:jobId/download', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!job.done) return res.status(202).json({ error: 'Not ready yet' });
  res.setHeader('Content-Disposition', 'attachment; filename="ProductDemo.mp4"');
  res.setHeader('Content-Type', 'video/mp4');
  res.sendFile(job.outputPath);
});

// ── GET /render/:jobId/preview — inline for <video> ───────────────────────
app.get('/render/:jobId/preview', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!job.done) return res.status(202).json({ error: 'Not ready yet' });
  res.setHeader('Content-Type', 'video/mp4');
  res.sendFile(job.outputPath);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Render server on http://localhost:${PORT}`));
