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
  const PLAYBACK_OPERATION_CAPABILITIES = Object.freeze({
    connect: "connect",
    disconnect: "connect",
    getAuthState: "connect",
    listPlaylists: "playlists",
    getPlaybackState: "currentTrack",
    play: "play",
    pause: "pause",
    stop: "stop",
    previous: "previous",
    next: "next",
    seek: "seek",
    volume: "volume"
  });
  const PLAYBACK_OPERATIONS = Object.freeze(Object.keys(PLAYBACK_OPERATION_CAPABILITIES));

  function normalizePlaybackSourceMode(value) {
    return value === "external" ? "external" : "local";
  }

  function normalizeCapabilities(value) {
    const source = value && typeof value === "object" ? value : {};
    return Object.freeze(Object.fromEntries(
      PLAYBACK_CAPABILITIES.map((capability) => [capability, source[capability] === true])
    ));
  }

  function createUnsupportedOperationError(backendId, operation, reason) {
    const error = new Error(`Playback backend "${backendId}" cannot run "${operation}": ${reason}.`);
    error.code = reason;
    error.backendId = backendId;
    error.operation = operation;
    return error;
  }

  function createOperation(definition, backendId, operation, capabilities) {
    const capability = PLAYBACK_OPERATION_CAPABILITIES[operation];
    const implementation = typeof definition[operation] === "function" ? definition[operation] : null;
    return function runPlaybackOperation(...args) {
      if (capabilities[capability] !== true) {
        return Promise.reject(createUnsupportedOperationError(backendId, operation, "unsupported-capability"));
      }
      if (!implementation) {
        return Promise.reject(createUnsupportedOperationError(backendId, operation, "operation-not-implemented"));
      }
      try {
        return Promise.resolve(implementation.apply(definition, args));
      } catch (error) {
        return Promise.reject(error);
      }
    };
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
    const capabilities = normalizeCapabilities(definition.capabilities);
    const backend = {
      id,
      mode: definition.mode,
      label: typeof definition.label === "string" && definition.label.trim()
        ? definition.label.trim().slice(0, 120)
        : id,
      capabilities,
      activate: typeof definition.activate === "function" ? definition.activate : noOp,
      deactivate: typeof definition.deactivate === "function" ? definition.deactivate : noOp
    };
    for (const operation of PLAYBACK_OPERATIONS) {
      backend[operation] = createOperation(definition, id, operation, capabilities);
    }
    return Object.freeze(backend);
  }

  const api = {
    PLAYBACK_CAPABILITIES,
    PLAYBACK_OPERATION_CAPABILITIES,
    PLAYBACK_OPERATIONS,
    PLAYBACK_SOURCE_MODES,
    createPlaybackBackend,
    normalizeCapabilities,
    normalizePlaybackSourceMode
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalScope) globalScope.InfiniteLofiPlaybackBackends = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
