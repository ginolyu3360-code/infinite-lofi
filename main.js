const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, nativeTheme, powerMonitor, screen, shell } = require("electron");
const path = require("path");
const { pathToFileURL } = require("url");
const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const musicMetadata = require("music-metadata");
const { createMusicLibrary } = require("./src/music-library");
const { createReaderLibrary, isPathInside, pathsReferToSameLocation } = require("./src/reader-library");
const { createVideoProxyService, selectRuntimeEntry } = require("./src/video-proxy");
const { createLyricsService } = require("./src/lyrics-service");
const { isTrustedNavigationUrl } = require("./src/security");
const { bindWindowBackgroundLifecycle } = require("./src/window-lifecycle");
const {
  createNativeMediaBridge,
  resolveNativeMediaBridgePath
} = require("./src/native-media-bridge");
const { createNativeMediaOwnershipController } = require("./src/native-media-ownership");

const testUserDataArgument = process.argv.find((argument) => argument.startsWith("--user-data-dir="));
const testUserDataDirectory = process.env.INFINITE_LOFI_SMOKE_PROFILE ||
  testUserDataArgument?.slice("--user-data-dir=".length);
if ((!app.isPackaged || process.argv.includes("--allow-devtools-for-testing")) && testUserDataDirectory) {
  if (!path.isAbsolute(testUserDataDirectory)) throw new Error("Test user-data directory must be absolute");
  app.setPath("userData", testUserDataDirectory);
  app.setPath("sessionData", testUserDataDirectory);
}

const mainDocumentPath = path.join(__dirname, "src", "index.html");
const mainDocumentUrl = pathToFileURL(mainDocumentPath).href;
const execFileAsync = promisify(execFile);
const appIconPath = path.join(__dirname, "assets", "icon.png");

let mainWindow = null;
let tray = null;
let miniModeEnabled = false;
let queuePanelOpen = false;
let fullWindowBounds = null;
let musicLibrary = null;
let lyricsService = null;
let readerLibrary = null;
let videoProxyService = null;
let nativeMediaOwnership = null;
let grantedMusicFolders = new Set();
let grantedReaderFolders = new Set();
let trayStatus = {
  timerText: "25:00",
  phaseText: "Focus Session",
  isRunning: false,
  labels: {
    startTimer: "Start Timer",
    pauseTimer: "Pause Timer",
    resetTimer: "Reset Timer",
    showWindow: "Show Window",
    hideWindow: "Hide Window",
    quit: "Quit"
  }
};

function sendCommandToRenderer(command) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send("app:command", command);
}

function sendPowerStateToRenderer(state) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("app:power-state", state);
}

