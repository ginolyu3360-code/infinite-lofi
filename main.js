const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, nativeTheme } = require("electron");
const path = require("path");
const { pathToFileURL } = require("url");
const { execFileSync } = require("child_process");
const musicMetadata = require("music-metadata");

let mainWindow = null;
let tray = null;
let isQuitting = false;
let closeBehavior = "quit";
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
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 360,
    minHeight: 280,
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
      preload: path.join(__dirname, "preload.js"),
      devTools: true
    }
  });

  if (process.platform === "win32") {
    mainWindow.setBackgroundColor("#00000000");
  }

  mainWindow.on("show", () => refreshTrayMenu());
  mainWindow.on("hide", () => refreshTrayMenu());

  mainWindow.loadFile(path.join(__dirname, "src", "index.html"));
}

app.whenReady().then(() => {
  nativeTheme.themeSource = "dark";
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

ipcMain.on("window:close", (event) => {
  const targetWindow = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (targetWindow && !targetWindow.isDestroyed()) {
    if (closeBehavior === "tray") {
      targetWindow.hide();
      return;
    }
    targetWindow.close();
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
const fs = require("fs");
const { dialog } = require("electron");

async function getEmbeddedArtworkForAudio(filePath) {
  try {
    const metadata = await musicMetadata.parseFile(filePath, { duration: false });
    const picture = metadata && metadata.common && Array.isArray(metadata.common.picture) ? metadata.common.picture[0] : null;
    if (!picture || !picture.data) {
      return null;
    }

    const mimeType = typeof picture.format === "string" && picture.format.trim() ? picture.format.trim() : "image/jpeg";
    const artworkData = Buffer.isBuffer(picture.data) ? picture.data : Buffer.from(picture.data);
    return {
      artworkName: "Embedded Cover",
      artworkMimeType: mimeType,
      artworkUrl: `data:${mimeType};base64,${artworkData.toString("base64")}`
    };
  } catch (error) {
    return null;
  }
}

async function scanMusicFolder(folderPath) {
  try {
    const files = fs.readdirSync(folderPath, { withFileTypes: true });
    const audioExtensions = [".mp3", ".wav", ".flac", ".aac", ".m4a", ".ogg"];
    const imageExtensions = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"];
    const fileNameLookup = new Map(files.filter((entry) => entry.isFile()).map((entry) => [entry.name.toLowerCase(), entry.name]));

    function findArtworkForAudio(fileName) {
      const baseName = path.basename(fileName, path.extname(fileName));
      const candidates = [
        `${baseName}.jpg`,
        `${baseName}.jpeg`,
        `${baseName}.png`,
        `${baseName}.webp`,
        `${baseName}.gif`,
        `${baseName}.bmp`,
        "cover.jpg",
        "cover.jpeg",
        "cover.png",
        "cover.webp",
        "folder.jpg",
        "folder.jpeg",
        "folder.png",
        "folder.webp",
        "front.jpg",
        "front.jpeg",
        "front.png",
        "album.jpg",
        "album.jpeg",
        "album.png"
      ];

      for (const candidate of candidates) {
        const actualName = fileNameLookup.get(candidate.toLowerCase());
        if (!actualName || !imageExtensions.includes(path.extname(actualName).toLowerCase())) {
          continue;
        }

        return {
          artworkName: actualName,
          artworkPath: path.join(folderPath, actualName),
          artworkUrl: pathToFileURL(path.join(folderPath, actualName)).href
        };
      }

      return null;
    }

    const musicFiles = await Promise.all(
      files
        .filter((f) => f.isFile() && audioExtensions.includes(path.extname(f.name).toLowerCase()))
        .map(async (f, idx) => {
          const audioPath = path.join(folderPath, f.name);
          const embeddedArtwork = await getEmbeddedArtworkForAudio(audioPath);
          return {
            id: `local-${idx}`,
            label: path.basename(f.name, path.extname(f.name)),
            src: audioPath,
            srcUrl: pathToFileURL(audioPath).href,
            isLocal: true,
            ...findArtworkForAudio(f.name),
            ...embeddedArtwork
          };
        })
    );
    return musicFiles;
  } catch (e) {
    console.error("Error scanning music folder:", e);
    return [];
  }
}

ipcMain.handle("music:selectFolder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "Select Music Folder"
  });
  if (result.canceled || !result.filePaths[0]) {
    return null;
  }
  const folderPath = result.filePaths[0];
  const tracks = await scanMusicFolder(folderPath);
  return { folderPath, tracks };
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
