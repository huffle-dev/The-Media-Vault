const { app, BrowserWindow, ipcMain, dialog, shell, session, safeStorage, Menu, clipboard, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const { createCloudSyncClient } = require("./lib/cloudSyncClient");
const { LEGACY: LEGACY_SERVER } = require("./lib/supabaseConfig");
const supabaseSetup = require("@media-vault/core/supabaseSetup");
const setupCode = require("@media-vault/core/setupCode");
const authForm = require("@media-vault/core/authForm");
const phoneLog = require("@media-vault/core/phoneLog");
const Database = require("./database");
const cloudSync = require("./lib/cloudSync");
const cryptoSync = require("@media-vault/core/cryptoSync");
const { APPEARANCE_KEY, buildAppearancePayload } = require("@media-vault/core/appearanceSync");
const cryptoAdapterNode = require("./lib/cryptoAdapterNode");
const BetterSqlite3 = require("better-sqlite3");
const { fetchWithTimeout: fetch } = require("@media-vault/core/fetchWithTimeout");
const { decodeCp1252 } = require("@media-vault/core/textEncoding");
const { decodeHtmlEntities, stripHtml } = require("@media-vault/core/htmlText");
const { slugify, formatCount } = require("@media-vault/core/format");
const { EXPORT_HEADERS, csvEscape, buildExportCsv } = require("./lib/csv");
const { safeExtractZip } = require("./lib/safeZip");
const { hltbGetContext, hltbSearchGame } = require("./services/hltb");
const { restrictNavigation } = require("./lib/windowSecurity");
const bgg = require("./services/bgg");
const { downloadImage, setDownloadListener } = require("./lib/downloadImage");
const { downloadLinkedCoverArt } = require("./lib/linkedCoverArt");
const { backfillCoverArtLinks, verifyImageUrl } = require("./lib/coverArtBackfill");
const { AsyncLocalStorage } = require("async_hooks");
const { coverArtDir } = require("./lib/appPaths");
const { BROWSER_HEADERS } = require("@media-vault/core/httpHeaders");
const { scanLocalLibraryFolder } = require("./lib/folderScan");
const { resolveImportCoverArt } = require("./lib/importCoverArt");
const { parseDeepLink } = require("./lib/deepLink");
const { extractGogCode, isPlausibleAuthCode } = require("@media-vault/core/authValidation");
const website = require("./services/website");
// Every createXService(storage) factory below needs the same cover-art
// storage adapter — see packages/core/movie.js's own header comment for
// why these are factories rather than plain exports (Metro/mobile
// bundling: a literal require of a desktop-only fs/path/Electron helper
// anywhere in the file breaks the mobile bundle outright, whether or not
// the code path actually runs). One shared object rather than repeating
// this shape per service.
// Every successful download records its source URL (see database.js's
// cover_art_sources) so Cloud Sync can send items.cover_art_url. `db` is
// assigned later in app startup — the listener only reads it at call time.
setDownloadListener((url, dest) => { if (db) db.recordCoverArtSource(dest, url); });

const desktopStorage = {
  coverArtDir, downloadImage,
  fileExists: (p) => fs.existsSync(p),
  joinPath: (...parts) => path.join(...parts),
  // Download unless the file already exists — but still record where the
  // existing file came from, since the download listener never fires for it.
  ensureImage: async (url, dest, headers) => {
    if (fs.existsSync(dest)) { if (db) db.recordCoverArtSource(dest, url); return; }
    await downloadImage(url, dest, headers);
  },
};
const discogs = require("@media-vault/core/discogs")(desktopStorage);
const audible = require("@media-vault/core/audible")(desktopStorage);
const movie = require("@media-vault/core/movie")(desktopStorage);
const podcast = require("@media-vault/core/podcast")(desktopStorage);
const openLibrary = require("@media-vault/core/openLibrary")(desktopStorage);
const steam = require("@media-vault/core/steam")(desktopStorage);
const igdb = require("@media-vault/core/igdb")(desktopStorage);
const gog = require("./services/gog");
const youtube = require("@media-vault/core/youtube")(desktopStorage);
const gemini = require("./services/gemini");

// archiver v8 is ESM-only, so it's loaded lazily via dynamic import() and
// cached; also uses named classes now instead of the old factory function.
let _ZipArchive = null;
async function getZipArchiveClass() {
  if (!_ZipArchive) _ZipArchive = (await import("archiver")).ZipArchive;
  return _ZipArchive;
}

let mainWindow;
let db;
let pendingDeepLinkUrl = null;

// Only one instance should ever hold the vault:// registration — a second
// launch (e.g. from a browser deep-link while the app's already open) hands
// its argv to the first instance via "second-instance" instead of opening a
// duplicate window.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  // Dev mode (`electron .`, unpackaged) needs the exec path + script arg
  // spelled out explicitly since there's no installed .exe for the OS to
  // associate the protocol with; a packaged app can register with just the
  // scheme name. Re-registers on every dev launch, so moving this repo just
  // needs one normal (non-deep-link) launch afterward to pick up the new path.
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient("vault", process.execPath, [path.resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient("vault");
  }

  app.on("second-instance", (event, argv) => {
    const url = argv.find(a => a.startsWith("vault://"));
    if (url) handleDeepLink(url);
    else if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // macOS delivers a registered-protocol launch this way instead of via argv.
  app.on("open-url", (event, url) => {
    event.preventDefault();
    if (mainWindow) handleDeepLink(url);
    else pendingDeepLinkUrl = url; // flushed once the window exists, see createWindow's caller below
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#09090e",
    // Window + taskbar icon (the vault) — same artwork as the browser
    // extensions and the Android app. build/icon.ico is for the installer.
    icon: path.join(__dirname, "build", "icon.png"),
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  restrictNavigation(mainWindow);
  // Coming back to the app is a good moment for a background Cloud Sync (lib/autoSync.js).
  mainWindow.on("focus", () => autoSync.notifyFocus());

  // In development load from file; in production use built assets
  const isDev = process.argv.includes("--dev");
  if (isDev) {
    mainWindow.loadFile(path.join(__dirname, "dist", "index.html"));
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "dist", "index.html"));
  }
}

// Menu is just a dispatcher — the renderer owns the actual behavior.
function sendMenuAction(actionId, value) {
  if (mainWindow) mainWindow.webContents.send("menu:action", actionId, value);
}

// Entry point for every vault:// deep-link — cold-start argv, second-instance
// argv, and macOS's open-url all funnel through here. Fails closed: an
// invalid/unrecognized URL or a not-yet-created window is a silent no-op,
// never a crash.
function handleDeepLink(rawUrl) {
  const parsed = parseDeepLink(rawUrl);
  if (!parsed || !mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
  mainWindow.webContents.send("deeplink:open", parsed);
}

// Tile/list display submenus: plain click-to-apply items, no live checkmark
// (avoids having to keep the menu in sync with toolbar-driven changes too).
//
// Pre-filled GitHub "new issue" link for the Help menu — query params only,
// no in-app form. App version/OS are auto-filled so reports never miss them.
const REPO_ISSUES_URL = "https://github.com/huffle-dev/The-Media-Vault/issues/new";
function githubIssueUrl({ label, bodyLines }) {
  const osLine = `${os.type()} ${os.release()}`;
  const body = bodyLines
    .map(line => line === "__ENV__" ? `**App Version:** ${app.getVersion()}\n**OS:** ${osLine}` : line)
    .join("\n");
  const params = new URLSearchParams({ labels: label, body });
  return `${REPO_ISSUES_URL}?${params.toString()}`;
}

function displayGroup(actionId, options) {
  return options.map(([label, value]) => ({ label, click: () => sendMenuAction(actionId, value) }));
}

function buildAppMenu() {
  const isMac = process.platform === "darwin";

  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    }] : []),
    {
      label: "File",
      submenu: [
        { label: "Add Item…", accelerator: "CmdOrCtrl+N", click: () => sendMenuAction("addItem") },
        { label: "Add Custom Type…", click: () => sendMenuAction("addCustomType") },
        { label: "Import Library…", click: () => sendMenuAction("import") },
        { type: "separator" },
        {
          label: "Settings",
          submenu: [
            { label: "API Keys & Accounts", accelerator: "CmdOrCtrl+,", click: () => sendMenuAction("settings", "API Keys & Accounts") },
            { label: "Account Access", click: () => sendMenuAction("settings", "Accounts") },
            { label: "Appearance", click: () => sendMenuAction("settings", "Appearance") },
            { label: "Resync", click: () => sendMenuAction("settings", "Resync") },
            { label: "Export", click: () => sendMenuAction("settings", "Export") },
          ],
        },
        ...(isMac ? [] : [{ type: "separator" }, { role: "quit", label: "Exit" }]),
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { label: "Toggle Tile / List View", click: () => sendMenuAction("toggleView") },
        { label: "Toggle Stats View", click: () => sendMenuAction("toggleStats") },
        { label: "Reset Filters", click: () => sendMenuAction("resetFilters") },
        { type: "separator" },
        {
          label: "Display",
          submenu: [
            { label: "Tile Size", submenu: displayGroup("tileSize", [["Small", "small"], ["Medium", "medium"], ["Large", "large"]]) },
            { label: "Tile Gap", submenu: displayGroup("tileGap", [["Small", "small"], ["Medium", "medium"], ["Large", "large"]]) },
            { label: "Tile Overlay", submenu: displayGroup("tileOverlay", [["None", "none"], ["No Icon", "no-icon"], ["Full", "full"]]) },
            { label: "List Row Size", submenu: displayGroup("listRowSize", [["Small", "small"], ["Medium", "medium"], ["Large", "large"]]) },
            { label: "Scroll Speed", submenu: displayGroup("scrollSpeed", [["Slow", "slow"], ["Normal", "medium"], ["Fast", "fast"], ["Very Fast", "veryfast"]]) },
          ],
        },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Resync",
      submenu: [
        { label: "Resync Steam Library", click: () => sendMenuAction("resyncSteam") },
        { label: "Resync GOG Library", click: () => sendMenuAction("resyncGog") },
        { type: "separator" },
        { label: "Fetch Missing Cover Art", click: () => sendMenuAction("fetchArt") },
        { label: "Fill Missing Movie/TV Info", click: () => sendMenuAction("fillMovieTv") },
        { label: "Fetch HowLongToBeat Times", click: () => sendMenuAction("fetchHltb") },
        { type: "separator" },
        { label: "Resync Everything", click: () => sendMenuAction("resyncAll") },
      ],
    },
    { role: "windowMenu" },
    {
      label: "Help",
      submenu: [
        { label: "Show Welcome Screen", click: () => sendMenuAction("showWelcome") },
        { label: "About && Credits", click: () => sendMenuAction("showAbout") },
        { type: "separator" },
        {
          label: "Send Error Report",
          click: () => shell.openExternal(githubIssueUrl({
            label: "bug",
            bodyLines: [
              "__ENV__",
              "",
              "**Steps to Reproduce:**\n1. ",
              "",
              "**Expected:**\n",
              "",
              "**Actual:**\n",
            ],
          })),
        },
        {
          label: "Feature Request",
          click: () => shell.openExternal(githubIssueUrl({
            label: "enhancement",
            bodyLines: [
              "**Description:**\n",
              "",
              "**Why:**\n",
            ],
          })),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Safety net for detached background-enrichment IIFEs (each has its own
// .catch() too) and any future detached async work — log, don't crash.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});

app.whenReady().then(() => {
  // No legitimate use for camera/mic/geolocation/etc. — deny explicitly
  // rather than relying on Electron's default.
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(false);
  });

  // Initialise database
  const dbPath = path.join(app.getPath("userData"), "vault.db");
  db = new Database(dbPath);
  try {
    db.initialise();
    // Epic integration was removed — drop any Epic login still stored.
    db.setSetting("epic_refresh_token", null);
  } catch (err) {
    // Most likely _migrate()'s schema-downgrade guard (e.g. a newer-version
    // backup was just restored) — surface it as a real dialog instead of
    // letting it fall through to the unhandledRejection logger above, which
    // would leave the app silently failing to open any window at all.
    dialog.showErrorBox("The Media Vault can't open this database", err.message || String(err));
    app.exit(1);
    return;
  }

  createWindow();
  buildAppMenu();
  persistLegacyServerIfInUse();
  carryOverGogOptIn();
  autoSync.start(); // background Cloud Sync timer (does nothing unless the mode is "auto")

  // Cold-start deep link: either a vault:// URL passed as a launch arg
  // (Windows/Linux), or one that arrived via open-url before this window
  // existed (macOS, see pendingDeepLinkUrl above). did-finish-load ensures
  // the renderer's deepLink.onOpen subscription is mounted before it fires.
  const initialDeepLinkUrl = pendingDeepLinkUrl || process.argv.find(a => a.startsWith("vault://"));
  if (initialDeepLinkUrl) {
    mainWindow.webContents.once("did-finish-load", () => handleDeepLink(initialDeepLinkUrl));
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ── IPC Handlers — media items ─────────────────────────────────────────────

ipcMain.handle("items:getAll", () => {
  return db.getAllItems();
});

ipcMain.handle("items:add", (event, itemData) => {
  return db.addItem(itemData);
});

ipcMain.handle("items:update", (event, id, itemData) => {
  return db.updateItem(id, itemData);
});

// Narrow sibling to items:update — writes only the given fields, bypassing
// updateItem()'s fixed column whitelist. For background-tracking fields
// (metadata_checked_date etc.) that aren't form-editable.
ipcMain.handle("items:updateFields", (event, id, fields) => {
  db.updateFields(id, fields);
  return db.getItem(id);
});

ipcMain.handle("items:delete", (event, { id, deleteCoverArt }) => {
  const item = db.getItem(id);
  const result = db.deleteItem(id);
  if (deleteCoverArt && item?.cover_art_path && !db.coverArtPathInUse(item.cover_art_path)) {
    try { fs.unlinkSync(item.cover_art_path); } catch { /* file already gone, or never existed */ }
  }
  return result;
});

ipcMain.handle("items:deleteMany", (event, { ids, deleteCoverArt }) => {
  const paths = deleteCoverArt
    ? [...new Set(db.getCoverArtPathsByIds(ids))]
    : [];
  const result = db.deleteItems(ids);
  for (const p of paths) {
    if (!db.coverArtPathInUse(p)) {
      try { fs.unlinkSync(p); } catch { /* file already gone, or never existed */ }
    }
  }
  return result;
});

ipcMain.handle("items:search", (event, query) => {
  return db.searchItems(query);
});

ipcMain.handle("items:getGenres", () => db.getDistinctGenres());

// ── IPC Handlers — lists ──────────────────────────────────────────────────

ipcMain.handle("lists:getAll", () => db.getLists());
ipcMain.handle("lists:create", (event, name) => db.createList(name));
ipcMain.handle("lists:delete", (event, id) => db.deleteList(id));
ipcMain.handle("lists:addItems", (event, listId, itemIds) => db.addItemsToList(listId, itemIds));
ipcMain.handle("lists:removeItem", (event, listId, itemId) => db.removeItemFromList(listId, itemId));
ipcMain.handle("lists:toggleFavourite", (event, itemId) => db.toggleFavourite(itemId));

// ── IPC Handlers — custom types ───────────────────────────────────────────

ipcMain.handle("customTypes:getAll",  ()             => db.getCustomTypes());
ipcMain.handle("customTypes:add",     (event, data)  => db.addCustomType(data));
ipcMain.handle("customTypes:update",  (event, id, data) => db.updateCustomType(id, data));
ipcMain.handle("customTypes:delete",  (event, id)    => db.deleteCustomType(id));

// ── IPC Handlers — dialogs & files ────────────────────────────────────────

ipcMain.handle("dialog:openImage", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "webp"] }],
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle("dialog:openCSV", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [{ name: "CSV Files", extensions: ["csv"] }],
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle("files:readCSV", async (event, filePath) => {
  const fs = require("fs");
  try {
    const buffer = fs.readFileSync(filePath);
    const utf8 = buffer.toString("utf-8");
    // U+FFFD means invalid UTF-8 byte sequences — a sign of cp1252 content.
    return utf8.includes("�") ? decodeCp1252(buffer) : utf8;
  } catch (err) {
    throw new Error(`Failed to read file: ${err.message}`);
  }
});

// Cover-art resolution (incl. path-traversal guard) lives in lib/importCoverArt.js.
ipcMain.handle("items:import", (event, items, csvFilePath) => {
  const coverArtSourceDir = csvFilePath ? path.dirname(csvFilePath) : null;
  const resolvedItems = resolveImportCoverArt(items, coverArtSourceDir, coverArtDir());
  return db.importItems(resolvedItems);
});

ipcMain.handle("items:findDuplicate", (event, candidate) => db.findDuplicate(candidate));

// Cleans up cover art downloaded during a search that never got attached
// (e.g. a duplicate was found and the add was cancelled).
ipcMain.handle("coverArt:deleteIfUnused", (event, coverArtPath) => {
  if (!coverArtPath || db.coverArtPathInUse(coverArtPath)) return false;
  try { fs.unlinkSync(coverArtPath); return true; } catch { return false; }
});

// Full-library orphan sweep — same guard as the single-file cleanup above,
// applied to every file in the folder. Skips files modified in the last 10
// minutes so an in-progress Add/Edit's not-yet-saved cover isn't swept.
const ORPHAN_SCAN_GRACE_MS = 10 * 60 * 1000;
ipcMain.handle("coverArt:scanOrphaned", () => {
  const dir = coverArtDir();
  const now = Date.now();
  const orphaned = [];
  // One query for every in-use path, not one per file — see
  // allCoverArtPathsInUse's own comment for why coverArtPathInUse itself
  // can't just be called in this loop.
  const inUse = db.allCoverArtPathsInUse();
  for (const name of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, name);
    let stat;
    try { stat = fs.statSync(fullPath); } catch { continue; }
    if (!stat.isFile()) continue;
    if (now - stat.mtimeMs < ORPHAN_SCAN_GRACE_MS) continue;
    if (inUse.has(fullPath.replace(/\\/g, "/").toLowerCase())) continue;
    orphaned.push({ path: fullPath, size: stat.size });
  }
  return orphaned;
});

ipcMain.handle("coverArt:deleteOrphaned", (event, paths) => {
  let deleted = 0;
  for (const p of paths || []) {
    if (db.coverArtPathInUse(p)) continue; // re-check right before deleting, in case anything changed since the scan
    try { fs.unlinkSync(p); deleted++; } catch {}
  }
  return deleted;
});

// ── IPC Handlers — folders ────────────────────────────────────────────────

// Manual .exe pointer for a Game the GOG auto-scan missed — writes to
// install_path via items:updateFields, same column the scans populate.
ipcMain.handle("dialog:openExecutable", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [{ name: "Executable", extensions: ["exe"] }],
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle("dialog:openFolder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// Logic lives in lib/folderScan.js.
ipcMain.handle("folders:scan", async (event, folderPath, mediaType) => {
  return scanLocalLibraryFolder(folderPath, mediaType);
});

ipcMain.handle("folders:getAll",      ()                    => db.getFolders());
ipcMain.handle("folders:add",         (e, folderPath, type) => db.addFolder(folderPath, type));
ipcMain.handle("folders:updateScan",  (e, id, count)        => db.updateFolderScan(id, count));
ipcMain.handle("folders:remove",      (e, id)               => db.removeFolder(id));
ipcMain.handle("folders:processScan", (e, items)            => db.processScanResults(items));

// ── IPC Handlers — cover art fetch ───────────────────────────────────────

ipcMain.handle("bgg:downloadArt", async (event, url, bggId) => {
  const ext      = (url.split(".").pop().split("?")[0] || "jpg").toLowerCase();
  const destPath = path.join(coverArtDir(), `bgg-${slugify(String(bggId))}.${ext}`);
  if (fs.existsSync(destPath)) return destPath;
  await downloadImage(url, destPath);
  return destPath;
});

// ── IPC Handlers — photo scan (Gemini vision) ───────────────────────────────

ipcMain.handle("photo:scanImage", async (event, filePath) => {
  return await gemini.scanPhotoForItems(filePath, getDecryptedSetting("gemini_api_key"));
});

// Import → Map step's "Auto-map with AI" — header names + up to 3 sample rows
// only; the service clamps and validates both directions (packages/core/csvMapping.js).
ipcMain.handle("csv:suggestMapping", async (event, payload) => {
  return await gemini.suggestCsvMapping(payload || {}, getDecryptedSetting("gemini_api_key"));
});

ipcMain.handle("coverArt:fetch", async (event, { title, year, mediaType, imdbUrl, platformId }) => {
  console.log(`[coverArt:fetch] title="${title}" mediaType="${mediaType}"`);

  const destDir = coverArtDir();

  let stableFilename;
  if ((mediaType === "Movie" || mediaType === "TV") && imdbUrl) {
    const match = imdbUrl.match(/tt\d+/);
    stableFilename = match ? `${match[0]}.jpg` : `${slugify(title)}-${year || "unknown"}.jpg`;
  } else {
    stableFilename = `${slugify(title)}-${year || "unknown"}.jpg`;
  }

  const destPath = path.join(destDir, stableFilename);

  // Return existing file immediately — no API call needed
  if (fs.existsSync(destPath)) return destPath;

  // Movie / TV — TMDB only
  if (mediaType === "Movie" || mediaType === "TV") {
    return movie.fetchMovieCoverArt(mediaType, title, year, destPath, db.getSetting("tmdb_api_key"));
  }

  // Audiobook with no Audible id to look up directly — Audible's own catalog by
  // title, so the cover matches every other audiobook's (an Open Library match
  // is a BOOK cover). No match throws rather than saving the wrong picture.
  if (mediaType === "Audiobook") {
    const imageUrl = audible.pickAudibleCoverUrl(await audible.searchAudibleBooks(title), title);
    if (!imageUrl) throw new Error("No matching audiobook found on Audible — try uploading art manually.");
    await downloadImage(imageUrl, destPath);
    return destPath;
  }

  // Book — Open Library (no key required)
  if (mediaType === "Book") {
    const imageUrl = await openLibrary.findOpenLibraryCoverUrl(title);
    await downloadImage(imageUrl, destPath);
    return destPath;
  }

  // GOG-sourced Game — a "gog-" prefixed platformId isn't a Steam appid;
  // route to GOG's own catalog instead of a doomed Steam search.
  if (mediaType === "Game" && typeof platformId === "string" && platformId.startsWith("gog-")) {
    return await gog.fetchGogCoverArt(platformId, title, destPath);
  }

  // Game — Steam directly, or IGDB fallback
  if (mediaType === "Game") {
    const steamResult = await steam.fetchSteamGameCoverArt(platformId, title, destPath);
    if (steamResult) return steamResult;

    // Steam has no EA/Nintendo titles — IGDB isn't storefront-specific, so
    // it covers those too. Degrades quietly if no IGDB key is configured.
    try {
      const igdbResult = await igdb.fetchIgdbCoverArt(title, destPath, db.getSetting("igdb_client_id"), getDecryptedSetting("igdb_client_secret"));
      if (igdbResult) return igdbResult;
    } catch { /* not configured, or failed — fall through to the error below */ }

    throw new Error("No cover found on Steam or IGDB — try uploading art manually.");
  }

  // Web Video — a channel, video or playlist; its details lookup downloads
  // the thumbnail (trying each size) and returns the saved path.
  if (mediaType === "Web Video") {
    if (!platformId) throw new Error("No YouTube id saved for this item — can't look up its art.");
    const key = db.getSetting("youtube_api_key");
    if (!key) throw new Error("No YouTube Data API key set — add one in Settings.");
    const details = await youtube.getYoutubeDetails(String(platformId), key);
    if (details.cover_art_path) return details.cover_art_path;
    throw new Error("YouTube has no thumbnail for this item.");
  }

  // Board Game art is handled separately via the bgg:* handlers (see below).

  throw new Error(`Auto cover art not supported for ${mediaType}`);
});

// ── IPC Handlers — export ─────────────────────────────────────────────────

// Plain CSV, no zip, no bundled art — just the data, for opening straight in
// a spreadsheet or re-importing elsewhere without the image overhead.
ipcMain.handle("export:csvOnly", async () => {
  const items = db.exportAllItems();
  const csv = buildExportCsv(items, { withArtRefs: false });

  const result = await dialog.showSaveDialog(mainWindow, {
    title:       "Export Library (CSV only)",
    defaultPath: `the-vault-export-${new Date().toISOString().split("T")[0]}.csv`,
    filters:     [{ name: "CSV", extensions: ["csv"] }],
  });
  if (result.canceled) return { canceled: true };

  fs.writeFileSync(result.filePath, csv, "utf-8");
  return { success: true, path: result.filePath };
});

// Same as export:csvOnly, scoped to whatever's currently checked in the
// multi-select bar rather than the whole library.
ipcMain.handle("export:selected", async (event, ids) => {
  const items = db.exportItemsByIds(ids);
  const csv = buildExportCsv(items, { withArtRefs: false });

  const result = await dialog.showSaveDialog(mainWindow, {
    title:       "Export Selected Items",
    defaultPath: `the-vault-export-selected-${new Date().toISOString().split("T")[0]}.csv`,
    filters:     [{ name: "CSV", extensions: ["csv"] }],
  });
  if (result.canceled) return { canceled: true };

  fs.writeFileSync(result.filePath, csv, "utf-8");
  return { success: true, path: result.filePath };
});

// Zips a CSV (with relative cover_art/<filename> refs) alongside the actual
// images — cover_art_path itself is a local absolute path, meaningless
// elsewhere.
ipcMain.handle("export:csv", async () => {
  const items = db.exportAllItems();
  const csv = buildExportCsv(items, { withArtRefs: true });

  const result = await dialog.showSaveDialog(mainWindow, {
    title:       "Export Library",
    defaultPath: `the-vault-export-${new Date().toISOString().split("T")[0]}.zip`,
    filters:     [{ name: "Zip Archive", extensions: ["zip"] }],
  });
  if (result.canceled) return { canceled: true };

  const ZipArchive = await getZipArchiveClass();
  const output     = fs.createWriteStream(result.filePath);
  const archive    = new ZipArchive({ zlib: { level: 9 } });
  const done = new Promise((resolve, reject) => {
    output.on("close", resolve);
    archive.on("error", reject);
  });
  archive.pipe(output);
  archive.append(csv, { name: "library-export.csv" });

  const addedArt = new Set();
  for (const item of items) {
    if (!item.cover_art_path || !fs.existsSync(item.cover_art_path)) continue;
    const base = path.basename(item.cover_art_path);
    if (addedArt.has(base)) continue; // two items sharing the same cached art file
    archive.file(item.cover_art_path, { name: `cover_art/${base}` });
    addedArt.add(base);
  }

  await archive.finalize();
  await done;

  return { success: true, path: result.filePath };
});

// Full backup: db.backup() (WAL-safe, unlike a raw file copy) plus every
// file folder, zipped. Captures everything, unlike the CSV export above.
ipcMain.handle("backup:create", async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title:       "Full Backup",
    defaultPath: `the-vault-backup-${new Date().toISOString().split("T")[0]}.zip`,
    filters:     [{ name: "Zip Archive", extensions: ["zip"] }],
  });
  if (result.canceled) return { canceled: true };

  const tempDbPath = path.join(os.tmpdir(), `vault-backup-${Date.now()}.db`);
  await db.backup(tempDbPath);

  try {
    const output     = fs.createWriteStream(result.filePath);
    const ZipArchive = await getZipArchiveClass();
    const archive    = new ZipArchive({ zlib: { level: 9 } });
    const done = new Promise((resolve, reject) => {
      output.on("close", resolve);
      archive.on("error", reject);
    });
    archive.pipe(output);
    archive.file(tempDbPath, { name: "vault.db" });

    const maybeAddDir = (dirPath, zipFolderName) => {
      if (fs.existsSync(dirPath)) archive.directory(dirPath, zipFolderName);
    };
    maybeAddDir(coverArtDir(), "cover_art");

    await archive.finalize();
    await done;
  } finally {
    try { fs.unlinkSync(tempDbPath); } catch {}
  }

  return { success: true, path: result.filePath };
});

ipcMain.handle("backup:restore", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title:       "Restore from Backup",
    filters:     [{ name: "Zip Archive", extensions: ["zip"] }],
    properties:  ["openFile"],
  });
  if (result.canceled || !result.filePaths.length) return { canceled: true };
  const zipPath = result.filePaths[0];

  const tempExtractDir = path.join(os.tmpdir(), `vault-restore-${Date.now()}`);
  fs.mkdirSync(tempExtractDir, { recursive: true });
  try {
    await safeExtractZip(zipPath, tempExtractDir);

    const extractedDbPath = path.join(tempExtractDir, "vault.db");
    if (!fs.existsSync(extractedDbPath)) {
      throw new Error("That file doesn't look like a Media Vault backup — no vault.db found inside.");
    }

    // A file merely named vault.db could still be truncated, corrupt, or an
    // unrelated SQLite file — open it read-only and confirm it's actually a
    // Vault database before touching the live one.
    try {
      const testDb = new BetterSqlite3(extractedDbPath, { readonly: true });
      try {
        const hasMediaItems = testDb.prepare(
          `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'media_items'`
        ).get();
        if (!hasMediaItems) throw new Error("missing media_items table");
      } finally {
        testDb.close();
      }
    } catch {
      throw new Error("That backup file is corrupt or isn't a valid Media Vault database.");
    }

    // Close the live connection so its (locked) file can be moved aside.
    db.close();

    const userDataDir = app.getPath("userData");
    // Moved aside, not deleted — a failed restore stays recoverable by hand.
    const preRestoreDir = path.join(userDataDir, `pre-restore-${Date.now()}`);
    fs.mkdirSync(preRestoreDir, { recursive: true });

    const RESTORABLE_NAMES = ["vault.db", "vault.db-wal", "vault.db-shm", "cover_art"];
    for (const name of RESTORABLE_NAMES) {
      const src = path.join(userDataDir, name);
      if (fs.existsSync(src)) fs.renameSync(src, path.join(preRestoreDir, name));
    }
    for (const name of RESTORABLE_NAMES) {
      const src = path.join(tempExtractDir, name);
      if (fs.existsSync(src)) fs.cpSync(src, path.join(userDataDir, name), { recursive: true });
    }

    // Cleaned up explicitly — app.exit() below would skip the `finally`.
    try { fs.rmSync(tempExtractDir, { recursive: true, force: true }); } catch {}

    // Simpler and safer than hot-swapping the live DB connection in place.
    app.relaunch();
    app.exit(0);
    return { success: true };
  } finally {
    try { fs.rmSync(tempExtractDir, { recursive: true, force: true }); } catch {}
  }
});

// ── BGG (BoardGameGeek) — logic in services/bgg.js (needs a hidden ─────────
// BrowserWindow to get past Cloudflare, unlike most services).

ipcMain.handle("bgg:searchText", (event, query) => bgg.searchBggText(query));

ipcMain.handle("bgg:itemJson", (event, bggId) => bgg.fetchBggItemRaw(bggId));

ipcMain.handle("bgg:statsJson", (event, bggId) => bgg.getBggStats(bggId));

ipcMain.handle("bgg:expansions", (event, bggId) => bgg.getBggExpansions(bggId));

ipcMain.handle("bgg:moreFromDesigner", (event, { designer, excludeTitle }) => bgg.getBggMoreFromDesigner(designer, excludeTitle));

// ── IPC Handlers — Online search ─────────────────────────────────────────

ipcMain.handle("search:query", async (event, { query, mediaType, store = "steam", year, kind }) => {
  if (mediaType === "Game" && store === "gog") {
    return await gog.searchGogGames(query);
  }

  if (mediaType === "Game" && store === "igdb") {
    // Explicit pick, or SearchModal's fallback once Steam/GOG are
    // empty — IGDB isn't storefront-specific, so it covers console-exclusive
    // titles (Bloodborne, Nintendo, etc.) those miss.
    return await igdb.searchIgdbGames(query, db.getSetting("igdb_client_id"), getDecryptedSetting("igdb_client_secret"));
  }

  if (mediaType === "Game") {
    return steam.searchSteamGames(query);
  }

  // Web Video — YouTube. A pasted link/@handle resolves straight to that one
  // channel/video/playlist (1 quota unit); otherwise search channels or
  // videos by `kind` (100 units).
  if (mediaType === "Web Video") {
    const key = db.getSetting("youtube_api_key");
    if (youtube.parseYoutubeInput(query)) {
      const hit = await youtube.resolveYoutubeInput(query, key);
      return hit ? [hit] : [];
    }
    return await youtube.searchYoutube(query, key, kind === "video" ? "video" : "channel");
  }

  // Podcast — Apple's iTunes Search API, free/keyless.
  if (mediaType === "Podcast") {
    return await podcast.searchPodcasts(query);
  }

  // Audiobook — Audible only (never Open Library), so cover art is
  // consistent across every audiobook. Free/keyless; uses the same
  // `audible-<ASIN>` platform_id the Libation import writes, so the two
  // de-duplicate.
  if (mediaType === "Audiobook") {
    return await audible.searchAudibleBooks(query);
  }

  // Book — Open Library.
  if (mediaType === "Book") {
    return openLibrary.searchOpenLibrary(query, mediaType);
  }

  // Music — Discogs. Works unauthenticated; a free token (Settings ⚙) raises
  // the rate limit and is required for results to include a thumbnail.
  if (mediaType === "Music") {
    return (await discogs.searchDiscogsReleases(query, db.getSetting("discogs_api_key")))
      .filter(Boolean)
      .slice(0, 24)
      .map(r => ({
        platformId:   r.platformId,
        title:        r.title,
        type:         "music",
        storeUrl:     r.storeUrl,
        storeLabel:   "Discogs ↗",
        thumbnailUrl: r.thumbnailUrl,
        source:       "discogs",
      }));
  }

  if (mediaType === "Movie" || mediaType === "TV") {
    return movie.searchMovieTv(query, mediaType, db.getSetting("tmdb_api_key"), year);
  }

  throw new Error(`Search not yet supported for ${mediaType}.`);
});

// ── Movie/TV — logic lives in packages/core/movie.js ────────────────────────────


// Live "fetch info" lookup from the Add/Edit modal — same logic as the
// metadata backfill, for one item at a time.
ipcMain.handle("movie:lookupDetails", (event, item) => movie.enrichMovieItem(item, db.getSetting("tmdb_api_key")));

// ── Music (Discogs) ──────────────────────────────────────────────────────
// Logic lives in packages/core/discogs.js. These handlers are thin call-throughs
// that supply the Discogs API key from settings.

ipcMain.handle("music:lookupDetails", (event, item) => discogs.enrichMusicItem(item, db.getSetting("discogs_api_key")));

ipcMain.handle("music:moreFromArtist", (event, { artist, excludeTitle }) => discogs.getMusicMoreFromArtist(artist, excludeTitle, db.getSetting("discogs_api_key")));

ipcMain.handle("music:similarByGenre", (event, { genre, style, excludePlatformId }) => discogs.getMusicSimilarByGenre(genre, style, excludePlatformId, db.getSetting("discogs_api_key")));

// ── Movie/TV watch providers — logic lives in packages/core/movie.js ────────────
ipcMain.handle("movie:watchRegions", () => movie.getWatchRegionOptions());

ipcMain.handle("movie:providerOptions", (event, region) => movie.getMovieProviderOptions(region, db.getSetting("tmdb_api_key")));

// ── Movie/TV related-titles — logic lives in packages/core/movie.js ─────────────
ipcMain.handle("movie:moreFromCreator", (event, { creatorName, mediaType }) => movie.getMovieMoreFromCreator(creatorName, mediaType, db.getSetting("tmdb_api_key")));

ipcMain.handle("movie:moreFromSeries", (event, { seriesName }) => movie.getMovieMoreFromSeries(seriesName, db.getSetting("tmdb_api_key")));

ipcMain.handle("movie:similarTitles", (event, { platformId, mediaType }) => movie.getMovieSimilarTitles(platformId, mediaType, db.getSetting("tmdb_api_key")));

// Discovery's sections each return { items, reason } rather than a bare
// array, so the renderer can tell "no API key" apart from "nothing to show".

ipcMain.handle("discovery:dismiss", (event, { mediaType, tmdbId, title }) => {
  return db.dismissDiscoveryItem(mediaType, tmdbId, title);
});

ipcMain.handle("discovery:getDismissed", () => db.getDiscoveryDismissals());
ipcMain.handle("discovery:undismiss", (event, id) => db.undismissDiscoveryItem(id));

// "Recommended For You" — logic lives in packages/core/movie.js.
ipcMain.handle("discovery:recommendations", () => movie.getMovieRecommendations(db.getAllItems(), db.getDiscoveryDismissals(), db.getSetting("tmdb_api_key")));

// Book recommendations — seeded from the user's top-10 rated books' genre
// field via Open Library's real genre-browse endpoint. Logic lives in
// packages/core/openLibrary.js.
ipcMain.handle("discovery:bookRecommendations", async () => {
  return await openLibrary.getBookRecommendations(db.getAllItems(), db.getDiscoveryDismissals());
});

// Web Video — "New from your channels": latest uploads of the channels in the
// library (packages/core/youtube.js). Cached for 30 minutes so reopening
// Discover doesn't spend the API quota again; library changes (a channel
// added or a video added/dismissed) bust the cache via its key.
let ytUploadsCache = null;
ipcMain.handle("discovery:youtubeUploads", async (event, { force } = {}) => {
  const key = db.getSetting("youtube_api_key");
  const items = db.getAllItems();
  const dismissals = db.getDiscoveryDismissals();
  const signature = [key ? 1 : 0, items.filter(i => i.media_type === "Web Video").map(i => `${i.id}:${i.rating ?? ""}:${i.platform_id}`).join(","), dismissals.filter(d => d.media_type === "Web Video").length].join("|");
  if (!force && ytUploadsCache && ytUploadsCache.signature === signature && Date.now() - ytUploadsCache.at < 30 * 60 * 1000) return ytUploadsCache.result;
  const result = await youtube.getYoutubeNewUploads(items, dismissals, key);
  if (!result.reason) ytUploadsCache = { signature, at: Date.now(), result };
  return result;
});

// Refreshes the YouTube channels in the library (or just `ids`): subscriber and
// video counts always, the picture and description only where missing, plus
// the page URL. One API request per 50 channels. Used after a Takeout import
// and by Settings → Resync's "Refresh channel info".
ipcMain.handle("youtube:refreshChannels", async (event, { ids } = {}) => {
  const key = db.getSetting("youtube_api_key");
  if (!key) throw new Error("No YouTube Data API key set — add one in Settings.");
  const wanted = ids ? new Set(ids) : null;
  const channels = db.getAllItems().filter((i) => i.media_type === "Web Video" && i.platform_id
    && youtube.youtubeKind(i.platform_id) === "channel" && (!wanted || wanted.has(i.id)));
  if (!channels.length) return { total: 0, updated: 0, missing: 0 };
  const needArt = channels.filter((c) => !c.cover_art_path || !fs.existsSync(c.cover_art_path)).map((c) => c.platform_id);
  const details = await youtube.getYoutubeChannelsBatch(channels.map((c) => c.platform_id), key, { artFor: needArt });
  let updated = 0, missing = 0;
  for (const item of channels) {
    const d = details.get(item.platform_id);
    if (!d) { missing++; continue; }
    const patch = { subscribers: d.subscribers, video_count: d.video_count, url: d.url };
    if (!item.notes && d.notes) patch.notes = d.notes;
    if (!item.language && d.language) patch.language = d.language;
    if (!item.year && d.year) patch.year = d.year;
    if (d.cover_art_path) patch.cover_art_path = d.cover_art_path;
    db.updateFields(item.id, patch);
    updated++;
  }
  return { total: channels.length, updated, missing };
});

// A channel's recent uploads for its Item Profile's "More from" row.
ipcMain.handle("youtube:recentUploads", (event, { channelId }) => youtube.getYoutubeRecentUploads(channelId, db.getAllItems(), db.getSetting("youtube_api_key")));

// "More Like This" and "More From [Author]" for Book/Audiobook's Item
// Profile. Logic lives in packages/core/openLibrary.js — thin call-throughs.
ipcMain.handle("book:similarByGenre", (event, { genre, excludeKey }) => openLibrary.getBookSimilarByGenre(genre, excludeKey));

ipcMain.handle("book:worksByAuthor", (event, { creator, excludeKey }) => openLibrary.getBookWorksByAuthor(creator, excludeKey));

// "Trending This Week" — logic lives in packages/core/movie.js.
ipcMain.handle("discovery:trending", () => movie.getMovieTrending(db.getAllItems(), db.getDiscoveryDismissals(), db.getSetting("tmdb_api_key")));

// Checks (and caches) watch-provider availability for whatever's currently
// visible. Skips items checked today (cache covers every country in one
// shot). Items on an OMDB-shaped id get resolved via TMDB first and their
// platform_id upgraded permanently.
//
// watchCheckRunId guards against overlapping runs (e.g. changing view mid-
// check) — a new run bumps the id, and any older run stops reporting.
let watchCheckRunId = 0;

ipcMain.handle("movie:checkWatchProviders", async (event, { items }) => {
  const myRunId = ++watchCheckRunId;
  const tmdbKey = db.getSetting("tmdb_api_key");
  const today = new Date().toISOString().split("T")[0];

  const toCheck = items.filter(i => {
    if (i.media_type !== "Movie" && i.media_type !== "TV") return false;
    if (!i.platform_id) return false;
    // watch_providers null means it's never had the all-countries fetch —
    // due for a one-time backfill regardless of watch_checked_date.
    return i.watch_checked_date !== today || i.watch_providers == null;
  });

  const total = toCheck.length;
  const send = (payload) => {
    if (myRunId !== watchCheckRunId) return; // superseded — stay silent
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("movie:watchProgress", payload);
  };
  send({ done: 0, total });
  if (total === 0 || !tmdbKey) return null;

  let done = 0;
  for (const item of toCheck) {
    if (myRunId !== watchCheckRunId) break; // superseded — stop spending API calls on a run nobody's watching
    try {
      let tmdbId = item.platform_id;
      let idUpgraded = false;
      if (/^tt\d+$/.test(tmdbId)) {
        const resolved = await movie.resolveTmdbIdFromImdb(item.media_type, tmdbId, tmdbKey);
        if (!resolved) throw new Error("No TMDB match for this IMDb id");
        tmdbId = resolved;
        idUpgraded = true;
      }
      const providers = await movie.fetchWatchProviders(item.media_type, tmdbId, tmdbKey);
      db.updateFields(item.id, {
        ...(idUpgraded ? { platform_id: tmdbId } : {}),
        watch_providers: JSON.stringify(providers),
        watch_checked_date: today,
      });
      const updated = db.getItem(item.id);
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("movie:watchChecked", updated);
    } catch {
      // Stamp as checked with an explicit "{}" (not null, which would look
      // like a never-migrated row and retry forever) — becomes due again
      // once today rolls over.
      db.updateFields(item.id, { watch_checked_date: today, watch_providers: "{}" });
    }

    done++;
    send({ done, total });
    await new Promise(r => setTimeout(r, 300));
  }

  return null;
});

// Where to Watch for a not-yet-owned preview item — same TMDB lookup as
// above but with no DB row to write to or broadcast, just returns the
// providers object directly.
ipcMain.handle("movie:previewWatchProviders", (event, { mediaType, platformId }) => movie.previewMovieWatchProviders(mediaType, platformId, db.getSetting("tmdb_api_key")));

// Cancels the running Where to Watch check via the same run-id guard, and
// broadcasts {done:0,total:0} so the corner chip disappears immediately.
ipcMain.handle("movie:cancelWatchCheck", () => {
  watchCheckRunId++;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("movie:watchProgress", { done: 0, total: 0 });
  return { success: true };
});

// ── Book / Audiobook (Open Library) ──────────────────────────────────────
// Logic lives in packages/core/openLibrary.js. Thin call-through.
ipcMain.handle("book:lookupDetails", (event, item) => openLibrary.enrichBookItem(item));

// ── Podcast (Apple/iTunes) ───────────────────────────────────────────────
// Logic lives in packages/core/podcast.js. These handlers are thin call-throughs.

ipcMain.handle("podcast:moreFromHost", (event, { host, excludePlatformId }) => podcast.getPodcastMoreFromHost(host, excludePlatformId));

ipcMain.handle("podcast:similarByGenre", (event, { genre, excludePlatformId }) => podcast.getPodcastSimilarByGenre(genre, excludePlatformId));

ipcMain.handle("podcast:lookupDetails", (event, item) => podcast.enrichPodcastItem(item));

// Named function so the handler below can uniformly stamp
// metadata_checked_date onto whatever branch returns.
async function resolveSearchDetails({ platformId, mediaType, inferredType, year, creator, genre, store, thumbnailUrl, publisher, language, pageCount, ebookUrl }) {
  if (mediaType === "Game" && store === "igdb") {
    // Same shaping Fetch Info's IGDB path uses (igdbGameToItem).
    return await igdb.getIgdbGameDetailsById(platformId, db.getSetting("igdb_client_id"), getDecryptedSetting("igdb_client_secret"));
  }

  if (mediaType === "Game" && store === "gog") {
    return await gog.getGogGameDetails(platformId, thumbnailUrl, year, genre, creator);
  }

  if (mediaType === "Game") {
    return await steam.getSteamGameDetailsById(platformId, inferredType);
  }

  if (mediaType === "Web Video") {
    return await youtube.getYoutubeDetails(platformId, db.getSetting("youtube_api_key"));
  }

  if (mediaType === "Podcast") {
    return await podcast.fetchApplePodcastDetails(platformId);
  }

  if (mediaType === "Audiobook") {
    return await audible.getAudibleBookDetails(platformId);
  }

  if (mediaType === "Book") {
    return openLibrary.resolveOpenLibraryBookDetails({ platformId, mediaType, creator, year, publisher, language, pageCount, ebookUrl });
  }

  if (mediaType === "Music") {
    const discogsKey = db.getSetting("discogs_api_key");
    const details = await discogs.fetchDiscogsReleaseDetails(platformId, discogsKey);
    return { ...details, media_type: "Music", platform_id: platformId };
  }

  if (mediaType === "Movie" || mediaType === "TV") {
    const tmdbKey = db.getSetting("tmdb_api_key");
    if (!tmdbKey) throw new Error("No TMDB API key set — add one in Settings ⚙.");
    return movie.fetchTmdbMovieDetails(mediaType, platformId, tmdbKey);
  }

  throw new Error(`Details not yet supported for ${mediaType}.`);
}

ipcMain.handle("search:details", async (event, params) => {
  const result = await resolveSearchDetails(params);
  return result ? { ...result, metadata_checked_date: new Date().toISOString().split("T")[0] } : result;
});

// ── Website (Open Graph / schema.org) ────────────────────────────────────
// Logic lives in services/website.js. Thin call-through.
ipcMain.handle("website:fetchInfo", (event, rawUrl) => website.fetchWebsiteInfo(rawUrl));

// Written into coverArtDir() (not os.tmpdir()) since SearchModal promotes
// this exact path into cover_art_path when a Steam result gets added — a
// temp-dir file previously got reclaimed by Windows/AV, silently breaking
// the cover art (found live). `steam-thumb-` keeps this distinct from
// fetchSteamGameDetails' own `steam-enrich-` download.
ipcMain.handle("search:thumbnail", async (event, { platformId, mediaType }) => {
  // Same validation as steam:launch below — platformId also lands in a
  // filesystem path (destPath) as well as a URL, so an unvalidated value
  // isn't just a bad request, it's a path/URL injection point.
  if (mediaType === "Game" && !/^\d+$/.test(String(platformId))) return null;
  if (mediaType === "Game") {
    const portrait = `https://cdn.akamai.steamstatic.com/steam/apps/${platformId}/library_600x900.jpg`;
    const fallback = `https://cdn.akamai.steamstatic.com/steam/apps/${platformId}/header.jpg`;
    for (const url of [portrait, fallback]) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const contentType = res.headers.get("content-type") || "";
        if (!contentType.startsWith("image/")) continue;
        const buf = await res.arrayBuffer();
        const destPath = path.join(coverArtDir(), `steam-thumb-${platformId}.jpg`);
        fs.writeFileSync(destPath, Buffer.from(buf));
        return destPath;
      } catch { /* try next */ }
    }
    return null;
  }

  return null;
});

