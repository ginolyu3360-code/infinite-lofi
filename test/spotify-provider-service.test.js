const test = require("node:test");
const assert = require("node:assert/strict");

const spotifyAuth = require("../src/spotify-auth");
const {
  PROVIDER_SERVICE_ERROR_CODES,
  createSpotifyProviderService
} = require("../src/spotify-provider-service");

const CLIENT_ID = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
const REDIRECT_URI = "http://127.0.0.1:54321/callback";
const ACCESS_TOKEN = "BQD_secret_access_token_value";
const REFRESH_TOKEN = "AQD_secret_refresh_token_value";

function createError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function capture(promise) {
  return promise.then(
    (value) => ({ ok: true, value }),
    (error) => ({ ok: false, error })
  );
}

async function flush(times = 4) {
  for (let index = 0; index < times; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function createFakeListenerFactory() {
  const listeners = [];
  function factory() {
    const record = { started: false, closed: false, closeCount: 0, waitOptions: null, settled: false, _settle: null };
    const listener = {
      async start() {
        record.started = true;
        return REDIRECT_URI;
      },
      get redirectUri() {
        return record.started ? REDIRECT_URI : "";
      },
      waitForCode(options) {
        record.waitOptions = options;
        return new Promise((resolve, reject) => {
          record._settle = (outcome) => {
            if (record.settled) return;
            record.settled = true;
            if (outcome.error) reject(outcome.error);
            else resolve(outcome.code);
          };
        });
      },
      async close() {
        record.closed = true;
        record.closeCount += 1;
        if (record._settle) record._settle({ error: createError("closed", "listener closed") });
        return true;
      }
    };
    listeners.push(record);
    return listener;
  }
  factory.listeners = listeners;
  return factory;
}

function createFakeSession(initialState) {
  const calls = { load: 0, connect: [], disconnect: 0, getAccessToken: 0 };
  let authState = initialState || {
    status: "disconnected",
    providerId: "spotify",
    connected: false,
    hasRefreshToken: false,
    accessExpiresAt: 0,
    refreshExpiresAt: 0,
    scopes: []
  };
  return {
    calls,
    async load() {
      calls.load += 1;
      return authState;
    },
    async connect(tokenSet) {
      calls.connect.push(tokenSet);
      authState = {
        status: "connected",
        providerId: "spotify",
        connected: true,
        hasRefreshToken: Boolean(tokenSet.refreshToken),
        accessExpiresAt: tokenSet.accessExpiresAt || 0,
        refreshExpiresAt: tokenSet.refreshExpiresAt || 0,
        scopes: []
      };
      return authState;
    },
    async disconnect() {
      calls.disconnect += 1;
      authState = { ...authState, status: "disconnected", connected: false };
      return authState;
    },
    async getAccessToken() {
      calls.getAccessToken += 1;
      return ACCESS_TOKEN;
    },
    getAuthState: () => authState,
    setAuthState(next) {
      authState = next;
    }
  };
}

function createFakeClient() {
  const calls = [];
  const record = (name) => (...args) => {
    calls.push({ name, args });
    return Promise.resolve({ result: name });
  };
  return {
    calls,
    getCurrentProfile: record("getCurrentProfile"),
    listPlaylists: record("listPlaylists"),
    getPlaybackState: record("getPlaybackState"),
    getDevices: record("getDevices"),
    playPlaylistContext: record("playPlaylistContext"),
    resume: record("resume"),
    pause: record("pause"),
    next: record("next"),
    previous: record("previous"),
    seek: record("seek"),
    setVolume: record("setVolume")
  };
}

function createTokenFetch(payload) {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => payload
  });
}

function createHarness(overrides = {}) {
  const listenerFactory = createFakeListenerFactory();
  const session = createFakeSession(overrides.initialState);
  const client = createFakeClient();
  const opened = [];
  let clientOptions = null;
  const service = createSpotifyProviderService({
    auth: spotifyAuth,
    session,
    fetchImpl: overrides.fetchImpl || createTokenFetch({
      access_token: ACCESS_TOKEN,
      refresh_token: REFRESH_TOKEN,
      token_type: "Bearer",
      scope: "playlist-read-private",
      expires_in: 3600
    }),
    openExternal: overrides.openExternal || (async (url) => {
      opened.push(url);
    }),
    createListener: listenerFactory,
    createClient: (options) => {
      clientOptions = options;
      return client;
    }
  });
  return { service, session, client, opened, listenerFactory, listeners: listenerFactory.listeners, getClientOptions: () => clientOptions };
}

