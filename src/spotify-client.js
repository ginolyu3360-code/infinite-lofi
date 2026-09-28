const API_BASE = "https://api.spotify.com/v1";
const MAX_RETRY_AFTER_SECONDS = 3600;
const MAX_PLAYLISTS = 50;
const MAX_DEVICES = 32;
const MAX_ARTISTS = 8;
const MAX_MEDIA_MS = 86400000;

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedString(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function clampInt(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(Math.round(number), min), max);
}

function createSpotifyClientError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  if (Number.isInteger(details.status)) error.status = details.status;
  if (Number.isFinite(details.retryAfter)) error.retryAfter = details.retryAfter;
  if (typeof details.retryable === "boolean") error.retryable = details.retryable;
  return error;
}

function readHeader(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === "function") {
    const value = headers.get(name);
    return typeof value === "string" ? value : null;
  }
  const direct = headers[name] ?? headers[name.toLowerCase()];
  return typeof direct === "string" ? direct : null;
}

function boundedRetryAfter(headers) {
  const value = Number(readHeader(headers, "retry-after"));
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.min(Math.max(Math.round(value), 1), MAX_RETRY_AFTER_SECONDS);
}

function normalizeImage(images) {
  const first = Array.isArray(images) ? images[0] : null;
  return boundedString(first?.url, 2048);
}

function normalizeDeviceId(value) {
  return boundedString(value, 128);
}

function normalizeContextUri(value) {
  const uri = boundedString(value, 256);
  return /^spotify:[a-z]+:[A-Za-z0-9]+$/.test(uri) ? uri : "";
}

function normalizePlaylistUri(value) {
  const uri = boundedString(value, 256);
  return /^spotify:playlist:[A-Za-z0-9]+$/.test(uri) ? uri : "";
}

async function readErrorReason(response) {
  try {
    const payload = await response.json();
    return boundedString(payload?.error?.reason, 64);
  } catch {
    return "";
  }
}