// ── IPC Handlers — Steam ──────────────────────────────────────────────────

// ── Steam — logic lives in packages/core/steam.js ─────────────────────────────
ipcMain.handle("steam:fetch", (event, { steamId, apiKey }) => steam.fetchSteamLibrary(steamId, apiKey));

// Separate from shell:openExternal (http/https only) — appId is always our
// own numeric platform_id, but still validated digits-only.
ipcMain.handle("steam:launch", (event, appId) => {
  if (!/^\d+$/.test(String(appId))) return;
  shell.openExternal(`steam://rungameid/${appId}`);
});

// No "More From Developer" for Games — verified live neither Steam's
// storesearch nor SteamSpy's developer endpoint actually returns results.
ipcMain.handle("game:similarGames", async (event, { appid }) => {
  if (!appid) return [];
  try {
    return await steam.fetchSteamSimilarGames(appid);
  } catch {
    return [];
  }
});

// ── IGDB (optional Game metadata/cover-art source) ─────────────────────────
// Pure IGDB logic (auth, throttling, query shaping) lives in packages/core/igdb.js;
// these handlers just supply the settings the service takes as parameters.

ipcMain.handle("game:igdbLookupDetails", (event, item) => igdb.enrichGameItemViaIgdb(item, db.getSetting("igdb_client_id"), getDecryptedSetting("igdb_client_secret")));