function initializeNativeMediaBridge() {
  nativeMediaOwnership = createNativeMediaOwnershipController({
    createBridge: () => createNativeMediaBridge({
      addonPath: resolveNativeMediaBridgePath({
        appPath: app.getAppPath(),
        isPackaged: app.isPackaged,
        resourcesPath: process.resourcesPath
      }),
      onCommand: (command) => sendCommandToRenderer({
        ...command,
        type: `media-${command.type}`
      })
    })
  });
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

function setMinimumContentSize(browserWindow, width, height) {
  const [windowWidth, windowHeight] = browserWindow.getSize();
  const [contentWidth, contentHeight] = browserWindow.getContentSize();
  browserWindow.setMinimumSize(
    width + Math.max(0, windowWidth - contentWidth),
    height + Math.max(0, windowHeight - contentHeight)
  );
}

function getSupportedContentSize(browserWindow, requestedWidth, requestedHeight) {
  const [windowWidth, windowHeight] = browserWindow.getSize();
  const [contentWidth, contentHeight] = browserWindow.getContentSize();
  const display = screen.getDisplayMatching(browserWindow.getBounds());
  return [
    Math.min(requestedWidth, Math.max(360, display.workAreaSize.width - Math.max(0, windowWidth - contentWidth))),
    Math.min(requestedHeight, Math.max(200, display.workAreaSize.height - Math.max(0, windowHeight - contentHeight)))
  ];
}

function applyWindowContentConstraints({ grow = false } = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const requestedSize = miniModeEnabled
    ? [360, 200]
    : queuePanelOpen
      ? [900, 780]
      : [720, 520];
  const [minimumWidth, minimumHeight] = getSupportedContentSize(mainWindow, ...requestedSize);
  setMinimumContentSize(mainWindow, minimumWidth, minimumHeight);
  if (!grow) return;
  const [contentWidth, contentHeight] = mainWindow.getContentSize();
  if (contentWidth < minimumWidth || contentHeight < minimumHeight) {
    mainWindow.setContentSize(
      Math.max(contentWidth, minimumWidth),
      Math.max(contentHeight, minimumHeight),
      false
    );
  }
}

function createTray() {
  const iconPath = path.join(__dirname, "assets", "trayTemplate.png");
  const icon = nativeImage.createFromPath(iconPath);
  const trayIcon = icon.isEmpty()
    ? nativeImage.createEmpty()
    : process.platform === "win32"
      ? icon.resize({ width: 16, height: 16, quality: "best" })
      : icon;
  tray = new Tray(trayIcon);
  tray.setToolTip("Infinite Lo-Fi");
  tray.on("click", () => {
    showMainWindow();
  });
  refreshTrayMenu();
}

function refreshTrayMenu() {
  if (!tray) {
    return;
  }

  const runLabel = trayStatus.isRunning ? trayStatus.labels.pauseTimer : trayStatus.labels.startTimer;
  const visibilityLabel = mainWindow && mainWindow.isVisible() ? trayStatus.labels.hideWindow : trayStatus.labels.showWindow;
  const menu = Menu.buildFromTemplate([
    { label: `Pomodoro ${trayStatus.timerText}`, enabled: false },
    { label: trayStatus.phaseText, enabled: false },
    { type: "separator" },
    {
      label: runLabel,
      click: () => sendCommandToRenderer("toggle-timer")
    },
    {
      label: trayStatus.labels.resetTimer,
      click: () => sendCommandToRenderer("reset-timer")
    },
    {
      label: visibilityLabel,
      click: () => {
        if (mainWindow && mainWindow.isVisible()) {
          mainWindow.hide();
          return;
        }
        showMainWindow();
      }
    },
    { type: "separator" },
    {
      label: trayStatus.labels.quit,
      click: () => app.quit()
    }
  ]);

  tray.setContextMenu(menu);
}

function createMainWindow() {
  const allowDevTools = !app.isPackaged || process.argv.includes("--allow-devtools-for-testing");
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    width: Math.min(1100, workArea.width),
    height: Math.min(760, workArea.height),
    minWidth: 720,
    minHeight: 520,
    center: true,
    resizable: true,
    frame: true,
    transparent: process.platform === "darwin",
    backgroundColor: process.platform === "darwin" ? "#00000000" : "#11110f",
    icon: process.platform === "win32" ? appIconPath : undefined,
    vibrancy: process.platform === "darwin" ? "under-window" : undefined,
    visualEffectState: process.platform === "darwin" ? "active" : undefined,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
      devTools: allowDevTools,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      navigateOnDragDrop: false,
      webviewTag: false,
      spellcheck: false
    }
  });
  setMinimumContentSize(mainWindow, 720, 520);

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-attach-webview", (event) => event.preventDefault());
  mainWindow.webContents.on("will-navigate", (event, navigationUrl) => {
    if (!isTrustedNavigationUrl(navigationUrl, mainDocumentUrl)) event.preventDefault();
  });
  if (!allowDevTools) {
    mainWindow.webContents.on("devtools-opened", () => mainWindow?.webContents.closeDevTools());
  }

  mainWindow.on("show", () => refreshTrayMenu());
  mainWindow.on("hide", () => refreshTrayMenu());
  bindWindowBackgroundLifecycle(mainWindow);
  mainWindow.on("closed", () => {
    mainWindow = null;
    miniModeEnabled = false;
    queuePanelOpen = false;
    fullWindowBounds = null;
    refreshTrayMenu();
  });

  mainWindow.loadFile(mainDocumentPath);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showMainWindow());

  app.whenReady().then(async () => {
    nativeTheme.themeSource = "dark";
    initializeNativeMediaBridge();
    await loadMusicFolderGrants();
    await loadReaderFolderGrants();
    musicLibrary = createMusicLibrary({
      parseFile: musicMetadata.parseFile,
      artworkCacheDirectory: path.join(app.getPath("cache"), "Infinite Lo-Fi", "artwork")
    });
    lyricsService = createLyricsService({
      cacheDirectory: path.join(app.getPath("cache"), "Infinite Lo-Fi", "lyrics"),
      getLocalLyrics: (track) => musicLibrary.getLocalLyrics(track),
      userAgent: `Infinite Lo-Fi/${app.getVersion()} (https://github.com/ginolyu3360-code/infinite-lofi)`
    });
    readerLibrary = createReaderLibrary();
    initializeVideoProxyService();
    createMainWindow();
    createTray();
    powerMonitor.on("suspend", () => sendPowerStateToRenderer("suspend"));
    powerMonitor.on("resume", () => sendPowerStateToRenderer("resume"));

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
        refreshTrayMenu();
        return;
      }
      showMainWindow();
    });
  });
}

