const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, nativeTheme, powerMonitor, screen } = require("electron");
const path = require("path");
const { pathToFileURL } = require("url");
const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const musicMetadata = require("music-metadata");
const { createMusicLibrary } = require("./src/music-library");
const { createLyricsService } = require("./src/lyrics-service");
const { isTrustedNavigationUrl } = require("./src/security");
const { bindWindowBackgroundLifecycle } = require("./src/window-lifecycle");
const {
  createNativeMediaBridge,
  resolveNativeMediaBridgePath
} = require("./src/native-media-bridge");

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
let nativeMediaBridge = null;
let grantedMusicFolders = new Set();
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
  nativeMediaBridge = createNativeMediaBridge({
    addonPath: resolveNativeMediaBridgePath({
      appPath: app.getAppPath(),
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath
    }),
    onCommand: (command) => sendCommandToRenderer({
      ...command,
      type: `media-${command.type}`
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
    musicLibrary = createMusicLibrary({
      parseFile: musicMetadata.parseFile,
      artworkCacheDirectory: path.join(app.getPath("cache"), "Infinite Lo-Fi", "artwork")
    });
    lyricsService = createLyricsService({
      cacheDirectory: path.join(app.getPath("cache"), "Infinite Lo-Fi", "lyrics"),
      getLocalLyrics: (track) => musicLibrary.getLocalLyrics(track),
      userAgent: `Infinite Lo-Fi/${app.getVersion()} (https://github.com/ginolyu3360-code/infinite-lofi)`
    });
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
  return isTrustedIpcSender(event) && nativeMediaBridge?.isAvailable() === true;
});

ipcMain.on("media:updateNativeState", (event, state) => {
  if (!isTrustedIpcSender(event) || nativeMediaBridge?.isAvailable() !== true) return;
  nativeMediaBridge.update(state);
});

// Local music folder selection and scanning
const { dialog } = require("electron");

const MUSIC_FOLDER_GRANTS_FILE = "music-folder-grants.json";

function getMusicFolderGrantsPath() {
  return path.join(app.getPath("userData"), MUSIC_FOLDER_GRANTS_FILE);
}

async function loadMusicFolderGrants() {
  try {
    const raw = await fs.promises.readFile(getMusicFolderGrantsPath(), "utf8");
    const parsed = JSON.parse(raw);
    grantedMusicFolders = new Set(
      (Array.isArray(parsed) ? parsed : [])
        .filter((entry) => typeof entry === "string" && path.isAbsolute(entry))
        .map((entry) => path.resolve(entry))
    );
  } catch (error) {
    if (error?.code !== "ENOENT") console.error("Failed to load music folder grants:", error);
    grantedMusicFolders = new Set();
  }
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
  return { folderPath, tracks };
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
    if (!grantedMusicFolders.has(canonicalPath)) {
      return { folderPath, tracks: [], error: "folder-not-approved" };
    }
    const stat = await fs.promises.stat(canonicalPath);
    if (!stat.isDirectory()) return { folderPath, tracks: [], error: "folder-unavailable" };
    const tracks = await musicLibrary.scanFolder(canonicalPath);
    return {
      folderPath: canonicalPath,
      tracks,
      error: tracks.length > 0 ? null : "no-audio-files"
    };
  } catch (error) {
    console.error("Failed to restore music folder:", error);
    return { folderPath, tracks: [], error: "folder-unreadable" };
  }
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
      if (grantedMusicFolders.has(parentPath)) normalizedTrack.src = canonicalPath;
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
  nativeMediaBridge?.destroy();
  nativeMediaBridge = null;
});
