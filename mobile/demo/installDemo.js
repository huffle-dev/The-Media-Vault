// Runs once, first, in the browser demo: turns off everything that would reach the internet, with a plain
// message, and marks the first-run welcome as seen.
if (typeof window !== "undefined" && !window.__DEMO__) {
  window.__DEMO__ = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    if (/^(https?:)?\/\//i.test(url) && !url.startsWith(window.location.origin)) {
      return Promise.reject(new Error("Online lookups are switched off in this demo. In the real app this searches the internet."));
    }
    return realFetch(input, init);
  };
  try { window.localStorage.setItem("mobile_welcome_seen", "1"); } catch { /* the demo works without it */ }
}