ipcMain.handle("window:setMiniMode", (event, enabled) => {
  if (!isTrustedIpcSender(event) || !mainWindow || mainWindow.isDestroyed()) return miniModeEnabled;
  const nextEnabled = enabled === true;
  if (nextEnabled === miniModeEnabled) return miniModeEnabled;

  if (nextEnabled) {
    fullWindowBounds = mainWindow.getBounds();
    miniModeEnabled = true;
    queuePanelOpen = false;
    applyWindowContentConstraints();
    mainWindow.setContentSize(420, 250, true);
  } else {
    miniModeEnabled = false;
    applyWindowContentConstraints();
    if (fullWindowBounds) mainWindow.setBounds(fullWindowBounds, true);
    else mainWindow.setContentSize(1100, 760, true);
    fullWindowBounds = null;
  }
  return miniModeEnabled;
});

ipcMain.handle("window:setQueueOpen", (event, open) => {
  if (!isTrustedIpcSender(event) || !mainWindow || mainWindow.isDestroyed()) return queuePanelOpen;
  queuePanelOpen = open === true && !miniModeEnabled;
  applyWindowContentConstraints({ grow: queuePanelOpen });
  return queuePanelOpen;
});

ipcMain.on("app:trayStatus", (_event, status) => {
  const incomingLabels = status?.labels && typeof status.labels === "object" ? status.labels : {};
  const readLabel = (name) => typeof incomingLabels[name] === "string" && incomingLabels[name].trim()
    ? incomingLabels[name].trim().slice(0, 80)
    : trayStatus.labels[name];
  trayStatus = {
    timerText: typeof status?.timerText === "string" ? status.timerText : trayStatus.timerText,
    phaseText: typeof status?.phaseText === "string" ? status.phaseText : trayStatus.phaseText,
    isRunning: Boolean(status?.isRunning),
    labels: Object.fromEntries(Object.keys(trayStatus.labels).map((name) => [name, readLabel(name)]))
  };
  refreshTrayMenu();
});

ipcMain.handle("media:nativeAvailable", (event) => {
  return isTrustedIpcSender(event) && nativeMediaOwnership?.isAvailable() === true;
});

ipcMain.handle("media:setNativeOwnership", (event, enabled) => {
  if (!isTrustedIpcSender(event) || !nativeMediaOwnership) return false;
  return enabled === true
    ? nativeMediaOwnership.acquire()
    : nativeMediaOwnership.release();
});

ipcMain.on("media:updateNativeState", (event, state) => {
  if (!isTrustedIpcSender(event) || nativeMediaOwnership?.isAvailable() !== true) return;
  nativeMediaOwnership.update(state);
});

// Local music folder selection and scanning
const { dialog } = require("electron");