test("requires openExternal, a listener factory, and a client factory", () => {
  assert.throws(() => createSpotifyProviderService({}), /openExternal/i);
  assert.throws(
    () => createSpotifyProviderService({ openExternal: async () => {}, createListener: {}, createClient: () => {} }),
    /listener factory/i
  );
  assert.throws(
    () => createSpotifyProviderService({ openExternal: async () => {}, createListener: () => {}, createClient: {} }),
    /client factory/i
  );
});

test("rejects operations before initialization and restores the session on initialize", async () => {
  const restored = {
    status: "connected",
    providerId: "spotify",
    connected: true,
    hasRefreshToken: true,
    accessExpiresAt: 111,
    refreshExpiresAt: 222,
    scopes: ["playlist-read-private"]
  };
  const { service, session } = createHarness({ initialState: restored });

  await assert.rejects(service.getAuthState(), (error) => error.code === "not-initialized");
  await assert.rejects(service.getProfile(), (error) => error.code === "not-initialized");
  await assert.rejects(service.pause(), (error) => error.code === "not-initialized");
  assert.equal(service.isInitialized(), false);

  const state = await service.initialize();
  assert.equal(session.calls.load, 1);
  assert.equal(service.isInitialized(), true);
  assert.equal(state.status, "connected");
  assert.deepEqual(state.scopes, ["playlist-read-private"]);

  const again = await service.initialize();
  assert.equal(session.calls.load, 1);
  assert.equal(again.status, "connected");
});

test("deduplicates concurrent initialization", async () => {
  const harness = createHarness();
  let releaseLoad;
  harness.session.load = () => new Promise((resolve) => {
    harness.session.calls.load += 1;
    releaseLoad = () => resolve(harness.session.getAuthState());
  });

  const first = harness.service.initialize();
  const second = harness.service.initialize();
  assert.equal(harness.session.calls.load, 1);
  releaseLoad();
  const [firstState, secondState] = await Promise.all([first, second]);
  assert.equal(firstState.status, "disconnected");
  assert.equal(secondState.status, "disconnected");
});

test("connects through a fresh loopback listener and persists the client ID", async () => {
  const harness = createHarness();
  const { service, session, opened, listeners } = harness;
  await service.initialize();

  const pending = capture(service.connect({ clientId: CLIENT_ID }));
  await flush();

  assert.equal(listeners.length, 1);
  assert.equal(listeners[0].started, true);
  assert.equal(opened.length, 1);

  const url = new URL(opened[0]);
  assert.equal(url.origin, "https://accounts.spotify.com");
  assert.equal(url.pathname, "/authorize");
  assert.equal(url.searchParams.get("client_id"), CLIENT_ID);
  assert.equal(url.searchParams.get("redirect_uri"), REDIRECT_URI);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.ok(url.searchParams.get("state"));
  assert.ok(url.searchParams.get("code_challenge"));
  assert.equal(url.searchParams.has("code_verifier"), false);
  assert.equal(listeners[0].waitOptions.expectedState, url.searchParams.get("state"));

  listeners[0]._settle({ code: "AUTH_CODE" });
  const outcome = await pending;
  assert.equal(outcome.ok, true);

  assert.equal(session.calls.connect.length, 1);
  assert.equal(session.calls.connect[0].clientId, CLIENT_ID);
  assert.equal(session.calls.connect[0].accessToken, ACCESS_TOKEN);
  assert.equal(session.calls.connect[0].refreshToken, REFRESH_TOKEN);
  assert.equal(outcome.value.status, "connected");
  assert.equal(listeners[0].closed, true);
  assert.equal(JSON.stringify(outcome.value).includes(ACCESS_TOKEN), false);
  assert.equal(JSON.stringify(outcome.value).includes(REFRESH_TOKEN), false);
});

