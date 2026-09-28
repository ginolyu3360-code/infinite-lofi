const crypto = require("node:crypto");

const AUTHORIZE_ENDPOINT = "https://accounts.spotify.com/authorize";
const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
const REFRESH_EXPIRY_MONTHS = 6;
const CLIENT_ID_PATTERN = /^[A-Za-z0-9]{16,64}$/;
const CODE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;
const CODE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;
const MAX_VERIFIER_LENGTH = 128;
const MAX_SCOPE_COUNT = 32;
const MAX_SCOPE_LENGTH = 64;
const MAX_EXPIRES_IN_SECONDS = 86400;
const DEFAULT_SCOPES = Object.freeze([
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state"
]);

function boundedString(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function createSpotifyAuthError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  if (Number.isInteger(details.status)) error.status = details.status;
  return error;
}

function isValidSpotifyClientId(value) {
  return typeof value === "string" && CLIENT_ID_PATTERN.test(value.trim());
}

function createCodeVerifier() {
  return crypto.randomBytes(64).toString("base64url");
}

function createCodeChallenge(verifier) {
  const value = boundedString(verifier, MAX_VERIFIER_LENGTH);
  if (!CODE_VERIFIER_PATTERN.test(value)) {
    throw createSpotifyAuthError("invalid-request", "A valid PKCE code verifier is required.");
  }
  return crypto.createHash("sha256").update(value).digest("base64url");
}

function isValidLoopbackRedirectUri(value) {
  const redirect = boundedString(value, 2048);
  if (!redirect) return false;
  try {
    const url = new URL(redirect);
    return url.protocol === "http:" &&
      url.hostname === "127.0.0.1" &&
      Boolean(url.port) &&
      url.pathname === "/callback" &&
      !url.username &&
      !url.password &&
      !url.hash;
  } catch {
    return false;
  }
}

function createState() {
  return crypto.randomBytes(32).toString("base64url");
}

function normalizeScopes(scopes) {
  const list = Array.isArray(scopes)
    ? scopes
    : typeof scopes === "string"
      ? scopes.split(/\s+/)
      : [];
  const result = [];
  for (const scope of list) {
    const value = boundedString(scope, MAX_SCOPE_LENGTH);
    if (!value || result.includes(value)) continue;
    result.push(value);
    if (result.length >= MAX_SCOPE_COUNT) break;
  }
  return result;
}

function addCalendarMonths(timestamp, months) {
  const date = new Date(Number(timestamp));
  const day = date.getUTCDate();
  date.setUTCMonth(date.getUTCMonth() + Number(months));
  if (date.getUTCDate() < day) date.setUTCDate(0);
  return date.getTime();
}

function buildAuthorizeUrl(options = {}) {
  const { clientId, redirectUri, state, codeChallenge, scopes = DEFAULT_SCOPES } = options;
  if (!isValidSpotifyClientId(clientId)) {
    throw createSpotifyAuthError("invalid-client-id", "A valid Spotify client ID is required.");
  }
  const redirect = boundedString(redirectUri, 2048);
  const csrfState = boundedString(state, 256);
  const challenge = boundedString(codeChallenge, 256);
  if (!isValidLoopbackRedirectUri(redirect) || !csrfState || !CODE_CHALLENGE_PATTERN.test(challenge)) {
    throw createSpotifyAuthError("invalid-request", "A loopback redirect URI, state, and valid PKCE challenge are required.");
  }
  const url = new URL(AUTHORIZE_ENDPOINT);
  url.searchParams.set("client_id", clientId.trim());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirect);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("state", csrfState);
  const scopeList = normalizeScopes(scopes);
  if (scopeList.length > 0) url.searchParams.set("scope", scopeList.join(" "));
  return url.toString();
}

