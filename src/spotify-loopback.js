const crypto = require("node:crypto");
const http = require("node:http");

const LOOPBACK_HOST = "127.0.0.1";
const CALLBACK_PATH = "/callback";
const DEFAULT_TIMEOUT_MS = 300000;
const MIN_TIMEOUT_MS = 1;
const MAX_TIMEOUT_MS = 600000;
const MAX_STATE_LENGTH = 512;

const LOOPBACK_ERROR_MESSAGES = Object.freeze({
  "authorization-denied": "The Spotify authorization request was denied.",
  "authorization-failed": "The Spotify authorization callback was incomplete.",
  "authorization-timeout": "The Spotify authorization request timed out.",
  closed: "The loopback callback listener is closed.",
  "invalid-request": "The loopback callback listener was used incorrectly.",
  "not-listening": "The loopback callback listener is not running.",
  "server-error": "The loopback callback listener could not start.",
  "state-mismatch": "The Spotify authorization state did not match."
});

function createLoopbackError(code) {
  const error = new Error(LOOPBACK_ERROR_MESSAGES[code] || "Loopback callback error.");
  error.code = code;
  return error;
}

function timingSafeEqualStrings(left, right) {
  const expected = typeof left === "string" ? left : "";
  const received = typeof right === "string" ? right : "";
  const expectedHash = crypto.createHash("sha256").update(expected, "utf8").digest();
  const receivedHash = crypto.createHash("sha256").update(received, "utf8").digest();
  return Boolean(expected && received) && crypto.timingSafeEqual(expectedHash, receivedHash);
}

function clampTimeout(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(Math.max(Math.round(number), MIN_TIMEOUT_MS), MAX_TIMEOUT_MS);
}

