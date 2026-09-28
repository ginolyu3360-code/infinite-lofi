const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const {
  AUTHORIZE_ENDPOINT,
  DEFAULT_SCOPES,
  REFRESH_EXPIRY_MONTHS,
  TOKEN_ENDPOINT,
  addCalendarMonths,
  buildAuthorizeUrl,
  createCodeChallenge,
  createCodeVerifier,
  createState,
  exchangeCodeForToken,
  isValidLoopbackRedirectUri,
  isValidSpotifyClientId,
  normalizeTokenResponse,
  refreshAccessToken
} = require("../src/spotify-auth");

const CLIENT_ID = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
const REDIRECT_URI = "http://127.0.0.1:43210/callback";
const ACCESS_TOKEN = "BQD_secret_access_token_value";
const REFRESH_TOKEN = "AQD_secret_refresh_token_value";

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

function jsonResponse(status, payload) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

test("validates a bounded Spotify client ID", () => {
  assert.equal(isValidSpotifyClientId(CLIENT_ID), true);
  assert.equal(isValidSpotifyClientId(` ${CLIENT_ID} `), true);
  assert.equal(isValidSpotifyClientId("short"), false);
  assert.equal(isValidSpotifyClientId("a".repeat(65)), false);
  assert.equal(isValidSpotifyClientId("has spaces and symbols!"), false);
  assert.equal(isValidSpotifyClientId(null), false);
});

test("generates PKCE verifier, S256 challenge, and CSRF state", () => {
  const verifier = createCodeVerifier();
  assert.match(verifier, /^[A-Za-z0-9_-]{43,128}$/);
  const challenge = createCodeChallenge(verifier);
  assert.equal(challenge, crypto.createHash("sha256").update(verifier).digest("base64url"));
  assert.match(challenge, /^[A-Za-z0-9_-]{43}$/);
  const state = createState();
  assert.match(state, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(createState(), state);
  assert.throws(() => createCodeChallenge(""), /verifier/i);
  assert.throws(() => createCodeChallenge("too-short"), /verifier/i);
});

test("accepts only the explicit Spotify loopback callback URI", () => {
  assert.equal(isValidLoopbackRedirectUri(REDIRECT_URI), true);
  assert.equal(isValidLoopbackRedirectUri("http://localhost:43210/callback"), false);
  assert.equal(isValidLoopbackRedirectUri("https://127.0.0.1:43210/callback"), false);
  assert.equal(isValidLoopbackRedirectUri("http://127.0.0.1:43210/other"), false);
  assert.equal(isValidLoopbackRedirectUri("http://127.0.0.1/callback"), false);
});

test("builds the official authorize URL with exact redirect URI and S256", () => {
  const verifier = createCodeVerifier();
  const state = createState();
  const url = new URL(buildAuthorizeUrl({
    clientId: CLIENT_ID,
    redirectUri: REDIRECT_URI,
    state,
    codeChallenge: createCodeChallenge(verifier)
  }));
  assert.equal(url.origin + url.pathname, AUTHORIZE_ENDPOINT);
  assert.equal(url.searchParams.get("client_id"), CLIENT_ID);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("redirect_uri"), REDIRECT_URI);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("code_challenge"), createCodeChallenge(verifier));
  assert.equal(url.searchParams.get("state"), state);
  assert.equal(url.searchParams.get("scope"), DEFAULT_SCOPES.join(" "));
  assert.deepEqual(DEFAULT_SCOPES, [
    "playlist-read-private",
    "playlist-read-collaborative",
    "user-read-private",
    "user-read-playback-state",
    "user-modify-playback-state"
  ]);
});

test("rejects authorize URL construction without a valid client ID or request fields", () => {
  assert.throws(
    () => buildAuthorizeUrl({ clientId: "nope", redirectUri: REDIRECT_URI, state: "s", codeChallenge: "c" }),
    (error) => error.code === "invalid-client-id"
  );
  assert.throws(
    () => buildAuthorizeUrl({ clientId: CLIENT_ID, redirectUri: "", state: "s", codeChallenge: "c" }),
    (error) => error.code === "invalid-request"
  );
});