function createSpotifyClient(options = {}) {
  const { fetchImpl, getAccessToken } = options;
  if (typeof fetchImpl !== "function") {
    throw new TypeError("A fetch implementation is required for the Spotify Web API client.");
  }
  if (typeof getAccessToken !== "function") {
    throw new TypeError("An access-token provider is required for the Spotify Web API client.");
  }

  async function resolveAccessToken() {
    const resolved = await getAccessToken();
    const token = typeof resolved === "string" ? resolved : boundedString(resolved?.accessToken, 4096);
    if (!token) {
      throw createSpotifyClientError("not-authenticated", "A Spotify access token is required.");
    }
    return token;
  }

  async function request(method, path, options = {}) {
    const { query, body, signal } = options;
    const token = await resolveAccessToken();
    const url = new URL(`${API_BASE}${path}`);
    if (isObject(query)) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) continue;
        url.searchParams.set(key, String(value));
      }
    }
    const headers = { Accept: "application/json", Authorization: `Bearer ${token}` };
    const init = { method, headers };
    if (signal) init.signal = signal;
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }

    let response;
    try {
      response = await fetchImpl(url.toString(), init);
    } catch {
      throw createSpotifyClientError("network-error", "Could not reach the Spotify Web API.", { retryable: method === "GET" });
    }
    if (!response || typeof response.status !== "number") {
      throw createSpotifyClientError("unexpected-response", "The Spotify Web API returned an unexpected response.");
    }

    const status = response.status;
    if (status === 204) return null;
    if (status === 401) {
      throw createSpotifyClientError("unauthorized", "The Spotify session is no longer authorized.", { status });
    }
    if (status === 403) {
      throw createSpotifyClientError("forbidden", "Spotify refused this request for the current account.", { status });
    }
    if (status === 429) {
      throw createSpotifyClientError("rate-limited", "Spotify rate-limited this request.", {
        status,
        retryAfter: boundedRetryAfter(response.headers),
        retryable: method === "GET"
      });
    }
    if (status === 404) {
      const reason = await readErrorReason(response);
      if (reason === "NO_ACTIVE_DEVICE") {
        throw createSpotifyClientError("no-active-device", "No active Spotify device is available.", { status });
      }
      throw createSpotifyClientError("not-found", "The requested Spotify resource was not found.", { status });
    }
    if (status >= 500) {
      throw createSpotifyClientError("server-error", "The Spotify Web API is temporarily unavailable.", {
        status,
        retryable: method === "GET"
      });
    }
    if (status < 200 || status >= 300) {
      throw createSpotifyClientError("unexpected-response", `The Spotify Web API returned status ${status}.`, { status });
    }

    if (typeof response.json !== "function") return null;
    try {
      return await response.json();
    } catch {
      throw createSpotifyClientError("unexpected-response", "The Spotify Web API returned an unreadable response.", { status });
    }
  }

  async function getCurrentProfile() {
    const payload = await request("GET", "/me");
    const source = isObject(payload) ? payload : {};
    return Object.freeze({
      id: boundedString(source.id, 128),
      displayName: boundedString(source.display_name, 128),
      imageUrl: normalizeImage(source.images)
    });
  }

  async function listPlaylists(options = {}) {
    const limit = clampInt(options.limit, 50, 1, 50);
    const offset = clampInt(options.offset, 0, 0, 100000);
    const payload = await request("GET", "/me/playlists", { query: { limit, offset }, signal: options.signal });
    const source = isObject(payload) ? payload : {};
    const items = (Array.isArray(source.items) ? source.items : [])
      .slice(0, MAX_PLAYLISTS)
      .map((item) => {
        const entry = isObject(item) ? item : {};
        return Object.freeze({
          id: boundedString(entry.id, 128),
          uri: normalizePlaylistUri(entry.uri),
          name: boundedString(entry.name, 256),
          trackCount: clampInt(entry.items?.total ?? entry.tracks?.total, 0, 0, 1000000),
          ownerName: boundedString(entry.owner?.display_name, 128),
          imageUrl: normalizeImage(entry.images)
        });
      })
      .filter((item) => item.id);
    return Object.freeze({
      items: Object.freeze(items),
      total: clampInt(source.total, 0, 0, 1000000),
      limit,
      offset
    });
  }

  async function getPlaybackState(options = {}) {
    const payload = await request("GET", "/me/player", { signal: options.signal });
    if (payload === null) return null;
    const source = isObject(payload) ? payload : {};
    const item = isObject(source.item) ? source.item : null;
    return Object.freeze({
      isPlaying: source.is_playing === true,
      progressMs: clampInt(source.progress_ms, 0, 0, MAX_MEDIA_MS),
      deviceId: normalizeDeviceId(source.device?.id),
      deviceName: boundedString(source.device?.name, 128),
      deviceRestricted: source.device?.is_restricted === true,
      supportsVolume: source.device?.supports_volume !== false,
      volumePercent: clampInt(source.device?.volume_percent, 0, 0, 100),
      contextUri: normalizeContextUri(source.context?.uri),
      track: item
        ? Object.freeze({
            id: boundedString(item.id, 128),
            name: boundedString(item.name, 256),
            artists: Object.freeze(
              (Array.isArray(item.artists) ? item.artists : [])
                .slice(0, MAX_ARTISTS)
                .map((artist) => boundedString(artist?.name, 128))
                .filter(Boolean)
            ),
            durationMs: clampInt(item.duration_ms, 0, 0, MAX_MEDIA_MS)
          })
        : null
    });
  }

  async function getDevices(options = {}) {
    const payload = await request("GET", "/me/player/devices", { signal: options.signal });
    const source = isObject(payload) ? payload : {};
    const devices = (Array.isArray(source.devices) ? source.devices : [])
      .slice(0, MAX_DEVICES)
      .map((device) => {
        const entry = isObject(device) ? device : {};
        return Object.freeze({
          id: normalizeDeviceId(entry.id),
          name: boundedString(entry.name, 128),
          type: boundedString(entry.type, 32),
          isActive: entry.is_active === true,
          isRestricted: entry.is_restricted === true,
          supportsVolume: entry.supports_volume !== false,
          volumePercent: clampInt(entry.volume_percent, 0, 0, 100)
        });
      })
      .filter((device) => device.id);
    return Object.freeze({ devices: Object.freeze(devices) });
  }

  function deviceQuery(deviceId) {
    const id = normalizeDeviceId(deviceId);
    return id ? { device_id: id } : undefined;
  }

  async function playPlaylistContext(options = {}) {
    const contextUri = normalizePlaylistUri(options.contextUri);
    if (!contextUri) {
      throw createSpotifyClientError("invalid-request", "A Spotify playlist context is required.");
    }
    await request("PUT", "/me/player/play", {
      query: deviceQuery(options.deviceId),
      body: { context_uri: contextUri },
      signal: options.signal
    });
    return true;
  }

  async function resume(options = {}) {
    await request("PUT", "/me/player/play", { query: deviceQuery(options.deviceId), signal: options.signal });
    return true;
  }

  async function pause(options = {}) {
    await request("PUT", "/me/player/pause", { query: deviceQuery(options.deviceId), signal: options.signal });
    return true;
  }

  async function next(options = {}) {
    await request("POST", "/me/player/next", { query: deviceQuery(options.deviceId), signal: options.signal });
    return true;
  }

  async function previous(options = {}) {
    await request("POST", "/me/player/previous", { query: deviceQuery(options.deviceId), signal: options.signal });
    return true;
  }

  async function seek(positionMs, options = {}) {
    await request("PUT", "/me/player/seek", {
      query: { position_ms: clampInt(positionMs, 0, 0, MAX_MEDIA_MS), ...deviceQuery(options.deviceId) },
      signal: options.signal
    });
    return true;
  }

  async function setVolume(percent, options = {}) {
    await request("PUT", "/me/player/volume", {
      query: { volume_percent: clampInt(percent, 0, 0, 100), ...deviceQuery(options.deviceId) },
      signal: options.signal
    });
    return true;
  }

  return Object.freeze({
    getCurrentProfile,
    getDevices,
    getPlaybackState,
    listPlaylists,
    next,
    pause,
    playPlaylistContext,
    previous,
    resume,
    seek,
    setVolume
  });
}

module.exports = {
  API_BASE,
  MAX_RETRY_AFTER_SECONDS,
  createSpotifyClient
};
