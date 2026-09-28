const test = require("node:test");
const assert = require("node:assert/strict");

const spotifyAuth = require("../src/spotify-auth");
const { DEFAULT_REFRESH_LEAD_MS, SESSION_STATUSES, createSpotifySession } = require("../src/spotify-session");

const CLIENT_ID = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
const ACCESS_TOKEN = "BQD_secret_access_token_value";
const REFRESH_TOKEN = "AQD_secret_refresh_token_value";

function createFakeStore(initial = null) {
  let record = initial ? { ...initial } : null;
  const calls = { load: 0, save: [], clear: 0 };
  return {
    calls,
    get record() {
      return record;
    },
    async load() {
      calls.load += 1;
      return record ? { ...record } : null;
    },
    async save(next) {
      calls.save.push({ ...next });
      record = { ...next };
      return Object.freeze({ ...next });
    },
    async clear() {
      calls.clear += 1;
      record = null;
      return true;
    }
  };
}

function createFakeAuth(refreshAccessToken = async () => {
  throw new Error("unexpected refresh");
}) {
  return {
    isValidSpotifyClientId: (value) => typeof value === "string" && /^[A-Za-z0-9]{16,64}$/.test(value.trim()),
    refreshAccessToken
  };
}

function createRecord(overrides = {}) {
  return {
    providerId: "spotify",
    clientId: CLIENT_ID,
    accessToken: ACCESS_TOKEN,
    refreshToken: REFRESH_TOKEN,
    tokenType: "Bearer",
    scope: "playlist-read-private user-modify-playback-state",
    accessExpiresAt: 1000000,
    refreshExpiresAt: 5000000,
    savedAt: 900000,
    ...overrides
  };
}

test("requires a credential store, auth module, and valid client ID", () => {
  const store = createFakeStore();
  assert.throws(() => createSpotifySession({ auth: createFakeAuth(), clientId: CLIENT_ID }), /credential store/i);
  assert.throws(() => createSpotifySession({ credentialStore: store, auth: {}, clientId: CLIENT_ID }), /auth module/i);
  assert.doesNotThrow(() => createSpotifySession({ credentialStore: store, auth: createFakeAuth() }));
  assert.throws(
    () => createSpotifySession({ credentialStore: store, auth: createFakeAuth(), clientId: "short" }),
    /valid Spotify client ID/i
  );
  assert.equal(DEFAULT_REFRESH_LEAD_MS, 300000);
});

test("can restore the client ID from encrypted credentials at startup", async () => {
  const session = createSpotifySession({
    credentialStore: createFakeStore(createRecord()),
    auth: createFakeAuth(),
    now: () => 100000
  });
  assert.equal((await session.load()).connected, true);
  assert.equal(await session.getAccessToken(), ACCESS_TOKEN);
});

test("loads stored credentials into a sanitized connected state", async () => {
  const store = createFakeStore(createRecord());
  const session = createSpotifySession({ credentialStore: store, auth: createFakeAuth(), clientId: CLIENT_ID });

  const state = await session.load();
  assert.equal(state.status, SESSION_STATUSES.connected);
  assert.equal(state.connected, true);
  assert.equal(state.hasRefreshToken, true);
  assert.deepEqual(state.scopes, ["playlist-read-private", "user-modify-playback-state"]);
  assert.equal(Object.isFrozen(state), true);
  const serialized = JSON.stringify(state);
  assert.equal(serialized.includes(ACCESS_TOKEN), false);
  assert.equal(serialized.includes(REFRESH_TOKEN), false);
  assert.equal(serialized.includes(CLIENT_ID), false);
});

test("reports a disconnected session when nothing is stored", async () => {
  const session = createSpotifySession({
    credentialStore: createFakeStore(),
    auth: createFakeAuth(),
    clientId: CLIENT_ID
  });
  const state = await session.load();
  assert.equal(state.status, SESSION_STATUSES.disconnected);
  await assert.rejects(session.getAccessToken(), (error) => error.code === "not-authenticated");
});

test("returns a fresh access token without refreshing", async () => {
  let refreshes = 0;
  const session = createSpotifySession({
    credentialStore: createFakeStore(createRecord()),
    auth: createFakeAuth(async () => {
      refreshes += 1;
    }),
    clientId: CLIENT_ID,
    now: () => 100000,
    refreshLeadMs: 60000
  });
  await session.load();
  assert.equal(await session.getAccessToken(), ACCESS_TOKEN);
  assert.equal(refreshes, 0);
});