test("exchanges an authorization code through injected fetch and normalizes expiry", async () => {
  const now = Date.UTC(2026, 8, 15, 12, 0, 0);
  const verifier = createCodeVerifier();
  const { calls, fetchImpl } = createFetchRecorder(() => jsonResponse(200, {
    access_token: ACCESS_TOKEN,
    refresh_token: REFRESH_TOKEN,
    token_type: "Bearer",
    scope: "user-read-private",
    expires_in: 3600
  }));
  const token = await exchangeCodeForToken({
    fetchImpl,
    clientId: CLIENT_ID,
    redirectUri: REDIRECT_URI,
    code: "authorization-code",
    codeVerifier: verifier,
    now
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, TOKEN_ENDPOINT);
  assert.equal(calls[0].init.method, "POST");
  const body = new URLSearchParams(calls[0].init.body);
  assert.equal(body.get("grant_type"), "authorization_code");
  assert.equal(body.get("code"), "authorization-code");
  assert.equal(body.get("redirect_uri"), REDIRECT_URI);
  assert.equal(body.get("client_id"), CLIENT_ID);
  assert.equal(body.get("code_verifier"), verifier);
  assert.equal(calls[0].init.headers.Authorization, undefined);

  assert.equal(token.accessToken, ACCESS_TOKEN);
  assert.equal(token.refreshToken, REFRESH_TOKEN);
  assert.equal(token.tokenType, "Bearer");
  assert.equal(token.accessExpiresAt, now + 3600 * 1000);
  assert.deepEqual(
    [new Date(token.refreshExpiresAt).getUTCFullYear(), new Date(token.refreshExpiresAt).getUTCMonth(), new Date(token.refreshExpiresAt).getUTCDate()],
    [2027, 2, 15]
  );
  assert.equal(REFRESH_EXPIRY_MONTHS, 6);
});

test("refreshes with client_id, preserves refresh token and refresh expiry when omitted", async () => {
  const now = Date.UTC(2026, 11, 1);
  const priorRefreshExpiry = Date.UTC(2027, 2, 15);
  const { calls, fetchImpl } = createFetchRecorder(() => jsonResponse(200, {
    access_token: "BQD_rotated_access",
    expires_in: 1800
  }));
  const token = await refreshAccessToken({
    fetchImpl,
    clientId: CLIENT_ID,
    refreshToken: REFRESH_TOKEN,
    refreshExpiresAt: priorRefreshExpiry,
    now
  });

  const body = new URLSearchParams(calls[0].init.body);
  assert.equal(body.get("grant_type"), "refresh_token");
  assert.equal(body.get("refresh_token"), REFRESH_TOKEN);
  assert.equal(body.get("client_id"), CLIENT_ID);
  assert.equal(token.refreshToken, REFRESH_TOKEN);
  assert.equal(token.refreshExpiresAt, priorRefreshExpiry);
  assert.equal(token.accessExpiresAt, now + 1800 * 1000);
});

test("uses a rotated refresh token when the refresh response provides one", async () => {
  const { fetchImpl } = createFetchRecorder(() => jsonResponse(200, {
    access_token: "BQD_next_access",
    refresh_token: "AQD_next_refresh",
    expires_in: 3600
  }));
  const token = await refreshAccessToken({
    fetchImpl,
    clientId: CLIENT_ID,
    refreshToken: REFRESH_TOKEN,
    refreshExpiresAt: Date.UTC(2027, 2, 15)
  });
  assert.equal(token.refreshToken, "AQD_next_refresh");
});

test("surfaces stable token errors without leaking tokens or response bodies", async () => {
  const verifier = createCodeVerifier();
  const rejected = createFetchRecorder(() => jsonResponse(400, { error: "invalid_grant", access_token: ACCESS_TOKEN }));
  await assert.rejects(
    exchangeCodeForToken({
      fetchImpl: rejected.fetchImpl,
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
      code: "code",
      codeVerifier: verifier
    }),
    (error) => {
      assert.equal(error.code, "reauthorization-required");
      assert.equal(error.status, 400);
      assert.equal(error.message.includes(ACCESS_TOKEN), false);
      assert.equal(JSON.stringify(error).includes(ACCESS_TOKEN), false);
      return true;
    }
  );

  const network = createFetchRecorder(() => { throw new Error(`boom ${ACCESS_TOKEN}`); });
  await assert.rejects(
    refreshAccessToken({ fetchImpl: network.fetchImpl, clientId: CLIENT_ID, refreshToken: REFRESH_TOKEN }),
    (error) => {
      assert.equal(error.code, "network-error");
      assert.equal(error.message.includes(ACCESS_TOKEN), false);
      return true;
    }
  );

  const unreadable = createFetchRecorder(() => ({ ok: true, status: 200, json: async () => { throw new Error("bad json"); } }));
  await assert.rejects(
    refreshAccessToken({ fetchImpl: unreadable.fetchImpl, clientId: CLIENT_ID, refreshToken: REFRESH_TOKEN }),
    (error) => error.code === "unexpected-response"
  );
});

test("rejects an incomplete token response without exposing the access token", () => {
  assert.throws(
    () => normalizeTokenResponse({ access_token: ACCESS_TOKEN }, { now: 0 }),
    (error) => {
      assert.equal(error.code, "invalid-token-response");
      assert.equal(error.message.includes(ACCESS_TOKEN), false);
      return true;
    }
  );
});

test("adds calendar months deterministically in UTC", () => {
  assert.equal(addCalendarMonths(Date.UTC(2026, 8, 15), 6), Date.UTC(2027, 2, 15));
  assert.equal(addCalendarMonths(Date.UTC(2026, 0, 31), 1), Date.UTC(2026, 1, 28));
});
