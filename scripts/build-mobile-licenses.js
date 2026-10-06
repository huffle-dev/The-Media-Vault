// Writes mobile/licenses.json: every open-source package that ships inside the phone
// app (its production dependency tree), with licence and the licence text it came with,
// for Settings -> About -> Open-source licences. Texts are stored once and shared by
// packages whose licence text is word-for-word the same.
//
//   node scripts/build-mobile-licenses.js     (re-run after changing the phone's dependencies)

const fs = require("fs");
const path = require("path");
const { collect } = require("./build-licenses.js");

const root = path.join(__dirname, "..");
const out = path.join(root, "mobile", "licenses.json");

function build() {
  const packages = collect(path.join(root, "mobile"));
  const texts = [];
  const index = new Map();
  const list = packages.map((p) => {
    let t = null;
    if (p.text) {
      if (!index.has(p.text)) { index.set(p.text, texts.length); texts.push(p.text); }
      t = index.get(p.text);
    }
    return { name: p.name, version: p.version, license: p.license, text: t };
  });
  return { packages: list, texts };
}

if (require.main === module) {
  const data = build();
  fs.writeFileSync(out, JSON.stringify(data));
  const unknown = data.packages.filter((p) => p.license === "UNKNOWN");
  console.log(`Wrote mobile/licenses.json - ${data.packages.length} packages, ${data.texts.length} distinct licence texts${unknown.length ? `, ${unknown.length} with no declared licence: ${unknown.map((p) => p.name).join(", ")}` : ""}`);
}

module.exports = { build };
