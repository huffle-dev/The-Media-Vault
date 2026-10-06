// Makes the clean copy of the project that goes in a NEW public repository: today's files
// only, with one fresh commit and none of this repository's history.
//
//   node scripts/make-public-copy.js --out ../media-vault-public --repo OWNER/NAME \
//        [--name "Your Name"] [--email 12345+you@users.noreply.github.com] [--message "..."]
//
// What it does, in order:
//   1. copies every file git tracks here (so nothing ignored, untracked or secret comes along);
//   2. points the repository links at OWNER/NAME instead of this repository;
//   3. leaves out the private backlog, strips the maker's Expo account from the phone app's settings, and
//      empties the built-in server (LEGACY) in the desktop and phone apps, so a downloaded
//      build starts with no server and asks for one — the "one-way" release step;
//   4. refuses to continue if anything personal or private is still in the copy;
//   5. runs `git init` and makes a single commit with the identity you give (it never touches
//      your global git settings and never adds a remote or pushes).
//
// The pure parts (transformText, emptyLegacy, findLeaks) are tested in test/makePublicCopy.test.js.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const OLD_REPO = "huffle-dev/The-Media-Vault";
const TEXT_EXT = /\.(md|js|jsx|mjs|cjs|json|yml|yaml|html|css|txt|sql)$/i;

// What must not appear in a public copy.
//
// GENERIC patterns are safe to keep in the code. The PERSONAL ones (the old server's address and key, the
// maker's private email, local folder names) must not be written in any file that gets published, or the
// copy would carry the very details it hides. So they live in scripts/private-strings.local.json, which is
// gitignored and never copied:
//
//     [ { "name": "the old Supabase project address", "pattern": "abcdefgh1234" }, ... ]
//
// (each "pattern" is a regular expression, case-insensitive). The script refuses to run without that file.
const GENERIC_LEAKS = [
  { name: "a secret Supabase key", re: /sb_secret_[A-Za-z0-9_-]{10,}/ },
];
const PRIVATE_FILE = "private-strings.local.json";

// -> [{ name, re }] from the local file, or null when it does not exist.
function loadPrivateLeaks(dir) {
  const file = path.join(dir, PRIVATE_FILE);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")).map(({ name, pattern }) => ({ name, re: new RegExp(pattern, "i") }));
}

// Files that stay private: the working backlog, and the script that renders it.
const EXCLUDE = new Set(["BACKLOG.md", "scripts/build-backlog-html.js"]);

// The maker's Expo account and project id belong to their own builds; someone building their own copy of the
// phone app uses their own (`npx eas-cli init` fills them in).
const stripExpoAccount = (text) => text
  .replace(/,\s*"eas":\s*\{[^}]*\}/, "")
  .replace(/,\s*"owner":\s*"[^"]*"/, "");

const emptyLegacy = (text) => text
  .replace(/(const LEGACY = \{\s*url: )"[^"]*"(,\s*key: )"[^"]*"/, '$1""$2""');

// Text files get the repository links repointed; the two server files get LEGACY emptied.
function transformText(rel, text, { repo }) {
  let out = text;
  if (repo && repo !== OLD_REPO) out = out.split(OLD_REPO).join(repo);
  if (rel === "lib/supabaseConfig.js" || rel === "mobile/supabase.js") out = emptyLegacy(out);
  if (rel === "mobile/app.json") out = stripExpoAccount(out);
  // The backlog is not published: point at the changelog, or just say "the project backlog".
  out = out.replace("- **What's new:** [CHANGELOG.md](CHANGELOG.md)", "- **What's new:** [CHANGELOG.md](CHANGELOG.md)");
  out = out.replace("the project backlog", "the project backlog");
  return out;
}

// -> [{ file, leak }] for every private string still present.
function findLeaks(files, extra = []) {
  const found = [];
  for (const { rel, text } of files) {
    for (const l of [...GENERIC_LEAKS, ...extra]) {
      if (l.re.test(text)) found.push({ file: rel, leak: l.name });
    }
  }
  return found;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) out[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
  }
  return out;
}

function main() {
  const root = path.join(__dirname, "..");
  const args = parseArgs(process.argv.slice(2));
  if (!args.out || !args.repo || !/^[\w.-]+\/[\w.-]+$/.test(args.repo)) {
    console.error('Usage: node scripts/make-public-copy.js --out <folder> --repo OWNER/NAME [--name "Name"] [--email you@users.noreply.github.com]');
    process.exit(2);
  }
  const out = path.resolve(args.out);
  if (fs.existsSync(out) && fs.readdirSync(out).length) { console.error(`${out} already exists and is not empty.`); process.exit(2); }

  const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8" });
  const dirty = git(root, "status", "--porcelain", "--untracked-files=no").trim();
  if (dirty) console.warn("Warning: tracked files have uncommitted changes; the copy uses the files as they are on disk:\n" + dirty);

  const tracked = git(root, "ls-files", "-z").split("\0").filter(Boolean);
  const textFiles = [];
  fs.mkdirSync(out, { recursive: true });
  for (const rel of tracked.filter((r) => !EXCLUDE.has(r))) {
    const from = path.join(root, rel);
    if (!fs.existsSync(from)) continue;
    const to = path.join(out, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    if (TEXT_EXT.test(rel)) {
      const text = transformText(rel, fs.readFileSync(from, "utf8"), { repo: args.repo });
      fs.writeFileSync(to, text);
      textFiles.push({ rel, text });
    } else {
      fs.copyFileSync(from, to);
    }
  }

  const personal = loadPrivateLeaks(__dirname);
  if (!personal) {
    console.error(`Stopped: scripts/${PRIVATE_FILE} is missing. It lists, as regular expressions, the private things that must never appear in a public copy`);
    console.error('(your old server address and key, your private email, your local folder name), e.g. [{ "name": "my private email", "pattern": "me@example\.com" }]. It is gitignored.');
    fs.rmSync(out, { recursive: true, force: true });
    process.exit(1);
  }
  const leaks = findLeaks(textFiles, personal);
  if (leaks.length) {
    console.error("Stopped: the copy still contains private material:");
    for (const l of leaks) console.error(`  ${l.file}: ${l.leak}`);
    console.error(`(left in ${out} for inspection — delete it before trying again)`);
    process.exit(1);
  }

  git(out, "init", "-b", "main");
  if (args.name) git(out, "config", "user.name", String(args.name));
  if (args.email) git(out, "config", "user.email", String(args.email));
  git(out, "add", "-A");
  const version = JSON.parse(fs.readFileSync(path.join(out, "package.json"), "utf8")).version;
  git(out, "commit", "-q", "-m", typeof args.message === "string" ? args.message : `The Media Vault ${version}`);
  console.log(`Wrote ${tracked.length - EXCLUDE.size} files to ${out} and made one commit (${git(out, "rev-parse", "--short", "HEAD").trim()}).`);
  console.log(`Next: create the empty repository ${args.repo} on GitHub, then in that folder:`);
  console.log(`  git remote add origin https://github.com/${args.repo}.git && git push -u origin main`);
}

if (require.main === module) main();
module.exports = { transformText, emptyLegacy, stripExpoAccount, findLeaks, loadPrivateLeaks, OLD_REPO, GENERIC_LEAKS, EXCLUDE };
