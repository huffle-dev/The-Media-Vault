// Downloads the cover pictures for the online demo from Wikimedia Commons and records who made each one.
// Only pictures whose licence on Commons is public domain, CC0, Creative Commons (BY / BY-SA) or GPL are
// kept; anything else stops the run, so a wrongly-picked file can't slip into the demo unnoticed.
//
//   node scripts/fetch-demo-art.js
//
// Reads demo/artManifest.json, writes demo/public/covers/<slug>.<ext> (resized) and demo/credits.json.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "demo", "artManifest.json"), "utf8"));
const outDir = path.join(root, "demo", "public", "covers"); // copied into the built demo as covers/
const API = "https://commons.wikimedia.org/w/api.php";
const UA = { "User-Agent": "MediaVaultDemo/1.0 (https://github.com/huffle-dev; demo cover fetch)" };
const OK_LICENCE = /^(public domain|pd[\s-]|cc0|cc by(-sa)?\b|gpl|gnu|lgpl)/i;
const strip = (html) => String(html || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, " ").trim();

async function info(file, width) {
  const url = `${API}?${new URLSearchParams({ action: "query", format: "json", titles: `File:${file}`, prop: "imageinfo", iiprop: "url|extmetadata|mime", iiurlwidth: String(width), iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist|Credit|ImageDescription|DateTimeOriginal" })}`;
  const page = Object.values((await (await fetch(url, { headers: UA })).json()).query.pages)[0];
  if (!page.imageinfo) throw new Error(`Not found on Commons: ${file}`);
  return { ...page.imageinfo[0], pageUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(`File:${file}`.replace(/ /g, "_"))}` };
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const credits = {};
  for (const m of manifest) {
    const ii = await info(m.file, m.square ? 360 : 360);
    const md = ii.extmetadata || {};
    const licence = strip(md.LicenseShortName && md.LicenseShortName.value);
    if (!OK_LICENCE.test(licence)) throw new Error(`${m.file}: licence "${licence}" is not on the allowed list`);
    const ext = (ii.thumburl || ii.url).match(/\.(jpe?g|png|gif|webp)(\?|$)/i)[1].toLowerCase().replace("jpeg", "jpg");
    const res = await fetch(ii.thumburl || ii.url, { headers: UA });
    if (!res.ok) throw new Error(`${m.file}: download failed (${res.status})`);
    fs.writeFileSync(path.join(outDir, `${m.slug}.${ext}`), Buffer.from(await res.arrayBuffer()));
    credits[m.slug] = {
      image: `covers/${m.slug}.${ext}`,
      file: m.file,
      author: strip(md.Artist && md.Artist.value) || "Unknown",
      licence,
      licenceUrl: strip(md.LicenseUrl && md.LicenseUrl.value) || null,
      source: ii.pageUrl,
      description: strip(md.ImageDescription && md.ImageDescription.value).slice(0, 300),
      date: strip(md.DateTimeOriginal && md.DateTimeOriginal.value),
    };
    console.log(`ok  ${m.slug}  [${licence}]  ${credits[m.slug].author.slice(0, 50)}`);
    await new Promise((r) => setTimeout(r, 250));
  }
  fs.writeFileSync(path.join(root, "demo", "credits.json"), JSON.stringify(credits, null, 2));
})().catch((e) => { console.error(e.message); process.exit(1); });