function renderPage(title, message) {
  return [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${title}</title>`,
    "</head><body>",
    `<main><h1>${title}</h1><p>${message}</p></main>`,
    "</body></html>"
  ].join("");
}

function createLoopbackCallbackListener(options = {}) {
  const httpImpl = options.httpImpl || http;
  if (!httpImpl || typeof httpImpl.createServer !== "function") {
    throw new TypeError("An http-compatible module is required.");
  }
  const defaultTimeoutMs = clampTimeout(options.timeoutMs);

  let server = null;
  let port = 0;
  let waiting = null;
  let closed = false;
  let closePromise = null;
  let startPromise = null;
  let rejectPendingStart = null;

  function address() {
    if (!server || typeof server.address !== "function") return null;
    const info = server.address();
    return info && typeof info === "object" ? { address: info.address, port: info.port } : null;
  }

  function redirectUri() {
    return port ? `http://${LOOPBACK_HOST}:${port}${CALLBACK_PATH}` : "";
  }

  function respond(res, statusCode, title, message) {
    const body = Buffer.from(renderPage(title, message), "utf8");
    res.writeHead(statusCode, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": String(body.length),
      "Cache-Control": "no-store",
      Connection: "close"
    });
    res.end(body);
  }

  function settle(outcome) {
    const current = waiting;
    if (!current || current.settled) return;
    current.settled = true;
    clearTimeout(current.timer);
    waiting = null;
    if (outcome.error) current.reject(outcome.error);
    else current.resolve(outcome.code);
  }

  function respondAndSettle(res, statusCode, title, message, outcome) {
    res.on("finish", () => {
      void close();
    });
    respond(res, statusCode, title, message);
    settle(outcome);
  }

  function handleRequest(req, res) {
    if (closed) {
      respond(res, 410, "Link expired", "This authorization link is no longer valid.");
      return;
    }
    let requestUrl;
    try {
      requestUrl = new URL(typeof req.url === "string" ? req.url : "/", `http://${LOOPBACK_HOST}`);
    } catch {
      respond(res, 400, "Invalid request", "The authorization callback could not be read.");
      return;
    }
    if (requestUrl.pathname !== CALLBACK_PATH) {
      respond(res, 404, "Not found", "This address does not handle Spotify authorization.");
      return;
    }
    if (req.method !== "GET") {
      respond(res, 405, "Method not allowed", "Return to Infinite Lo-Fi and try again.");
      return;
    }
    const current = waiting;
    if (!current || current.settled) {
      respond(res, 410, "Link expired", "This authorization link is no longer valid.");
      return;
    }
    const receivedState = requestUrl.searchParams.get("state") || "";
    if (!timingSafeEqualStrings(current.expectedState, receivedState)) {
      respond(res, 400, "Authorization failed", "The authorization response did not match this request.");
      return;
    }
    if (requestUrl.searchParams.has("error")) {
      respondAndSettle(
        res,
        400,
        "Authorization failed",
        "Spotify did not approve this authorization request.",
        { error: createLoopbackError("authorization-denied") }
      );
      return;
    }
    const code = requestUrl.searchParams.get("code") || "";
    if (!code) {
      respondAndSettle(
        res,
        400,
        "Authorization failed",
        "The authorization response was incomplete.",
        { error: createLoopbackError("authorization-failed") }
      );
      return;
    }
    respondAndSettle(
      res,
      200,
      "Authorization complete",
      "You can return to Infinite Lo-Fi and close this window.",
      { code }
    );
  }

  async function close() {
    if (closePromise) return closePromise;
    const current = waiting;
    if (current && !current.settled) {
      current.settled = true;
      clearTimeout(current.timer);
      waiting = null;
      current.reject(createLoopbackError("closed"));
    }
    closed = true;
    if (rejectPendingStart) {
      const rejectStart = rejectPendingStart;
      rejectPendingStart = null;
      rejectStart(createLoopbackError("closed"));
    }
    closePromise = (async () => {
      const active = server;
      server = null;
      port = 0;
      if (!active) return true;
      await new Promise((resolve) => {
        active.close(() => resolve());
        if (typeof active.closeIdleConnections === "function") active.closeIdleConnections();
      });
      return true;
    })();
    return closePromise;
  }

  async function start() {
    if (closed) throw createLoopbackError("closed");
    if (server && port) return redirectUri();
    if (startPromise) return startPromise;
    const active = httpImpl.createServer(handleRequest);
    server = active;
    active.on("clientError", (_error, socket) => {
      try {
        socket.destroy();
      } catch {}
    });
    const run = (async () => {
      await new Promise((resolve, reject) => {
        let settled = false;
        const finish = (error) => {
          if (settled) return;
          settled = true;
          active.off("error", onError);
          if (rejectPendingStart === rejectStart) rejectPendingStart = null;
          if (error) reject(error);
          else resolve();
        };
        const rejectStart = (error) => finish(error);
        const onError = () => finish(createLoopbackError("server-error"));
        rejectPendingStart = rejectStart;
        active.once("error", onError);
        try {
          active.listen(0, LOOPBACK_HOST, () => finish());
        } catch {
          finish(createLoopbackError("server-error"));
        }
      });
      if (closed || server !== active) throw createLoopbackError("closed");
      const info = active.address();
      port = info && typeof info === "object" ? Number(info.port) || 0 : 0;
      if (!port) {
        await close();
        throw createLoopbackError("server-error");
      }
      return redirectUri();
    })();
    startPromise = run;
    const release = () => {
      if (startPromise === run) startPromise = null;
    };
    run.then(release, release);
    return run;
  }

  function waitForCode(options = {}) {
    if (closed) return Promise.reject(createLoopbackError("closed"));
    if (!server || !port) return Promise.reject(createLoopbackError("not-listening"));
    if (waiting) return Promise.reject(createLoopbackError("invalid-request"));
    const expectedState = typeof options.expectedState === "string" ? options.expectedState.trim() : "";
    if (!expectedState || expectedState.length > MAX_STATE_LENGTH) {
      return Promise.reject(createLoopbackError("invalid-request"));
    }
    const timeoutMs = clampTimeout(options.timeoutMs === undefined ? defaultTimeoutMs : options.timeoutMs);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        settle({ error: createLoopbackError("authorization-timeout") });
        void close();
      }, timeoutMs);
      if (typeof timer.unref === "function") timer.unref();
      waiting = { expectedState, resolve, reject, timer, settled: false };
    });
  }

  return Object.freeze({
    address,
    close,
    get redirectUri() {
      return redirectUri();
    },
    start,
    waitForCode
  });
}

module.exports = {
  CALLBACK_PATH,
  DEFAULT_TIMEOUT_MS,
  LOOPBACK_HOST,
  MAX_TIMEOUT_MS,
  createLoopbackCallbackListener,
  timingSafeEqualStrings
};
