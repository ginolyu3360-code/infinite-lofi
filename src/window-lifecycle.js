(function exposeInfiniteLofiWindowLifecycle(globalScope) {
  function bindWindowBackgroundLifecycle(browserWindow) {
    const setBackgroundThrottling = (allowed) => {
      const webContents = browserWindow?.webContents;
      if (!webContents || webContents.isDestroyed()) return;
      webContents.setBackgroundThrottling(allowed);
    };

    browserWindow.on("minimize", () => setBackgroundThrottling(false));
    browserWindow.on("restore", () => setBackgroundThrottling(true));
  }

  const api = { bindWindowBackgroundLifecycle };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalScope) globalScope.InfiniteLofiWindowLifecycle = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