ipcMain.handle("game:igdbSimilarGames", (event, { igdbId }) => igdb.getIgdbSimilarGames(igdbId, db.getSetting("igdb_client_id"), getDecryptedSetting("igdb_client_secret")));

ipcMain.handle("game:igdbMoreFromDeveloper", (event, { developer, excludeTitle }) => igdb.getIgdbMoreFromDeveloper(developer, excludeTitle, db.getSetting("igdb_client_id"), getDecryptedSetting("igdb_client_secret")));

ipcMain.handle("game:igdbSimilarGamesByTitle", (event, { title }) => igdb.getIgdbSimilarGamesByTitle(title, db.getSetting("igdb_client_id"), getDecryptedSetting("igdb_client_secret")));

ipcMain.handle("steam:enrich", async (event, platformIds) => {
  (async () => {
    // Pre-filter: skip games already attempted (metadata_fetched = 1)
    const toEnrich = platformIds.filter(pid => {
      const item = db.getByPlatformId(String(pid));
      return item && !item.metadata_fetched;
    });

    const total = toEnrich.length;
    if (total === 0) return;

    const send = (payload) => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("steam:enrichProgress", payload);
    };

    send({ done: 0, total });

    let done = 0;
    for (const platformId of toEnrich) {
      try {
        const item = db.getByPlatformId(String(platformId));
        if (!item) { done++; send({ done, total }); continue; }

        const details = await steam.fetchSteamGameDetails(platformId);
        if (details) {
          // {} means removed/region-locked — still counts as attempted.
          if (Object.keys(details).length > 0) {
            db.patchNullFields(item.id, details);
          }
          db.markMetadataFetched(item.id);
          const updated = db.getByPlatformId(String(platformId));
          if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("steam:enriched", updated);
        }
        // null (rate limit / server error) — leave metadata_fetched=0 to retry.
      } catch { /* network failure — retry next time too */ }

      done++;
      send({ done, total });
      await new Promise(r => setTimeout(r, 1000));
    }
  })().catch(err => console.error("steam:enrich failed:", err));

  return null;
});

