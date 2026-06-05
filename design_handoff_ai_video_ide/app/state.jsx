// state.jsx — config model, serializer, line-diff, and the scripted AI agent.
// Single source of truth: everything (preview, timeline, code) derives from `state`.

// ---------------------------------------------------------------- initial state
const INITIAL = {
  meta: { composition: "ProductDemo", fps: 30, size: [1920, 1080], duration: 34 },
  items: [
    { id: "v1", type: "video", track: "screen", label: "screen-recording.mp4",
      start: 0, end: 30, trim: [4.0, 38.5], speed: 1.0, volume: 0.8 },
    { id: "z1", type: "zoom", track: "zoom", label: "zoom 1.6×",
      start: 12.5, end: 16.5, scale: 1.6, focus: [0.62, 0.34] },
    { id: "t1", type: "text", track: "text", label: "title-card",
      start: 1, end: 4, value: "Ship faster with Acme", preset: "title-card" },
    { id: "a1", type: "voice", track: "voice", label: "voiceover.mp3",
      start: 8, end: 30, src: "voiceover.mp3", volume: 1.0 },
    { id: "m1", type: "music", track: "music", label: "bed.mp3",
      start: 0, end: 34, src: "bed.mp3", volume: 0.2 },
  ],
};

const TRACK_ORDER = ["screen", "zoom", "text", "voice", "music"];
const TRACK_LABEL = { screen: "Screen", zoom: "Zoom", text: "Text", voice: "Voice", music: "Music" };

// ---------------------------------------------------------------- helpers
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round = (v, d = 2) => { const m = 10 ** d; return Math.round(v * m) / m; };
const uid = (p) => p + Math.random().toString(36).slice(2, 6);
const fmtTime = (s) => {
  s = Math.max(0, s);
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};
const deepClone = (s) => JSON.parse(JSON.stringify(s));

// ---------------------------------------------------------------- serializer
// Builds the Remotion-style config object with deterministic key order, then
// pretty-prints it. Clean key order => clean diffs.
function buildConfig(state) {
  const order = { video: 0, color: 1, zoom: 2, text: 3, transition: 4 };
  const clips = state.items
    .filter((i) => ["video", "color", "zoom", "text", "transition"].includes(i.type))
    .slice()
    .sort((a, b) => (a.start - b.start) || ((order[a.type] ?? 9) - (order[b.type] ?? 9)));
  const audio = state.items.filter((i) => ["voice", "music"].includes(i.type));

  const clipObj = (i) => {
    if (i.type === "video") return { id: i.id, type: "video", src: i.label, trim: [round(i.trim[0]), round(i.trim[1])], speed: i.speed, volume: i.volume };
    if (i.type === "zoom") return { type: "zoom", at: round(i.start), dur: round(i.end - i.start), scale: i.scale, focus: i.focus.map((f) => round(f)) };
    if (i.type === "text") return { type: "text", at: round(i.start), dur: round(i.end - i.start), value: i.value, preset: i.preset };
    if (i.type === "color") return { type: "color", at: round(i.start), dur: round(i.end - i.start), color: i.color, value: i.value || undefined };
    if (i.type === "transition") return { type: "transition", at: round(i.start), kind: i.kind, dur: round(i.end - i.start) };
    return {};
  };
  const audObj = (i) => ({ type: i.type, src: i.src, at: round(i.start), dur: round(i.end - i.start), volume: i.volume });

  return {
    composition: state.meta.composition,
    fps: state.meta.fps,
    size: state.meta.size,
    duration: round(state.meta.duration),
    clips: clips.map(clipObj),
    audio: audio.map(audObj),
  };
}
const serialize = (state) => JSON.stringify(buildConfig(state), null, 2);

// ---------------------------------------------------------------- JSON highlight
const HL_RE = /("(?:[^"\\]|\\.)*")(\s*:)|("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?)|(true|false|null)|([{}\[\],:])/g;
function highlightLine(line) {
  const out = []; let last = 0, m, i = 0;
  while ((m = HL_RE.exec(line))) {
    if (m.index > last) out.push(<span key={i++}>{line.slice(last, m.index)}</span>);
    if (m[1] !== undefined) { out.push(<span key={i++} className="tok-k">{m[1]}</span>); out.push(<span key={i++} className="tok-p">{m[2]}</span>); }
    else if (m[3] !== undefined) out.push(<span key={i++} className="tok-s">{m[3]}</span>);
    else if (m[4] !== undefined) out.push(<span key={i++} className="tok-n">{m[4]}</span>);
    else if (m[5] !== undefined) out.push(<span key={i++} className="tok-b">{m[5]}</span>);
    else if (m[6] !== undefined) out.push(<span key={i++} className="tok-p">{m[6]}</span>);
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push(<span key={i++}>{line.slice(last)}</span>);
  return out;
}

// ---------------------------------------------------------------- line diff (LCS)
function diffLines(aStr, bStr) {
  const a = aStr.split("\n"), b = bStr.split("\n");
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops = []; let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push({ t: "ctx", text: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ t: "del", text: a[i] }); i++; }
    else { ops.push({ t: "add", text: b[j] }); j++; }
  }
  while (i < n) ops.push({ t: "del", text: a[i++] });
  while (j < m) ops.push({ t: "add", text: b[j++] });
  return ops;
}
// Trim a diff to a compact window around the changed hunks (for diff cards).
function diffWindow(ops, pad = 2) {
  const changed = ops.map((o, i) => (o.t !== "ctx" ? i : -1)).filter((i) => i >= 0);
  if (!changed.length) return [];
  const lo = Math.max(0, changed[0] - pad), hi = Math.min(ops.length - 1, changed[changed.length - 1] + pad);
  return ops.slice(lo, hi + 1);
}