test("closes the listener and does not persist when authorization is denied", async () => {
  const { service, session, listeners } = createHarness();
  await service.initialize();

  const pending = capture(service.connect({ clientId: CLIENT_ID }));
  await flush();
  listeners[0]._settle({ error: createError("authorization-denied") });
  const outcome = await pending;

  assert.equal(outcome.ok, false);
  assert.equal(outcome.error.code, "authorization-denied");
  assert.equal(session.calls.connect.length, 0);
  assert.equal(listeners[0].closed, true);
});

test("closes the listener when the callback times out", async () => {
  const { service, session, listeners } = createHarness();
  await service.initialize();

  const pending = capture(service.connect({ clientId: CLIENT_ID, timeoutMs: 10 }));
  await flush();
  assert.equal(listeners[0].waitOptions.timeoutMs, 10);
  listeners[0]._settle({ error: createError("authorization-timeout") });
  const outcome = await pending;

  assert.equal(outcome.error.code, "authorization-timeout");
  assert.equal(session.calls.connect.length, 0);
  assert.equal(listeners[0].closed, true);
});

test("cancelConnect cancels an in-flight connect without disconnecting the session", async () => {
  const connected = {
    status: "connected",
    providerId: "spotify",
    connected: true,
    hasRefreshToken: true,
    accessExpiresAt: 111,
    refreshExpiresAt: 222,
    scopes: []
  };
  const { service, session, listeners } = createHarness({ initialState: connected });
  await service.initialize();

  const pending = capture(service.connect({ clientId: CLIENT_ID }));
  await flush();
  assert.equal(await service.cancelConnect(), true);
  assert.equal(await service.cancelConnect(), false);
  const outcome = await pending;

  assert.equal(outcome.ok, false);
  assert.equal(outcome.error.code, "connect-cancelled");
  assert.equal(listeners[0].closed, true);
  assert.equal(session.calls.disconnect, 0);
  assert.equal(session.calls.connect.length, 0);
  assert.equal((await service.getAuthState()).status, "connected");
});

test("cancelConnect stops an in-flight code exchange before credentials are persisted", async () => {
  let releaseExchange;
  let exchangeStarted;
  const started = new Promise((resolve) => { exchangeStarted = resolve; });
  const harness = createHarness({
    fetchImpl: async () => {
      exchangeStarted();
      return new Promise((resolve) => {
        releaseExchange = () => resolve({
          ok: true,
          status: 200,
          json: async () => ({
            access_token: ACCESS_TOKEN,
            refresh_token: REFRESH_TOKEN,
            expires_in: 3600
          })
        });
      });
    }
  });
  await harness.service.initialize();

  const pending = capture(harness.service.connect({ clientId: CLIENT_ID }));
  await flush();
  harness.listeners[0]._settle({ code: "AUTH_CODE" });
  await started;
  assert.equal(await harness.service.cancelConnect(), true);
  releaseExchange();
  const outcome = await pending;

  assert.equal(outcome.ok, false);
  assert.equal(outcome.error.code, "connect-cancelled");
  assert.equal(harness.session.calls.connect.length, 0);
  assert.equal(harness.session.calls.disconnect, 0);
});

test("rejects a concurrent connect while one is in progress", async () => {
  const { service, session, listeners } = createHarness();
  await service.initialize();

  const first = capture(service.connect({ clientId: CLIENT_ID }));
  await flush();
  const second = capture(service.connect({ clientId: CLIENT_ID }));
  const secondOutcome = await second;
  assert.equal(secondOutcome.ok, false);
  assert.equal(secondOutcome.error.code, "connect-in-progress");
  assert.equal(listeners.length, 1);

  listeners[0]._settle({ code: "AUTH_CODE" });
  const firstOutcome = await first;
  assert.equal(firstOutcome.ok, true);
  assert.equal(session.calls.connect.length, 1);
});

test("rejects an invalid client ID without creating a listener", async () => {
  const { service, listeners } = createHarness();
  await service.initialize();

  await assert.rejects(service.connect({ clientId: "short" }), (error) => error.code === "invalid-client-id");
  await assert.rejects(service.connect({}), (error) => error.code === "invalid-client-id");
  assert.equal(listeners.length, 0);
});