// Cover art for a Libation (Audible) CSV import — bulk imports never get
// art during the import itself, so this is a post-import enrichment pass,
// same as steam:enrich above.
// "More From [Author]" for an Audiobook's profile — Audible's own catalog, so
// every tile is a real audiobook that can be added.
ipcMain.handle("audible:moreFromAuthor", (event, { author, excludePlatformId }) => audible.getAudibleMoreFromAuthor(author, excludePlatformId));

ipcMain.handle("audible:enrichCovers", async (event, items) => {
  (async () => {
    for (const { platform_id, coverId } of items) {
      if (!coverId || !platform_id) continue;
      try {
        const item = db.getByPlatformId(platform_id);
        if (!item || item.cover_art_path) continue;
        const destPath = path.join(coverArtDir(), `audible-${coverId}.jpg`);
        if (!fs.existsSync(destPath)) {
          await downloadImage(`https://m.media-amazon.com/images/I/${coverId}.jpg`, destPath);
        }
        db.updateFields(item.id, { cover_art_path: destPath });
      } catch { /* leave uncovered — user can Force Resync / Fetch Art individually */ }
    }
  })().catch(err => console.error("audible:enrichCovers failed:", err));
  return null;
});

// ── GOG Import — auth/fetch/enrich logic in services/gog.js; the login ────
// window stays here since it manages a real BrowserWindow (OAuth only, no
// Steam-style paste-a-key option).

