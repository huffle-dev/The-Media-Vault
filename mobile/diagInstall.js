// Hooks the app's last-resort error paths into the problems log, once at start-up: uncaught errors
// (the fatal one is written to the phone BEFORE the app closes, so the next launch can show it),
// console errors and warnings, and promise failures nothing handled.
import { diag } from "./diag";

let installed = false;
const show = (v) => (v instanceof Error ? v.message : typeof v === "string" ? v : (() => { try { return JSON.stringify(v); } catch { return String(v); } })());

export function installDiagnostics() {
  if (installed) return;
  installed = true;

  const EU = globalThis.ErrorUtils;
  if (EU && EU.getGlobalHandler && EU.setGlobalHandler) {
    const previous = EU.getGlobalHandler();
    EU.setGlobalHandler((error, isFatal) => {
      try {
        diag.add(isFatal ? "fatal" : "error", "uncaught", (error && error.message) || String(error), error && error.stack);
        diag.flush();
      } catch { /* never let logging hide the real error */ }
      if (previous) previous(error, isFatal);
    });
  }

  const wrap = (name, level) => {
    const original = console[name];
    console[name] = (...args) => {
      try { diag.add(level, "console", args.map(show).join(" ")); } catch { /* ignore */ }
      original.apply(console, args);
    };
  };
  wrap("error", "error");
  wrap("warn", "warn");

  const hermes = globalThis.HermesInternal;
  if (hermes && hermes.enablePromiseRejectionTracker) {
    try {
      hermes.enablePromiseRejectionTracker({
        allRejections: true,
        onUnhandled: (id, error) => diag.add("error", "unhandled promise", (error && error.message) || show(error), error && error.stack),
      });
    } catch { /* not available on this runtime */ }
  }
}
