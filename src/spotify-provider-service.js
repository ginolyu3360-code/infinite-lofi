const auth = require("./spotify-auth");
const { createLoopbackCallbackListener } = require("./spotify-loopback");
const { createSpotifySession } = require("./spotify-session");
const { createSpotifyClient } = require("./spotify-client");

const MAX_CLIENT_ID_LENGTH = 128;

const PROVIDER_SERVICE_ERROR_CODES = Object.freeze({
  closed: "closed",
  connectCancelled: "connect-cancelled",
  connectInProgress: "connect-in-progress",
  invalidClientId: "invalid-client-id",
  notInitialized: "not-initialized",
  openExternalFailed: "open-external-failed"
});

const PROVIDER_SERVICE_ERROR_MESSAGES = Object.freeze({
  closed: "The Spotify provider service is closed.",
  "connect-cancelled": "The Spotify connection was cancelled.",
  "connect-in-progress": "A Spotify connection is already in progress.",
  "invalid-client-id": "A valid Spotify client ID is required.",
  "not-initialized": "The Spotify provider service is not initialized.",
  "open-external-failed": "The Spotify authorization page could not be opened."
});

function createProviderServiceError(code) {
  const error = new Error(PROVIDER_SERVICE_ERROR_MESSAGES[code] || "Spotify provider service error.");
  error.code = code;
  return error;
}

