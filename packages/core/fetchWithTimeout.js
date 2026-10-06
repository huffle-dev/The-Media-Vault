// Node's fetch has no default response timeout — a single stalled request
// (TMDB/IGDB/Steam/Open Library/etc.) would otherwise hang forever with no
// recovery, blocking whichever bulk enrichment pass it's in. Drop-in
// replacement for the global fetch: merges a bounded AbortSignal.timeout
// into the request, combined with any caller-supplied signal so both can
// still abort independently.
const DEFAULT_TIMEOUT_MS = 15000;

function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;
  return fetch(url, { ...options, signal });
}

module.exports = { fetchWithTimeout, DEFAULT_TIMEOUT_MS };
