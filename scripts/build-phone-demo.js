// Builds the phone app as a web page for the online demo -> docs/demo-phone/.
//
//   node scripts/build-phone-demo.js [--base=/folder/the/demo-is-served/from]
//
// docs/demo-phone/index.html is a small page that shows the app inside a phone-sized frame on a computer
// (the app lays itself out by the size of its window, so it has to be IN a phone-sized window) and sends
// a real phone straight to the app. The app itself is in docs/demo-phone/app/.
//
// The real phone screens run unchanged; mobile/metro.config.js swaps the server and the phone-only
// libraries for the stand-ins in mobile/demo when MEDIA_VAULT_PHONE_DEMO is set. Covers are the same
// public-domain / Creative Commons pictures the desktop demo uses (demo/public/covers).
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const mobile = path.join(root, "mobile");
const out = path.join(root, "docs", "demo-phone");
const appOut = path.join(out, "app");
// Git Bash on Windows rewrites "--base=/folder" into "C:/Program Files/Git/folder"; undo that, and tolerate a missing leading slash.
const rawBase = (process.argv.find((a) => a.startsWith("--base=")) || "--base=").slice(7).replace(/^[A-Za-z]:[\/]Program Files[\/]Git/i, "");
const base = rawBase ? `/${rawBase.replace(/^[\/]+/, "").replace(/[\/]+$/, "")}` : "";

fs.rmSync(path.join(mobile, "public"), { recursive: true, force: true });
fs.mkdirSync(path.join(mobile, "public"), { recursive: true });
fs.cpSync(path.join(root, "demo", "public", "covers"), path.join(mobile, "public", "covers"), { recursive: true });
fs.copyFileSync(path.join(root, "demo", "credits.json"), path.join(mobile, "public", "credits.json"));

fs.rmSync(out, { recursive: true, force: true });
const env = { ...process.env, MEDIA_VAULT_PHONE_DEMO: "1", MEDIA_VAULT_PHONE_DEMO_BASE: `${base}/app` };
const r = spawnSync("npx", ["expo", "export", "--platform", "web", "--output-dir", `"${appOut}"`], { cwd: mobile, env, stdio: "inherit", shell: true });
fs.rmSync(path.join(mobile, "public"), { recursive: true, force: true }); // build-time copy only
if (r.status !== 0) process.exit(r.status || 1);

fs.writeFileSync(path.join(out, "index.html"), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The Media Vault - phone demo</title>
<style>
  html, body { margin: 0; height: 100%; background: #05050a; }
  body { display: flex; align-items: center; justify-content: center; }
  iframe { width: 390px; height: min(844px, calc(100vh - 32px)); border: 0; border-radius: 32px; background: #09090e;
           box-shadow: 0 0 0 9px #181822, 0 0 0 11px #2a2a38, 0 24px 70px rgba(0,0,0,.65); }
</style>
<script>
  // On a phone-sized screen there is nothing to frame: go straight to the app.
  if (window.innerWidth < 560) location.replace("app/");
</script>
</head>
<body>
<iframe src="app/" title="The Media Vault phone demo"></iframe>
</body>
</html>
`);
console.log(`Phone demo written to ${path.relative(root, out)}${base ? ` (served from ${base})` : ""}`);
