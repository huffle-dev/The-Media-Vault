const { contextBridge, ipcRenderer, webUtils } = require("electron");

// Expose a safe, limited API to the renderer process
// The renderer never has direct access to Node.js or Electron internals
contextBridge.exposeInMainWorld("vault", {
  items: {
    getAll:  ()           => ipcRenderer.invoke("items:getAll"),
    add:     (data)       => ipcRenderer.invoke("items:add", data),
    update:  (id, data)   => ipcRenderer.invoke("items:update", id, data),
    updateFields: (id, fields) => ipcRenderer.invoke("items:updateFields", id, fields),
    delete:  (id, deleteCoverArt = false) => ipcRenderer.invoke("items:delete", { id, deleteCoverArt }),
    search:  (query)      => ipcRenderer.invoke("items:search", query),
    import:      (items, csvFilePath) => ipcRenderer.invoke("items:import", items, csvFilePath),
    deleteMany:  (ids, deleteCoverArt = false) => ipcRenderer.invoke("items:deleteMany", { ids, deleteCoverArt }),
    getGenres:   ()        => ipcRenderer.invoke("items:getGenres"),
    findDuplicate: (candidate) => ipcRenderer.invoke("items:findDuplicate", candidate),
  },
  lists: {
    getAll:          ()                    => ipcRenderer.invoke("lists:getAll"),
    create:          (name)                => ipcRenderer.invoke("lists:create", name),
    delete:          (id)                  => ipcRenderer.invoke("lists:delete", id),
    addItems:        (listId, itemIds)     => ipcRenderer.invoke("lists:addItems", listId, itemIds),
    removeItem:      (listId, itemId)      => ipcRenderer.invoke("lists:removeItem", listId, itemId),
    toggleFavourite: (itemId)              => ipcRenderer.invoke("lists:toggleFavourite", itemId),
  },
  customTypes: {
    getAll: ()          => ipcRenderer.invoke("customTypes:getAll"),
    add:    (data)      => ipcRenderer.invoke("customTypes:add", data),
    update: (id, data)  => ipcRenderer.invoke("customTypes:update", id, data),
    delete: (id)        => ipcRenderer.invoke("customTypes:delete", id),
  },
  dialog: {
    openImage:        () => ipcRenderer.invoke("dialog:openImage"),
    openCSV:          () => ipcRenderer.invoke("dialog:openCSV"),
    openFolder:       () => ipcRenderer.invoke("dialog:openFolder"),
    openExecutable:   () => ipcRenderer.invoke("dialog:openExecutable"),
  },
  files: {
    saveCoverArt:    (sourcePath) => ipcRenderer.invoke("files:saveCoverArt", sourcePath),
    saveCoverArtDataUrl: (dataUrl) => ipcRenderer.invoke("files:saveCoverArtDataUrl", dataUrl),
    readCSV:         (filePath)   => ipcRenderer.invoke("files:readCSV", filePath),
    // Electron removed the renderer-side File.path property (as of v32) for
    // security reasons — a dropped/selected File's real filesystem path now
    // has to be resolved here, in the preload script, via webUtils instead.
    getPathForFile:  (file)       => webUtils.getPathForFile(file),
  },
  folders: {
    getAll:      ()                  => ipcRenderer.invoke("folders:getAll"),
    add:         (folderPath, type)  => ipcRenderer.invoke("folders:add", folderPath, type),
    scan:        (folderPath, type)  => ipcRenderer.invoke("folders:scan", folderPath, type),
    updateScan:  (id, count)         => ipcRenderer.invoke("folders:updateScan", id, count),
    remove:      (id)                => ipcRenderer.invoke("folders:remove", id),
    processScan: (items)             => ipcRenderer.invoke("folders:processScan", items),
  },
  shell: {
    openExternal: (url)        => ipcRenderer.invoke("shell:openExternal", url),
    openPath:     (folderPath) => ipcRenderer.invoke("shell:openPath", folderPath),
  },
  clipboard: {
    writeText: (text) => ipcRenderer.invoke("clipboard:writeText", text),
  },
  settings: {
    get: (key)         => ipcRenderer.invoke("settings:get", key),
    set: (key, value)  => ipcRenderer.invoke("settings:set", key, value),
  },
  coverArt: {
    fetch: (params) => ipcRenderer.invoke("coverArt:fetch", params),
    deleteIfUnused: (coverArtPath) => ipcRenderer.invoke("coverArt:deleteIfUnused", coverArtPath),
    scanOrphaned: () => ipcRenderer.invoke("coverArt:scanOrphaned"),
    deleteOrphaned: (paths) => ipcRenderer.invoke("coverArt:deleteOrphaned", paths),
  },
  photo: {
    scanImage: (filePath) => ipcRenderer.invoke("photo:scanImage", filePath),
  },
  csv: {
    suggestMapping: (payload) => ipcRenderer.invoke("csv:suggestMapping", payload),
  },
  export: {
    csv:      () => ipcRenderer.invoke("export:csv"),
    csvOnly:  () => ipcRenderer.invoke("export:csvOnly"),
    selected: (ids) => ipcRenderer.invoke("export:selected", ids),
  },
  backup: {
    create:  () => ipcRenderer.invoke("backup:create"),
    restore: () => ipcRenderer.invoke("backup:restore"),
  },
  steam: {
    fetch:      (params)   => ipcRenderer.invoke("steam:fetch",  params),
    launch:     (appId)    => ipcRenderer.invoke("steam:launch", appId),
    enrich:     (ids)      => ipcRenderer.invoke("steam:enrich", ids),
    onEnriched:  (callback) => ipcRenderer.on("steam:enriched",       (event, item) => callback(item)),
    onProgress:  (callback) => ipcRenderer.on("steam:enrichProgress", (event, p)    => callback(p)),
  },
  audible: {
    enrichCovers: (items)  => ipcRenderer.invoke("audible:enrichCovers", items),
    moreFromAuthor: (author, excludePlatformId) => ipcRenderer.invoke("audible:moreFromAuthor", { author, excludePlatformId }),
  },
  gog: {
    login:        ()       => ipcRenderer.invoke("gog:login"),
    isConnected:  ()       => ipcRenderer.invoke("gog:isConnected"),
    disconnect:   ()       => ipcRenderer.invoke("gog:disconnect"),
    fetch:        ()       => ipcRenderer.invoke("gog:fetch"),
    scanInstalled: ()      => ipcRenderer.invoke("gog:scanInstalled"),
    enrich:       (ids)    => ipcRenderer.invoke("gog:enrich", ids),
    onEnriched:   (callback) => ipcRenderer.on("gog:enriched",       (event, item) => callback(item)),
    onProgress:   (callback) => ipcRenderer.on("gog:enrichProgress", (event, p)    => callback(p)),
  },
  cloudSync: {
    login:        (email, password) => ipcRenderer.invoke("cloudSync:login", { email, password }),
    signUp:       (email, password) => ipcRenderer.invoke("cloudSync:signUp", { email, password }),
    getPhoneLog:  ()       => ipcRenderer.invoke("cloudSync:getPhoneLog"),
    copyPhoneLog: ()       => ipcRenderer.invoke("cloudSync:copyPhoneLog"),
    showPhoneLogFile: ()   => ipcRenderer.invoke("cloudSync:showPhoneLogFile"),
    getSetupCode: ()       => ipcRenderer.invoke("cloudSync:getSetupCode"),
    copySetupCode: ()      => ipcRenderer.invoke("cloudSync:copySetupCode"),
    isConnected:  ()       => ipcRenderer.invoke("cloudSync:isConnected"),
    disconnect:   ()       => ipcRenderer.invoke("cloudSync:disconnect"),
    sync:         ()       => ipcRenderer.invoke("cloudSync:sync"),
    // Background (automatic) sync: current status, a retry after a failure, and
    // live status changes (returns an unsubscribe function).
    // "Your server": the user's own Supabase project.
    getConfig:    ()       => ipcRenderer.invoke("cloudSync:getConfig"),
    testConfig:   (url, key) => ipcRenderer.invoke("cloudSync:testConfig", { url, key }),
    setConfig:    (url, key) => ipcRenderer.invoke("cloudSync:setConfig", { url, key }),
    getSetupSql:  ()       => ipcRenderer.invoke("cloudSync:getSetupSql"),
    copySetupSql: ()       => ipcRenderer.invoke("cloudSync:copySetupSql"),
    uploadThumbnails: () => ipcRenderer.invoke("cloudSync:uploadThumbnails"),
    status:       ()       => ipcRenderer.invoke("cloudSync:status"),
    retry:        ()       => ipcRenderer.invoke("cloudSync:retry"),
    onStatus:     (callback) => {
      const listener = (event, status) => callback(status);
      ipcRenderer.on("cloudSync:status", listener);
      return () => ipcRenderer.removeListener("cloudSync:status", listener);
    },
    secretsStatus:            ()             => ipcRenderer.invoke("cloudSync:secretsStatus"),
    secretsSetup:             (passphrase)    => ipcRenderer.invoke("cloudSync:secretsSetup", { passphrase }),
    secretsUnlock:            (passphrase)    => ipcRenderer.invoke("cloudSync:secretsUnlock", { passphrase }),
    secretsUnlockWithRecovery: (recoveryKeyDisplay) => ipcRenderer.invoke("cloudSync:secretsUnlockWithRecovery", { recoveryKeyDisplay }),
    secretsForget:            ()             => ipcRenderer.invoke("cloudSync:secretsForget"),
    // Background cover-art link gathering that follows a sync — state on
    // demand, plus live updates (returns an unsubscribe function).
    coverArtStatus:           ()             => ipcRenderer.invoke("cloudSync:coverArtStatus"),
    onCoverArtProgress:       (callback)     => {
      const listener = (event, status) => callback(status);
      ipcRenderer.on("cloudSync:coverArtProgress", listener);
      return () => ipcRenderer.removeListener("cloudSync:coverArtProgress", listener);
    },
  },
  // Generic launch for any source that's resolved its own local executable
  // path (GOG) — Steam keeps its own launch() above, since it works
  // off just an appid and doesn't need a local file lookup at all.
  game: {
    launch: (installPath) => ipcRenderer.invoke("game:launch", installPath),
    similarGames: (appid) => ipcRenderer.invoke("game:similarGames", { appid }),
    igdbLookupDetails: (item) => ipcRenderer.invoke("game:igdbLookupDetails", item),
    igdbSimilarGames: (igdbId) => ipcRenderer.invoke("game:igdbSimilarGames", { igdbId }),
    igdbSimilarGamesByTitle: (title) => ipcRenderer.invoke("game:igdbSimilarGamesByTitle", { title }),
    igdbMoreFromDeveloper: (developer, excludeTitle) => ipcRenderer.invoke("game:igdbMoreFromDeveloper", { developer, excludeTitle }),
  },
  movie: {
    enrich:      (items, force = false, forceOverwrite = false) => ipcRenderer.invoke("movie:enrich", { items, force, forceOverwrite }),
    onEnriched:  (callback) => ipcRenderer.on("movie:enriched",       (event, item) => callback(item)),
    // Returns an unsubscribe function, same reasoning as onWatchChecked
    // below — SettingsModal re-subscribes every time it's opened, and with
    // no cleanup that stacked another listener on every open/close cycle.
    onProgress:  (callback) => {
      const listener = (event, p) => callback(p);
      ipcRenderer.on("movie:enrichProgress", listener);
      return () => ipcRenderer.removeListener("movie:enrichProgress", listener);
    },
    lookupDetails: (item)   => ipcRenderer.invoke("movie:lookupDetails", item),
    watchRegions:  ()       => ipcRenderer.invoke("movie:watchRegions"),
    checkWatchProviders: (items) => ipcRenderer.invoke("movie:checkWatchProviders", { items }),
    previewWatchProviders: (mediaType, platformId) => ipcRenderer.invoke("movie:previewWatchProviders", { mediaType, platformId }),
    cancelWatchCheck: () => ipcRenderer.invoke("movie:cancelWatchCheck"),
    onWatchProgress: (callback) => ipcRenderer.on("movie:watchProgress", (event, p)    => callback(p)),
    // Returns an unsubscribe function — needed by callers like ItemProfile
    // that mount/unmount repeatedly within a session (once per app-lifetime
    // listeners, like App.jsx's own, can ignore the return value).
    onWatchChecked:  (callback) => {
      const listener = (event, item) => callback(item);
      ipcRenderer.on("movie:watchChecked", listener);
      return () => ipcRenderer.removeListener("movie:watchChecked", listener);
    },
    providerOptions: (region)  => ipcRenderer.invoke("movie:providerOptions", region),
    moreFromCreator: (creatorName, mediaType) => ipcRenderer.invoke("movie:moreFromCreator", { creatorName, mediaType }),
    moreFromSeries: (seriesName) => ipcRenderer.invoke("movie:moreFromSeries", { seriesName }),
    similarTitles: (platformId, mediaType) => ipcRenderer.invoke("movie:similarTitles", { platformId, mediaType }),
  },
  book: {
    similarByGenre: (genre, excludeKey) => ipcRenderer.invoke("book:similarByGenre", { genre, excludeKey }),
    worksByAuthor: (creator, excludeKey) => ipcRenderer.invoke("book:worksByAuthor", { creator, excludeKey }),
    lookupDetails: (item) => ipcRenderer.invoke("book:lookupDetails", item),
  },
  discovery: {
    recommendations: () => ipcRenderer.invoke("discovery:recommendations"),
    bookRecommendations: () => ipcRenderer.invoke("discovery:bookRecommendations"),
    youtubeUploads: (opts) => ipcRenderer.invoke("discovery:youtubeUploads", opts || {}),
    trending: () => ipcRenderer.invoke("discovery:trending"),
    dismiss: (mediaType, tmdbId, title) => ipcRenderer.invoke("discovery:dismiss", { mediaType, tmdbId, title }),
    getDismissed: () => ipcRenderer.invoke("discovery:getDismissed"),
    undismiss: (id) => ipcRenderer.invoke("discovery:undismiss", id),
  },
  music: {
    lookupDetails: (item) => ipcRenderer.invoke("music:lookupDetails", item),
    moreFromArtist: (artist, excludeTitle) => ipcRenderer.invoke("music:moreFromArtist", { artist, excludeTitle }),
    similarByGenre: (genre, style, excludePlatformId) => ipcRenderer.invoke("music:similarByGenre", { genre, style, excludePlatformId }),
  },
  podcast: {
    lookupDetails: (item) => ipcRenderer.invoke("podcast:lookupDetails", item),
    moreFromHost: (host, excludePlatformId) => ipcRenderer.invoke("podcast:moreFromHost", { host, excludePlatformId }),
    similarByGenre: (genre, excludePlatformId) => ipcRenderer.invoke("podcast:similarByGenre", { genre, excludePlatformId }),
  },
  hltb: {
    enrich:      (items, force = false) => ipcRenderer.invoke("hltb:enrich", { items, force }),
    previewTimes: (title) => ipcRenderer.invoke("hltb:previewTimes", { title }),
    onEnriched:  (callback) => ipcRenderer.on("hltb:enriched",       (event, item) => callback(item)),
    // Returns an unsubscribe function — same fix as film.onProgress above,
    // same leak (SettingsModal re-subscribes on every open with no cleanup).
    onProgress:  (callback) => {
      const listener = (event, p) => callback(p);
      ipcRenderer.on("hltb:enrichProgress", listener);
      return () => ipcRenderer.removeListener("hltb:enrichProgress", listener);
    },
  },
  search: {
    query:     (params) => ipcRenderer.invoke("search:query",     params),
    details:   (params) => ipcRenderer.invoke("search:details",   params),
    thumbnail: (params) => ipcRenderer.invoke("search:thumbnail", params),
  },
  bgg: {
    searchText:  (query)      => ipcRenderer.invoke("bgg:searchText", query),
    itemJson:    (bggId)      => ipcRenderer.invoke("bgg:itemJson", bggId),
    statsJson:   (bggId)      => ipcRenderer.invoke("bgg:statsJson", bggId),
    downloadArt: (url, bggId) => ipcRenderer.invoke("bgg:downloadArt", url, bggId),
    expansions:  (bggId)      => ipcRenderer.invoke("bgg:expansions", bggId),
    moreFromDesigner: (designer, excludeTitle) => ipcRenderer.invoke("bgg:moreFromDesigner", { designer, excludeTitle }),
  },
  youtube: {
    recentUploads: (channelId) => ipcRenderer.invoke("youtube:recentUploads", { channelId }),
    refreshChannels: (ids) => ipcRenderer.invoke("youtube:refreshChannels", { ids }),
  },
  // About dialog: version, data folder, and the licence / privacy files shipped with the app.
  app: {
    getInfo:      () => ipcRenderer.invoke("app:getInfo"),
    openLicences: () => ipcRenderer.invoke("app:openLicences"),
    openPrivacy:  () => ipcRenderer.invoke("app:openPrivacy"),
  },
  website: {
    fetchInfo: (url) => ipcRenderer.invoke("website:fetchInfo", url),
  },
  menu: {
    // Returns an unsubscribe function, same pattern as film.onWatchChecked —
    // App.jsx only ever subscribes once for the app's lifetime, but the
    // pattern is kept consistent with the other multi-listener IPC channels.
    // value is present for actions that carry a payload (which Settings tab,
    // which tile-size option, etc.) and undefined otherwise.
    onAction: (callback) => {
      const listener = (event, actionId, value) => callback(actionId, value);
      ipcRenderer.on("menu:action", listener);
      return () => ipcRenderer.removeListener("menu:action", listener);
    },
  },
  deepLink: {
    // Pushed by main.js's handleDeepLink for a vault:// URL (browser
    // extension or OS protocol launch) — payload is { action, mediaType, query }.
    onOpen: (callback) => {
      const listener = (event, payload) => callback(payload);
      ipcRenderer.on("deeplink:open", listener);
      return () => ipcRenderer.removeListener("deeplink:open", listener);
    },
  },
});