const MUSIC_FOLDER_GRANTS_FILE = "music-folder-grants.json";
const READER_FOLDER_GRANTS_FILE = "reader-folder-grants.json";

function getMusicFolderGrantsPath() {
  return path.join(app.getPath("userData"), MUSIC_FOLDER_GRANTS_FILE);
}

async function loadMusicFolderGrants() {
  try {
    const raw = await fs.promises.readFile(getMusicFolderGrantsPath(), "utf8");
    const parsed = JSON.parse(raw);
    grantedMusicFolders = await canonicalizeFolderGrants(parsed);
  } catch (error) {
    if (error?.code !== "ENOENT") console.error("Failed to load music folder grants:", error);
    grantedMusicFolders = new Set();
  }
}

async function canonicalizeFolderGrants(entries) {
  const canonicalPaths = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (typeof entry !== "string" || !path.isAbsolute(entry)) continue;
    try {
      canonicalPaths.push(await fs.promises.realpath(entry));
    } catch {
      canonicalPaths.push(path.resolve(entry));
    }
  }
  return new Set(canonicalPaths);
}

function hasFolderGrant(grants, canonicalPath) {
  return [...grants].some((grantedPath) => pathsReferToSameLocation(grantedPath, canonicalPath));
}

async function grantMusicFolder(folderPath) {
  const canonicalPath = await fs.promises.realpath(folderPath);
  grantedMusicFolders.add(canonicalPath);
  try {
    await fs.promises.mkdir(path.dirname(getMusicFolderGrantsPath()), { recursive: true });
    await fs.promises.writeFile(
      getMusicFolderGrantsPath(),
      JSON.stringify([...grantedMusicFolders].sort(), null, 2),
      { encoding: "utf8", mode: 0o600 }
    );
  } catch (error) {
    console.error("Failed to save music folder grant:", error);
  }
  return canonicalPath;
}

function getReaderFolderGrantsPath() {
  return path.join(app.getPath("userData"), READER_FOLDER_GRANTS_FILE);
}

async function loadReaderFolderGrants() {
  try {
    const parsed = JSON.parse(await fs.promises.readFile(getReaderFolderGrantsPath(), "utf8"));
    grantedReaderFolders = await canonicalizeFolderGrants(parsed);
  } catch (error) {
    if (error?.code !== "ENOENT") console.error("Failed to load Reader folder grants:", error);
    grantedReaderFolders = new Set();
  }
}

async function grantReaderFolder(folderPath) {
  const canonicalPath = await fs.promises.realpath(folderPath);
  grantedReaderFolders.add(canonicalPath);
  await fs.promises.mkdir(path.dirname(getReaderFolderGrantsPath()), { recursive: true });
  await fs.promises.writeFile(
    getReaderFolderGrantsPath(),
    JSON.stringify([...grantedReaderFolders].sort(), null, 2),
    { encoding: "utf8", mode: 0o600 }
  );
  return canonicalPath;
}

function getFfmpegRuntimePath() {
  const runtimeRoot = app.isPackaged
    ? path.join(process.resourcesPath, "ffmpeg")
    : path.join(__dirname, "vendor", "ffmpeg");
  const manifest = JSON.parse(fs.readFileSync(path.join(runtimeRoot, "manifest.json"), "utf8"));
  const entry = selectRuntimeEntry(manifest, process.platform, process.arch);
  return path.join(runtimeRoot, entry.file);
}

function initializeVideoProxyService() {
  try {
    videoProxyService = createVideoProxyService({
      cacheDirectory: path.join(app.getPath("cache"), "Infinite Lo-Fi", "video-proxies"),
      ffmpegPath: getFfmpegRuntimePath(),
      onProgress: (progress) => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("video:proxyProgress", progress);
      }
    });
  } catch (error) {
    console.error("Bundled FFmpeg runtime is unavailable:", error);
    videoProxyService = null;
  }
}

function isTrustedIpcSender(event) {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) return false;
  const senderUrl = event.senderFrame?.url || event.sender.getURL();
  return isTrustedNavigationUrl(senderUrl, mainDocumentUrl);
}

