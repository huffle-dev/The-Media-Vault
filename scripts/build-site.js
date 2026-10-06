// Builds the project's website (landing page + both online demos) into _site/, ready for GitHub Pages.
//
//   node scripts/build-site.js [--base=/The-Media-Vault]
//
// --base is the folder the site is served from: "/<repository name>" on GitHub Pages, empty when it is served
// from the top of a domain. (The .github/workflows/pages.yml workflow passes it for you.)
//
// What ends up in _site/:
//   index.html        the landing page (site/index.html) and its bundled fonts
//   privacy.html      the privacy notice
//   demo/             the desktop app running in the browser on sample data   (npm run demo:build)
//   demo-phone/       the phone app running in the browser on the same data   (scripts/build-phone-demo.js)
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const out = path.join(root, "_site");

// Git Bash on Windows rewrites "--base=/folder" into "C:/Program Files/Git/folder"; undo that.
const rawBase = (process.argv.find((a) => a.startsWith("--base=")) || "--base=").slice(7)
  .replace(/^[A-Za-z]:[\\/]Program Files[\\/]Git/i, "");
const base = rawBase ? `/${rawBase.replace(/^[\\/]+/, "").replace(/[\\/]+$/, "")}` : "";

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit" }); // no shell: paths with spaces stay intact
  if (r.status !== 0) { console.error(`Failed: ${cmd} ${args.join(" ")}`); process.exit(r.status || 1); }
};
const node = process.execPath;

console.log("1/3 desktop demo");
run(node, [path.join(root, "node_modules", "vite", "bin", "vite.js"), "build", "--config", "demo/vite.config.mjs"]);
console.log("2/3 phone demo");
run(node, [path.join(__dirname, "build-phone-demo.js"), `--base=${base}/demo-phone`]);

console.log("3/3 assemble");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, "fonts"), { recursive: true });
fs.cpSync(path.join(root, "site"), out, { recursive: true });
const fonts = [
  ["dm-serif-display", "400Regular", "DMSerifDisplay_400Regular.ttf"],
  ["dm-sans", "400Regular", "DMSans_400Regular.ttf"],
  ["dm-sans", "700Bold", "DMSans_700Bold.ttf"],
];
for (const [pkg, dir, file] of fonts) {
  fs.copyFileSync(path.join(root, "node_modules", "@expo-google-fonts", pkg, dir, file), path.join(out, "fonts", file));
}
fs.cpSync(path.join(root, "docs", "demo"), path.join(out, "demo"), { recursive: true });
fs.cpSync(path.join(root, "docs", "demo-phone"), path.join(out, "demo-phone"), { recursive: true });
fs.copyFileSync(path.join(root, "docs", "privacy.html"), path.join(out, "privacy.html"));
fs.writeFileSync(path.join(out, ".nojekyll"), ""); // serve files as they are
console.log(`Site written to ${path.relative(root, out)}${base ? ` (served from ${base})` : ""}`);