ipcMain.handle("gog:isConnected", () => !!getDecryptedSetting("gog_refresh_token"));

ipcMain.handle("gog:disconnect", () => { db.setSetting("gog_refresh_token", null); return null; });

// Opens a visible, locked-down login window and resolves with the OAuth
// code the instant any navigation event carries it — the redirect target
// bounces through to a plain homepage with no code visible to a human, so a
// system-browser-plus-copy flow isn't possible here.
function gogLoginWindow() {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 500, height: 720,
      title: "Log in with GOG",
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
    });
    restrictNavigation(win, ["auth.gog.com", "login.gog.com", "www.gog.com", "embed.gog.com"]);

    let settled = false;
    const tryExtractCode = (event, url) => {
      if (settled) return;
      // null for no code, a malformed one, or one that isn't plausibly an
      // OAuth code — the window just keeps waiting rather than settling on it.
      const code = extractGogCode(url);
      if (!code) return;
      settled = true;
      if (event?.preventDefault) event.preventDefault();
      win.close();
      resolve(code);
    };

    win.webContents.on("will-redirect", tryExtractCode);
    win.webContents.on("will-navigate", tryExtractCode);
    win.webContents.on("did-navigate", tryExtractCode);

    win.on("closed", () => {
      if (!settled) { settled = true; reject(new Error("GOG login window was closed before finishing.")); }
    });

    win.loadURL(gog.GOG_AUTH_URL);
  });
}

ipcMain.handle("gog:login", async () => {
  // GOG import is unofficial and opt-in (settings/GogCard.jsx) — refuse unless turned on.
  if (db.getSetting("gog_enabled") !== "1") throw new Error("Turn on GOG import in Settings first (it is off by default).");
  const code = await gogLoginWindow();
  const { refreshToken, accessToken } = await gog.exchangeGogCode(code);
  setEncryptedSetting("gog_refresh_token", refreshToken);

  const username = await gog.fetchGogUsername(accessToken);
  return { username };
});

ipcMain.handle("gog:fetch", async () => {
  const refreshToken = getDecryptedSetting("gog_refresh_token");
  if (!refreshToken) throw new Error("Log in with GOG first.");

  const { owned, wishlist, wishlistError, newRefreshToken } = await gog.fetchGogLibrary(refreshToken);
  // GOG rotates the refresh token on every use — persisting the new one is
  // required or the *next* sync's refresh call fails.
  if (newRefreshToken) setEncryptedSetting("gog_refresh_token", newRefreshToken);

  return { owned, wishlist, wishlistError };
});

// Background enrichment for GOG games — same shape as steam:enrich, but
// api.gog.com has no genre/cover fields at all, so this searches
// catalog.gog.com by title (text-search only) and matches back to the id.
ipcMain.handle("gog:enrich", async (event, platformIds) => {
  (async () => {
    // Retries anything still missing genre AND cover, even if already
    // attempted — a miss here is a fuzzy title-search result, not a stable
    // "won't exist" signal like Steam's. Stops retrying once cover_art_path
    // is set, since some GOG products just aren't in the searchable catalog.
    const toEnrich = platformIds.filter(pid => {
      const item = db.getByPlatformId(String(pid));
      return item && (!item.metadata_fetched || (!item.genre && !item.cover_art_path));
    });

    const total = toEnrich.length;
    if (total === 0) return;

    const send = (payload) => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("gog:enrichProgress", payload);
    };

    send({ done: 0, total });

    let done = 0;
    for (const platformId of toEnrich) {
      try {
        const item = db.getByPlatformId(String(platformId));
        if (!item) { done++; send({ done, total }); continue; }

        // item.platform_id carries the "gog-" prefix the app uses elsewhere.
        const numericId = item.platform_id.replace(/^gog-/, "");
        const details = await gog.fetchGogGameDetails(numericId, item.title);
        db.patchNullFields(item.id, details);
        // Mark attempted either way — the retry gate above (missing genre)
        // decides whether this gets tried again, not this flag alone.
        db.markMetadataFetched(item.id);
        const updated = db.getByPlatformId(String(platformId));
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("gog:enriched", updated);
      } catch { /* search or network failure — leave metadata_fetched=0 so it retries */ }

      done++;
      send({ done, total });
      await new Promise(r => setTimeout(r, 1000));
    }
  })().catch(err => console.error("gog:enrich failed:", err));

  return null;
});

// Used by the GOG install scan — resolves each library item's
// current install path via resolveExe and writes it if changed, clearing it
// back to null if no longer installed (not just a one-way "detect" check).
async function scanInstalledForPrefix(prefix, resolveExe) {
  const items = db.getAllItems().filter(i => i.media_type === "Game" && String(i.platform_id || "").startsWith(prefix));
  const updated = [];
  for (const item of items) {
    const id = item.platform_id.slice(prefix.length);
    let exePath = null;
    try { exePath = await resolveExe(id); } catch { /* treat any scan failure as not installed */ }
    if (exePath !== (item.install_path || null)) {
      db.updateFields(item.id, { install_path: exePath });
      updated.push({ id: item.id, install_path: exePath });
    }
  }
  return { scanned: items.length, updated };
}

// Runs on every launch so a newly-installed game gets its Launch button.
// Local-only — no API calls, works before ever logging in.
ipcMain.handle("gog:scanInstalled", () => {
  if (process.platform !== "win32") return { scanned: 0, updated: [] };
  return scanInstalledForPrefix("gog-", gog.resolveGogInstall);
});