ipcMain.handle("music:selectFolder", async (event) => {
  if (!isTrustedIpcSender(event)) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "Select Music Folder"
  });
  if (result.canceled || !result.filePaths[0]) {
    return null;
  }
  const folderPath = await grantMusicFolder(result.filePaths[0]);
  const tracks = await musicLibrary.scanFolder(folderPath);
  return {
    folderPath,
    tracks,
    duplicateCount: Number(tracks.duplicateCount) || 0,
    duplicateKeys: Array.isArray(tracks.duplicateKeys) ? tracks.duplicateKeys : []
  };
});

ipcMain.handle("music:scanFolder", async (event, folderPath) => {
  if (!isTrustedIpcSender(event)) {
    return { folderPath: "", tracks: [], error: "unauthorized-sender" };
  }
  if (typeof folderPath !== "string" || !folderPath.trim()) {
    return { folderPath: "", tracks: [], error: "invalid-folder" };
  }

  try {
    const canonicalPath = await fs.promises.realpath(folderPath);
    if (!hasFolderGrant(grantedMusicFolders, canonicalPath)) {
      return { folderPath, tracks: [], error: "folder-not-approved" };
    }
    const stat = await fs.promises.stat(canonicalPath);
    if (!stat.isDirectory()) return { folderPath, tracks: [], error: "folder-unavailable" };
    const tracks = await musicLibrary.scanFolder(canonicalPath);
    return {
      folderPath: canonicalPath,
      tracks,
      duplicateCount: Number(tracks.duplicateCount) || 0,
      duplicateKeys: Array.isArray(tracks.duplicateKeys) ? tracks.duplicateKeys : [],
      error: tracks.length > 0 ? null : "no-media-files"
    };
  } catch (error) {
    console.error("Failed to restore music folder:", error);
    return { folderPath, tracks: [], error: "folder-unreadable" };
  }
});

ipcMain.handle("reader:selectFolder", async (event) => {
  if (!isTrustedIpcSender(event) || !readerLibrary) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "Select Reading Folder"
  });
  if (result.canceled || !result.filePaths[0]) return null;
  try {
    const folderPath = await grantReaderFolder(result.filePaths[0]);
    return await readerLibrary.scan(folderPath, { source: "reader", authorize: true });
  } catch (error) {
    return { folderPath: result.filePaths[0], documents: [], error: error?.code || "folder-unreadable" };
  }
});

ipcMain.handle("reader:scanFolder", async (event, source, folderPath) => {
  if (!isTrustedIpcSender(event) || !readerLibrary) return { documents: [], error: "unauthorized-sender" };
  if (!["media", "reader"].includes(source) || typeof folderPath !== "string" || !path.isAbsolute(folderPath)) {
    return { folderPath: "", documents: [], error: "invalid-folder" };
  }
  try {
    const canonicalPath = await fs.promises.realpath(folderPath);
    const grants = source === "media" ? grantedMusicFolders : grantedReaderFolders;
    if (!hasFolderGrant(grants, canonicalPath)) return { folderPath, documents: [], error: "folder-not-approved" };
    return await readerLibrary.scan(canonicalPath, { source, authorize: true });
  } catch (error) {
    return { folderPath, documents: [], error: error?.code || "folder-unreadable" };
  }
});

ipcMain.handle("reader:read", async (event, source, documentKey) => {
  if (!isTrustedIpcSender(event) || !readerLibrary || !["media", "reader"].includes(source)) {
    return { error: "unauthorized-sender" };
  }
  try {
    return { document: await readerLibrary.read(source, typeof documentKey === "string" ? documentKey.slice(0, 8192) : "") };
  } catch (error) {
    return { error: error?.code || "read-error" };
  }
});

ipcMain.handle("app:openExternal", async (event, url) => {
  if (!isTrustedIpcSender(event)) return false;
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    await shell.openExternal(parsed.href);
    return true;
  } catch {
    return false;
  }
});

