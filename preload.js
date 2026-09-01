const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopWindow", {
  minimize: () => ipcRenderer.send("window:minimize"),
  close: () => ipcRenderer.send("window:close")
});

contextBridge.exposeInMainWorld("desktopApp", {
  sendTrayStatus: (status) => ipcRenderer.send("app:trayStatus", status),
  getCloseBehavior: () => ipcRenderer.invoke("app:getCloseBehavior"),
  setCloseBehavior: (behavior) => ipcRenderer.send("app:setCloseBehavior", behavior),
  selectMusicFolder: () => ipcRenderer.invoke("music:selectFolder"),
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
  }
});
