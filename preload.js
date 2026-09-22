const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopWindow", {
  platform: process.platform,
  setMiniMode: (enabled) => ipcRenderer.invoke("window:setMiniMode", enabled === true),
  setQueueOpen: (open) => ipcRenderer.invoke("window:setQueueOpen", open === true)
});

contextBridge.exposeInMainWorld("desktopApp", {
  sendTrayStatus: (status) => ipcRenderer.send("app:trayStatus", status),
  getNativeMediaSessionAvailability: () => ipcRenderer.invoke("media:nativeAvailable"),
  setNativeMediaSessionOwnership: (enabled) => ipcRenderer.invoke("media:setNativeOwnership", enabled === true),
  sendNativeMediaSessionState: (state) => ipcRenderer.send("media:updateNativeState", state),
  selectMusicFolder: () => ipcRenderer.invoke("music:selectFolder"),
  scanMusicFolder: (folderPath) => ipcRenderer.invoke("music:scanFolder", folderPath),
  getLyrics: (track, options) => ipcRenderer.invoke("lyrics:get", track, options),
  selectBackgroundImage: () => ipcRenderer.invoke("background:selectImage"),
  selectBackgroundVideo: () => ipcRenderer.invoke("background:selectVideo"),
  getWallpaperBackground: () => ipcRenderer.invoke("background:getWallpaper"),
  onCommand: (callback) => {
    if (typeof callback !== "function") {
      return;
    }
    ipcRenderer.on("app:command", (_event, command) => {
      callback(command);
    });
  },
  onPowerState: (callback) => {
    if (typeof callback !== "function") return;
    ipcRenderer.on("app:power-state", (_event, state) => callback(state));
  }
});
