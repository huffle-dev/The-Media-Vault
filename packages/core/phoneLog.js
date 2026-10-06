// Sending the phone's problems log to the person's own computer, through their own Supabase project
// (one `app_settings` row, key "phone_log"), so it can be read on the desktop when the phone app won't
// open. Pure — test/phoneLog.test.js covers it. Nothing is sent unless the person presses Send.

const PHONE_LOG_KEY = "phone_log";
const MAX_CHARS = 200_000; // plenty for a few hundred entries, and keeps the row small

// The row to save. `meta` = { version, build, device }.
function buildPhoneLogRow(text, meta = {}, now = () => new Date().toISOString()) {
  const body = String(text || "");
  return {
    key: PHONE_LOG_KEY,
    value: {
      text: body.length > MAX_CHARS ? `${body.slice(0, MAX_CHARS)}\n…(cut off)` : body,
      version: meta.version || null,
      build: meta.build || null,
      device: meta.device || "Phone",
      sentAt: now(),
    },
  };
}

// What the desktop shows and saves: a header line, then the log. null when nothing has been sent yet.
function formatPhoneLog(value) {
  if (!value || typeof value.text !== "string") return null;
  const head = [
    `Phone log sent ${value.sentAt || "(time unknown)"}`,
    value.version ? `App v${value.version}${value.build ? ` build ${value.build}` : ""}` : null,
    value.device ? `Device: ${value.device}` : null,
  ].filter(Boolean).join(" · ");
  return `${head}\n\n${value.text}`;
}

// At start-up: did the last run end in a crash that the person has not seen yet? `entries` is the log,
// `ackedAt` the time (ms) they last chose to carry on. Returns that crash entry or null.
function unseenCrash(entries, ackedAt = 0) {
  for (let i = (entries || []).length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.level === "fatal") return e.t > ackedAt ? e : null;
  }
  return null;
}

module.exports = { PHONE_LOG_KEY, MAX_CHARS, buildPhoneLogRow, formatPhoneLog, unseenCrash };
