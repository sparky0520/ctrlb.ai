import express from 'express';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import { mkdirSync, existsSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, 'output');
if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

const app = express();
app.use(express.json({ limit: '1mb' }));

// jobId → { totalFrames, stages, outputPath, stage, framesRendered, done, error }
const jobs = new Map();

function fmtBytes(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + ' GB';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + ' MB';
  return (n / 1e3).toFixed(0) + ' KB';
}

// ── POST /render ───────────────────────────────────────────────────────────
app.post('/render', (req, res) => {
  const config = req.body ?? {};
  const fps = config.fps ?? 30;
  const videoClip = (config.clips ?? []).find((c) => c.type === 'video');

  if (!videoClip) return res.status(400).json({ error: 'No video clip in config' });

  const [trimIn, trimOut] = videoClip.trim ?? [0, 10];
  const speed = videoClip.speed ?? 1;
  const clipDuration = (trimOut - trimIn) / speed;
  const totalFrames = Math.round(fps * clipDuration);

  const jobId = randomUUID();
  const outputPath = path.join(OUTPUT_DIR, `${jobId}.mp4`);
  const stages = [
    'Parsing config.json',
    `FFmpeg · encoding ${totalFrames} frames`,
  ];

  jobs.set(jobId, { config, totalFrames, stages, outputPath, stage: 0, framesRendered: 0, done: false, error: null });

  startRender(jobId, videoClip, fps, trimIn, clipDuration, outputPath);

  res.json({ jobId, totalFrames, stages });
});

// ── Real FFmpeg render ─────────────────────────────────────────────────────
async function startRender(jobId, videoClip, fps, trimIn, clipDuration, outputPath) {
  const job = jobs.get(jobId);
  if (!job) return;

  // Brief pause for "Parsing config.json" stage
  await new Promise((r) => setTimeout(r, 500));
  if (!jobs.has(jobId)) return; // cancelled
  job.stage = 1;

  const srcPath = path.join(__dirname, 'public', videoClip.src);
  if (!existsSync(srcPath)) {
    job.error = `Source file not found: ${videoClip.src}`;
    return;
  }

  const speed = videoClip.speed ?? 1;
  const volume = videoClip.volume ?? 1;

  // Video filter
  const vf = speed !== 1 ? `setpts=${1 / speed}*PTS` : null;

  // Audio filter — clamp atempo to 0.5–2.0 range (chain if needed)
  const buildAtempo = (s) => {
    if (s >= 0.5 && s <= 2) return `atempo=${s}`;
    if (s > 2) return `atempo=2.0,atempo=${(s / 2).toFixed(3)}`;
    return `atempo=0.5,atempo=${(s * 2).toFixed(3)}`;
  };
  const afParts = [];
  if (volume !== 1) afParts.push(`volume=${volume}`);
  if (speed !== 1) afParts.push(buildAtempo(speed));

  const args = [
    '-ss', String(trimIn),
    '-t',  String(clipDuration),
    '-i',  srcPath,
    ...(vf ? ['-vf', vf] : []),
    ...(afParts.length ? ['-af', afParts.join(',')] : []),
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
    '-c:a', 'aac',
    '-movflags', '+faststart',
    '-progress', 'pipe:1',
    '-loglevel', 'error',
    '-y',
    outputPath,
  ];

  const proc = spawn('ffmpeg', args);

  let buf = '';
  proc.stdout.on('data', (chunk) => {
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

  proc.stderr.on('data', (chunk) => {
    // Capture stderr for error reporting
    const text = chunk.toString();
    if (text.includes('Error') || text.includes('error')) {
      job.error = text.trim().split('\n').pop();
    }
  });

  proc.on('close', (code) => {
    if (code === 0) {
      job.done = true;
      job.framesRendered = job.totalFrames;
    } else if (!job.error) {
      job.error = `FFmpeg exited with code ${code}`;
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

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

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

// ── GET /render/:jobId/download — download with attachment header ──────────
app.get('/render/:jobId/download', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!job.done) return res.status(202).json({ error: 'Not ready yet' });
  res.setHeader('Content-Disposition', 'attachment; filename="ProductDemo.mp4"');
  res.setHeader('Content-Type', 'video/mp4');
  res.sendFile(job.outputPath);
});

// ── GET /render/:jobId/preview — inline for <video> playback ─────────────
app.get('/render/:jobId/preview', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!job.done) return res.status(202).json({ error: 'Not ready yet' });
  res.setHeader('Content-Type', 'video/mp4');
  res.sendFile(job.outputPath);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Render server on http://localhost:${PORT}`));
