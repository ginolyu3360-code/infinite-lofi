(function exposeInfiniteLofiSpotifyController(globalScope) {
  const DASHBOARD_URL = "https://developer.spotify.com/dashboard";
  const OPEN_SPOTIFY_URL = "https://open.spotify.com";
  const PLAYBACK_POLL_MS = 5000;
  const PLAYLIST_URI_PATTERN = /^spotify:playlist:[A-Za-z0-9]+$/;
  const MAX_CLIENT_ID_LENGTH = 128;

  // Documented API shape: matches window.desktopApp.spotify from preload.js.
  // Every method returns { ok: true, data } or { ok: false, error: { code, status?, retryAfter? } }.
  //   getAuthState(), getProfile(), cancelConnect(), disconnect(),
  //   getPlaybackState(), getDevices() -> no arguments
  //   connect(clientId), resume(deviceId), pause(deviceId), next(deviceId), previous(deviceId)
  //   listPlaylists(options) -> { limit, offset }
  //   playPlaylist(contextUri, deviceId), seek(positionMs, deviceId), setVolume(percent, deviceId)
  const SPOTIFY_CONTROLLER_API_METHODS = Object.freeze([
    "getAuthState",
    "getProfile",
    "connect",
    "cancelConnect",
    "disconnect",
    "listPlaylists",
    "getPlaybackState",
    "getDevices",
    "playPlaylist",
    "resume",
    "pause",
    "next",
    "previous",
    "seek",
    "setVolume"
  ]);

  function cleanString(value, maxLength) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
  }

  function boundedNumber(value, fallback, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(Math.max(Math.round(number), min), max);
  }

  function normalizeError(error) {
    const status = Number(error?.status);
    const retryAfter = Number(error?.retryAfter);
    return {
      code: cleanString(error?.code, 64) || "spotify-error",
      ...(Number.isInteger(status) && status > 0 ? { status } : {}),
      ...(Number.isFinite(retryAfter) && retryAfter > 0
        ? { retryAfter: boundedNumber(retryAfter, 1, 1, 3600) }
        : {})
    };
  }

  function sanitizeAuthState(data) {
    const connected = data?.connected === true || data?.status === "connected";
    return Object.freeze({
      connected,
      status: cleanString(data?.status, 32) || (connected ? "connected" : "disconnected"),
      providerId: cleanString(data?.providerId, 64),
      hasRefreshToken: data?.hasRefreshToken === true,
      accessExpiresAt: boundedNumber(data?.accessExpiresAt, 0, 0, Number.MAX_SAFE_INTEGER),
      refreshExpiresAt: boundedNumber(data?.refreshExpiresAt, 0, 0, Number.MAX_SAFE_INTEGER),
      scopes: Object.freeze(
        (Array.isArray(data?.scopes) ? data.scopes : [])
          .filter((scope) => typeof scope === "string")
          .slice(0, 32)
          .map((scope) => scope.slice(0, 64))
      )
    });
  }

  function normalizeProfile(data) {
    if (!data || typeof data !== "object") return null;
    return Object.freeze({
      id: cleanString(data.id, 128),
      displayName: cleanString(data.displayName, 128),
      imageUrl: cleanString(data.imageUrl, 2048)
    });
  }

  function normalizePlaylists(data) {
    const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
    const result = [];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      let uri = typeof item.uri === "string" && PLAYLIST_URI_PATTERN.test(item.uri) ? item.uri : "";
      if (!uri) {
        const id = cleanString(item.id, 128);
        if (/^[A-Za-z0-9]+$/.test(id)) uri = `spotify:playlist:${id}`;
      }
      if (!uri) continue;
      result.push(Object.freeze({
        uri,
        id: cleanString(item.id, 128) || uri.slice("spotify:playlist:".length),
        name: cleanString(item.name, 256) || uri,
        trackCount: boundedNumber(item.trackCount, 0, 0, 1000000),
        ownerName: cleanString(item.ownerName, 128),
        imageUrl: cleanString(item.imageUrl, 2048)
      }));
      if (result.length >= 50) break;
    }
    return Object.freeze(result);
  }

  function normalizeDevices(data) {
    const items = Array.isArray(data?.devices) ? data.devices : Array.isArray(data) ? data : [];
    const result = [];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const id = cleanString(item.id, 128);
      if (!id) continue;
      result.push(Object.freeze({
        id,
        name: cleanString(item.name, 128) || id,
        type: cleanString(item.type, 32),
        isActive: item.isActive === true,
        isRestricted: item.isRestricted === true,
        supportsVolume: item.supportsVolume !== false,
        volumePercent: boundedNumber(item.volumePercent, 0, 0, 100)
      }));
      if (result.length >= 32) break;
    }
    return Object.freeze(result);
  }

  function normalizePlaybackState(data) {
    if (!data || typeof data !== "object") return null;
    const track = data.track && typeof data.track === "object"
      ? Object.freeze({
          id: cleanString(data.track.id, 128),
          name: cleanString(data.track.name, 256),
          artists: Object.freeze(
            (Array.isArray(data.track.artists) ? data.track.artists : [])
              .filter((artist) => typeof artist === "string")
              .slice(0, 8)
              .map((artist) => artist.slice(0, 128))
          ),
          durationMs: boundedNumber(data.track.durationMs, 0, 0, 86400000)
        })
      : null;
    return Object.freeze({
      isPlaying: data.isPlaying === true,
      progressMs: boundedNumber(data.progressMs, 0, 0, 86400000),
      deviceId: cleanString(data.deviceId, 128),
      deviceName: cleanString(data.deviceName, 128),
      deviceRestricted: data.deviceRestricted === true,
      supportsVolume: data.supportsVolume !== false,
      volumePercent: boundedNumber(data.volumePercent, 0, 0, 100),
      contextUri: cleanString(data.contextUri, 256),
      track
    });
  }

  function createSpotifyController(options = {}) {
    const elements = options.elements || {};
    const t = typeof options.t === "function" ? options.t : (key) => key;
    const announce = typeof options.announce === "function" ? options.announce : () => {};
    const onPlaybackState = typeof options.onPlaybackState === "function" ? options.onPlaybackState : null;
    const setIntervalImpl = typeof options.setIntervalImpl === "function" ? options.setIntervalImpl : globalScope?.setInterval;
    const clearIntervalImpl = typeof options.clearIntervalImpl === "function" ? options.clearIntervalImpl : globalScope?.clearInterval;
    const api = options.api || globalScope?.desktopApp?.spotify || null;
    const openExternal = options.openExternal || globalScope?.desktopApp?.openExternalUrl || null;
    const doc = elements.document || globalScope?.document || null;

    let authState = sanitizeAuthState(null);
    let profile = null;
    let playlists = [];
    let devices = [];
    let playbackState = null;
    let selectedPlaylistUri = "";
    let selectedDeviceId = "";
    let activated = false;
    let destroyed = false;
    let connectInFlight = false;
    let priorConnected = false;
    let connectGeneration = 0;
    let pollTimer = null;
    let pollInFlight = false;
    const boundListeners = [];

    function errorText(error) {
      const code = cleanString(error?.code, 64) || "spotify-error";
      const params = code === "rate-limited" && Number.isFinite(Number(error?.retryAfter))
        ? { retryAfter: boundedNumber(error.retryAfter, 1, 1, 3600) }
        : {};
      const key = `spotify.error.${code}`;
      const translated = t(key, params);
      return translated !== key ? translated : t("spotify.error.generic", params);
    }

    function setStatus(text) {
      if (elements.statusText) elements.statusText.textContent = text;
    }

    function reportError(error) {
      const message = errorText(error);
      setStatus(message);
      announce(message);
    }

    async function callApi(name, ...args) {
      const method = api && typeof api[name] === "function" ? api[name] : null;
      if (!method) return { ok: false, error: { code: "provider-unavailable" } };
      let result;
      try {
        result = await method.apply(api, args);
      } catch {
        return { ok: false, error: { code: "network-error" } };
      }
      if (result && result.ok === true) return { ok: true, data: result.data };
      if (result && result.ok === false) return { ok: false, error: normalizeError(result.error) };
      return { ok: false, error: { code: "spotify-error" } };
    }

    async function openUrl(url) {
      if (typeof openExternal !== "function") return false;
      try {
        await openExternal(url);
        return true;
      } catch {
        return false;
      }
    }

    function canControl() {
      return authState.connected && !connectInFlight && !destroyed;
    }

    function transportAllowed() {
      return canControl() && !effectiveDeviceFlags().restricted;
    }

    function selectedDevice() {
      if (selectedDeviceId) return devices.find((device) => device.id === selectedDeviceId) || null;
      return null;
    }

    function effectiveDeviceFlags() {
      const selected = selectedDevice();
      if (selected) return { restricted: selected.isRestricted, supportsVolume: selected.supportsVolume };
      return {
        restricted: playbackState?.deviceRestricted === true,
        supportsVolume: playbackState?.supportsVolume !== false
      };
    }

    function renderViews() {
      if (elements.disconnectedView) elements.disconnectedView.hidden = authState.connected;
      if (elements.connectedView) elements.connectedView.hidden = !authState.connected;
      if (elements.clientIdInput) elements.clientIdInput.disabled = connectInFlight;
      if (elements.connectButton) elements.connectButton.disabled = connectInFlight;
      if (elements.cancelConnectButton) elements.cancelConnectButton.hidden = !connectInFlight;
    }

    function renderProfile() {
      if (!elements.profileText) return;
      elements.profileText.textContent = profile ? profile.displayName || profile.id || "" : "";
    }

    function renderPlaylists() {
      if (!elements.playlistSelect || !doc || typeof doc.createElement !== "function") return;
      const options = [];
      const placeholder = doc.createElement("option");
      placeholder.value = "";
      placeholder.textContent = t("spotify.selectPlaylist");
      options.push(placeholder);
      for (const playlist of playlists) {
        const option = doc.createElement("option");
        option.value = playlist.uri;
        option.textContent = playlist.name;
        options.push(option);
      }
      elements.playlistSelect.replaceChildren(...options);
      if (selectedPlaylistUri && playlists.some((playlist) => playlist.uri === selectedPlaylistUri)) {
        elements.playlistSelect.value = selectedPlaylistUri;
      } else {
        selectedPlaylistUri = "";
        elements.playlistSelect.value = "";
      }
    }

    function renderDevices() {
      if (!elements.deviceSelect || !doc || typeof doc.createElement !== "function") return;
      const options = [];
      const placeholder = doc.createElement("option");
      placeholder.value = "";
      placeholder.textContent = t("spotify.activeDevice");
      options.push(placeholder);
      for (const device of devices) {
        const option = doc.createElement("option");
        option.value = device.id;
        option.textContent = device.name;
        option.disabled = device.isRestricted === true;
        options.push(option);
      }
      elements.deviceSelect.replaceChildren(...options);
      if (selectedDeviceId && devices.some((device) => device.id === selectedDeviceId)) {
        elements.deviceSelect.value = selectedDeviceId;
      } else {
        selectedDeviceId = "";
        elements.deviceSelect.value = "";
      }
    }

    function renderPlayback() {
      const durationMs = playbackState?.track?.durationMs || 0;
      const flags = effectiveDeviceFlags();
      if (elements.playPauseButton) {
        elements.playPauseButton.textContent = playbackState?.isPlaying === true ? t("spotify.pause") : t("spotify.play");
      }
      if (elements.seekRange) {
        elements.seekRange.disabled = !canControl() || flags.restricted || durationMs <= 0;
        if (!doc || doc.activeElement !== elements.seekRange) {
          elements.seekRange.value = durationMs > 0
            ? String(boundedNumber((playbackState.progressMs / durationMs) * 1000, 0, 0, 1000))
            : "0";
        }
      }
      if (elements.volumeRange) {
        elements.volumeRange.disabled = !canControl() || flags.restricted || !flags.supportsVolume;
        elements.volumeRange.value = String(boundedNumber(playbackState?.volumePercent, 0, 0, 100));
      }
    }

    function renderControls() {
      const enabled = canControl();
      const flags = effectiveDeviceFlags();
      const transportEnabled = enabled && !flags.restricted;
      for (const button of [elements.previousButton, elements.playPauseButton, elements.nextButton]) {
        if (button) button.disabled = !transportEnabled;
      }
      if (elements.refreshButton) elements.refreshButton.disabled = !enabled;
      if (elements.disconnectButton) elements.disconnectButton.disabled = !enabled;
      if (elements.openSpotifyButton) elements.openSpotifyButton.disabled = !authState.connected;
    }

    function render() {
      renderViews();
      renderProfile();
      renderPlaylists();
      renderDevices();
      renderPlayback();
      renderControls();
    }

    async function refreshPlayback({ silent = false } = {}) {
      const result = await callApi("getPlaybackState");
      if (!result.ok) {
        if (!silent) reportError(result.error);
        return false;
      }
      playbackState = normalizePlaybackState(result.data);
      renderPlayback();
      renderControls();
      if (onPlaybackState) onPlaybackState(playbackState);
      return true;
    }

    async function loadConnectedData({ silent = false } = {}) {
      const [profileResult, playlistsResult, devicesResult] = await Promise.all([
        callApi("getProfile"),
        callApi("listPlaylists", { limit: 50, offset: 0 }),
        callApi("getDevices")
      ]);
      let ok = true;
      if (profileResult.ok) {
        profile = normalizeProfile(profileResult.data);
      } else {
        ok = false;
        if (!silent) reportError(profileResult.error);
      }
      if (playlistsResult.ok) {
        playlists = normalizePlaylists(playlistsResult.data);
      } else {
        ok = false;
        if (!silent) reportError(playlistsResult.error);
      }
      if (devicesResult.ok) {
        devices = normalizeDevices(devicesResult.data);
      } else {
        ok = false;
        if (!silent) reportError(devicesResult.error);
      }
      await refreshPlayback({ silent });
      render();
      return ok;
    }

    async function pollPlayback() {
      if (pollInFlight || destroyed) return;
      pollInFlight = true;
      try {
        await refreshPlayback({ silent: true });
      } finally {
        pollInFlight = false;
      }
    }

    function startPolling() {
      if (pollTimer !== null || typeof setIntervalImpl !== "function") return;
      pollTimer = setIntervalImpl(() => {
        void pollPlayback();
      }, PLAYBACK_POLL_MS);
    }

    function stopPolling() {
      if (pollTimer === null) return;
      if (typeof clearIntervalImpl === "function") clearIntervalImpl(pollTimer);
      pollTimer = null;
    }

    async function initialize() {
      const result = await callApi("getAuthState");
      authState = result.ok ? sanitizeAuthState(result.data) : sanitizeAuthState(null);
      render();
      if (!result.ok) reportError(result.error);
      if (authState.connected) await loadConnectedData({ silent: true });
      return authState;
    }

    async function connect(clientId) {
      if (destroyed || connectInFlight) return false;
      const rawClientId = cleanString(clientId, MAX_CLIENT_ID_LENGTH);
      if (!rawClientId) {
        reportError({ code: "invalid-client-id" });
        return false;
      }
      priorConnected = authState.connected;
      connectInFlight = true;
      const generation = ++connectGeneration;
      render();
      setStatus(t("spotify.connecting"));
      const result = await callApi("connect", rawClientId);
      if (generation !== connectGeneration) return false;
      connectInFlight = false;
      if (result.ok) {
        authState = sanitizeAuthState(result.data);
        if (authState.connected) {
          if (elements.clientIdInput) elements.clientIdInput.value = "";
          await loadConnectedData({ silent: true });
          if (activated) {
            void pollPlayback();
            startPolling();
          }
        }
        render();
        if (authState.connected) {
          setStatus(t("spotify.connected"));
          announce(t("spotify.connected"));
        } else {
          reportError({ code: "not-authenticated" });
        }
        return authState.connected;
      }
      authState = sanitizeAuthState({ connected: priorConnected, status: priorConnected ? "connected" : "disconnected" });
      render();
      reportError(result.error);
      return false;
    }

    async function cancelConnect() {
      if (!connectInFlight) return false;
      connectGeneration += 1;
      connectInFlight = false;
      await callApi("cancelConnect");
      authState = sanitizeAuthState({ connected: priorConnected, status: priorConnected ? "connected" : "disconnected" });
      render();
      setStatus(t("spotify.connectCancelled"));
      announce(t("spotify.connectCancelled"));
      return true;
    }

    async function disconnect() {
      const result = await callApi("disconnect");
      if (!result.ok) {
        reportError(result.error);
        return false;
      }
      authState = sanitizeAuthState(result.data);
      profile = null;
      playlists = [];
      devices = [];
      playbackState = null;
      selectedPlaylistUri = "";
      selectedDeviceId = "";
      stopPolling();
      render();
      setStatus(t("spotify.disconnected"));
      announce(t("spotify.disconnected"));
      return true;
    }

    async function refresh() {
      if (!authState.connected) return false;
      return loadConnectedData({ silent: false });
    }

    async function play() {
      if (!transportAllowed()) return false;
      const result = selectedPlaylistUri
        ? await callApi("playPlaylist", selectedPlaylistUri, selectedDeviceId)
        : await callApi("resume", selectedDeviceId);
      if (!result.ok) {
        reportError(result.error);
        return false;
      }
      await refreshPlayback({ silent: true });
      return true;
    }

    async function pause() {
      if (!transportAllowed()) return false;
      const result = await callApi("pause", selectedDeviceId);
      if (!result.ok) {
        reportError(result.error);
        return false;
      }
      await refreshPlayback({ silent: true });
      return true;
    }

    async function previous() {
      if (!transportAllowed()) return false;
      const result = await callApi("previous", selectedDeviceId);
      if (!result.ok) {
        reportError(result.error);
        return false;
      }
      await refreshPlayback({ silent: true });
      return true;
    }

    async function next() {
      if (!transportAllowed()) return false;
      const result = await callApi("next", selectedDeviceId);
      if (!result.ok) {
        reportError(result.error);
        return false;
      }
      await refreshPlayback({ silent: true });
      return true;
    }

    async function seekFraction(fraction) {
      if (!transportAllowed()) return false;
      const durationMs = playbackState?.track?.durationMs || 0;
      if (durationMs <= 0) return false;
      const ratio = Math.min(Math.max(Number(fraction) || 0, 0), 1);
      const result = await callApi("seek", Math.round(ratio * durationMs), selectedDeviceId);
      if (!result.ok) {
        reportError(result.error);
        return false;
      }
      await refreshPlayback({ silent: true });
      return true;
    }

    async function setVolume(percent) {
      if (!transportAllowed()) return false;
      const flags = effectiveDeviceFlags();
      if (flags.restricted || !flags.supportsVolume) return false;
      const result = await callApi(
        "setVolume",
        boundedNumber(percent, 0, 0, 100),
        selectedDeviceId
      );
      if (!result.ok) {
        reportError(result.error);
        return false;
      }
      await refreshPlayback({ silent: true });
      return true;
    }

    function activate() {
      if (destroyed) return false;
      activated = true;
      if (authState.connected) {
        void pollPlayback();
        startPolling();
      }
      return true;
    }

    function deactivate() {
      activated = false;
      stopPolling();
      return true;
    }

    function destroy() {
      if (destroyed) return true;
      destroyed = true;
      activated = false;
      stopPolling();
      for (const { element, type, handler } of boundListeners) {
        element.removeEventListener?.(type, handler);
      }
      boundListeners.length = 0;
      return true;
    }

    function on(element, type, handler) {
      if (!element || typeof element.addEventListener !== "function") return;
      element.addEventListener(type, handler);
      boundListeners.push({ element, type, handler });
    }

    let bound = false;
    function bind() {
      if (bound) return controller;
      bound = true;
      on(elements.connectButton, "click", () => {
        void connect(elements.clientIdInput ? elements.clientIdInput.value : "");
      });
      on(elements.cancelConnectButton, "click", () => {
        void cancelConnect();
      });
      on(elements.dashboardButton, "click", () => {
        void openUrl(DASHBOARD_URL);
      });
      on(elements.refreshButton, "click", () => {
        void refresh();
      });
      on(elements.disconnectButton, "click", () => {
        void disconnect();
      });
      on(elements.openSpotifyButton, "click", () => {
        void openUrl(OPEN_SPOTIFY_URL);
      });
      on(elements.previousButton, "click", () => {
        void previous();
      });
      on(elements.playPauseButton, "click", () => {
        void (isPlaying() ? pause() : play());
      });
      on(elements.nextButton, "click", () => {
        void next();
      });
      on(elements.seekRange, "change", (event) => {
        void seekFraction(boundedNumber(event?.target?.value, 0, 0, 1000) / 1000);
      });
      on(elements.volumeRange, "change", (event) => {
        void setVolume(boundedNumber(event?.target?.value, 0, 0, 100));
      });
      on(elements.playlistSelect, "change", (event) => {
        selectedPlaylistUri = cleanString(event?.target?.value, 256);
        renderControls();
      });
      on(elements.deviceSelect, "change", (event) => {
        selectedDeviceId = cleanString(event?.target?.value, 128);
        renderPlayback();
        renderControls();
      });
      return controller;
    }

    function isPlaying() {
      return playbackState?.isPlaying === true;
    }

    const controller = Object.freeze({
      activate,
      bind,
      cancelConnect,
      connect,
      deactivate,
      destroy,
      disconnect,
      getAuthState: () => authState,
      getPlaybackState: () => playbackState,
      initialize,
      isConnected: () => authState.connected === true,
      isPlaying,
      next,
      pause,
      play,
      previous,
      refresh,
      render,
      seekFraction,
      setVolume
    });
    return controller;
  }

  const api = {
    DASHBOARD_URL,
    OPEN_SPOTIFY_URL,
    PLAYBACK_POLL_MS,
    SPOTIFY_CONTROLLER_API_METHODS,
    createSpotifyController
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalScope) globalScope.InfiniteLofiSpotifyController = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
