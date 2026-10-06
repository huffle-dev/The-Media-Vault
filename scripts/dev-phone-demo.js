// Tries the phone demo on your own computer: builds it, then serves it at http://localhost:5300 (shown in a
// phone-sized frame). Stop it with Ctrl+C. Run it again after changing the phone app to rebuild.
//
//   npm run demo:phone:dev
const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const dir = path.join(root, "docs", "demo-phone");
const built = spawnSync("node", [path.join(__dirname, "build-phone-demo.js")], { cwd: root, stdio: "inherit" });
if (built.status !== 0) process.exit(built.status || 1);

const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".ico": "image/x-icon" };
const PORT = 5300;
http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split("?")[0]);
  if (rel.endsWith("/")) rel += "index.html";
  let file = path.join(dir, rel);
  if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dir, "app", "index.html"); // the app handles its own addresses
  res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`\nPhone demo: http://localhost:${PORT}   (Ctrl+C to stop)`));
