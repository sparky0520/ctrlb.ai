// modals.jsx — top bar + Render, Thumbnail generator, and Voiceover modals.
import { useState, useEffect, useRef } from 'react';
import { fmtTime, buildConfig } from './state.jsx';
import { Spark } from './chat.jsx';

function Mark({ s = 17 }) {
  return <svg width={s} height={s} viewBox="0 0 16 16" aria-hidden="true">
    <rect x="1" y="1" width="14" height="14" rx="4" fill="none" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M6 5 L11 8 L6 11 Z" fill="currentColor"/></svg>;
}

export function TopBar({ meta, dur, dirty, onRender, onThumb, onVoice, canUndo, onUndo }) {
  return (
    <div className="topbar">
      <div className="tb-grp">
        <div className="logo"><Mark/></div>
        <span className="crumb">acme-demo</span>
        <span className="crumb-sep">/</span>
        <span className="crumb cur">{meta.composition}.video</span>
        {dirty && <span className="dirty" title="Unsaved edits to config">●</span>}
      </div>
      <div className="tb-mid">{meta.size[0]}×{meta.size[1]} · {meta.fps}fps · {fmtTime(dur)}</div>
      <div className="tb-grp end">
        <button className="btn ghost icon" disabled={!canUndo} onClick={onUndo} title="Undo">
          <svg width="13" height="13" viewBox="0 0 13 13"><path d="M4 3 L1.5 5.5 L4 8 M1.8 5.5 H8 a3.2 3.2 0 0 1 0 6.4 H5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <button className="btn ghost" onClick={onVoice}>Voiceover</button>
        <button className="btn ghost" onClick={onThumb}>Thumbnail</button>
        <button className="btn primary" onClick={onRender}>
          <svg width="11" height="11" viewBox="0 0 12 12"><path d="M2.5 1.5 L10 6 L2.5 10.5 Z" fill="currentColor"/></svg> Render
        </button>
      </div>
    </div>
  );
}

