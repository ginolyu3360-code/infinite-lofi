const test = require("node:test");
const assert = require("node:assert/strict");

const { API_BASE, MAX_RETRY_AFTER_SECONDS, createSpotifyClient } = require("../src/spotify-client");

const ACCESS_TOKEN = "BQD_secret_access_token_value";
const PLAYLIST_URI = "spotify:playlist:37i9dQZF1DXcBWIGoYBM5M";

function createFetchRecorder(responder) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return responder({ url: String(url), init });
    }
  };
}

function jsonResponse(status, payload, headers) {
  return { ok: status >= 200 && status < 300, status, headers, json: async () => payload };
}

function noContentResponse() {
  return { ok: true, status: 204, headers: undefined, json: async () => { throw new Error("no body"); } };
}

function createClient(fetchImpl, token = ACCESS_TOKEN) {
  return createSpotifyClient({ fetchImpl, getAccessToken: async () => token });
}

test("requires an injected fetch and access-token provider", () => {
  assert.throws(() => createSpotifyClient({ getAccessToken: async () => ACCESS_TOKEN }), /fetch/i);
  assert.throws(() => createSpotifyClient({ fetchImpl: async () => noContentResponse() }), /access-token/i);
});

test("rejects requests when no access token is available", async () => {
  const { calls, fetchImpl } = createFetchRecorder(() => jsonResponse(200, {}));
  const client = createSpotifyClient({ fetchImpl, getAccessToken: async () => "" });
  await assert.rejects(client.getCurrentProfile(), (error) => error.code === "not-authenticated");
  assert.equal(calls.length, 0);
});

