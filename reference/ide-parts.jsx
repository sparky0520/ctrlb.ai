// ide-parts.jsx — shared, styled mockup pieces for the AI video-editing IDE.
// Pure presentational React components used by the layout-exploration canvas.
// Exports to window at the end.

// ---- tiny inline icons (simple shapes only) -------------------------------
const Play = ({s=12}) => (
  <svg width={s} height={s} viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 1.5 L10 6 L2.5 10.5 Z" fill="currentColor"/></svg>
);
const Square = ({s=10}) => (
  <svg width={s} height={s} viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="2" width="8" height="8" rx="1.5" fill="currentColor"/></svg>
);
const Spark = ({s=12}) => (
  <svg width={s} height={s} viewBox="0 0 12 12" aria-hidden="true"><path d="M6 0.6 L7.1 4.9 L11.4 6 L7.1 7.1 L6 11.4 L4.9 7.1 L0.6 6 L4.9 4.9 Z" fill="currentColor"/></svg>
);
const Mark = ({s=16}) => (
  <svg width={s} height={s} viewBox="0 0 16 16" aria-hidden="true">
    <rect x="1" y="1" width="14" height="14" rx="4" fill="none" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M6 5 L11 8 L6 11 Z" fill="currentColor"/>
  </svg>
);

