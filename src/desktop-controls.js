const GLOBAL_TIMER_ACCELERATOR = "CommandOrControl+Shift+Space";

const DEFAULT_DESKTOP_CONTROL_PREFERENCES = Object.freeze({
  globalTimerShortcutEnabled: false,
  miniAlwaysOnTop: false
});

function normalizeDesktopControlPreferences(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    globalTimerShortcutEnabled: source.globalTimerShortcutEnabled === true,
    miniAlwaysOnTop: source.miniAlwaysOnTop === true
  };
}

function isDesktopControlPreferencesPayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 2 &&
    keys.every((key) => key === "globalTimerShortcutEnabled" || key === "miniAlwaysOnTop") &&
    typeof value.globalTimerShortcutEnabled === "boolean" &&
    typeof value.miniAlwaysOnTop === "boolean";
}

function createDesktopControlManager(options = {}) {
  const shortcut = options.globalShortcut;
  const getWindow = typeof options.getWindow === "function" ? options.getWindow : () => null;
  const isMiniMode = typeof options.isMiniMode === "function" ? options.isMiniMode : () => false;
  const onToggleTimer = typeof options.onToggleTimer === "function" ? options.onToggleTimer : () => {};
  let preferences = { ...DEFAULT_DESKTOP_CONTROL_PREFERENCES };
  let globalShortcutStatus = "off";
  let miniAlwaysOnTopApplied = false;

  function setGlobalShortcutEnabled(enabled) {
    if (!enabled) {
      try {
        shortcut?.unregister?.(GLOBAL_TIMER_ACCELERATOR);
      } catch {}
      globalShortcutStatus = "off";
      return;
    }

    try {
      if (shortcut?.isRegistered?.(GLOBAL_TIMER_ACCELERATOR)) {
        globalShortcutStatus = "registered";
        return;
      }
      const registered = shortcut?.register?.(GLOBAL_TIMER_ACCELERATOR, () => onToggleTimer()) === true;
      globalShortcutStatus = registered ? "registered" : "unavailable";
    } catch {
      globalShortcutStatus = "unavailable";
    }
  }

  function applyMiniAlwaysOnTop() {
    const browserWindow = getWindow();
    const requested = preferences.miniAlwaysOnTop && isMiniMode();
    if (!browserWindow || browserWindow.isDestroyed?.()) {
      miniAlwaysOnTopApplied = false;
      return;
    }

    try {
      if (requested) browserWindow.setAlwaysOnTop(true, "floating");
      else browserWindow.setAlwaysOnTop(false);
      miniAlwaysOnTopApplied = typeof browserWindow.isAlwaysOnTop === "function"
        ? browserWindow.isAlwaysOnTop() === true && requested
        : requested;
    } catch {
      miniAlwaysOnTopApplied = false;
    }
  }

  function getStatus() {
    return {
      accelerator: GLOBAL_TIMER_ACCELERATOR,
      globalShortcutStatus,
      miniAlwaysOnTopPreferred: preferences.miniAlwaysOnTop,
      miniAlwaysOnTopApplied
    };
  }

  function applyPreferences(value) {
    preferences = normalizeDesktopControlPreferences(value);
    setGlobalShortcutEnabled(preferences.globalTimerShortcutEnabled);
    applyMiniAlwaysOnTop();
    return getStatus();
  }

  function refreshWindowState() {
    applyMiniAlwaysOnTop();
    return getStatus();
  }

  function dispose() {
    try {
      shortcut?.unregister?.(GLOBAL_TIMER_ACCELERATOR);
    } catch {}
    globalShortcutStatus = "off";
    const browserWindow = getWindow();
    if (browserWindow && !browserWindow.isDestroyed?.()) {
      try {
        browserWindow.setAlwaysOnTop(false);
      } catch {}
    }
    miniAlwaysOnTopApplied = false;
  }

  return {
    applyPreferences,
    dispose,
    getStatus,
    refreshWindowState
  };
}

function createRendererCommandDispatcher(options = {}) {
  const getWindow = typeof options.getWindow === "function" ? options.getWindow : () => null;
  const createWindow = typeof options.createWindow === "function" ? options.createWindow : () => null;
  const isRendererReady = typeof options.isRendererReady === "function"
    ? options.isRendererReady
    : () => true;
  const channel = typeof options.channel === "string" && options.channel ? options.channel : "app:command";
  let pendingCommands = [];

  function send(browserWindow, command) {
    const webContents = browserWindow?.webContents;
    if (!webContents || webContents.isDestroyed?.()) return false;
    webContents.send(channel, command);
    return true;
  }

  function dispatch(command, { createIfMissing = false } = {}) {
    let browserWindow = getWindow();
    if (!browserWindow || browserWindow.isDestroyed?.()) {
      if (!createIfMissing) return false;
      browserWindow = createWindow({ show: false });
    }
    if (!browserWindow || browserWindow.isDestroyed?.()) return false;
    if (!isRendererReady()) {
      pendingCommands.push(command);
      return true;
    }
    return send(browserWindow, command);
  }

  function markReady() {
    const browserWindow = getWindow();
    if (!browserWindow || browserWindow.isDestroyed?.()) return false;
    const commands = pendingCommands;
    pendingCommands = [];
    commands.forEach((command) => send(browserWindow, command));
    return true;
  }

  function clear() {
    pendingCommands = [];
  }

  return { clear, dispatch, markReady };
}

module.exports = {
  DEFAULT_DESKTOP_CONTROL_PREFERENCES,
  GLOBAL_TIMER_ACCELERATOR,
  createDesktopControlManager,
  createRendererCommandDispatcher,
  isDesktopControlPreferencesPayload,
  normalizeDesktopControlPreferences
};
