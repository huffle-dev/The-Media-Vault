// One "resync my library" card for Settings → Resync: title, one-line
// blurb, the resync button (with its syncing state), the "sync on launch"
// checkbox, and the last result line. Shared by Steam, GOG and
// Cloud Sync, which differ only in these props.
import { T } from "../tokens.js";
import { Card, Toggle, ProgressBox, actionBtnStyle } from "./SettingsShared.jsx";

export default function LibraryResyncSection({
  title, description, resyncLabel, syncing, onResync,
  autoSync, onToggleAutoSync, result, progress,
  // Cloud Sync replaces the single checkbox with its own picker and adds a
  // line saying how the last background sync went.
  autoControl, statusLine,
}) {
  return (
    <Card title={title} blurb={description}>
      <button onClick={onResync} disabled={syncing} style={actionBtnStyle(syncing)}>
        {syncing ? "Syncing…" : resyncLabel}
      </button>
      {autoControl || (
        <Toggle checked={autoSync} onChange={onToggleAutoSync}>
          Also do this every time the app opens
        </Toggle>
      )}
      {statusLine && (
        <div style={{ marginTop: 10, fontSize: 11, fontFamily: T.fontMono, color: statusLine.error ? "#e84b6e" : T.muted }}>
          {statusLine.text}
        </div>
      )}
      {result && (
        <div style={{
          marginTop: 10, fontSize: 11, fontFamily: T.fontMono,
          color: result.error ? "#e84b6e" : T.seen,
        }}>
          {result.error
            ? result.error
            // .summary is an escape hatch for a result shape that doesn't
            // fit "N new / N already in library" (Cloud Sync's push+pull
            // counts) — Steam/GOG never set it.
            : result.summary || `✓ ${result.imported} new · ${result.skipped} already in library`}
        </div>
      )}
      {/* Optional background-job progress ({ text, done, total }), e.g. Cloud
          Sync's cover-art link gathering. */}
      {progress && <ProgressBox text={progress.text} done={progress.done} total={progress.total} />}
    </Card>
  );
}
