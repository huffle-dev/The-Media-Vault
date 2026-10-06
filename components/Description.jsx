import { useState } from "react";
import { T } from "../tokens.js";

// Long descriptions (a YouTube video's is a wall of links, a book's can run
// for pages) show a few lines with a Show more / Show less toggle. Line
// breaks in the source text are kept. Short text shows in full, no toggle.
const CLAMP_CHARS = 420;
const CLAMP_LINES = 6;

export default function Description({ text }) {
  const [open, setOpen] = useState(false);
  const long = text.length > CLAMP_CHARS || text.split("\n").length > CLAMP_LINES;
  return (
    <div>
      <div style={{
        fontSize: 13.5, lineHeight: 1.7, color: T.text, whiteSpace: "pre-line", overflowWrap: "anywhere",
        ...(long && !open ? { display: "-webkit-box", WebkitLineClamp: CLAMP_LINES, WebkitBoxOrient: "vertical", overflow: "hidden" } : null),
      }}>{text}</div>
      {long && (
        <span onClick={() => setOpen(o => !o)} style={{ display: "inline-block", marginTop: 8, color: T.accent, fontSize: 11, fontFamily: T.fontMono, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {open ? "Show less" : "Show more"}
        </span>
      )}
    </div>
  );
}
