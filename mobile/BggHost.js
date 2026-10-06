// The hidden web view behind Board Game search (see bggBridge.js). Nothing is shown. It is
// only created the first time a Board Game lookup is made, so BoardGameGeek is not contacted
// at all unless you use it; after loading boardgamegeek.com it waits a moment for Cloudflare's
// cookie, then answers requests. If BGG refuses (401/403) it reloads the page once and retries.
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";
import { createBridge, setBggHandler } from "./bggBridge";
import { diag } from "./diag";

const HOME = "https://boardgamegeek.com/";
const WARM_UP_MS = 1500;

export default function BggHost() {
  const [wanted, setWanted] = useState(false);
  const viewRef = useRef(null);
  const readyRef = useRef(null); // a promise that resolves when the page is warmed up
  const resolveReady = useRef(null);
  const bridge = useRef(null);
  if (!bridge.current) {
    bridge.current = createBridge({ send: (script) => viewRef.current && viewRef.current.injectJavaScript(script) });
  }
  if (!readyRef.current) readyRef.current = new Promise((resolve) => { resolveReady.current = resolve; });

  useEffect(() => {
    setBggHandler(async (url, kind) => {
      setWanted(true);
      await readyRef.current;
      const where = (() => { try { return new URL(url).host; } catch { return "BoardGameGeek"; } })();
      try {
        return await bridge.current.request(url, kind);
      } catch (e) {
        // A refused session shows up as "HTTP 403" or, when Cloudflare's answer carries no cross-site
        // permission headers, as the browser's bare "Failed to fetch". Both get one fresh start.
        if (!/HTTP 40[13]|Failed to fetch|NetworkError|Load failed/i.test(String(e.message))) {
          diag.add("warn", "bgg", `BoardGameGeek request to ${where} failed: ${e.message}`);
          throw e;
        }
        diag.add("warn", "bgg", `BoardGameGeek request to ${where} was refused (${e.message}); reloading the page and trying once more`);
        readyRef.current = new Promise((resolve) => { resolveReady.current = resolve; });
        viewRef.current && viewRef.current.reload();
        await readyRef.current;
        try {
          return await bridge.current.request(url, kind);
        } catch (e2) {
          diag.add("warn", "bgg", `BoardGameGeek request to ${where} failed again: ${e2.message}`);
          throw new Error(/Failed to fetch/i.test(String(e2.message)) ? "BoardGameGeek wouldn't send this game's details (its security check turned the request away)." : e2.message);
        }
      }
    });
    return () => setBggHandler(null);
  }, []);

  if (!wanted) return null;
  return (
    <View style={{ width: 1, height: 1, opacity: 0, position: "absolute" }} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <WebView
        ref={viewRef} source={{ uri: HOME }}
        onLoadEnd={() => setTimeout(() => resolveReady.current && resolveReady.current(), WARM_UP_MS)}
        onMessage={(e) => bridge.current.receive(e.nativeEvent.data)}
        // Stay on BoardGameGeek.
        onShouldStartLoadWithRequest={({ url }) => { try { return /(^|\.)boardgamegeek\.com$/.test(new URL(url).hostname) || url.startsWith("about:"); } catch { return false; } }}
        javaScriptEnabled domStorageEnabled setSupportMultipleWindows={false}
      />
    </View>
  );
}
