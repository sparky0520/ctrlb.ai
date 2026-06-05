// codesheet.jsx — config.json as a draggable bottom sheet in the right column.
const { useRef: csUseRef } = React;

function CodeSheet({ code, height, setHeight, maxH, flash }) {
  const startRef = csUseRef(null);
  const lines = code.split("\n");
  const open = height > 60;

  const onHandleDown = (e) => {
    e.preventDefault();
    startRef.current = { y: e.clientY, h: height };
    const mv = (ev) => {
      const dh = startRef.current.y - ev.clientY;
      setHeight(clamp(startRef.current.h + dh, 36, maxH));
    };
    const up = () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
  };
  const toggle = () => setHeight(open ? 36 : Math.round(maxH * 0.62));

  return (
    <div className="codesheet" style={{ height }}>
      <div className="cs-handle" onMouseDown={onHandleDown} onDoubleClick={toggle}>
        <div className="cs-grip"/>
      </div>
      <div className="cs-bar" onClick={toggle}>
        <span className="cs-file"><span className="dot edit"/>config.json</span>
        <span className="cs-lang">JSON · read-write</span>
        <div className="cs-spacer"/>
        {flash && flash.size > 0 && <span className="cs-changed">{flash.size} line{flash.size > 1 ? "s" : ""} changed</span>}
        <span className="cs-chev">{open ? "⌄" : "⌃"}</span>
      </div>
      {open && (
        <div className="cs-body">
          <div className="code">
            <div className="code-gutter">{lines.map((_, i) => <div key={i} className={flash && flash.has(i) ? "g-flash" : ""}>{i + 1}</div>)}</div>
            <div className="code-text">{lines.map((ln, i) => (
              <div className={"code-line" + (flash && flash.has(i) ? " flash" : "")} key={i}>{highlightLine(ln)}</div>
            ))}</div>
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { CodeSheet });