async function requestToken(fetchImpl, params) {
  if (typeof fetchImpl !== "function") {
    throw createSpotifyAuthError("fetch-unavailable", "A fetch implementation is required for Spotify token requests.");
  }
  let response;
  try {
    response = await fetchImpl(TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams(params).toString()
    });
  } catch {
    throw createSpotifyAuthError("network-error", "Could not reach the Spotify accounts service.");
  }
  if (!response || typeof response.ok !== "boolean") {
    throw createSpotifyAuthError("unexpected-response", "The Spotify accounts service returned an unexpected response.");
  }
  if (!response.ok) {
    const status = Number(response.status);
    let providerCode = "";
    try {
      const payload = await response.json();
      providerCode = boundedString(payload?.error, 64);
    } catch {
      providerCode = "";
    }
    throw createSpotifyAuthError(
      providerCode === "invalid_grant" ? "reauthorization-required" : "token-request-failed",
      `The Spotify accounts service rejected the token request${Number.isInteger(status) ? ` (status ${status})` : ""}.`,
      { status }
    );
  }
  try {
    return await response.json();
  } catch {
    throw createSpotifyAuthError("unexpected-response", "The Spotify accounts service returned an unreadable response.");
  }
}

function normalizeTokenResponse(payload, options = {}) {
  const { previousRefreshToken = "", refreshExpiresAt = 0, now = Date.now() } = options;
  const source = payload && typeof payload === "object" ? payload : {};
  const accessToken = boundedString(source.access_token, 4096);
  if (!accessToken) {
    throw createSpotifyAuthError("invalid-token-response", "The Spotify token response did not include an access token.");
  }
  const expiresIn = Number(source.expires_in);
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw createSpotifyAuthError("invalid-token-response", "The Spotify token response did not include a valid expiry.");
  }
  const issuedAt = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const refreshToken = boundedString(source.refresh_token, 4096) || boundedString(previousRefreshToken, 4096);
  const preservedRefreshExpiry = Number(refreshExpiresAt);
  const nextRefreshExpiresAt = Number.isFinite(preservedRefreshExpiry) && preservedRefreshExpiry > 0
    ? preservedRefreshExpiry
    : addCalendarMonths(issuedAt, REFRESH_EXPIRY_MONTHS);
  return Object.freeze({
    accessToken,
    refreshToken,
    tokenType: boundedString(source.token_type, 32) || "Bearer",
    scope: boundedString(source.scope, 1024),
    accessExpiresAt: issuedAt + Math.min(Math.max(Math.round(expiresIn), 1), MAX_EXPIRES_IN_SECONDS) * 1000,
    refreshExpiresAt: nextRefreshExpiresAt
  });
}

async function exchangeCodeForToken(options = {}) {
  const { fetchImpl, clientId, redirectUri, code, codeVerifier, now = Date.now() } = options;
  if (!isValidSpotifyClientId(clientId)) {
    throw createSpotifyAuthError("invalid-client-id", "A valid Spotify client ID is required.");
  }
  const redirect = boundedString(redirectUri, 2048);
  const authorizationCode = boundedString(code, 4096);
  const verifier = boundedString(codeVerifier, MAX_VERIFIER_LENGTH);
  if (!isValidLoopbackRedirectUri(redirect) || !authorizationCode || !CODE_VERIFIER_PATTERN.test(verifier)) {
    throw createSpotifyAuthError("invalid-request", "A loopback redirect URI, authorization code, and valid PKCE verifier are required.");
  }
  const payload = await requestToken(fetchImpl, {
    grant_type: "authorization_code",
    code: authorizationCode,
    redirect_uri: redirect,
    client_id: clientId.trim(),
    code_verifier: verifier
  });
  return normalizeTokenResponse(payload, { now });
}

async function refreshAccessToken(options = {}) {
  const { fetchImpl, clientId, refreshToken, refreshExpiresAt = 0, now = Date.now() } = options;
  if (!isValidSpotifyClientId(clientId)) {
    throw createSpotifyAuthError("invalid-client-id", "A valid Spotify client ID is required.");
  }
  const token = boundedString(refreshToken, 4096);
  if (!token) {
    throw createSpotifyAuthError("invalid-request", "A refresh token is required.");
  }
  const payload = await requestToken(fetchImpl, {
    grant_type: "refresh_token",
    refresh_token: token,
    client_id: clientId.trim()
  });
  return normalizeTokenResponse(payload, { previousRefreshToken: token, refreshExpiresAt, now });
}

module.exports = {
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
};
