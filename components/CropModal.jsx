import { useState, useRef, useEffect } from "react";
import { T } from "../tokens.js";

// Frame is the on-screen crop window, sized to the cover art aspect ratio —
// 2:3 for everything except Music, which is square (`square` prop). Output
// is rendered at a fixed higher resolution regardless of source image size.
const clamp = (v, max) => Math.max(-max, Math.min(max, v));

// Simple zoom-and-pan crop tool shown right after a user picks or drops a
// local image file, so mismatched aspect ratios / letterboxing can be fixed
// before the file is saved as a cover. Not used for API-fetched art, which
// already comes in at the right ratio.
export default function CropModal({ imageSrc, onConfirm, onCancel, square = false }) {
  const FRAME_W = square ? 300 : 240;
  const FRAME_H = square ? 300 : 360;
  const OUT_W = 600;
  const OUT_H = square ? 600 : 900;
  const [natural, setNatural] = useState(null); // { w, h }
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const imgRef = useRef(null);

  const baseScale = natural ? Math.max(FRAME_W / natural.w, FRAME_H / natural.h) : 1;
  const scale = baseScale * zoom;
  const dispW = natural ? natural.w * scale : 0;
  const dispH = natural ? natural.h * scale : 0;
  const maxPanX = Math.max(0, (dispW - FRAME_W) / 2);
  const maxPanY = Math.max(0, (dispH - FRAME_H) / 2);

  // Re-clamp whenever zoom (or a fresh image) shrinks the allowed pan range.
  useEffect(() => {
    setPan(p => ({ x: clamp(p.x, maxPanX), y: clamp(p.y, maxPanY) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, natural]);

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e) => {
      setPan({
        x: clamp(dragStart.current.panX + (e.clientX - dragStart.current.x), maxPanX),
        y: clamp(dragStart.current.panY + (e.clientY - dragStart.current.y), maxPanY),
      });
    };
    const handleUp = () => setDragging(false);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragging, maxPanX, maxPanY]);

  const handleMouseDown = (e) => {
    dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    setDragging(true);
  };

  const handleConfirm = async () => {
    if (!natural) return;
    setSaving(true);
    // Map the visible frame back to source-image pixel coordinates.
    const imgLeft = FRAME_W / 2 - dispW / 2 + pan.x;
    const imgTop  = FRAME_H / 2 - dispH / 2 + pan.y;
    const sx = -imgLeft / scale;
    const sy = -imgTop / scale;
    const sw = FRAME_W / scale;
    const sh = FRAME_H / scale;

    const canvas = document.createElement("canvas");
    canvas.width = OUT_W;
    canvas.height = OUT_H;
    const ctx = canvas.getContext("2d");
    // Zooming out below "fit" scale can leave letterboxing — JPEG has no
    // alpha channel, so any area drawImage doesn't cover would otherwise
    // export as solid black. Fill with the same "empty" color shown while
    // editing so the saved result matches the preview.
    ctx.fillStyle = T.surface2;
    ctx.fillRect(0, 0, OUT_W, OUT_H);
    ctx.drawImage(imgRef.current, sx, sy, sw, sh, 0, 0, OUT_W, OUT_H);
    await onConfirm(canvas.toDataURL("image/jpeg", 0.92));
  };

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(5,5,10,0.92)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 200,
    }}>
      <div style={{
        background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: 10, padding: 20,
        boxShadow: "0 32px 80px rgba(0,0,0,0.7)",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
      }}>
        <div style={{ fontFamily: T.fontSerif, fontSize: 15, color: T.text, alignSelf: "flex-start" }}>
          Adjust Cover Art
        </div>

        <div
          onMouseDown={handleMouseDown}
          style={{
            width: FRAME_W, height: FRAME_H, overflow: "hidden", position: "relative",
            borderRadius: 5, border: `1px solid ${T.border}`, background: T.surface2,
            cursor: dragging ? "grabbing" : "grab",
          }}
        >
          <img
            ref={imgRef}
            src={imageSrc}
            onLoad={e => setNatural({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
            draggable={false}
            style={{
              position: "absolute", left: "50%", top: "50%",
              width: dispW || "auto", height: dispH || "auto",
              transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px))`,
              userSelect: "none", pointerEvents: "none",
            }}
          />
        </div>

        <div style={{ width: FRAME_W, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, color: T.muted, fontFamily: T.fontMono }}>Zoom</span>
          <input
            type="range" min={0.5} max={3} step={0.01}
            value={zoom}
            onChange={e => setZoom(parseFloat(e.target.value))}
            style={{ flex: 1 }}
          />
        </div>

        <div style={{ display: "flex", gap: 8, width: FRAME_W }}>
          <button
            onClick={handleConfirm}
            disabled={!natural || saving}
            style={{
              flex: 1, padding: "8px", background: T.accent, color: T.bg,
              border: "none", borderRadius: 5, fontSize: 12, fontWeight: 700,
              cursor: (!natural || saving) ? "default" : "pointer", fontFamily: T.fontSans,
            }}
          >{saving ? "Saving…" : "Apply"}</button>
          <button
            onClick={onCancel}
            disabled={saving}
            style={{
              padding: "8px 16px", background: "transparent",
              border: `1px solid ${T.border}`, borderRadius: 5,
              color: T.muted, fontSize: 12, cursor: saving ? "default" : "pointer",
              fontFamily: T.fontSans,
            }}
          >Cancel</button>
        </div>
      </div>
    </div>
  );
}