async function approvedMediaFile(filePath) {
  if (typeof filePath !== "string" || !path.isAbsolute(filePath)) return null;
  const canonicalPath = await fs.promises.realpath(filePath);
  return [...grantedMusicFolders].some((rootPath) => isPathInside(rootPath, canonicalPath))
    ? canonicalPath
    : null;
}

ipcMain.handle("video:prepareProxy", async (event, request) => {
  if (!isTrustedIpcSender(event)) throw Object.assign(new Error("Video request is unauthorized."), { code: "unauthorized-sender" });
  if (!videoProxyService) throw Object.assign(new Error("Bundled video converter is unavailable."), { code: "runtime-unavailable" });
  const filePath = await approvedMediaFile(request?.filePath);
  if (!filePath) throw Object.assign(new Error("Video is outside the approved media folder."), { code: "path-outside-root" });
  return videoProxyService.prepare(filePath, { jobId: typeof request?.jobId === "string" ? request.jobId.slice(0, 128) : undefined });
});

ipcMain.handle("video:cancelProxy", async (event) => {
  return isTrustedIpcSender(event) && videoProxyService ? videoProxyService.cancel("renderer-request") : false;
});

ipcMain.handle("video:clearProxyCache", async (event) => {
  if (!isTrustedIpcSender(event) || !videoProxyService) return false;
  await videoProxyService.clearCache();
  return true;
});

ipcMain.handle("lyrics:get", async (event, track, options) => {
  if (!isTrustedIpcSender(event) || !lyricsService) return { status: "unavailable" };
  const clean = (value, maxLength = 500) => typeof value === "string" ? value.trim().slice(0, maxLength) : "";
  const normalizedTrack = {
    key: clean(track?.key, 8192),
    label: clean(track?.label),
    title: clean(track?.title),
    artist: clean(track?.artist),
    album: clean(track?.album),
    duration: Number(track?.duration),
    src: "",
    isLocal: track?.isLocal === true
  };

  if (normalizedTrack.isLocal && typeof track?.src === "string" && path.isAbsolute(track.src)) {
    try {
      const canonicalPath = await fs.promises.realpath(track.src);
      const parentPath = path.dirname(canonicalPath);
      if (hasFolderGrant(grantedMusicFolders, parentPath)) normalizedTrack.src = canonicalPath;
    } catch {}
  }

  return lyricsService.lookup(normalizedTrack, { allowOnline: options?.allowOnline === true });
});

async function getCurrentDesktopWallpaperPath() {
  if (process.platform !== "darwin") {
    return null;
  }

  try {
    const { stdout } = await execFileAsync(
      "osascript",
      ["-e", 'tell application "System Events" to get picture of current desktop'],
      { encoding: "utf8", timeout: 5000 }
    );
    const wallpaperPath = String(stdout || "").trim().replace(/^"|"$/g, "");
    return wallpaperPath || null;
  } catch (error) {
    console.error("Failed to read desktop wallpaper:", error);
    return null;
  }
}

ipcMain.handle("background:getWallpaper", async () => {
  const wallpaperPath = await getCurrentDesktopWallpaperPath();
  if (!wallpaperPath || !fs.existsSync(wallpaperPath)) {
    return null;
  }

  return {
    filePath: wallpaperPath,
    fileUrl: pathToFileURL(wallpaperPath).href
  };
});

ipcMain.handle("background:selectImage", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    title: "Select Background Image",
    filters: [
      { name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"] }
    ]
  });
  if (result.canceled || !result.filePaths[0]) {
    return null;
  }

  const filePath = result.filePaths[0];
  return {
    filePath,
    fileUrl: pathToFileURL(filePath).href
  };
});

ipcMain.handle("background:selectVideo", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    title: "Select Background Video",
    filters: [
      { name: "Video", extensions: ["mp4", "webm", "mov", "m4v", "ogg"] }
    ]
  });
  if (result.canceled || !result.filePaths[0]) {
    return null;
  }

  const filePath = result.filePaths[0];
  return {
    filePath,
    fileUrl: pathToFileURL(filePath).href
  };
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  videoProxyService?.cancel("app-quit");
  nativeMediaOwnership?.destroy();
  nativeMediaOwnership = null;
});