test("closes the listener and does not persist when openExternal fails", async () => {
  const { service, session, listeners } = createHarness({
    openExternal: async () => {
      throw new Error(`cannot open https://accounts.spotify.com/authorize?state=leaky`);
    }
  });
  await service.initialize();

  const pending = capture(service.connect({ clientId: CLIENT_ID }));
  await flush();
  const outcome = await pending;

  assert.equal(outcome.ok, false);
  assert.equal(outcome.error.code, "open-external-failed");
  assert.equal(outcome.error.message.includes("accounts.spotify.com"), false);
  assert.equal(session.calls.connect.length, 0);
  assert.equal(listeners[0].closed, true);
});

test("closes the listener and does not persist when the code exchange fails", async () => {
  const { service, session, listeners } = createHarness({
    fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({ error: "invalid_grant" }) })
  });
  await service.initialize();

  const pending = capture(service.connect({ clientId: CLIENT_ID }));
  await flush();
  listeners[0]._settle({ code: "AUTH_CODE" });
  const outcome = await pending;

  assert.equal(outcome.ok, false);
  assert.equal(outcome.error.code, "reauthorization-required");
  assert.equal(outcome.error.message.includes("AUTH_CODE"), false);
  assert.equal(session.calls.connect.length, 0);
  assert.equal(listeners[0].closed, true);
});

test("creates one client that resolves tokens through the session and forwards commands", async () => {
  const harness = createHarness();
  const { service, session, client, getClientOptions } = harness;
  await service.initialize();

  assert.equal(typeof getClientOptions().getAccessToken, "function");
  assert.equal(await getClientOptions().getAccessToken(), ACCESS_TOKEN);
  assert.equal(session.calls.getAccessToken, 1);

  await service.getProfile();
  await service.listPlaylists({ limit: 5 });
  await service.getPlaybackState();
  await service.getDevices();
  await service.playPlaylist({ contextUri: "spotify:playlist:abc" });
  await service.resume();
  await service.pause({ deviceId: "device-1" });
  await service.next();
  await service.previous();
  await service.seek(1234);
  await service.setVolume(55, { deviceId: "device-1" });

  assert.deepEqual(client.calls.map((call) => call.name), [
    "getCurrentProfile",
    "listPlaylists",
    "getPlaybackState",
    "getDevices",
    "playPlaylistContext",
    "resume",
    "pause",
    "next",
    "previous",
    "seek",
    "setVolume"
  ]);
  assert.deepEqual(client.calls[1].args, [{ limit: 5 }]);
  assert.deepEqual(client.calls[2].args, [undefined]);
  assert.deepEqual(client.calls[4].args, [{ contextUri: "spotify:playlist:abc" }]);
  assert.deepEqual(client.calls[9].args, [1234, undefined]);
  assert.deepEqual(client.calls[10].args, [55, { deviceId: "device-1" }]);
});

test("disconnect forwards to the session", async () => {
  const { service, session } = createHarness();
  await service.initialize();
  const state = await service.disconnect();
  assert.equal(session.calls.disconnect, 1);
  assert.equal(state.status, "disconnected");
});

test("close cancels an in-flight connect and blocks later operations", async () => {
  const { service, listeners } = createHarness();
  await service.initialize();

  const pending = capture(service.connect({ clientId: CLIENT_ID }));
  await flush();
  assert.equal(await service.close(), true);
  const outcome = await pending;
  assert.equal(outcome.ok, false);
  assert.equal(outcome.error.code, "closed");
  assert.equal(listeners[0].closed, true);

  assert.equal(await service.close(), true);
  assert.equal(await service.cancelConnect(), false);
  await assert.rejects(service.getAuthState(), (error) => error.code === "closed");
  await assert.rejects(service.initialize(), (error) => error.code === "closed");
});

test("exposes stable error code constants", () => {
  assert.equal(PROVIDER_SERVICE_ERROR_CODES.connectInProgress, "connect-in-progress");
  assert.equal(PROVIDER_SERVICE_ERROR_CODES.connectCancelled, "connect-cancelled");
  assert.equal(PROVIDER_SERVICE_ERROR_CODES.notInitialized, "not-initialized");
  assert.equal(PROVIDER_SERVICE_ERROR_CODES.openExternalFailed, "open-external-failed");
});
