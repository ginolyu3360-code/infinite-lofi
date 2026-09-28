const MAX_CLIENT_ID_LENGTH = 128;
const MAX_DEVICE_ID_LENGTH = 128;
const MAX_CONTEXT_URI_LENGTH = 256;

function cleanString(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function boundedNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(Math.round(number), min), max);
}

function errorResult(error) {
  const retryAfter = Number(error?.retryAfter);
  const status = Number(error?.status);
  return {
    ok: false,
    error: {
      code: cleanString(error?.code, 64) || "spotify-error",
      ...(Number.isInteger(status) ? { status } : {}),
      ...(Number.isFinite(retryAfter) && retryAfter > 0
        ? { retryAfter: boundedNumber(retryAfter, 1, 1, 3600) }
        : {})
    }
  };
}

function registerSpotifyIpc(options = {}) {
  const { ipcMain, isTrustedSender, getService } = options;
  if (!ipcMain || typeof ipcMain.handle !== "function") {
    throw new TypeError("An ipcMain-compatible handler registry is required.");
  }
  if (typeof isTrustedSender !== "function" || typeof getService !== "function") {
    throw new TypeError("Trusted-sender and service resolvers are required.");
  }

  const channels = [];
  const register = (channel, operation) => {
    ipcMain.handle(channel, async (event, payload) => {
      if (!isTrustedSender(event)) return errorResult({ code: "unauthorized-sender" });
      const service = getService();
      if (!service) return errorResult({ code: "provider-unavailable" });
      try {
        return { ok: true, data: await operation(service, payload) };
      } catch (error) {
        return errorResult(error);
      }
    });
    channels.push(channel);
  };

  register("spotify:getAuthState", (service) => service.getAuthState());
  register("spotify:getProfile", (service) => service.getProfile());
  register("spotify:connect", (service, payload) => service.connect({
    clientId: cleanString(payload?.clientId, MAX_CLIENT_ID_LENGTH)
  }));
  register("spotify:cancelConnect", (service) => service.cancelConnect());
  register("spotify:disconnect", (service) => service.disconnect());
  register("spotify:listPlaylists", (service, payload) => service.listPlaylists({
    limit: boundedNumber(payload?.limit, 50, 1, 50),
    offset: boundedNumber(payload?.offset, 0, 0, 100000)
  }));
  register("spotify:getPlaybackState", (service) => service.getPlaybackState());
  register("spotify:getDevices", (service) => service.getDevices());
  register("spotify:playPlaylist", (service, payload) => service.playPlaylist({
    contextUri: cleanString(payload?.contextUri, MAX_CONTEXT_URI_LENGTH),
    deviceId: cleanString(payload?.deviceId, MAX_DEVICE_ID_LENGTH)
  }));
  register("spotify:resume", (service, payload) => service.resume({
    deviceId: cleanString(payload?.deviceId, MAX_DEVICE_ID_LENGTH)
  }));
  register("spotify:pause", (service, payload) => service.pause({
    deviceId: cleanString(payload?.deviceId, MAX_DEVICE_ID_LENGTH)
  }));
  register("spotify:next", (service, payload) => service.next({
    deviceId: cleanString(payload?.deviceId, MAX_DEVICE_ID_LENGTH)
  }));
  register("spotify:previous", (service, payload) => service.previous({
    deviceId: cleanString(payload?.deviceId, MAX_DEVICE_ID_LENGTH)
  }));
  register("spotify:seek", (service, payload) => service.seek(
    boundedNumber(payload?.positionMs, 0, 0, 86400000),
    { deviceId: cleanString(payload?.deviceId, MAX_DEVICE_ID_LENGTH) }
  ));
  register("spotify:setVolume", (service, payload) => service.setVolume(
    boundedNumber(payload?.percent, 0, 0, 100),
    { deviceId: cleanString(payload?.deviceId, MAX_DEVICE_ID_LENGTH) }
  ));

  return Object.freeze({
    channels: Object.freeze([...channels]),
    dispose() {
      if (typeof ipcMain.removeHandler === "function") {
        for (const channel of channels) ipcMain.removeHandler(channel);
      }
    }
  });
}

module.exports = {
  errorResult,
  registerSpotifyIpc
};