// Generic — used for any locally-installed source that's resolved its own
// executable path (GOG), as opposed to Steam's steam:launch, which
// works off just an appid and needs no local file lookup at all.
ipcMain.handle("game:launch", (event, installPath) => {
  if (!installPath || typeof installPath !== "string") return;
  shell.openPath(installPath);
});

// Backfills missing Movie/TV metadata. Runs in the main process so it isn't
// blocked by the Settings window closing.
ipcMain.handle("movie:enrich", async (event, { items, force, forceOverwrite } = {}) => {
  (async () => {
    const tmdbKey = db.getSetting("tmdb_api_key");

    // Eligible if any patchNullFields-writable field is missing. Once
    // checked once, not auto-retried (some fields genuinely have no data)
    // unless `force` (manual button) or `forceOverwrite` (Force Refresh,
    // includes everything regardless of what's already filled in).
    const toEnrich = items.filter(i => {
      if (i.media_type !== "Movie" && i.media_type !== "TV") return false;
      if (forceOverwrite) return true;
      if (!force && i.metadata_checked_date) return false;
      const missingCommon = !i.year || !i.genre || !i.creator || !i.country || !i.language
        || !i.cast_list || !i.critic_rating || !i.content_rating || !i.runtime || !i.imdb_url
        || !i.cover_art_path || !i.notes || !i.platform_id;
      const missingTv = i.media_type === "TV" && (!i.network || !i.season_count);
      return missingCommon || missingTv;
    });

    const total = toEnrich.length;

    const send = (payload) => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("movie:enrichProgress", payload);
    };

    send({ done: 0, total });
    if (total === 0) return;

    let done = 0;
    for (const item of toEnrich) {
      try {
        const details = await movie.enrichMovieItem(item, tmdbKey);
        const fetched = {
          year:          details.year,
          genre:         details.genre,
          creator:       details.creator,
          country:       details.country,
          language:      details.language,
          cast_list:     details.cast_list,
          critic_rating: details.critic_rating,
          imdb_rating:   details.imdb_rating,
          imdb_votes:    details.imdb_votes,
          rotten_tomatoes_rating: details.rotten_tomatoes_rating,
          metacritic_rating: details.metacritic_rating,
          tmdb_rating:   details.tmdb_rating,
          tmdb_votes:    details.tmdb_votes,
          content_rating: details.content_rating,
          trailer_url:   details.trailer_url,
          series_name:   details.series_name,
          runtime:       details.runtime,
          imdb_url:      details.imdb_url,
          notes:         details.notes,
          network:       details.network,
          season_count:  details.season_count,
          cover_art_path: details.cover_art_path,
          platform_id:   details.platform_id,
        };
        if (forceOverwrite) {
          // Never blank a field the fetch didn't return — that's data loss.
          db.updateFields(item.id, Object.fromEntries(Object.entries(fetched).filter(([, v]) => v != null)));
        } else {
          db.patchNullFields(item.id, fetched);
          // patchNullFields won't touch platform_id if already set (stale
          // OMDB id) — force the upgrade through.
          if (details._idUpgraded) {
            db.updateFields(item.id, { platform_id: details.platform_id });
          }
        }
        const updated = db.getItem(item.id);
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("movie:enriched", updated);
      } catch { /* no match / API error — leave fields null, still stamp checked date */ }

      // Stamp regardless of outcome so it isn't auto-retried until forced.
      db.updateFields(item.id, { metadata_checked_date: new Date().toISOString().split("T")[0] });

      done++;
      send({ done, total });
      await new Promise(r => setTimeout(r, 300));
    }
  })().catch(err => console.error("movie:enrich failed:", err));

  return null;
});

// ── HowLongToBeat (unofficial — no public API exists) — same shape as ──────
// movie:enrich. hltb_checked_date gates re-fetching; `force` bypasses it.
ipcMain.handle("hltb:enrich", async (event, { items, force } = {}) => {
  (async () => {
    const toEnrich = items.filter(i => i.media_type === "Game" && (force || !i.hltb_checked_date));
    const total = toEnrich.length;

    const send = (payload) => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("hltb:enrichProgress", payload);
    };

    send({ done: 0, total });
    if (total === 0) return;

    let context = null;
    try {
      context = await hltbGetContext();
    } catch { /* individual searches below fail gracefully without it */ }

    const today = new Date().toISOString().split("T")[0];
    let done = 0;
    // HLTB has no real API and periodically moves its endpoint — without a
    // circuit breaker, a moved endpoint means every request fails and this
    // grinds through the whole backlog for nothing. 3 failures gives up.
    const MAX_CONSECUTIVE_FAILURES = 3;
    let consecutiveFailures = 0;
    for (const item of toEnrich) {
      let stats = null;
      let requestFailed = false;
      try {
        stats = await hltbSearchGame(item.title, context);
      } catch {
        // Request failed (not "no match") — likely the auth context expired
        // mid-batch. Refresh once and retry; carries forward to later items too.
        try {
          context = await hltbGetContext();
          stats = await hltbSearchGame(item.title, context);
        } catch {
          // Still failing — a real fetch failure, not "no match". Skip the
          // stamp so it's retried next pass instead of marked permanently.
          requestFailed = true;
        }
      }

      if (requestFailed) {
        consecutiveFailures++;
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          console.error(`hltb:enrich: giving up after ${consecutiveFailures} consecutive request failures — HLTB's search endpoint may have moved again.`);
          // Same "hide the chip" signal movie:cancelWatchCheck uses.
          send({ done: 0, total: 0 });
          return;
        }
      } else {
        consecutiveFailures = 0;
        db.updateFields(item.id, { ...(stats || {}), hltb_checked_date: today });
      }
      const updated = db.getItem(item.id);
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("hltb:enriched", updated);

      done++;
      send({ done, total });
      await new Promise(r => setTimeout(r, 300));
    }
  })().catch(err => console.error("hltb:enrich failed:", err));

  return null;
});

// HowLongToBeat for a not-yet-owned preview Game — same "no row to write
// to" case as movie:previewWatchProviders, so just returns the stats directly.
ipcMain.handle("hltb:previewTimes", async (event, { title }) => {
  if (!title) return null;
  try {
    const context = await hltbGetContext();
    return await hltbSearchGame(title, context);
  } catch {
    return null;
  }
});

// ── IPC Handlers — shell ──────────────────────────────────────────────────

// URLs here come from third-party APIs (TMDB/BGG/Steam), untrusted
// input for shell.openExternal — restricting to http/https blocks file://
// and other schemes that could reach outside the browser.
ipcMain.handle("shell:openExternal", (event, url) => {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return;
  shell.openExternal(url);
});

// navigator.clipboard.writeText is unreliable in a packaged Electron app —
// permission handling for the web Clipboard API is inconsistent there
// (a real bug found live: the Copy button on the recovery key screen
// silently did nothing). Electron's own clipboard module is synchronous
// and always available in the main process, no permission prompt involved.
ipcMain.handle("clipboard:writeText", (event, text) => { clipboard.writeText(text); });

// All three call sites pass a path the user themselves chose (a stored
// local_path/file_path from a folder/file picker, not third-party input),
// but shell.openPath is the more dangerous of the two shell handlers — it
// runs whatever's at the path via the OS's own default handler, rather than
// just opening a URL in the browser — so it gets the same "don't act on
// garbage input" guard as shell:openExternal above, even though the actual
// threat model here is renderer compromise, not attacker-supplied paths.
ipcMain.handle("shell:openPath", (event, folderPath) => {
  if (typeof folderPath !== "string" || !folderPath || !fs.existsSync(folderPath)) return;
  shell.openPath(folderPath);
});

// ── IPC Handlers — settings ───────────────────────────────────────────────

// Real account credentials, plus keys with real cost/access implications
// (a billable Gemini key, an OAuth client secret), are encrypted at rest via
// OS-keychain safeStorage. The "enc:" prefix lets a pre-encryption plaintext
// value still read back.
const ENCRYPTED_SETTINGS = new Set(["steam_api_key", "gog_refresh_token", "gemini_api_key", "igdb_client_secret", "supabase_refresh_token", "secret_vault_master_key"]);

function getDecryptedSetting(key) {
  const raw = db.getSetting(key);
  if (!raw || !raw.startsWith("enc:")) return raw;
  try {
    return safeStorage.decryptString(Buffer.from(raw.slice(4), "base64"));
  } catch {
    return null; // undecryptable (e.g. moved to a different machine/OS user) — treat as unset
  }
}

function setEncryptedSetting(key, value) {
  if (value && safeStorage.isEncryptionAvailable()) {
    return db.setSetting(key, "enc:" + safeStorage.encryptString(value).toString("base64"));
  }
  return db.setSetting(key, value);
}

ipcMain.handle("settings:get", (event, key) =>
  ENCRYPTED_SETTINGS.has(key) ? getDecryptedSetting(key) : db.getSetting(key));

ipcMain.handle("settings:set", (event, key, value) =>
  ENCRYPTED_SETTINGS.has(key) ? setEncryptedSetting(key, value) : db.setSetting(key, value));

// ── Cloud Sync — logic lives in lib/cloudSync.js (V3 step 2) ────────────────
// Only the Supabase session's refresh_token is ever stored (encrypted, same
// as GOG's OAuth token) — never the password, which only ever passes
// through cloudSync:login on its way to Supabase's own signInWithPassword.
// Supabase rotates the refresh token on every use, same as GOG — the new
// one from every login/sync is persisted, or the *next* sync's restore
// fails.

// The server this install uses: the one the user entered (Settings → Cloud
// Sync → Your server), or — only for an install that was already signed in
// before the server became configurable — the old built-in one. null means
// "not set up yet", and everything that needs the cloud says so.
function getSupabaseConfig() {
  return supabaseSetup.resolveSupabaseConfig({
    savedUrl: db.getSetting("supabase_url"),
    savedKey: db.getSetting("supabase_anon_key"),
    legacy: LEGACY_SERVER,
    hasExistingLogin: !!getDecryptedSetting("supabase_refresh_token"),
  });
}

// An already-signed-in install keeps working on the old server after the
// update; write that choice down so it shows in Settings and survives a later
// disconnect.
// GOG import became opt-in: an install already signed in to GOG keeps it.
function carryOverGogOptIn() {
  if (db.getSetting("gog_enabled") == null && getDecryptedSetting("gog_refresh_token")) db.setSetting("gog_enabled", "1");
}

function persistLegacyServerIfInUse() {
  const cfg = getSupabaseConfig();
  if (cfg && cfg.source === "legacy") {
    db.setSetting("supabase_url", cfg.url);
    db.setSetting("supabase_anon_key", cfg.key);
  }
}

let supabaseClient = null;
let supabaseClientFor = null;
function getSupabaseClient() {
  const cfg = getSupabaseConfig();
  if (!cfg) throw new Error("Set up your server first — Settings → Cloud Sync → Your server.");
  const id = `${cfg.url}|${cfg.key}`;
  if (!supabaseClient || supabaseClientFor !== id) {
    supabaseClient = createCloudSyncClient(cfg);
    supabaseClientFor = id;
  }
  return supabaseClient;
}