function boundedString(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function createSpotifyProviderService(options = {}) {
  const authModule = options.auth || auth;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const now = typeof options.now === "function" ? options.now : Date.now;
  const openExternal = options.openExternal;
  const createListener = options.createListener || createLoopbackCallbackListener;
  const createClient = options.createClient || createSpotifyClient;

  if (typeof openExternal !== "function") {
    throw new TypeError("An openExternal function is required for the Spotify provider service.");
  }
  if (typeof createListener !== "function") {
    throw new TypeError("A loopback listener factory is required for the Spotify provider service.");
  }
  if (typeof createClient !== "function") {
    throw new TypeError("A Spotify client factory is required for the Spotify provider service.");
  }

  const session = options.session || createSpotifySession({
    credentialStore: options.credentialStore,
    auth: authModule,
    fetchImpl,
    now,
    providerId: options.providerId,
    refreshLeadMs: options.refreshLeadMs
  });

  const client = createClient({
    fetchImpl,
    getAccessToken: () => session.getAccessToken()
  });

  let initialized = false;
  let initializePromise = null;
  let closed = false;
  let activeListener = null;
  let connectPromise = null;
  let cancelRequested = false;

  function requireReady() {
    if (closed) throw createProviderServiceError(PROVIDER_SERVICE_ERROR_CODES.closed);
    if (!initialized) throw createProviderServiceError(PROVIDER_SERVICE_ERROR_CODES.notInitialized);
  }

  async function initialize() {
    if (closed) throw createProviderServiceError(PROVIDER_SERVICE_ERROR_CODES.closed);
    if (initialized) return session.getAuthState();
    if (initializePromise) return initializePromise;
    const run = (async () => {
      await session.load();
      if (closed) throw createProviderServiceError(PROVIDER_SERVICE_ERROR_CODES.closed);
      initialized = true;
      return session.getAuthState();
    })();
    initializePromise = run;
    const release = () => {
      if (initializePromise === run) initializePromise = null;
    };
    run.then(release, release);
    return run;
  }

  async function connect(options = {}) {
    requireReady();
    if (connectPromise) throw createProviderServiceError(PROVIDER_SERVICE_ERROR_CODES.connectInProgress);
    const clientId = boundedString(options.clientId, MAX_CLIENT_ID_LENGTH);
    if (!clientId || (typeof authModule.isValidSpotifyClientId === "function" && !authModule.isValidSpotifyClientId(clientId))) {
      throw createProviderServiceError(PROVIDER_SERVICE_ERROR_CODES.invalidClientId);
    }

    const run = (async () => {
      cancelRequested = false;
      const listener = createListener();
      activeListener = listener;
      const ensureActive = () => {
        if (closed) throw createProviderServiceError(PROVIDER_SERVICE_ERROR_CODES.closed);
        if (cancelRequested) throw createProviderServiceError(PROVIDER_SERVICE_ERROR_CODES.connectCancelled);
      };
      try {
        const state = authModule.createState();
        const codeVerifier = authModule.createCodeVerifier();
        const codeChallenge = authModule.createCodeChallenge(codeVerifier);
        const redirectUri = await listener.start();
        ensureActive();
        const authorizeUrl = authModule.buildAuthorizeUrl({ clientId, redirectUri, state, codeChallenge });
        try {
          await openExternal(authorizeUrl);
        } catch {
          throw createProviderServiceError(PROVIDER_SERVICE_ERROR_CODES.openExternalFailed);
        }
        ensureActive();
        const code = await listener.waitForCode({
          expectedState: state,
          ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs })
        });
        ensureActive();
        const tokenSet = await authModule.exchangeCodeForToken({
          fetchImpl,
          clientId,
          redirectUri,
          code,
          codeVerifier,
          now: now()
        });
        ensureActive();
        return await session.connect({ ...tokenSet, clientId });
      } catch (error) {
        if (closed) {
          throw createProviderServiceError(PROVIDER_SERVICE_ERROR_CODES.closed);
        }
        if (cancelRequested) {
          throw createProviderServiceError(PROVIDER_SERVICE_ERROR_CODES.connectCancelled);
        }
        throw error;
      } finally {
        activeListener = null;
        try {
          await listener.close();
        } catch {}
      }
    })();

    connectPromise = run;
    const release = () => {
      if (connectPromise === run) connectPromise = null;
    };
    run.then(release, release);
    return run;
  }

  async function cancelConnect() {
    const listener = activeListener;
    if (!listener) return false;
    cancelRequested = true;
    try {
      await listener.close();
    } catch {}
    return true;
  }

  async function close() {
    if (closed) return true;
    closed = true;
    const listener = activeListener;
    activeListener = null;
    if (listener) {
      try {
        await listener.close();
      } catch {}
    }
    return true;
  }

  async function getAuthState() {
    requireReady();
    return session.getAuthState();
  }

  async function getProfile() {
    requireReady();
    return client.getCurrentProfile();
  }

  async function listPlaylists(listOptions) {
    requireReady();
    return client.listPlaylists(listOptions);
  }

  async function getPlaybackState(stateOptions) {
    requireReady();
    return client.getPlaybackState(stateOptions);
  }

  async function getDevices(deviceOptions) {
    requireReady();
    return client.getDevices(deviceOptions);
  }

  async function playPlaylist(commandOptions) {
    requireReady();
    return client.playPlaylistContext(commandOptions);
  }

  async function resume(commandOptions) {
    requireReady();
    return client.resume(commandOptions);
  }

  async function pause(commandOptions) {
    requireReady();
    return client.pause(commandOptions);
  }

  async function next(commandOptions) {
    requireReady();
    return client.next(commandOptions);
  }

  async function previous(commandOptions) {
    requireReady();
    return client.previous(commandOptions);
  }

  async function seek(positionMs, commandOptions) {
    requireReady();
    return client.seek(positionMs, commandOptions);
  }

  async function setVolume(percent, commandOptions) {
    requireReady();
    return client.setVolume(percent, commandOptions);
  }

  async function disconnect() {
    requireReady();
    return session.disconnect();
  }

  return Object.freeze({
    cancelConnect,
    close,
    connect,
    disconnect,
    getAuthState,
    getDevices,
    getPlaybackState,
    getProfile,
    initialize,
    isInitialized: () => initialized,
    listPlaylists,
    next,
    pause,
    playPlaylist,
    previous,
    resume,
    seek,
    setVolume
  });
}

module.exports = {
  PROVIDER_SERVICE_ERROR_CODES,
  createSpotifyProviderService
};
