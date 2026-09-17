const path = require("path");

const NATIVE_MEDIA_COMMANDS = new Set([
  "play",
  "pause",
  "toggle",
  "stop",
  "next",
  "previous"
]);

function normalizeNativeMediaState(value) {
  const state = value && typeof value === "object" ? value : {};
  const playbackState = ["none", "playing", "paused", "stopped"].includes(state.state)
    ? state.state
    : "none";
  const number = (input, fallback = 0) => {
    const parsed = Number(input);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const duration = Math.max(0, number(state.duration));
  return {
    title: typeof state.title === "string" ? state.title.trim().slice(0, 500) : "",
    artist: typeof state.artist === "string" ? state.artist.trim().slice(0, 500) : "",
    album: typeof state.album === "string" ? state.album.trim().slice(0, 500) : "",
    duration,
    position: Math.min(duration || Number.MAX_SAFE_INTEGER, Math.max(0, number(state.position))),
    playbackRate: Math.max(0, number(state.playbackRate, 1)),
    state: playbackState
  };
}

function normalizeNativeMediaCommand(value) {
  if (NATIVE_MEDIA_COMMANDS.has(value)) return { type: value };
  if (typeof value !== "string" || !value.startsWith("seek:")) return null;
  const position = Number(value.slice("seek:".length));
  return Number.isFinite(position) && position >= 0
    ? { type: "seek", position }
    : null;
}

function resolveNativeMediaBridgePath({ appPath, isPackaged, resourcesPath }) {
  return isPackaged
    ? path.join(resourcesPath, "native", "macos_media_bridge.node")
    : path.join(appPath, "native-bin", "macos_media_bridge.node");
}

function createNativeMediaBridge(options = {}) {
  const {
    platform = process.platform,
    addonPath,
    loadAddon = require,
    onCommand = () => {},
    logger = console
  } = options;
  if (platform !== "darwin") {
    return {
      isAvailable: () => false,
      update() {},
      clear() {},
      destroy() {}
    };
  }

  try {
    const addon = loadAddon(addonPath);
    const nativeBridge = addon.createBridge((command) => {
      const normalized = normalizeNativeMediaCommand(command);
      if (normalized) onCommand(normalized);
    });
    return {
      isAvailable: () => true,
      update: (state) => nativeBridge.update(normalizeNativeMediaState(state)),
      clear: () => nativeBridge.clear(),
      destroy: () => nativeBridge.destroy()
    };
  } catch (error) {
    logger?.warn?.("Native macOS media controls are unavailable:", error);
    return {
      isAvailable: () => false,
      update() {},
      clear() {},
      destroy() {}
    };
  }
}

module.exports = {
  NATIVE_MEDIA_COMMANDS,
  createNativeMediaBridge,
  normalizeNativeMediaCommand,
  normalizeNativeMediaState,
  resolveNativeMediaBridgePath
};