// Exchanges the stored refresh_token for a live session — used at the start
// of every sync so the user only ever logs in once (until the token itself
// stops working, e.g. explicit disconnect elsewhere or Supabase revoking it).
//
// Single-flight: refresh tokens are single-use (Supabase rotates them on
// every call), so if two IPC handlers both call this within the same
// moment — e.g. Settings opening both the Resync tab's Cloud Sync section
// and Encrypted Key Sync at once, both reading the same stored token —
// whichever request reaches Supabase first consumes and rotates it, and
// every other concurrent call still holding the now-already-used old token
// fails with "Refresh Token Not Found". A real bug hit live, not a
// hypothetical: caching the in-flight promise means concurrent callers all
// await the one real refresh instead of racing to consume the same token.
let refreshInFlight = null;
async function restoreSupabaseSession() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const refreshToken = getDecryptedSetting("supabase_refresh_token");
    if (!refreshToken) throw new Error("Log in to Cloud Sync in the Cloud Sync tab first.");
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    if (error) {
      // A dropped connection is not an expired login: say so, so the person isn't told to sign in again.
      if (/fetch failed|network|ENOTFOUND|ECONN|ETIMEDOUT|EAI_AGAIN|timed? ?out/i.test(`${error.name} ${error.message}`) || error.status === 0) {
        throw new Error(`Can't reach your Cloud Sync server right now — check your internet connection and try again. (${error.message})`);
      }
      throw new Error(`Cloud Sync session expired — log in again. (${error.message})`);
    }
    setEncryptedSetting("supabase_refresh_token", data.session.refresh_token);
    return { supabase, userId: data.user.id };
  })();
  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

ipcMain.handle("cloudSync:isConnected", () => !!getDecryptedSetting("supabase_refresh_token"));

ipcMain.handle("cloudSync:login", async (event, { email, password }) => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  setEncryptedSetting("supabase_refresh_token", data.session.refresh_token);
  return { email: data.user.email };
});

// Making an account on the person's own server from inside the app. With email confirmation off, the
// answer carries a session and this signs in; with it on, nothing is stored and the caller says to
// check email. The password is only ever held for this one call, like cloudSync:login.
ipcMain.handle("cloudSync:signUp", async (event, { email, password }) => {
  const supabase = getSupabaseClient();
  const outcome = authForm.signUpOutcome(await supabase.auth.signUp({ email, password }));
  if (outcome.kind === "signedIn") {
    // signUp already returned the session; a fresh sign-in gives us the refresh token to keep.
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    setEncryptedSetting("supabase_refresh_token", data.session.refresh_token);
    return { kind: "signedIn", email: data.user.email };
  }
  return outcome;
});

ipcMain.handle("cloudSync:disconnect", () => { db.setSetting("supabase_refresh_token", null); return null; });

// "Upload covers" in Settings → Resync: the same thumbnail upload, on demand,
// with its result shown.
ipcMain.handle("cloudSync:uploadThumbnails", async () => {
  const { supabase, userId } = await restoreSupabaseSession();
  return uploadCoverThumbnails(supabase, userId);
});

// ── About ───────────────────────────────────────────────────────────────────
// Files shipped next to the program (see package.json "build.extraResources");
// when running from source they are read from the project instead.
const shippedFile = (name, devPath) => (app.isPackaged ? path.join(process.resourcesPath, name) : path.join(__dirname, devPath));
ipcMain.handle("app:getInfo", () => ({ version: app.getVersion(), dataPath: app.getPath("userData") }));
ipcMain.handle("app:openLicences", () => shell.openPath(shippedFile("THIRD_PARTY_LICENSES.txt", path.join("build", "THIRD_PARTY_LICENSES.txt"))));
ipcMain.handle("app:openPrivacy", () => shell.openPath(shippedFile("privacy.html", path.join("docs", "privacy.html"))));

// ── Your server (bring your own Supabase project) ──────────────────────────
// What the Settings screen shows: whether a server is set, which one, and the
// last few characters of its key (the key itself is public by design but there
// is no reason to display all of it).
ipcMain.handle("cloudSync:getConfig", () => {
  const cfg = getSupabaseConfig();
  if (!cfg) return { configured: false };
  return { configured: true, url: cfg.url, host: new URL(cfg.url).host, keyHint: cfg.key.slice(-4) };
});

// "Test connection": reachable, key accepted, setup SQL run. Nothing is saved.
ipcMain.handle("cloudSync:testConfig", (event, { url, key }) => supabaseSetup.testSupabaseConnection({ url, key }));

// Saves the server. Switching to a DIFFERENT one signs this install out of the
// old one and forgets what it knew about it: the sign-in, the unlocked key
// vault (it belongs to the old server) and the sync checkpoints, so the new
// server receives the whole library on its first sync instead of only recent edits.
ipcMain.handle("cloudSync:setConfig", (event, { url, key }) => {
  const u = supabaseSetup.normalizeSupabaseUrl(url);
  if (!u.ok) throw new Error(u.error);
  const k = supabaseSetup.validateSupabaseKey(key);
  if (!k.ok) throw new Error(k.error);
  const current = getSupabaseConfig();
  const changed = !current || current.url !== u.url || current.key !== k.key;
  if (changed) {
    db.setSetting("supabase_refresh_token", null);
    db.setSetting("cloud_sync_email", null);
    db.setSetting("secret_vault_master_key", null);
    db.setSetting("cloud_sync_last_pulled_at", null);
    db.setSetting("cloud_sync_last_synced_at", null);
  }
  db.setSetting("supabase_url", u.url);
  db.setSetting("supabase_anon_key", k.key);
  supabaseClient = null;
  supabaseClientFor = null;
  return { url: u.url, host: new URL(u.url).host, changed };
});

// The SQL a new Supabase project needs. "Copy setup SQL" puts it on the clipboard
// from HERE: the sandboxed window itself is not allowed to write to the clipboard.
ipcMain.handle("cloudSync:getSetupSql", () => fs.readFileSync(path.join(__dirname, "supabase", "schema_current.sql"), "utf8"));
ipcMain.handle("cloudSync:copySetupSql", () => {
  clipboard.writeText(fs.readFileSync(path.join(__dirname, "supabase", "schema_current.sql"), "utf8"));
  return true;
});

// The phone's problems log, sent by the phone's "Send log to my computer" button (or from its recovery screen
// when the app would not open) into the person's own server. This fetches it, keeps a copy as a text file in
// the app's data folder (phone-log.txt) so it can be opened or sent on, and returns it for display.
let lastPhoneLogText = null;
ipcMain.handle("cloudSync:getPhoneLog", async () => {
  const { supabase } = await restoreSupabaseSession();
  const { data, error } = await supabase.from("app_settings").select("value").eq("key", phoneLog.PHONE_LOG_KEY).maybeSingle();
  if (error) throw new Error(error.message);
  const text = data ? phoneLog.formatPhoneLog(data.value) : null;
  if (!text) { lastPhoneLogText = null; return { found: false }; }
  lastPhoneLogText = text;
  const file = path.join(app.getPath("userData"), "phone-log.txt");
  fs.writeFileSync(file, text, "utf8");
  return { found: true, text, file };
});
ipcMain.handle("cloudSync:copyPhoneLog", () => {
  if (!lastPhoneLogText) throw new Error("Fetch the phone's log first.");
  clipboard.writeText(lastPhoneLogText);
  return true;
});
ipcMain.handle("cloudSync:showPhoneLogFile", () => {
  const file = path.join(app.getPath("userData"), "phone-log.txt");
  if (fs.existsSync(file)) shell.showItemInFolder(file);
  return fs.existsSync(file);
});

// The setup code for the phone: this server's address and publishable key as one piece of text (shown
// as a QR code). The publishable key is public by design; a secret key never gets this far.
ipcMain.handle("cloudSync:getSetupCode", () => {
  const cfg = getSupabaseConfig();
  if (!cfg) throw new Error("Set up your server first.");
  return setupCode.encodeSetupCode({ url: cfg.url, key: cfg.key });
});
ipcMain.handle("cloudSync:copySetupCode", () => {
  const cfg = getSupabaseConfig();
  if (!cfg) throw new Error("Set up your server first.");
  clipboard.writeText(setupCode.encodeSetupCode({ url: cfg.url, key: cfg.key }));
  return true;
});

// ── Cover-art link backfill ────────────────────────────────────────────────
// Items whose art was downloaded before cover_art_sources existed have no
// source URL to send, so the phone has to look each cover up itself (slow,
// rate-limited, patchy). This re-runs the per-source lookup against a
// storage that downloads nothing — it only checks the image URL and
// remembers it (lib/coverArtBackfill.js). Started in the background after a
// sync; recording a URL marks the item changed, so the NEXT sync uploads it.
const backfillCapture = new AsyncLocalStorage();
let backfillRunning = false;
let backfillLookup = null;
// Shown as a progress bar in Settings -> Resync -> Cloud Sync; the renderer
// can also ask for the current state (it may open Settings mid-run).
let backfillStatus = { running: false, done: 0, total: 0, recorded: 0 };
function setBackfillStatus(patch, { force = false } = {}) {
  const prev = backfillStatus;
  backfillStatus = { ...backfillStatus, ...patch };
  // Throttled: one message per 10 items, plus every start/finish.
  if (force || backfillStatus.done % 10 === 0 || prev.running !== backfillStatus.running) {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("cloudSync:coverArtProgress", backfillStatus);
  }
}
ipcMain.handle("cloudSync:coverArtStatus", () => backfillStatus);

function getBackfillLookup() {
  if (backfillLookup) return backfillLookup;
  const capturing = {
    coverArtDir,
    joinPath: (...parts) => path.join(...parts),
    fileExists: () => true,
    downloadImage: async (url, _dest, headers) => { await verifyImageUrl(url, headers); const s = backfillCapture.getStore(); if (s) s.url = url; },
    ensureImage: async (url, _dest, headers) => { await verifyImageUrl(url, headers); const s = backfillCapture.getStore(); if (s) s.url = url; },
  };
  const svc = (name) => require(`@media-vault/core/${name}`)(capturing);
  backfillLookup = require("@media-vault/core/coverArtLookup")({
    movie: svc("movie"), openLibrary: svc("openLibrary"), podcast: svc("podcast"),
    discogs: svc("discogs"), youtube: svc("youtube"), steam: svc("steam"), igdb: svc("igdb"), audible: svc("audible"),
  });
  return backfillLookup;
}

function startCoverArtBackfill() {
  if (backfillRunning) return Promise.resolve();
  backfillRunning = true;
  setBackfillStatus({ running: true, done: 0, total: 0, recorded: 0 }, { force: true });
  const keys = {
    tmdb: db.getSetting("tmdb_api_key"),
    discogs: db.getSetting("discogs_api_key"),
    youtube: db.getSetting("youtube_api_key"),
    igdbId: db.getSetting("igdb_client_id"),
    igdbSecret: getDecryptedSetting("igdb_client_secret"),
  };
  // Covers a lookup already failed for are not retried for a week (a map of
  // cover path -> when it last failed, kept in settings), so a library with a few
  // unfindable covers doesn't repeat those lookups after every sync.
  const RETRY_AFTER_MS = 7 * 24 * 3600 * 1000;
  let failedBefore = {};
  try { failedBefore = JSON.parse(db.getSetting("cover_backfill_failed") || "{}"); } catch { /* start fresh */ }
  const now = Date.now();
  const skipPaths = new Set(Object.entries(failedBefore).filter(([, at]) => now - at < RETRY_AFTER_MS).map(([p]) => p));
  const failedNow = {};
  return backfillCoverArtLinks(db, {
    lookup: getBackfillLookup(), captureStore: backfillCapture, keys, skipPaths,
    onFailed: (item) => { failedNow[item.cover_art_path] = now; },
    onProgress: ({ done, total, recorded }) => setBackfillStatus({ done, total, recorded }),
  })
    .then(({ total, recorded }) => {
      // Keep still-recent failures, add the new ones; a path that has since been linked or deleted drops out.
      const stillRelevant = Object.fromEntries(Object.entries({ ...failedBefore, ...failedNow }).filter(([, at]) => now - at < RETRY_AFTER_MS));
      db.setSetting("cover_backfill_failed", Object.keys(stillRelevant).length ? JSON.stringify(stillRelevant) : null);
      if (total) console.log(`[cover-art backfill] recorded ${recorded} of ${total} source links${skipPaths.size ? ` (${skipPaths.size} skipped: failed within the last week)` : ""}`);
    })
    .catch((err) => console.error("cover-art backfill failed:", err))
    .finally(() => { backfillRunning = false; setBackfillStatus({ running: false }, { force: true }); });
}

