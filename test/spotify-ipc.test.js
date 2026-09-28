const test = require("node:test");
const assert = require("node:assert/strict");

const { errorResult, registerSpotifyIpc } = require("../src/spotify-ipc");

function createIpc() {
  const handlers = new Map();
  return {
    handlers,
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
    removeHandler(channel) {
      handlers.delete(channel);
    }
  };
}

function createService() {
  const calls = [];
  const method = (name, result = true) => async (...args) => {
    calls.push([name, ...args]);
    return result;
  };
  return {
    calls,
    getAuthState: method("getAuthState", { connected: false }),
    getProfile: method("getProfile", { id: "user" }),
    connect: method("connect", { connected: true }),
    cancelConnect: method("cancelConnect"),
    disconnect: method("disconnect", { connected: false }),
    listPlaylists: method("listPlaylists", { items: [] }),
    getPlaybackState: method("getPlaybackState", null),
    getDevices: method("getDevices", { devices: [] }),
    playPlaylist: method("playPlaylist"),
    resume: method("resume"),
    pause: method("pause"),
    next: method("next"),
    previous: method("previous"),
    seek: method("seek"),
    setVolume: method("setVolume")
  };
}

test("registers only explicit Spotify channels and rejects untrusted senders", async () => {
  const ipcMain = createIpc();
  const service = createService();
  const registration = registerSpotifyIpc({
    ipcMain,
    isTrustedSender: (event) => event?.trusted === true,
    getService: () => service
  });

  assert.equal(registration.channels.length, 15);
  assert.deepEqual([...ipcMain.handlers.keys()], registration.channels);
  const result = await ipcMain.handlers.get("spotify:getAuthState")({ trusted: false });
  assert.deepEqual(result, { ok: false, error: { code: "unauthorized-sender" } });
  assert.equal(service.calls.length, 0);

  registration.dispose();
  assert.equal(ipcMain.handlers.size, 0);
});

test("returns a stable unavailable result without a service", async () => {
  const ipcMain = createIpc();
  registerSpotifyIpc({ ipcMain, isTrustedSender: () => true, getService: () => null });
  assert.deepEqual(await ipcMain.handlers.get("spotify:getProfile")({}), {
    ok: false,
    error: { code: "provider-unavailable" }
  });
});

test("sanitizes connect, playlist, device, seek, and volume inputs", async () => {
  const ipcMain = createIpc();
  const service = createService();
  registerSpotifyIpc({ ipcMain, isTrustedSender: () => true, getService: () => service });

  await ipcMain.handlers.get("spotify:connect")({}, { clientId: `  ${"a".repeat(200)}  ` });
  await ipcMain.handlers.get("spotify:listPlaylists")({}, { limit: 999, offset: -4 });
  await ipcMain.handlers.get("spotify:playPlaylist")({}, {
    contextUri: ` spotify:playlist:${"x".repeat(300)} `,
    deviceId: ` ${"d".repeat(200)} `
  });
  await ipcMain.handlers.get("spotify:seek")({}, { positionMs: 999999999, deviceId: " d1 " });
  await ipcMain.handlers.get("spotify:setVolume")({}, { percent: -20, deviceId: " d2 " });

  assert.equal(service.calls[0][1].clientId.length, 128);
  assert.deepEqual(service.calls[1][1], { limit: 50, offset: 0 });
  assert.equal(service.calls[2][1].contextUri.length, 256);
  assert.equal(service.calls[2][1].deviceId.length, 128);
  assert.deepEqual(service.calls[3].slice(1), [86400000, { deviceId: "d1" }]);
  assert.deepEqual(service.calls[4].slice(1), [0, { deviceId: "d2" }]);
});

test("wraps successful data and exposes only stable error metadata", async () => {
  const ipcMain = createIpc();
  const secret = "secret-token-value";
  const service = createService();
  service.getProfile = async () => {
    const error = new Error(`failed with ${secret}`);
    error.code = "rate-limited";
    error.status = 429;
    error.retryAfter = 99999;
    error.rawBody = secret;
    throw error;
  };
  registerSpotifyIpc({ ipcMain, isTrustedSender: () => true, getService: () => service });

  const success = await ipcMain.handlers.get("spotify:getDevices")({});
  assert.deepEqual(success, { ok: true, data: { devices: [] } });
  const failure = await ipcMain.handlers.get("spotify:getProfile")({});
  assert.deepEqual(failure, {
    ok: false,
    error: { code: "rate-limited", status: 429, retryAfter: 3600 }
  });
  assert.equal(JSON.stringify(failure).includes(secret), false);
  assert.deepEqual(errorResult(null), { ok: false, error: { code: "spotify-error" } });
});
