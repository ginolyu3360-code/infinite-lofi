(function exposeInfiniteLofiPlaybackBackends(globalScope) {
  const PLAYBACK_SOURCE_MODES = Object.freeze(["local", "external"]);
  const PLAYBACK_CAPABILITIES = Object.freeze([
    "open",
    "connect",
    "playlists",
    "currentTrack",
    "play",
    "pause",
    "stop",
    "previous",
    "next",
    "seek",
    "volume"
  ]);

  function normalizePlaybackSourceMode(value) {
    return value === "external" ? "external" : "local";
  }

  function normalizeCapabilities(value) {
    const source = value && typeof value === "object" ? value : {};
    return Object.freeze(Object.fromEntries(
      PLAYBACK_CAPABILITIES.map((capability) => [capability, source[capability] === true])
    ));
  }

  function createPlaybackBackend(definition) {
    if (!definition || typeof definition !== "object") {
      throw new TypeError("A playback backend definition is required.");
    }
    const id = typeof definition.id === "string" ? definition.id.trim() : "";
    if (!id) throw new TypeError("Playback backend id is required.");
    if (!PLAYBACK_SOURCE_MODES.includes(definition.mode)) {
      throw new TypeError("Playback backend mode must be local or external.");
    }
    const noOp = () => Promise.resolve(true);
    return Object.freeze({
      id,
      mode: definition.mode,
      label: typeof definition.label === "string" && definition.label.trim()
        ? definition.label.trim().slice(0, 120)
        : id,
      capabilities: normalizeCapabilities(definition.capabilities),
      activate: typeof definition.activate === "function" ? definition.activate : noOp,
      deactivate: typeof definition.deactivate === "function" ? definition.deactivate : noOp
    });
  }

  const api = {
    PLAYBACK_CAPABILITIES,
    PLAYBACK_SOURCE_MODES,
    createPlaybackBackend,
    normalizeCapabilities,
    normalizePlaybackSourceMode
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalScope) globalScope.InfiniteLofiPlaybackBackends = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