// ~300 px JPEG of a cover picture for the covers bucket; null when the file is
// not an image Electron can read.
async function makeCoverThumbnail(filePath) {
  const img = nativeImage.createFromPath(filePath);
  if (img.isEmpty()) return null;
  const resized = img.getSize().width > 300 ? img.resize({ width: 300, quality: "good" }) : img;
  return resized.toJPEG(80);
}

// Upload thumbnails for items with no source link (lib/coverThumbnails.js).
async function uploadCoverThumbnails(supabase, userId) {
  return require("./lib/coverThumbnails").uploadUnlinkedCoverThumbnails({ db, supabase, userId, makeThumbnail: makeCoverThumbnail, fs });
}

// One full pull + push. Never called directly: every sync (the Sync Now
// button, the launch sync, the background scheduler) goes through autoSync.syncNow
// below, so they share one lock and one status.
async function performCloudSync() {
  const { supabase, userId } = await restoreSupabaseSession();

  let deviceId = db.getSetting("cloud_sync_device_id");
  if (!deviceId) { deviceId = crypto.randomUUID(); db.setSetting("cloud_sync_device_id", deviceId); }

  // Pull BEFORE push: push re-sends every current list membership, so a
  // removal made on another device (a soft-deleted cloud row) has to be
  // applied locally first or this push would quietly re-add it.
  const lastPulledAt = db.getSetting("cloud_sync_last_pulled_at") || "1970-01-01T00:00:00";
  const pullStartedAt = new Date().toISOString();
  const pulled = await cloudSync.pullChanges(db, supabase, lastPulledAt);
  db.setSetting("cloud_sync_last_pulled_at", pullStartedAt);
  // What the phone has marked owned (best effort; never fails the sync).
  try { await cloudSync.pullRemoteOwnership(db, supabase, deviceId); } catch (e) { console.warn("[ownership sync] skipped:", e.message); }

  const lastPushedAt = db.getSetting("cloud_sync_last_synced_at") || "1970-01-01 00:00:00";
  const pushStartedAt = new Date().toISOString().replace("T", " ").replace("Z", "").split(".")[0];
  const pushed = await cloudSync.pushChanges(db, supabase, {
    userId, deviceId, since: lastPushedAt,
    deviceName: os.hostname() || "Desktop", devicePlatform: "desktop",
  });
  db.setSetting("cloud_sync_last_synced_at", pushStartedAt);

  // Items whose cloud row has a cover_art_url but that have no local art
  // yet (e.g. added on the phone): download straight from the link rather
  // than falling back to a source-API lookup later.
  const coverArtFetched = await downloadLinkedCoverArt(db, pulled.coverArtLinks || [], {
    ensureImage: desktopStorage.ensureImage, coverArtDir, fs, path,
  });

  // Appearance goes to the phone as one `app_settings` row. Best effort: a project
  // set up before this table existed just skips it (the phone keeps default colours).
  try {
    const appearance = buildAppearancePayload((k) => db.getSetting(k));
    if (appearance) {
      await supabase.from("app_settings").upsert(
        { user_id: userId, key: APPEARANCE_KEY, value: appearance, updated_at: new Date().toISOString() },
        { onConflict: "user_id,key" }
      );
    }
  } catch (e) { console.warn("[appearance sync] skipped:", e.message); }

  // Secrets sync only runs once a vault is already unlocked on this device
  // — first-time setup/unlock is its own explicit action (secretsSetup/
  // secretsUnlock below), not folded silently into the main sync button.
  let secretsSynced = false;
  if (getDecryptedSetting("secret_vault_master_key")) {
    try {
      const masterKeyHex = getDecryptedSetting("secret_vault_master_key");
      for (const key of SYNCED_SECRET_KEYS) {
        const plaintext = getDecryptedSetting(key);
        if (plaintext) {
          const ciphertext = await cryptoSync.encryptSecret(cryptoAdapterNode, masterKeyHex, plaintext);
          await supabase.from("encrypted_secrets").upsert(
            { user_id: userId, key_name: key, ciphertext, updated_at: new Date().toISOString() },
            { onConflict: "user_id,key_name" }
          );
        }
      }
      const { data: remoteSecrets } = await supabase.from("encrypted_secrets").select("key_name, ciphertext");
      for (const row of remoteSecrets || []) {
        if (!SYNCED_SECRET_KEYS.includes(row.key_name)) continue;
        const plaintext = await cryptoSync.decryptSecret(cryptoAdapterNode, masterKeyHex, row.ciphertext);
        if (ENCRYPTED_SETTINGS.has(row.key_name)) setEncryptedSetting(row.key_name, plaintext);
        else db.setSetting(row.key_name, plaintext);
      }
      secretsSynced = true;
    } catch { /* best-effort — a stale/wrong cached key shouldn't break item sync */ }
  }

  // Look for each cover's source link first; whatever it can't find gets a small
  // thumbnail on the user's own server instead (the next sync then carries both).
  startCoverArtBackfill()
    .then(() => uploadCoverThumbnails(supabase, userId))
    .then((r) => { if (r && (r.uploaded || r.failed || r.skipped || r.cleared || r.error)) console.log(`[cover thumbnails] uploaded ${r.uploaded}, skipped ${r.skipped}, failed ${r.failed}, empty files cleared ${r.cleared || 0}${r.error ? ` — ${r.error}` : r.firstProblem ? ` — first problem: ${r.firstProblem}` : ""}`); })
    .catch(() => {});

  const { coverArtLinks, ...pulledCounts } = pulled;
  return { pushed, pulled: { ...pulledCounts, coverArtFetched }, secretsSynced };
}

// ── Automatic Cloud Sync (lib/autoSync.js) ──────────────────────────────────
// Setting `cloud_sync_mode`: "off" | "launch" | "auto". Unset means whatever the
// old "sync when the app opens" checkbox said. "launch" is handled by the
// renderer's launch sync; "auto" additionally syncs about a minute after edits,
// when the window regains focus, and every few minutes to pull other devices'
// changes. Failures are broadcast so the renderer can show a banner.
const { createAutoSync } = require("./lib/autoSync");
const autoSync = createAutoSync({
  getMode: () => db.getSetting("cloud_sync_mode") || (db.getSetting("auto_cloud_sync_on_launch") === "1" ? "launch" : "off"),
  isConnected: () => !!getDecryptedSetting("supabase_refresh_token"),
  getChangeMarker: () => db.changeMarker(),
  runSync: performCloudSync,
  onStatus: (status) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("cloudSync:status", status);
  },
});
ipcMain.handle("cloudSync:sync", () => autoSync.syncNow());
ipcMain.handle("cloudSync:status", () => autoSync.getStatus());
ipcMain.handle("cloudSync:retry", () => autoSync.retryNow());

// ── Encrypted Key Sync — logic lives in packages/core/cryptoSync.js, the
// Node-specific primitives in lib/cryptoAdapterNode.js (V3 suggested-order
// step 5). Only the keys mobile's Search & Add / cover-art lookups actually
// use sync (TMDB, Discogs, YouTube, IGDB); the GOG login is deliberately excluded (already
// decided: each device logs in for itself, since GOG rotates its refresh
// token on every use). omdb_api_key was synced here too until OMDB was
// removed 2026-09-23 (see BACKLOG.md) — any previously-synced OMDB
// ciphertext row is now orphaned in Supabase's encrypted_secrets table,
// harmless but never read; a one-time
// `DELETE FROM encrypted_secrets WHERE key_name = 'omdb_api_key'` would
// clean it up if desired.
const SYNCED_SECRET_KEYS = ["tmdb_api_key", "discogs_api_key", "youtube_api_key", "igdb_client_id", "igdb_client_secret", "gemini_api_key", "steam_api_key", "steam_id"];

ipcMain.handle("cloudSync:secretsStatus", async () => {
  const unlockedLocally = !!getDecryptedSetting("secret_vault_master_key");
  if (unlockedLocally) return { vaultExists: true, unlockedLocally: true };
  // Only a genuinely-empty vault query means "no vault exists" — a broken
  // Cloud Sync session (expired/invalid refresh token) is a real error that
  // needs surfacing, not something to paper over as "no vault", which
  // misleadingly offers Set Up instead of the real fix (re-log in to Cloud
  // Sync) — a real bug found live: it hid exactly that error once already.
  const { supabase } = await restoreSupabaseSession();
  const { data } = await supabase.from("secret_vault").select("user_id").maybeSingle();
  return { vaultExists: !!data, unlockedLocally: false };
});

// First-ever setup for this account — no vault exists in the cloud yet.
ipcMain.handle("cloudSync:secretsSetup", async (event, { passphrase }) => {
  const { supabase, userId } = await restoreSupabaseSession();
  const { data: existing } = await supabase.from("secret_vault").select("user_id").maybeSingle();
  if (existing) throw new Error("A key vault already exists for this account — use Unlock instead of Set Up.");

  const { masterKeyHex, saltBase64, wrappedByPassphrase, wrappedByRecovery, recoveryKeyDisplay } =
    await cryptoSync.setupNewVault(cryptoAdapterNode, passphrase);

  const { error } = await supabase.from("secret_vault").insert({
    user_id: userId, salt: saltBase64,
    wrapped_master_key_passphrase: wrappedByPassphrase,
    wrapped_master_key_recovery: wrappedByRecovery,
  });
  if (error) throw new Error(error.message);

  setEncryptedSetting("secret_vault_master_key", masterKeyHex);
  return { recoveryKeyDisplay };
});

// A second device joining an already-set-up vault.
ipcMain.handle("cloudSync:secretsUnlock", async (event, { passphrase }) => {
  const { supabase } = await restoreSupabaseSession();
  const { data, error } = await supabase.from("secret_vault").select("*").single();
  if (error || !data) throw new Error("No key vault found for this account yet — use Set Up instead.");

  const masterKeyHex = await cryptoSync.unlockWithPassphrase(
    cryptoAdapterNode, passphrase, data.salt, data.wrapped_master_key_passphrase
  ).catch(() => { throw new Error("Wrong passphrase."); });

  setEncryptedSetting("secret_vault_master_key", masterKeyHex);
  return { success: true };
});

ipcMain.handle("cloudSync:secretsUnlockWithRecovery", async (event, { recoveryKeyDisplay }) => {
  const { supabase } = await restoreSupabaseSession();
  const { data, error } = await supabase.from("secret_vault").select("*").single();
  if (error || !data) throw new Error("No key vault found for this account yet.");

  const masterKeyHex = await cryptoSync.unlockWithRecoveryKey(
    cryptoAdapterNode, recoveryKeyDisplay, data.wrapped_master_key_recovery
  ).catch(() => { throw new Error("Wrong recovery key."); });

  setEncryptedSetting("secret_vault_master_key", masterKeyHex);
  return { success: true };
});

ipcMain.handle("cloudSync:secretsForget", () => { db.setSetting("secret_vault_master_key", null); return null; });

ipcMain.handle("files:saveCoverArt", async (event, sourcePath) => {
  const fs = require("fs");
  const dest = path.join(app.getPath("userData"), "cover_art");
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const ext = path.extname(sourcePath);
  const filename = `${Date.now()}${ext}`;
  const destPath = path.join(dest, filename);
  fs.copyFileSync(sourcePath, destPath);
  return destPath;
});

// Saves a cropped cover-art image produced client-side (canvas.toDataURL)
// straight to disk — the crop tool never has a source *file* to hand off to
// files:saveCoverArt, only pixel data.
ipcMain.handle("files:saveCoverArtDataUrl", async (event, dataUrl) => {
  const match = /^data:image\/(\w+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("Invalid image data");
  const [, ext, base64] = match;
  const destPath = path.join(coverArtDir(), `cropped-${Date.now()}.${ext}`);
  fs.writeFileSync(destPath, Buffer.from(base64, "base64"));
  return destPath;
});
