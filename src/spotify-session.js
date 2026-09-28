const auth = require("./spotify-auth");

const DEFAULT_REFRESH_LEAD_MS = 300000;
const MAX_REFRESH_LEAD_MS = 3600000;
const MAX_TOKEN_LENGTH = 4096;
const MAX_CLIENT_ID_LENGTH = 128;
const MAX_PROVIDER_ID_LENGTH = 64;

const SESSION_STATUSES = Object.freeze({
  connected: "connected",
  disconnected: "disconnected",
  reauthorizationRequired: "reauthorization-required"
});

const SESSION_ERROR_MESSAGES = Object.freeze({
  "credentials-unavailable": "The Spotify credentials could not be stored.",
  "invalid-request": "The Spotify session was used incorrectly.",
  "not-authenticated": "No Spotify account is connected.",
  "reauthorization-required": "The Spotify authorization must be renewed."
});

function createSessionError(code) {
  const error = new Error(SESSION_ERROR_MESSAGES[code] || "Spotify session error.");
  error.code = code;
  return error;
}

function boundedString(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function boundedTimestamp(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

function clampRefreshLead(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return DEFAULT_REFRESH_LEAD_MS;
  return Math.min(Math.round(number), MAX_REFRESH_LEAD_MS);
}

function createSpotifySession(options = {}) {
  const credentialStore = options.credentialStore;
  const authModule = options.auth || auth;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const now = typeof options.now === "function" ? options.now : Date.now;
  const providerId = boundedString(options.providerId, MAX_PROVIDER_ID_LENGTH) || "spotify";
  const initialClientId = boundedString(options.clientId, MAX_CLIENT_ID_LENGTH);
  const refreshLeadMs = clampRefreshLead(options.refreshLeadMs);

  if (!credentialStore ||
    typeof credentialStore.load !== "function" ||
    typeof credentialStore.save !== "function" ||
    typeof credentialStore.clear !== "function") {
    throw new TypeError("A credential store is required for the Spotify session.");
  }
  if (!authModule || typeof authModule.refreshAccessToken !== "function") {
    throw new TypeError("A Spotify auth module is required for the Spotify session.");
  }
  if (initialClientId && typeof authModule.isValidSpotifyClientId === "function" && !authModule.isValidSpotifyClientId(initialClientId)) {
    throw new TypeError("A valid Spotify client ID is required for the Spotify session.");
  }

  let credentials = null;
  let status = SESSION_STATUSES.disconnected;
  let refreshPromise = null;
  let generation = 0;
  let storeMutation = Promise.resolve();

  function sanitize() {
    const record = credentials;
    return Object.freeze({
      status,
      providerId: record ? record.providerId : providerId,
      connected: status === SESSION_STATUSES.connected,
      hasRefreshToken: Boolean(record && record.refreshToken),
      accessExpiresAt: record ? record.accessExpiresAt : 0,
      refreshExpiresAt: record ? record.refreshExpiresAt : 0,
      scopes: Object.freeze(
        record && record.scope ? record.scope.split(/\s+/).filter(Boolean) : []
      )
    });
  }

  function enqueueStoreMutation(operation) {
    const run = storeMutation.then(operation, operation);
    storeMutation = run.catch(() => {});
    return run;
  }

  async function safeClear() {
    try {
      await enqueueStoreMutation(() => credentialStore.clear());
    } catch {}
  }

  function isValidClientId(value) {
    const candidate = boundedString(value, MAX_CLIENT_ID_LENGTH);
    return Boolean(candidate) && (
      typeof authModule.isValidSpotifyClientId !== "function" || authModule.isValidSpotifyClientId(candidate)
    );
  }

  function refreshTokenExpired(record) {
    return record.refreshExpiresAt > 0 && now() >= record.refreshExpiresAt;
  }

  function accessTokenFresh(record) {
    return record.accessExpiresAt > 0 && record.accessExpiresAt - now() > refreshLeadMs;
  }

  function toRecord(tokenSet, fallbackClientId = initialClientId) {
    const recordClientId = boundedString(tokenSet?.clientId, MAX_CLIENT_ID_LENGTH) || fallbackClientId;
    return {
      providerId,
      clientId: recordClientId,
      accessToken: boundedString(tokenSet?.accessToken, MAX_TOKEN_LENGTH),
      refreshToken: boundedString(tokenSet?.refreshToken, MAX_TOKEN_LENGTH),
      tokenType: boundedString(tokenSet?.tokenType, 32) || "Bearer",
      scope: boundedString(tokenSet?.scope, 1024),
      accessExpiresAt: boundedTimestamp(tokenSet?.accessExpiresAt),
      refreshExpiresAt: boundedTimestamp(tokenSet?.refreshExpiresAt),
      savedAt: now()
    };
  }

  async function load() {
    try {
      const record = await credentialStore.load();
      if (record && record.providerId === providerId && record.accessToken && isValidClientId(record.clientId)) {
        credentials = record;
        status = SESSION_STATUSES.connected;
      } else {
        credentials = null;
        status = SESSION_STATUSES.disconnected;
      }
    } catch {
      credentials = null;
      status = SESSION_STATUSES.disconnected;
    }
    generation += 1;
    return sanitize();
  }

  async function connect(tokenSet) {
    const record = toRecord(tokenSet);
    if (!isValidClientId(record.clientId) || !record.accessToken || !record.refreshToken ||
      !record.accessExpiresAt || !record.refreshExpiresAt) {
      throw createSessionError("invalid-request");
    }
    generation += 1;
    const connectGeneration = generation;
    try {
      const saved = await enqueueStoreMutation(() => credentialStore.save(record));
      if (generation !== connectGeneration) throw createSessionError("not-authenticated");
      credentials = saved;
    } catch (error) {
      throw error && error.code ? error : createSessionError("credentials-unavailable");
    }
    status = SESSION_STATUSES.connected;
    return sanitize();
  }

  async function disconnect() {
    generation += 1;
    const disconnectGeneration = generation;
    refreshPromise = null;
    try {
      await enqueueStoreMutation(() => credentialStore.clear());
    } catch {
      throw createSessionError("credentials-unavailable");
    }
    if (generation === disconnectGeneration) {
      credentials = null;
      status = SESSION_STATUSES.disconnected;
    }
    return sanitize();
  }

  async function clearForReauthorization() {
    generation += 1;
    credentials = null;
    status = SESSION_STATUSES.reauthorizationRequired;
    await safeClear();
  }

  function refresh() {
    if (refreshPromise) return refreshPromise;
    const run = (async () => {
      const record = credentials;
      const refreshGeneration = generation;
      if (!record) throw createSessionError("not-authenticated");
      const refreshToken = boundedString(record.refreshToken, MAX_TOKEN_LENGTH);
      if (!refreshToken) {
        await clearForReauthorization();
        throw createSessionError("reauthorization-required");
      }
      let refreshed;
      try {
        refreshed = await authModule.refreshAccessToken({
          fetchImpl,
          clientId: record.clientId || initialClientId,
          refreshToken,
          refreshExpiresAt: record.refreshExpiresAt,
          now: now()
        });
      } catch (error) {
        if (error && error.code === "reauthorization-required") {
          await clearForReauthorization();
          throw createSessionError("reauthorization-required");
        }
        throw error;
      }
      const nextRecord = toRecord({
        ...refreshed,
        clientId: record.clientId || initialClientId
      }, record.clientId);
      if (generation !== refreshGeneration) throw createSessionError("not-authenticated");
      const saved = await enqueueStoreMutation(() => credentialStore.save(nextRecord));
      if (generation !== refreshGeneration) {
        throw createSessionError("not-authenticated");
      }
      credentials = saved;
      status = SESSION_STATUSES.connected;
      return credentials.accessToken;
    })();
    refreshPromise = run;
    const release = () => {
      if (refreshPromise === run) refreshPromise = null;
    };
    run.then(release, release);
    return run;
  }

  async function getAccessToken() {
    const record = credentials;
    if (!record) throw createSessionError("not-authenticated");
    if (refreshTokenExpired(record)) {
      await clearForReauthorization();
      throw createSessionError("reauthorization-required");
    }
    if (accessTokenFresh(record)) return record.accessToken;
    return refresh();
  }

  return Object.freeze({
    connect,
    disconnect,
    getAccessToken,
    getAuthState: () => sanitize(),
    load
  });
}

module.exports = {
  DEFAULT_REFRESH_LEAD_MS,
  SESSION_STATUSES,
  createSpotifySession
};
