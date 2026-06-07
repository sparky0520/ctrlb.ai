// preview.jsx — read-only render surface + transport. Reflects `state` at `time`.
import { useRef, useEffect, useState } from 'react';
import { clamp, fmtTime } from './state.jsx';

const RATIOS = [
  { label: '16:9', size: [1920, 1080] },
  { label: '9:16', size: [1080, 1920] },
  { label: '1:1',  size: [1080, 1080] },
  { label: '4:3',  size: [1440, 1080] },
];

export function activeItems(state, t) {
  return state.items.filter((i) => t >= i.start && t < i.end);
}

export function Preview({ state, time, playing, onVideoSize }) {
  const act = activeItems(state, time);
  const zoom = act.find((i) => i.type === "zoom");
  const text = act.find((i) => i.type === "text");
  const color = act.find((i) => i.type === "color");
  const trans = act.find((i) => i.type === "transition");
  const v = state.items.find((i) => i.type === "video");

  const videoRef = useRef(null);
  // Keep a ref so effects can read the current mapped time without re-subscribing
  const vtRef = useRef(0);
  if (v) vtRef.current = clamp(v.trim[0] + (time - v.start) * v.speed, v.trim[0], v.trim[1]);

  // Seek to current position while paused (handles scrubbing)
  useEffect(() => {
    const el = videoRef.current;
    if (!el || playing) return;
    el.currentTime = vtRef.current;
  }, [time, playing]);

  // Keep volume in sync with config
  useEffect(() => {
    if (videoRef.current && v) videoRef.current.volume = clamp(v.volume, 0, 1);
  }, [v?.volume]);

  // Keep playback rate in sync with config
  useEffect(() => {
    if (videoRef.current && v) videoRef.current.playbackRate = v.speed ?? 1;
  }, [v?.speed]);

  // Play / pause
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (playing) {
      el.currentTime = vtRef.current;
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [playing]);

  let transform = "scale(1)";
  if (zoom) {
    const fx = (zoom.focus[0] - 0.5) * -100 * (zoom.scale - 1) / zoom.scale;
    const fy = (zoom.focus[1] - 0.5) * -100 * (zoom.scale - 1) / zoom.scale;
    transform = `scale(${zoom.scale}) translate(${fx}%, ${fy}%)`;
  }

  return (
    <div className="preview">
      <div className="pv-stage">
        <div className="pv-screen" style={{ aspectRatio: `${state.meta.size[0]}/${state.meta.size[1]}` }}>
          <div className="pv-cam" style={{ transform }}>
            {v ? (
              <video
                ref={videoRef}
                src={v.label}
                playsInline
                preload="auto"
                onLoadedMetadata={(e) => onVideoSize?.([e.target.videoWidth, e.target.videoHeight])}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
              />
            ) : (
              <>
                <div className="pv-stripes"/>
                <div className="pv-mock">
                  <div className="mk-side"/>
                  <div className="mk-main">
                    <div className="mk-row"><span/><span/><span/></div>
                    <div className="mk-chart"><i style={{height:'40%'}}/><i style={{height:'70%'}}/><i style={{height:'55%'}}/><i style={{height:'90%'}}/><i style={{height:'62%'}}/></div>
                  </div>
                </div>
              </>
            )}
          </div>

          {zoom && <div className="pv-zoom" style={{ left: (zoom.focus[0]*100-15)+'%', top: (zoom.focus[1]*100-21)+'%' }} data-scale={zoom.scale.toFixed(1)+'×'}/>}

          {text && (
            <div className={"pv-text " + text.preset}>
              {text.value}
            </div>
          )}

          {color && (
            <div className="pv-color" style={{ background: color.color }}>
              {color.value && <div className="pv-color-cta">{color.value}<span className="cta-arrow">→</span></div>}
            </div>
          )}

          {trans && <div className="pv-trans"/>}

          <div className="pv-tag">{v ? v.label : ''} · {state.meta.size[0]}×{state.meta.size[1]}</div>
          <div className="pv-badge">{playing ? "▶ playing" : "paused"}</div>
        </div>
      </div>
    </div>
  );
}

export function Transport({ state, time, playing, onToggle, onSeek, onAspect, naturalSize }) {
  const dur = state.meta.duration;
  const barRef = useRef(null);
  const arRef = useRef(null);
  const [arOpen, setArOpen] = useState(false);

  const seekTo = (clientX) => {
    const r = barRef.current.getBoundingClientRect();
    onSeek(clamp((clientX - r.left) / r.width, 0, 1) * dur);
  };
  const onDown = (e) => {
    seekTo(e.clientX);
    const mv = (ev) => seekTo(ev.clientX);
    const up = () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
  };

  useEffect(() => {
    if (!arOpen) return;
    const close = (e) => { if (arRef.current && !arRef.current.contains(e.target)) setArOpen(false); };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [arOpen]);

  const v = state.items.find((i) => i.id === "v1");
  const [w, h] = state.meta.size;
  const preset = RATIOS.find(r => r.size[0] === w && r.size[1] === h);
  const isFree = !preset && naturalSize && naturalSize[0] === w && naturalSize[1] === h;
  const curLabel = preset?.label ?? (isFree ? 'Free' : `${w}:${h}`);

  return (
    <div className="pv-ctrl">
      <button className="ic" onClick={onToggle} title="Space to play/pause">
        {playing
          ? <svg width="12" height="12" viewBox="0 0 12 12"><rect x="2.5" y="2" width="2.5" height="8" rx="1" fill="currentColor"/><rect x="7" y="2" width="2.5" height="8" rx="1" fill="currentColor"/></svg>
          : <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2.5 1.5 L10 6 L2.5 10.5 Z" fill="currentColor"/></svg>}
      </button>
      <span className="time">{fmtTime(time)}<span className="sep"> / </span>{fmtTime(dur)}</span>
      <div className="scrub" ref={barRef} onMouseDown={onDown}>
        <div className="scrub-fill" style={{ width: (time / dur * 100) + "%" }}/>
        <div className="scrub-knob" style={{ left: (time / dur * 100) + "%" }}/>
      </div>
      <span className="pill">{v ? v.speed.toFixed(1) + "×" : "1.0×"}</span>
      <span className="pill">vol {v ? Math.round(v.volume * 100) : 80}</span>
      <div className="ar-pick" ref={arRef}>
        <span className="ar-pill" onClick={() => setArOpen(o => !o)}>{curLabel}</span>
        {arOpen && (
          <div className="ar-menu">
            {RATIOS.map(r => (
              <div key={r.label}
                className={"ar-item" + (r.label === curLabel ? " on" : "")}
                onClick={() => { onAspect(r.size); setArOpen(false); }}>
                {r.label}
              </div>
            ))}
            {naturalSize && <>
              <div className="ar-div"/>
              <div className={"ar-item" + (isFree ? " on" : "")}
                onClick={() => { onAspect(naturalSize); setArOpen(false); }}>
                Free · {naturalSize[0]}×{naturalSize[1]}
              </div>
            </>}
          </div>
        )}
      </div>
    </div>
  );
}