// ---------------------------------------------------------------- the AI agent
// Each intent: keyword test, a friendly reply, and a `patch(state) -> newState`.
// The diff card is computed from serialize(before) vs serialize(after), so the
// proposed change is always exactly what gets applied.
const INTENTS = [
  {
    id: "trim",
    chip: "Trim the dead air at the start",
    test: /(trim|dead air|cut.*(start|begin|intro)|tighten the (start|intro))/i,
    reply: () => "Trimmed the silent intro — moved the screen clip’s in-point to 6.0s so it starts on the first click. Tightened the whole timeline by ~2s.",
    loc: "clips[0] · video",
    patch: (s) => {
      const n = deepClone(s);
      const v = n.items.find((x) => x.id === "v1");
      v.trim = [6.0, 38.5];
      return n;
    },
  },
  {
    id: "title",
    chip: "Add an intro title card",
    test: /(title|add.*text|intro card|headline|caption)/i,
    reply: () => "Added a title card reading “Ship faster with Acme” for the first 3 seconds using the title-card preset.",
    loc: "clips · text",
    patch: (s) => {
      const n = deepClone(s);
      if (!n.items.some((x) => x.id === "t1"))
        n.items.push({ id: "t1", type: "text", track: "text", label: "title-card", start: 1, end: 4, value: "Ship faster with Acme", preset: "title-card" });
      return n;
    },
  },
  {
    id: "zoom",
    chip: "Zoom into the dashboard at 12s",
    test: /(zoom|punch in|close.?up|emphasi[sz]e)/i,
    reply: () => "Added a 1.6× zoom at 12.5s focused on the chart in the upper-right, holding for 4s before easing back out.",
    loc: "clips · zoom",
    patch: (s) => {
      const n = deepClone(s);
      if (!n.items.some((x) => x.id === "z1"))
        n.items.push({ id: "z1", type: "zoom", track: "zoom", label: "zoom 1.6×", start: 12.5, end: 16.5, scale: 1.6, focus: [0.62, 0.34] });
      return n;
    },
  },
  {
    id: "speed",
    chip: "Speed up the slow middle section 1.5×",
    test: /(speed|faster|1\.5|2x|ramp|fast.?forward)/i,
    reply: () => "Set the screen clip to 1.5× — the form-filling section in the middle now moves quickly. Audio pitch is preserved.",
    loc: "clips[0] · video.speed",
    patch: (s) => { const n = deepClone(s); n.items.find((x) => x.id === "v1").speed = 1.5; return n; },
  },
  {
    id: "outro",
    chip: "Add a solid-color outro card",
    test: /(outro|color (card|screen)|solid|end card|cta card)/i,
    reply: () => "Added a solid indigo outro card from 31–34s with a “Start your free trial” call-to-action.",
    loc: "clips · color",
    patch: (s) => {
      const n = deepClone(s);
      if (!n.items.some((x) => x.id === "col1"))
        n.items.push({ id: "col1", type: "color", track: "text", label: "outro · CTA", start: 31, end: 34, color: "#3d2fb8", value: "Start your free trial" });
      return n;
    },
  },
  {
    id: "transition",
    chip: "Add a crossfade before the outro",
    test: /(transition|crossfade|fade|dissolve|wipe)/i,
    reply: () => "Added a 0.6s crossfade at 30.5s so the screen recording dissolves into the outro card.",
    loc: "clips · transition",
    patch: (s) => {
      const n = deepClone(s);
      if (!n.items.some((x) => x.id === "tr1"))
        n.items.push({ id: "tr1", type: "transition", track: "zoom", label: "crossfade", start: 30.5, end: 31.1, kind: "crossfade" });
      return n;
    },
  },
  {
    id: "music",
    chip: "Lower the music under the voiceover",
    test: /(music|background|bed|duck|quieter|lower.*volume)/i,
    reply: () => "Ducked the music bed to 0.12 so the voiceover sits clearly on top.",
    loc: "audio[1] · music.volume",
    patch: (s) => { const n = deepClone(s); n.items.find((x) => x.id === "m1").volume = 0.12; return n; },
  },
  {
    id: "voice",
    chip: "Match the voiceover to the cuts",
    test: /(voice ?over|voiceover|narration|sync.*voice|match.*voice)/i,
    special: "voiceover",
    reply: () => "I aligned the voiceover to the new edit — nudged it to start at 6.5s so narration lands with the first click, and stretched the last line to cover the outro.",
    loc: "audio[0] · voice",
    patch: (s) => { const n = deepClone(s); const a = n.items.find((x) => x.id === "a1"); a.start = 6.5; a.end = 33; return n; },
  },
  {
    id: "thumb",
    chip: "Generate a thumbnail",
    test: /(thumbnail|cover|poster frame)/i,
    special: "thumbnail",
    reply: () => "Pulled three high-motion frames and generated thumbnail options with bold captions — pick one in the panel.",
    loc: null,
    patch: null,
  },
];

function matchIntent(text) {
  return INTENTS.find((it) => it.test.test(text)) || null;
}

Object.assign(window, {
  INITIAL, TRACK_ORDER, TRACK_LABEL, INTENTS,
  clamp, round, uid, fmtTime, deepClone,
  serialize, buildConfig, highlightLine, diffLines, diffWindow, matchIntent,
});
