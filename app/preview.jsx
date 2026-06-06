// preview.jsx — read-only render surface + transport. Reflects `state` at `time`.
import { useRef } from 'react';
import { clamp, fmtTime } from './state.jsx';

export function activeItems(state, t) {
  return state.items.filter((i) => t >= i.start && t < i.end);
}

export function Preview({ state, time, playing }) {
  const act = activeItems(state, time);
  const zoom = act.find((i) => i.type === "zoom");
  const text = act.find((i) => i.type === "text");
  const color = act.find((i) => i.type === "color");
  const trans = act.find((i) => i.type === "transition");

  let transform = "scale(1)";
  if (zoom) {
    const fx = (zoom.focus[0] - 0.5) * -100 * (zoom.scale - 1) / zoom.scale;
    const fy = (zoom.focus[1] - 0.5) * -100 * (zoom.scale - 1) / zoom.scale;
    transform = `scale(${zoom.scale}) translate(${fx}%, ${fy}%)`;
  }

  return (
    <div className="preview">
      <div className="pv-stage">
        <div className="pv-screen">
          <div className="pv-cam" style={{ transform }}>
            <div className="pv-stripes"/>
            <div className="pv-mock">
              <div className="mk-side"/>
              <div className="mk-main">
                <div className="mk-row"><span/><span/><span/></div>
                <div className="mk-chart"><i style={{height:'40%'}}/><i style={{height:'70%'}}/><i style={{height:'55%'}}/><i style={{height:'90%'}}/><i style={{height:'62%'}}/></div>
              </div>
            </div>
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

          <div className="pv-tag">screen-recording.mp4 · 1920×1080</div>
          <div className="pv-badge">{playing ? "▶ playing" : "paused"}</div>
        </div>
      </div>
    </div>
  );
}

export function Transport({ state, time, playing, onToggle, onSeek }) {
  const dur = state.meta.duration;
  const barRef = useRef(null);
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
  const v = state.items.find((i) => i.id === "v1");
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
    </div>
  );
}
