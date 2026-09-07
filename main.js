const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, nativeTheme } = require("electron");
const path = require("path");
const { pathToFileURL } = require("url");
const { execFileSync } = require("child_process");
const fs = require("fs");
const musicMetadata = require("music-metadata");
const { resolveWindowCloseAction } = require("./src/app-lifecycle");
const { createMusicLibrary } = require("./src/music-library");
const { isTrustedNavigationUrl } = require("./src/security");

const mainDocumentPath = path.join(__dirname, "src", "index.html");
const mainDocumentUrl = pathToFileURL(mainDocumentPath).href;

let mainWindow = null;
let tray = null;
let isQuitting = false;
let closeBehavior = "quit";
let miniModeEnabled = false;
let fullWindowBounds = null;
let musicLibrary = null;
let grantedMusicFolders = new Set();
let trayStatus = {
  timerText: "25:00",
  phaseText: "Focus Session",
  isRunning: false
};

function sendCommandToRenderer(command) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send("app:command", command);
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.show();
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
}

function createTray() {
  const iconPath = path.join(__dirname, "assets", "trayTemplate.png");
  const icon = nativeImage.createFromPath(iconPath);
  const trayIcon = icon.isEmpty() ? nativeImage.createEmpty() : icon;
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

  const runLabel = trayStatus.isRunning ? "Pause Timer" : "Start Timer";
  const visibilityLabel = mainWindow && mainWindow.isVisible() ? "Hide Window" : "Show Window";
  const closeModeLabel = closeBehavior === "tray" ? "Close Mode: Minimize To Tray" : "Close Mode: Quit App";
  const menu = Menu.buildFromTemplate([
    { label: `Pomodoro ${trayStatus.timerText}`, enabled: false },
    { label: trayStatus.phaseText, enabled: false },
    { label: closeModeLabel, enabled: false },
    { type: "separator" },
    {
      label: runLabel,
      click: () => sendCommandToRenderer("toggle-timer")
    },
    {
      label: "Reset Timer",
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
      label: "Quit",
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(menu);
}

function createMainWindow() {
  const allowDevTools = !app.isPackaged || process.argv.includes("--allow-devtools-for-testing");
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 520,
    resizable: true,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    vibrancy: process.platform === "darwin" ? "under-window" : undefined,
    visualEffectState: process.platform === "darwin" ? "active" : undefined,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
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

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-attach-webview", (event) => event.preventDefault());
  mainWindow.webContents.on("will-navigate", (event, navigationUrl) => {
    if (!isTrustedNavigationUrl(navigationUrl, mainDocumentUrl)) event.preventDefault();
  });
  if (!allowDevTools) {
    mainWindow.webContents.on("devtools-opened", () => mainWindow?.webContents.closeDevTools());
  }

  if (process.platform === "win32") {
    mainWindow.setBackgroundColor("#00000000");
  }
  if (process.platform === "darwin") {
    mainWindow.setWindowButtonVisibility(false);
  }

  mainWindow.on("show", () => refreshTrayMenu());
  mainWindow.on("hide", () => refreshTrayMenu());
  mainWindow.on("close", (event) => {
    const action = resolveWindowCloseAction({ closeBehavior, isQuitting });
    if (action === "hide") {
      event.preventDefault();
      mainWindow?.hide();
      return;
    }
    if (action === "quit") {
      event.preventDefault();
      isQuitting = true;
      setImmediate(() => app.quit());
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
    miniModeEnabled = false;
    fullWindowBounds = null;
    refreshTrayMenu();
  });

  mainWindow.loadFile(mainDocumentPath);
}

app.whenReady().then(async () => {
  nativeTheme.themeSource = "dark";
  await loadMusicFolderGrants();
  musicLibrary = createMusicLibrary({
    parseFile: musicMetadata.parseFile,
    artworkCacheDirectory: path.join(app.getPath("cache"), "Infinite Lo-Fi", "artwork")
  });
  createMainWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
      refreshTrayMenu();
      return;
    }
    showMainWindow();
  });
});

app.on("before-quit", () => {
  isQuitting = true;
});

ipcMain.on("window:minimize", (event) => {
  const targetWindow = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (targetWindow && !targetWindow.isDestroyed()) {
    targetWindow.minimize();
  }
});

ipcMain.handle("window:setMiniMode", (event, enabled) => {
  if (!isTrustedIpcSender(event) || !mainWindow || mainWindow.isDestroyed()) return miniModeEnabled;
  const nextEnabled = enabled === true;
  if (nextEnabled === miniModeEnabled) return miniModeEnabled;

  if (nextEnabled) {
    fullWindowBounds = mainWindow.getBounds();
    miniModeEnabled = true;
    mainWindow.setMinimumSize(360, 200);
    mainWindow.setSize(420, 230, true);
  } else {
    miniModeEnabled = false;
    mainWindow.setMinimumSize(720, 520);
    if (fullWindowBounds) mainWindow.setBounds(fullWindowBounds, true);
    else mainWindow.setSize(1100, 760, true);
    fullWindowBounds = null;
  }
  return miniModeEnabled;
});

ipcMain.on("window:close", (event) => {
  const targetWindow = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (targetWindow && !targetWindow.isDestroyed()) {
    const action = resolveWindowCloseAction({ closeBehavior, isQuitting });
    if (action === "hide") {
      targetWindow.hide();
      return;
    }
    isQuitting = true;
    app.quit();
  }
});

ipcMain.handle("app:getCloseBehavior", () => closeBehavior);

ipcMain.on("app:setCloseBehavior", (_event, behavior) => {
  closeBehavior = behavior === "tray" ? "tray" : "quit";
  refreshTrayMenu();
});

ipcMain.on("app:trayStatus", (_event, status) => {
  trayStatus = {
    timerText: typeof status?.timerText === "string" ? status.timerText : trayStatus.timerText,
    phaseText: typeof status?.phaseText === "string" ? status.phaseText : trayStatus.phaseText,
    isRunning: Boolean(status?.isRunning)
  };
  refreshTrayMenu();
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

function getCurrentDesktopWallpaperPath() {
  if (process.platform !== "darwin") {
    return null;
  }

  try {
    const output = execFileSync(
      "osascript",
      ["-e", 'tell application "System Events" to get picture of current desktop'],
      { encoding: "utf8" }
    );
    const wallpaperPath = String(output || "").trim().replace(/^"|"$/g, "");
    return wallpaperPath || null;
  } catch (error) {
    console.error("Failed to read desktop wallpaper:", error);
    return null;
  }
}

ipcMain.handle("background:getWallpaper", async () => {
  const wallpaperPath = getCurrentDesktopWallpaperPath();
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