function Modal({ children, onClose, wide }) {
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className={"modal" + (wide ? " wide" : "")} onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

// ---- Render -----------------------------------------------------------------
export function RenderModal({ state, onClose }) {
  const [stage, setStage] = useState(0);
  const [prog, setProg] = useState(0);
  const [frame, setFrame] = useState(0);
  const [totalFrames, setTotalFrames] = useState(Math.round(state.meta.fps * state.meta.duration));
  const [stages, setStages] = useState(['Parsing config.json', `FFmpeg · encoding ${Math.round(state.meta.fps * state.meta.duration)} frames`]);
  const [done, setDone] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [fileSize, setFileSize] = useState(null);
  const [error, setError] = useState(null);
  const vidRef = useRef(null);
  const [vidPlaying, setVidPlaying] = useState(false);

  useEffect(() => {
    let es = null;

    fetch('/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildConfig(state)),
    })
      .then((r) => r.json())
      .then(({ jobId, totalFrames: tf, stages: sv }) => {
        if (tf) setTotalFrames(tf);
        if (sv) setStages(sv);
        es = new EventSource(`/render/${jobId}/events`);
        es.onmessage = (e) => {
          const data = JSON.parse(e.data);
          if (data.type === 'done') {
            setDone(true);
            setDownloadUrl(data.downloadUrl);
            setPreviewUrl(data.previewUrl);
            setFileSize(data.fileSize);
            es.close();
          } else if (data.type === 'error') {
            setError(data.message);
            es.close();
          } else {
            setStage(data.stage);
            setProg(data.progress);
            setFrame(data.frame);
            if (data.totalFrames) setTotalFrames(data.totalFrames);
          }
        };
        es.onerror = () => { setError('Connection to render server lost.'); es.close(); };
      })
      .catch((err) => setError(err.message));

    return () => es?.close();
  }, []);

  const togglePlay = () => {
    const el = vidRef.current;
    if (!el) return;
    if (vidPlaying) { el.pause(); setVidPlaying(false); }
    else { el.play().catch(() => {}); setVidPlaying(true); }
  };

  return (
    <Modal onClose={onClose}>
      <div className="md-head"><span className="md-title">{done ? "Render complete" : "Rendering…"}</span><button className="md-x" onClick={onClose}>✕</button></div>
      {error ? (
        <div className="md-body">
          <div className="render-error">{error}</div>
          <div className="render-actions"><button className="btn ghost" onClick={onClose}>Close</button></div>
        </div>
      ) : !done ? (
        <div className="md-body">
          <div className="render-prev"><div className="pv-stripes"/><div className="render-spin"/><div className="render-frame">frame {frame} / {totalFrames}</div></div>
          <div className="render-bar"><div className="render-fill" style={{ width: prog * 100 + "%" }}/></div>
          <div className="render-log">
            {stages.map((name, i) => {
              const suffix = i === stage && i > 0 ? ` — ${frame}/${totalFrames}` : "";
              return (
                <div key={i} className={"rl " + (i < stage ? "done" : i === stage ? "cur" : "wait")}>
                  <span className="rl-dot"/>{name}{suffix}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="md-body">
          <div className="render-prev done" onClick={togglePlay} style={{ cursor: 'pointer' }}>
            {previewUrl
              ? <video ref={vidRef} src={previewUrl} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} onEnded={() => setVidPlaying(false)} playsInline/>
              : <><div className="pv-stripes"/><div className="pv-text title-card">Ship faster with Acme</div></>
            }
            {!vidPlaying && (
              <div className="render-play">
                <svg width="22" height="22" viewBox="0 0 12 12"><path d="M2.5 1.5 L10 6 L2.5 10.5 Z" fill="#fff"/></svg>
              </div>
            )}
          </div>
          <div className="render-meta">
            <div><b>ProductDemo.mp4</b><span>{state.meta.size[0]}×{state.meta.size[1]} · {state.meta.fps}fps · {fmtTime(state.meta.duration)} · H.264{fileSize ? ` · ${fileSize}` : ''}</span></div>
          </div>
          <div className="render-actions"><button className="btn ghost" onClick={onClose}>Close</button><a className="btn primary" href={downloadUrl} download="ProductDemo.mp4">Download .mp4</a></div>
        </div>
      )}
    </Modal>
  );
}

// ---- Thumbnail generator ----------------------------------------------------
const THUMBS = [
  { id: 0, cap: "Ship faster\nwith Acme", pos: "bl", accent: "#3d7eff", frame: "00:12" },
  { id: 1, cap: "We rebuilt\nour workflow", pos: "center", accent: "#1f8a5b", frame: "00:21" },
  { id: 2, cap: "From 30 min\n→ 30 sec", pos: "br", accent: "#e0a93d", frame: "00:27" },
];
export function ThumbModal({ onClose, onPick }) {
  const [sel, setSel] = useState(0);
  return (
    <Modal onClose={onClose} wide>
      <div className="md-head"><span className="md-title"><Spark s={13}/> Thumbnail generator</span><button className="md-x" onClick={onClose}>✕</button></div>
      <div className="md-sub">Three high-motion frames pulled from the render, captioned automatically.</div>
      <div className="md-body">
        <div className="thumb-grid">
          {THUMBS.map((t) => (
            <button key={t.id} className={"thumb " + (sel === t.id ? "sel" : "")} onClick={() => setSel(t.id)}>
              <div className="th-img"><div className="pv-stripes"/><div className="th-frame">{t.frame}</div>
                <div className={"th-cap " + t.pos} style={{ "--ac": t.accent }}>{t.cap.split("\n").map((l, i) => <div key={i}>{l}</div>)}</div>
              </div>
              <div className="th-foot">{sel === t.id ? <span className="th-on">✓ selected</span> : "Option " + (t.id + 1)}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="render-actions"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => onPick(sel)}>Use thumbnail</button></div>
    </Modal>
  );
}

// ---- Voiceover --------------------------------------------------------------
export function VoiceModal({ state, onClose, onMatch }) {
  const voice = state.items.find((i) => i.type === "voice");
  const dur = state.meta.duration;
  const cuts = [6, 12.5, 19, 24, 30.5];
  return (
    <Modal onClose={onClose} wide>
      <div className="md-head"><span className="md-title"><Spark s={13}/> Voiceover matching</span><button className="md-x" onClick={onClose}>✕</button></div>
      <div className="md-sub">The agent aligns narration to your cuts and the new edit length.</div>
      <div className="md-body">
        <div className="vo-track">
          <div className="vo-label">video cuts</div>
          <div className="vo-lane">{cuts.map((c, i) => <div key={i} className="vo-cut" style={{ left: c / dur * 100 + "%" }}/>)}</div>
        </div>
        <div className="vo-track">
          <div className="vo-label">voiceover.mp3</div>
          <div className="vo-lane">
            <div className="vo-clip" style={{ left: voice.start / dur * 100 + "%", width: (voice.end - voice.start) / dur * 100 + "%" }}>
              <div className="seg-wave"/><span>voiceover.mp3 · {fmtTime(voice.end - voice.start)}</span>
            </div>
          </div>
        </div>
        <div className="vo-note">Detected <b>5 cut points</b>. Narration currently starts at {voice.start.toFixed(1)}s — first click lands at 6.5s.</div>
      </div>
      <div className="render-actions"><button className="btn ghost" onClick={onClose}>Close</button><button className="btn primary" onClick={onMatch}>Re-match with AI</button></div>
    </Modal>
  );
}