// ---- JSON syntax highlighter ----------------------------------------------
const HL_RE = /("(?:[^"\\]|\\.)*")(\s*:)|("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?)|(true|false|null)|([{}\[\],:])/g;
function highlightLine(line, key) {
  const out = [];
  let last = 0, m, i = 0;
  while ((m = HL_RE.exec(line))) {
    if (m.index > last) out.push(<span key={i++}>{line.slice(last, m.index)}</span>);
    if (m[1] !== undefined) {
      out.push(<span key={i++} className="tok-k">{m[1]}</span>);
      out.push(<span key={i++} className="tok-p">{m[2]}</span>);
    } else if (m[3] !== undefined) out.push(<span key={i++} className="tok-s">{m[3]}</span>);
    else if (m[4] !== undefined) out.push(<span key={i++} className="tok-n">{m[4]}</span>);
    else if (m[5] !== undefined) out.push(<span key={i++} className="tok-b">{m[5]}</span>);
    else if (m[6] !== undefined) out.push(<span key={i++} className="tok-p">{m[6]}</span>);
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push(<span key={i++}>{line.slice(last)}</span>);
  return out;
}

const CONFIG = `{
  "composition": "ProductDemo",
  "fps": 30,
  "size": [1920, 1080],
  "clips": [
    {
      "id": "screen",
      "src": "screen-recording.mp4",
      "trim": [4.0, 38.5],
      "speed": 1.0,
      "volume": 0.8
    },
    {
      "type": "zoom",
      "at": 12.5,
      "scale": 1.6,
      "focus": [0.62, 0.34]
    },
    {
      "type": "text",
      "value": "Ship faster with Acme",
      "at": 1.0,
      "dur": 3.0,
      "preset": "title-card"
    }
  ]
}`;

function CodeJSON({ code = CONFIG, start = 1 }) {
  const lines = code.split("\n");
  return (
    <div className="code">
      <div className="code-gutter">
        {lines.map((_, i) => <div key={i}>{start + i}</div>)}
      </div>
      <div className="code-body">
        {lines.map((ln, i) => (
          <div className="code-line" key={i}>{highlightLine(ln, i)}</div>
        ))}
      </div>
    </div>
  );
}

// ---- top bar ---------------------------------------------------------------
function TopBar() {
  return (
    <div className="topbar">
      <div className="tb-grp">
        <div className="logo"><Mark/></div>
        <span className="crumb">acme-demo</span>
        <span className="crumb-sep">/</span>
        <span className="crumb cur">ProductDemo.video</span>
      </div>
      <div className="tb-mid">1920×1080 · 30fps · 00:34</div>
      <div className="tb-grp end">
        <button className="btn ghost">Voiceover</button>
        <button className="btn ghost">Thumbnail</button>
        <button className="btn primary"><Play s={11}/> Render</button>
      </div>
    </div>
  );
}

// ---- preview ---------------------------------------------------------------
function Preview({ flush=false }) {
  return (
    <div className={"preview" + (flush ? " flush" : "")}>
      <div className="pv-stage">
        <div className="pv-screen">
          <div className="pv-stripes"/>
          <div className="pv-tag">screen-recording.mp4</div>
          <div className="pv-zoom"/>
          <div className="pv-title">Ship faster with Acme</div>
        </div>
      </div>
      <div className="pv-ctrl">
        <button className="ic"><Play/></button>
        <span className="time">00:12<span className="sep"> / </span>00:34</span>
        <div className="scrub"><div className="scrub-fill"/><div className="scrub-knob"/></div>
        <span className="pill">1.0×</span>
        <span className="pill">vol 80</span>
      </div>
    </div>
  );
}

// ---- timeline --------------------------------------------------------------
const TRACKS = [
  { name: "Screen", cls: "vid", segs: [{ l: 2, w: 58, label: "screen-recording", thumbs: true }] },
  { name: "Zoom",   cls: "zoom", segs: [{ l: 30, w: 14, label: "1.6×" }] },
  { name: "Text",   cls: "text", segs: [{ l: 4, w: 9, label: "title-card" }, { l: 46, w: 11, label: "lower-third" }] },
  { name: "Voice",  cls: "voice", segs: [{ l: 8, w: 50, label: "voiceover.mp3", wave: true }] },
  { name: "Music",  cls: "music", segs: [{ l: 2, w: 86, label: "bed.mp3", wave: true }] },
];
function Timeline({ compact=false }) {
  return (
    <div className={"timeline" + (compact ? " compact" : "")}>
      <div className="tl-ruler">
        {Array.from({ length: 13 }).map((_, i) => (
          <div className="tick" key={i}><span>{String(i*3).padStart(2,"0")}:00</span></div>
        ))}
      </div>
      <div className="tl-body">
        <div className="tl-playhead" style={{ left: "34%" }}><div className="ph-head"/></div>
        {TRACKS.map((t) => (
          <div className="tl-row" key={t.name}>
            <div className="tl-name">{t.name}</div>
            <div className="tl-lane">
              {t.segs.map((s, i) => (
                <div key={i} className={"seg " + t.cls} style={{ left: s.l + "%", width: s.w + "%" }}>
                  {s.thumbs && <div className="seg-thumbs"/>}
                  {s.wave && <div className="seg-wave"/>}
                  <span className="seg-label">{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- code panel ------------------------------------------------------------
function CodePanel({ tabs=["config.json","video.mp4"], active=0, code, start }) {
  return (
    <div className="panel code-panel">
      <div className="panel-tabs">
        {tabs.map((t, i) => (
          <div key={t} className={"tab" + (i===active ? " on" : "")}>
            <span className={"dot " + (i===0 ? "edit" : "lock")}/>{t}
          </div>
        ))}
        <div className="tabs-spacer"/>
        <span className="tab-meta">JSON</span>
      </div>
      <CodeJSON code={code} start={start}/>
    </div>
  );
}

// ---- chat panel ------------------------------------------------------------
function ChatPanel({ compact=false }) {
  return (
    <div className={"panel chat" + (compact ? " compact" : "")}>
      <div className="panel-head">
        <span className="ph-title"><Spark s={12}/> Agent</span>
        <span className="ph-sub">edits config.json</span>
      </div>
      <div className="ch-scroll">
        <div className="msg user"><div className="bub">Trim the dead air at the start and add a title card.</div></div>
        <div className="msg ai">
          <div className="bub">
            Done. Trimmed <b>0–4.0s</b> off the screen clip and added a <b>title-card</b> reading
            “Ship faster with Acme” for 3s.
            <div className="diffchip"><span className="add">+6</span><span className="del">−1</span> config.json</div>
          </div>
        </div>
        <div className="msg user"><div className="bub">Zoom into the dashboard around 12s.</div></div>
        <div className="msg ai">
          <div className="bub">
            Added a <b>1.6×</b> zoom at 12.5s focused on the chart.
            <div className="diffchip"><span className="add">+6</span> config.json</div>
          </div>
        </div>
      </div>
      <div className="ch-input">
        <div className="ci-box">
          <span className="ci-ph">Ask the agent to edit your video…</span>
          <button className="ci-send"><Spark s={11}/></button>
        </div>
        <div className="ci-foot"><span className="kbd">⌘K</span> commands · <span className="ctx">@screen-recording.mp4</span></div>
      </div>
    </div>
  );
}

// ---- diff-card chat (for AI-first layout) ---------------------------------
function ChatDiff() {
  return (
    <div className="panel chat diffmode">
      <div className="panel-head">
        <span className="ph-title"><Spark s={12}/> Agent</span>
        <span className="ph-sub">review &amp; apply</span>
      </div>
      <div className="ch-scroll">
        <div className="msg user"><div className="bub">Add a title card and zoom into the chart at 12s.</div></div>
        <div className="msg ai">
          <div className="bub">Proposing two edits to <b>config.json</b>:</div>
        </div>
        <div className="diffcard">
          <div className="dc-head"><span>config.json</span><span className="dc-loc">clips[2] · text</span></div>
          <div className="dc-body">
            <div className="dl add"><span className="g">+</span>{highlightLine('  "type": "text",')}</div>
            <div className="dl add"><span className="g">+</span>{highlightLine('  "value": "Ship faster with Acme",')}</div>
            <div className="dl add"><span className="g">+</span>{highlightLine('  "preset": "title-card"')}</div>
          </div>
          <div className="dc-actions"><button className="btn tiny ghost">Reject</button><button className="btn tiny primary">Apply</button></div>
        </div>
        <div className="diffcard">
          <div className="dc-head"><span>config.json</span><span className="dc-loc">clips[1] · zoom</span></div>
          <div className="dc-body">
            <div className="dl add"><span className="g">+</span>{highlightLine('  "scale": 1.6,')}</div>
            <div className="dl add"><span className="g">+</span>{highlightLine('  "focus": [0.62, 0.34]')}</div>
          </div>
          <div className="dc-actions"><button className="btn tiny ghost">Reject</button><button className="btn tiny primary">Apply</button></div>
        </div>
      </div>
      <div className="ch-input">
        <div className="ci-box"><span className="ci-ph">Ask the agent…</span><button className="ci-send"><Spark s={11}/></button></div>
      </div>
    </div>
  );
}

// ---- asset rail (for studio layout) ---------------------------------------
function Rail() {
  const groups = [
    { h: "Clips", items: [["vid","screen-recording.mp4"],["vid","b-roll-01.mp4"]] },
    { h: "Audio", items: [["voice","voiceover.mp3"],["music","bed.mp3"]] },
    { h: "Generated", items: [["text","thumbnail.png"],["zoom","title-card"]] },
  ];
  return (
    <div className="rail">
      <div className="rail-head">Assets</div>
      {groups.map((g) => (
        <div className="rail-grp" key={g.h}>
          <div className="rail-h">{g.h}</div>
          {g.items.map(([c, n]) => (
            <div className="rail-item" key={n}><span className={"chip " + c}/>{n}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { TopBar, Preview, Timeline, CodePanel, ChatPanel, ChatDiff, Rail, CodeJSON, Play, Spark, Mark });