test("refreshes shortly before expiry and persists the rotated refresh token", async () => {
  const store = createFakeStore(createRecord({ accessExpiresAt: 150000 }));
  const calls = [];
  const session = createSpotifySession({
    credentialStore: store,
    auth: createFakeAuth(async (options) => {
      calls.push(options);
      return {
        accessToken: "NEW_ACCESS",
        refreshToken: "ROTATED_REFRESH",
        tokenType: "Bearer",
        scope: "playlist-read-private",
        accessExpiresAt: 200000,
        refreshExpiresAt: 5000000
      };
    }),
    clientId: CLIENT_ID,
    now: () => 100000,
    refreshLeadMs: 60000
  });

  await session.load();
  assert.equal(await session.getAccessToken(), "NEW_ACCESS");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].clientId, CLIENT_ID);
  assert.equal(calls[0].refreshToken, REFRESH_TOKEN);
  assert.equal(calls[0].refreshExpiresAt, 5000000);

  const saved = store.calls.save.at(-1);
  assert.equal(saved.providerId, "spotify");
  assert.equal(saved.clientId, CLIENT_ID);
  assert.equal(saved.accessToken, "NEW_ACCESS");
  assert.equal(saved.refreshToken, "ROTATED_REFRESH");
});

test("preserves the refresh token through spotify-auth when the response omits it", async () => {
  const store = createFakeStore(createRecord({ accessExpiresAt: 150000 }));
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ access_token: "NEW_ACCESS", expires_in: 3600 })
  });
  const session = createSpotifySession({
    credentialStore: store,
    auth: spotifyAuth,
    fetchImpl,
    clientId: CLIENT_ID,
    now: () => 100000,
    refreshLeadMs: 60000
  });

  await session.load();
  assert.equal(await session.getAccessToken(), "NEW_ACCESS");
  const saved = store.calls.save.at(-1);
  assert.equal(saved.refreshToken, REFRESH_TOKEN);
  assert.equal(saved.refreshExpiresAt, 5000000);
  assert.equal(saved.accessExpiresAt, 100000 + 3600 * 1000);
});

test("clears credentials when the refresh token is already expired", async () => {
  let refreshes = 0;
  const store = createFakeStore(createRecord({ refreshExpiresAt: 50000 }));
  const session = createSpotifySession({
    credentialStore: store,
    auth: createFakeAuth(async () => {
      refreshes += 1;
    }),
    clientId: CLIENT_ID,
    now: () => 100000
  });

  await session.load();
  await assert.rejects(session.getAccessToken(), (error) => error.code === "reauthorization-required");
  assert.equal(refreshes, 0);
  assert.equal(session.getAuthState().status, SESSION_STATUSES.reauthorizationRequired);
  assert.equal(store.record, null);
  assert.equal(store.calls.clear, 1);
});

test("clears credentials when refresh reports reauthorization-required", async () => {
  const store = createFakeStore(createRecord({ accessExpiresAt: 150000 }));
  const session = createSpotifySession({
    credentialStore: store,
    auth: createFakeAuth(async () => {
      const error = new Error(`refresh failed for ${REFRESH_TOKEN}`);
      error.code = "reauthorization-required";
      throw error;
    }),
    clientId: CLIENT_ID,
    now: () => 100000,
    refreshLeadMs: 60000
  });

  await session.load();
  await assert.rejects(session.getAccessToken(), (error) => {
    assert.equal(error.code, "reauthorization-required");
    assert.equal(error.message.includes(REFRESH_TOKEN), false);
    return true;
  });
  assert.equal(store.record, null);
  assert.equal(session.getAuthState().status, SESSION_STATUSES.reauthorizationRequired);
});

test("keeps credentials when a refresh fails transiently", async () => {
  const store = createFakeStore(createRecord({ accessExpiresAt: 150000 }));
  const session = createSpotifySession({
    credentialStore: store,
    auth: createFakeAuth(async () => {
      const error = new Error("network unavailable");
      error.code = "network-error";
      throw error;
    }),
    clientId: CLIENT_ID,
    now: () => 100000,
    refreshLeadMs: 60000
  });

  await session.load();
  await assert.rejects(session.getAccessToken(), (error) => error.code === "network-error");
  assert.notEqual(store.record, null);
  assert.equal(store.calls.clear, 0);
  assert.equal(session.getAuthState().status, SESSION_STATUSES.connected);
});

test("shares a single refresh across concurrent calls", async () => {
  let refreshes = 0;
  const session = createSpotifySession({
    credentialStore: createFakeStore(createRecord({ accessExpiresAt: 150000 })),
    auth: createFakeAuth(async () => {
      refreshes += 1;
      return {
        accessToken: "NEW_ACCESS",
        refreshToken: REFRESH_TOKEN,
        accessExpiresAt: 200000,
        refreshExpiresAt: 5000000
      };
    }),
    clientId: CLIENT_ID,
    now: () => 100000,
    refreshLeadMs: 60000
  });

  await session.load();
  const [first, second] = await Promise.all([session.getAccessToken(), session.getAccessToken()]);
  assert.equal(refreshes, 1);
  assert.equal(first, "NEW_ACCESS");
  assert.equal(second, "NEW_ACCESS");
});

