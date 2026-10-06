// Writes build/THIRD_PARTY_LICENSES.txt: every open-source package that ships
// inside the installed app (the production dependency tree of this project, not
// the build or test tools), with its licence and the licence text it came with.
// Most licences (MIT, BSD, ISC, Apache) require that notice to travel with the
// software. The installer includes the file and Help → About opens it.
//
//   node scripts/build-licenses.js        (also run by `npm run dist` / `npm run pack`)
//
// Electron and Chromium's own licences are added by the packager
// (LICENSE.electron.txt, LICENSES.chromium.html next to the .exe).

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const out = path.join(root, "build", "THIRD_PARTY_LICENSES.txt");
const OWN = new Set(["@media-vault/core", "the-vault", "mobile"]);

// node's own lookup: node_modules/<name> in this folder, then each parent's.
function findPackageDir(name, fromDir) {
  let dir = fromDir;
  for (;;) {
    const candidate = path.join(dir, "node_modules", name);
    if (fs.existsSync(path.join(candidate, "package.json"))) return fs.realpathSync(candidate);
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

function licenceOf(pkg) {
  if (typeof pkg.license === "string") return pkg.license;
  if (pkg.license && pkg.license.type) return pkg.license.type;
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => l.type || l).join(" OR ");
  return "UNKNOWN";
}

function licenceText(dir) {
  const file = fs.readdirSync(dir).find((f) => /^(licen[cs]e|copying|notice)(\.(md|txt))?$/i.test(f));
  return file ? fs.readFileSync(path.join(dir, file), "utf8").trim() : null;
}

// `dir` is the project whose shipped dependencies to list (the desktop app by default;
// the phone app passes mobile/ — see build-mobile-licenses.js).
function collect(dir = root) {
  const seen = new Map(); // "name@version" -> { name, version, license, text, homepage }
  const walk = (name, fromDir, optional) => {
    if (OWN.has(name)) return;
    const dir = findPackageDir(name, fromDir);
    if (!dir) { if (!optional) console.warn(`not found: ${name}`); return; }
    const pkg = readJson(path.join(dir, "package.json"));
    const key = `${pkg.name}@${pkg.version}`;
    if (seen.has(key)) return;
    seen.set(key, {
      name: pkg.name, version: pkg.version, license: licenceOf(pkg),
      homepage: (typeof pkg.repository === "string" ? pkg.repository : pkg.repository && pkg.repository.url) || pkg.homepage || "",
      text: licenceText(dir),
    });
    for (const dep of Object.keys(pkg.dependencies || {})) walk(dep, dir, false);
    for (const dep of Object.keys(pkg.optionalDependencies || {})) walk(dep, dir, true);
  };
  const rootPkg = readJson(path.join(dir, "package.json"));
  for (const dep of Object.keys(rootPkg.dependencies || {})) walk(dep, dir, false);
  // Bundled into dist/ by the build, so they ship too even though they're dev dependencies.
  if (dir === root) for (const dep of ["react", "react-dom", "qrcode-generator"]) walk(dep, root, false);
  // The shared core's own dependencies (it is bundled into the app).
  const core = readJson(path.join(root, "packages", "core", "package.json"));
  for (const dep of Object.keys(core.dependencies || {})) walk(dep, path.join(root, "packages", "core"), false);
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function render(packages, appName = "THE MEDIA VAULT") {
  const lines = [
    `${appName} — OPEN-SOURCE SOFTWARE NOTICES`,
    "",
    "The Media Vault includes the open-source packages listed below. Each is used",
    "under its own licence, reproduced after the list. Electron and Chromium's",
    "licences are in LICENSE.electron.txt and LICENSES.chromium.html in this",
    "program's folder.",
    "",
    `${packages.length} packages`,
    "",
    ...packages.map((p) => `  ${p.name} ${p.version} — ${p.license}`),
    "",
  ];
  for (const p of packages) {
    lines.push("", "=".repeat(78), `${p.name} ${p.version}`, `Licence: ${p.license}`, p.homepage ? `Source: ${p.homepage}` : "", "-".repeat(78));
    lines.push(p.text || `(No licence file was included with this package; it is declared as ${p.license}.)`);
  }
  return lines.join("\n") + "\n";
}

if (require.main === module) {
  const packages = collect();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, render(packages));
  const unknown = packages.filter((p) => p.license === "UNKNOWN");
  console.log(`Wrote ${path.relative(root, out)} — ${packages.length} packages${unknown.length ? `, ${unknown.length} with no declared licence: ${unknown.map((p) => p.name).join(", ")}` : ""}`);
}

module.exports = { collect, render, licenceOf };