test("requests the current profile with an internal bearer token and bounded fields", async () => {
  const { calls, fetchImpl } = createFetchRecorder(() => jsonResponse(200, {
    id: "user-1",
    display_name: "Listener",
    images: [{ url: "https://i.scdn.co/image/abc" }],
    email: "secret@example.com"
  }));
  const profile = await createClient(fetchImpl).getCurrentProfile();

  assert.equal(calls[0].url, `${API_BASE}/me`);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${ACCESS_TOKEN}`);
  assert.deepEqual(profile, {
    id: "user-1",
    displayName: "Listener",
    imageUrl: "https://i.scdn.co/image/abc"
  });
  assert.equal(JSON.stringify(profile).includes(ACCESS_TOKEN), false);
  assert.equal(JSON.stringify(profile).includes("secret@example.com"), false);
});

test("clamps playlist pagination and normalizes items", async () => {
  const { calls, fetchImpl } = createFetchRecorder(() => jsonResponse(200, {
    total: 123,
    items: [
      { id: "p1", uri: PLAYLIST_URI, name: "Focus", items: { total: 42 }, tracks: { total: 7 }, owner: { display_name: "Owner" }, images: [{ url: "https://img/1" }] },
      { id: "", name: "Ignored" }
    ]
  }));
  const client = createClient(fetchImpl);
  const result = await client.listPlaylists({ limit: 999, offset: -5 });

  const url = new URL(calls[0].url);
  assert.equal(url.origin + url.pathname, `${API_BASE}/me/playlists`);
  assert.equal(url.searchParams.get("limit"), "50");
  assert.equal(url.searchParams.get("offset"), "0");
  assert.equal(result.total, 123);
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.items[0], {
    id: "p1",
    uri: PLAYLIST_URI,
    name: "Focus",
    trackCount: 42,
    ownerName: "Owner",
    imageUrl: "https://img/1"
  });

  await client.listPlaylists({ limit: 0, offset: 500000 });
  const second = new URL(calls[1].url);
  assert.equal(second.searchParams.get("limit"), "1");
  assert.equal(second.searchParams.get("offset"), "100000");
});

test("parses an empty playback state as null and normalizes an active state", async () => {
  const empty = createFetchRecorder(() => noContentResponse());
  assert.equal(await createClient(empty.fetchImpl).getPlaybackState(), null);

  const active = createFetchRecorder(() => jsonResponse(200, {
    is_playing: true,
    progress_ms: 1234.6,
    device: { id: "device-1", name: "MacBook", is_restricted: true, supports_volume: false, volume_percent: 63 },
    context: { uri: PLAYLIST_URI },
    item: {
      id: "track-1",
      name: "Song",
      duration_ms: 200000,
      artists: [{ name: "A" }, { name: "B" }, { name: "" }]
    }
  }));
  const state = await createClient(active.fetchImpl).getPlaybackState();
  assert.equal(state.isPlaying, true);
  assert.equal(state.progressMs, 1235);
  assert.equal(state.deviceId, "device-1");
  assert.equal(state.deviceRestricted, true);
  assert.equal(state.supportsVolume, false);
  assert.equal(state.volumePercent, 63);
  assert.equal(state.contextUri, PLAYLIST_URI);
  assert.deepEqual(state.track.artists, ["A", "B"]);
  assert.equal(state.track.durationMs, 200000);
  assert.equal(JSON.stringify(state).includes(ACCESS_TOKEN), false);
});

test("normalizes the available devices", async () => {
  const { fetchImpl } = createFetchRecorder(() => jsonResponse(200, {
    devices: [
      { id: "d1", name: "Phone", type: "Smartphone", is_active: true, is_restricted: true, supports_volume: false, volume_percent: 42 },
      { id: "", name: "Ignored" }
    ]
  }));
  const result = await createClient(fetchImpl).getDevices();
  assert.equal(result.devices.length, 1);
  assert.deepEqual(result.devices[0], {
    id: "d1",
    name: "Phone",
    type: "Smartphone",
    isActive: true,
    isRestricted: true,
    supportsVolume: false,
    volumePercent: 42
  });
});

test("starts a playlist context and rejects an invalid context URI without calling fetch", async () => {
  const { calls, fetchImpl } = createFetchRecorder(() => noContentResponse());
  const client = createClient(fetchImpl);
  assert.equal(await client.playPlaylistContext({ contextUri: PLAYLIST_URI, deviceId: "device-1" }), true);

  const url = new URL(calls[0].url);
  assert.equal(url.origin + url.pathname, `${API_BASE}/me/player/play`);
  assert.equal(calls[0].init.method, "PUT");
  assert.equal(url.searchParams.get("device_id"), "device-1");
  assert.deepEqual(JSON.parse(calls[0].init.body), { context_uri: PLAYLIST_URI });

  await assert.rejects(
    client.playPlaylistContext({ contextUri: "https://open.spotify.com/playlist/1" }),
    (error) => error.code === "invalid-request"
  );
  await assert.rejects(
    client.playPlaylistContext({ contextUri: "spotify:album:1" }),
    (error) => error.code === "invalid-request"
  );
  assert.equal(calls.length, 1);
});

test("passes AbortSignal to read and playback requests", async () => {
  const { calls, fetchImpl } = createFetchRecorder(({ url }) => (
    url.includes("/me/playlists") ? jsonResponse(200, { items: [], total: 0 }) : noContentResponse()
  ));
  const controller = new AbortController();
  const client = createClient(fetchImpl);
  await client.listPlaylists({ signal: controller.signal });
  await client.pause({ signal: controller.signal });
  assert.equal(calls[0].init.signal, controller.signal);
  assert.equal(calls[1].init.signal, controller.signal);
});

test("resumes and sends transport commands to fixed relative endpoints", async () => {
  const { calls, fetchImpl } = createFetchRecorder(() => noContentResponse());
  const client = createClient(fetchImpl);
  await client.resume();
  await client.pause({ deviceId: "device-1" });
  await client.next();
  await client.previous();
  await client.seek(-5);
  await client.seek(99999999999, { deviceId: "device-1" });
  await client.setVolume(150);
  await client.setVolume(-1, { deviceId: "device-1" });

  assert.deepEqual(calls.map((call) => [call.init.method, new URL(call.url).pathname]), [
    ["PUT", "/v1/me/player/play"],
    ["PUT", "/v1/me/player/pause"],
    ["POST", "/v1/me/player/next"],
    ["POST", "/v1/me/player/previous"],
    ["PUT", "/v1/me/player/seek"],
    ["PUT", "/v1/me/player/seek"],
    ["PUT", "/v1/me/player/volume"],
    ["PUT", "/v1/me/player/volume"]
  ]);
  assert.equal(calls[0].init.body, undefined);
  assert.equal(new URL(calls[1].url).searchParams.get("device_id"), "device-1");
  assert.equal(new URL(calls[4].url).searchParams.get("position_ms"), "0");
  assert.equal(new URL(calls[5].url).searchParams.get("position_ms"), "86400000");
  assert.equal(new URL(calls[6].url).searchParams.get("volume_percent"), "100");
  assert.equal(new URL(calls[7].url).searchParams.get("volume_percent"), "0");
  assert.equal(new URL(calls[7].url).searchParams.get("device_id"), "device-1");
});

test("maps HTTP failures to stable error codes", async () => {
  const unauthorized = createFetchRecorder(() => jsonResponse(401, {}));
  await assert.rejects(
    createClient(unauthorized.fetchImpl).getCurrentProfile(),
    (error) => error.code === "unauthorized" && error.status === 401
  );

  const forbidden = createFetchRecorder(() => jsonResponse(403, {}));
  await assert.rejects(createClient(forbidden.fetchImpl).getCurrentProfile(), (error) => error.code === "forbidden");

  const noDevice = createFetchRecorder(() => jsonResponse(404, { error: { reason: "NO_ACTIVE_DEVICE" } }));
  await assert.rejects(createClient(noDevice.fetchImpl).resume(), (error) => error.code === "no-active-device");

  const notFound = createFetchRecorder(() => jsonResponse(404, { error: { status: 404 } }));
  await assert.rejects(createClient(notFound.fetchImpl).getCurrentProfile(), (error) => error.code === "not-found");

  const server = createFetchRecorder(() => jsonResponse(503, {}));
  await assert.rejects(createClient(server.fetchImpl).getCurrentProfile(), (error) => error.code === "server-error");

  const unexpected = createFetchRecorder(() => jsonResponse(418, {}));
  await assert.rejects(createClient(unexpected.fetchImpl).getCurrentProfile(), (error) => error.code === "unexpected-response");

  const network = createFetchRecorder(() => { throw new Error(`offline ${ACCESS_TOKEN}`); });
  await assert.rejects(createClient(network.fetchImpl).getCurrentProfile(), (error) => {
    assert.equal(error.code, "network-error");
    assert.equal(error.message.includes(ACCESS_TOKEN), false);
    return true;
  });
});

test("bounds Retry-After and never leaks the access token", async () => {
  const { fetchImpl } = createFetchRecorder(() => jsonResponse(429, { error: "rate" }, { "retry-after": "120" }));
  await assert.rejects(createClient(fetchImpl).getCurrentProfile(), (error) => {
    assert.equal(error.code, "rate-limited");
    assert.equal(error.retryAfter, 120);
    assert.equal(error.retryable, true);
    assert.equal(error.message.includes(ACCESS_TOKEN), false);
    assert.equal(JSON.stringify(error).includes(ACCESS_TOKEN), false);
    return true;
  });

  const huge = createFetchRecorder(() => jsonResponse(429, {}, { "retry-after": "99999" }));
  await assert.rejects(createClient(huge.fetchImpl).getCurrentProfile(), (error) => {
    assert.equal(error.retryAfter, MAX_RETRY_AFTER_SECONDS);
    return true;
  });

  const missing = createFetchRecorder(() => jsonResponse(429, {}, {}));
  await assert.rejects(createClient(missing.fetchImpl).getCurrentProfile(), (error) => error.retryAfter === 1);
});

test("does not auto-retry write operations on rate limits", async () => {
  const { calls, fetchImpl } = createFetchRecorder(() => jsonResponse(429, {}, { "retry-after": "5" }));
  await assert.rejects(createClient(fetchImpl).pause(), (error) => {
    assert.equal(error.code, "rate-limited");
    assert.equal(error.retryable, false);
    return true;
  });
  assert.equal(calls.length, 1);
});