test("disconnects and clears stored credentials", async () => {
  const store = createFakeStore(createRecord());
  const session = createSpotifySession({ credentialStore: store, auth: createFakeAuth(), clientId: CLIENT_ID });
  await session.load();

  const state = await session.disconnect();
  assert.equal(state.status, SESSION_STATUSES.disconnected);
  assert.equal(store.record, null);
  assert.equal(store.calls.clear, 1);
  await assert.rejects(session.getAccessToken(), (error) => error.code === "not-authenticated");
});

test("connect persists credentials and exposes only sanitized state", async () => {
  const store = createFakeStore();
  const session = createSpotifySession({ credentialStore: store, auth: createFakeAuth(), clientId: CLIENT_ID });

  const state = await session.connect({
    accessToken: ACCESS_TOKEN,
    refreshToken: REFRESH_TOKEN,
    tokenType: "Bearer",
    scope: "playlist-read-private",
    accessExpiresAt: 111000,
    refreshExpiresAt: 222000
  });

  assert.equal(state.status, SESSION_STATUSES.connected);
  const saved = store.calls.save.at(-1);
  assert.equal(saved.providerId, "spotify");
  assert.equal(saved.clientId, CLIENT_ID);
  assert.equal(saved.accessToken, ACCESS_TOKEN);
  assert.equal(JSON.stringify(state).includes(ACCESS_TOKEN), false);
  assert.equal(JSON.stringify(state).includes(REFRESH_TOKEN), false);
  await assert.rejects(session.connect({}), (error) => error.code === "invalid-request");

  const dynamic = createSpotifySession({ credentialStore: createFakeStore(), auth: createFakeAuth() });
  await assert.rejects(
    dynamic.connect({
      accessToken: ACCESS_TOKEN,
      refreshToken: REFRESH_TOKEN,
      accessExpiresAt: 111000,
      refreshExpiresAt: 222000
    }),
    (error) => error.code === "invalid-request"
  );
  assert.equal((await dynamic.connect({
    clientId: CLIENT_ID,
    accessToken: ACCESS_TOKEN,
    refreshToken: REFRESH_TOKEN,
    accessExpiresAt: 111000,
    refreshExpiresAt: 222000
  })).connected, true);
});

test("load preserves stored data and reports disconnected when the store cannot be read", async () => {
  const store = createFakeStore();
  store.load = async () => {
    const error = new Error("decrypt failed");
    error.code = "decrypt-failed";
    throw error;
  };
  const session = createSpotifySession({ credentialStore: store, auth: createFakeAuth(), clientId: CLIENT_ID });

  const state = await session.load();
  assert.equal(state.status, SESSION_STATUSES.disconnected);
  assert.equal(store.calls.clear, 0);
});

test("disconnect prevents an in-flight refresh from restoring credentials", async () => {
  const store = createFakeStore(createRecord({ accessExpiresAt: 150000 }));
  let releaseRefresh;
  let refreshStarted;
  const started = new Promise((resolve) => { refreshStarted = resolve; });
  const session = createSpotifySession({
    credentialStore: store,
    auth: createFakeAuth(() => new Promise((resolve) => {
      releaseRefresh = resolve;
      refreshStarted();
    })),
    clientId: CLIENT_ID,
    now: () => 100000,
    refreshLeadMs: 60000
  });

  await session.load();
  const tokenPromise = session.getAccessToken();
  await started;
  const disconnected = await session.disconnect();
  releaseRefresh({
    accessToken: "STALE_ACCESS",
    refreshToken: REFRESH_TOKEN,
    accessExpiresAt: 200000,
    refreshExpiresAt: 5000000
  });

  await assert.rejects(tokenPromise, (error) => error.code === "not-authenticated");
  assert.equal(disconnected.connected, false);
  assert.equal(store.record, null);
  assert.equal(store.calls.save.length, 0);
});

test("disconnect failure does not falsely report that persisted credentials were removed", async () => {
  const store = createFakeStore(createRecord());
  store.clear = async () => {
    throw new Error("disk unavailable");
  };
  const session = createSpotifySession({ credentialStore: store, auth: createFakeAuth(), clientId: CLIENT_ID });
  await session.load();

  await assert.rejects(session.disconnect(), (error) => error.code === "credentials-unavailable");
  assert.equal(session.getAuthState().connected, true);
  assert.notEqual(store.record, null);
});
