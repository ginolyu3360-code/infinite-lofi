const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { EventEmitter } = require("node:events");

const {
  CALLBACK_PATH,
  DEFAULT_TIMEOUT_MS,
  LOOPBACK_HOST,
  createLoopbackCallbackListener,
  timingSafeEqualStrings
} = require("../src/spotify-loopback");

function captureRejection(promise) {
  return promise.then(
    (value) => ({ resolved: true, value }),
    (error) => ({ resolved: false, error })
  );
}

function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request(url, { method: options.method || "GET", agent: false }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => resolve({ status: response.statusCode, body }));
    });
    request.on("error", reject);
    request.end();
  });
}

test("binds only 127.0.0.1 on an ephemeral port and closes deterministically", async () => {
  const listener = createLoopbackCallbackListener();
  const redirectUri = await listener.start();

  assert.match(redirectUri, /^http:\/\/127\.0\.0\.1:\d+\/callback$/);
  assert.equal(new URL(redirectUri).pathname, CALLBACK_PATH);
  assert.equal(listener.redirectUri, redirectUri);
  assert.deepEqual(listener.address(), { address: LOOPBACK_HOST, port: Number(new URL(redirectUri).port) });

  await listener.close();
  assert.equal(listener.address(), null);
  assert.equal(listener.redirectUri, "");
});

test("resolves with the authorization code and renders a small success page", async () => {
  const listener = createLoopbackCallbackListener();
  await listener.start();
  const state = "state-value-1234567890";

  const pending = listener.waitForCode({ expectedState: state });
  const response = await httpRequest(`${listener.redirectUri}?code=SECRET_CODE&state=${state}`);

  assert.equal(response.status, 200);
  assert.match(response.body, /Authorization complete/);
  assert.equal(response.body.includes("SECRET_CODE"), false);
  assert.equal(await pending, "SECRET_CODE");

  await listener.close();
  assert.equal(listener.address(), null);
});

test("ignores mismatched state in constant time without echoing secrets or aborting the valid callback", async () => {
  const listener = createLoopbackCallbackListener();
  await listener.start();

  const pending = listener.waitForCode({ expectedState: "expected-state-value" });
  const wrongLength = await httpRequest(`${listener.redirectUri}?code=SECRET_CODE&state=short`);
  assert.equal(wrongLength.status, 400);
  assert.equal(wrongLength.body.includes("SECRET_CODE"), false);
  const wrongContent = await httpRequest(`${listener.redirectUri}?code=SECRET_CODE&state=wrong___-state-value`);
  assert.equal(wrongContent.status, 400);
  const valid = await httpRequest(`${listener.redirectUri}?code=VALID_CODE&state=expected-state-value`);
  assert.equal(valid.status, 200);
  assert.equal(await pending, "VALID_CODE");

  await listener.close();
});

test("close settles a start that has not finished listening", async () => {
  class PendingServer extends EventEmitter {
    listen(_port, _host, callback) {
      this.listenCallback = callback;
    }
    address() {
      return null;
    }
    close(callback) {
      callback(Object.assign(new Error("Server is not running."), { code: "ERR_SERVER_NOT_RUNNING" }));
    }
    closeIdleConnections() {}
  }
  const pendingServer = new PendingServer();
  const listener = createLoopbackCallbackListener({
    httpImpl: { createServer: () => pendingServer }
  });
  const starting = captureRejection(listener.start());

  assert.equal(await listener.close(), true);
  const outcome = await starting;
  assert.equal(outcome.resolved, false);
  assert.equal(outcome.error.code, "closed");
  assert.equal(listener.address(), null);
});

test("ignores other paths and methods while still waiting for the callback", async () => {
  const listener = createLoopbackCallbackListener();
  await listener.start();
  const state = "abcdefghijklmnop";

  const pending = listener.waitForCode({ expectedState: state });
  const notFound = await httpRequest(`${listener.redirectUri.replace(CALLBACK_PATH, "/other")}?code=x&state=${state}`);
  assert.equal(notFound.status, 404);

  const wrongMethod = await httpRequest(`${listener.redirectUri}?code=x&state=${state}`, { method: "POST" });
  assert.equal(wrongMethod.status, 405);

  const ok = await httpRequest(`${listener.redirectUri}?code=CODE_ONE&state=${state}`);
  assert.equal(ok.status, 200);
  assert.equal(await pending, "CODE_ONE");

  await listener.close();
});

test("rejects a denied authorization and an incomplete callback", async () => {
  const deniedListener = createLoopbackCallbackListener();
  await deniedListener.start();

  const denied = captureRejection(deniedListener.waitForCode({ expectedState: "state-value-abcdefgh" }));
  const deniedResponse = await httpRequest(`${deniedListener.redirectUri}?error=access_denied&state=state-value-abcdefgh`);
  assert.equal(deniedResponse.status, 400);
  assert.equal((await denied).error.code, "authorization-denied");
  await deniedListener.close();

  const incompleteListener = createLoopbackCallbackListener();
  await incompleteListener.start();
  const incomplete = captureRejection(incompleteListener.waitForCode({ expectedState: "state-value-abcdefgh" }));
  const incompleteResponse = await httpRequest(`${incompleteListener.redirectUri}?state=state-value-abcdefgh`);
  assert.equal(incompleteResponse.status, 400);
  assert.equal((await incomplete).error.code, "authorization-failed");

  await incompleteListener.close();
});

test("times out with a bounded default and closes the listener", async () => {
  assert.equal(DEFAULT_TIMEOUT_MS, 300000);
  const listener = createLoopbackCallbackListener({ timeoutMs: 20 });
  await listener.start();

  await assert.rejects(
    listener.waitForCode({ expectedState: "state-value-abcdefgh" }),
    (error) => {
      assert.equal(error.code, "authorization-timeout");
      assert.equal(error.message.includes("state-value"), false);
      return true;
    }
  );
  await listener.close();
  assert.equal(listener.address(), null);
});

test("close rejects a pending wait and is idempotent", async () => {
  const listener = createLoopbackCallbackListener();
  await listener.start();
  const pending = captureRejection(listener.waitForCode({ expectedState: "state-value-abcdefgh" }));

  await listener.close();
  const outcome = await pending;
  assert.equal(outcome.resolved, false);
  assert.equal(outcome.error.code, "closed");
  assert.equal(await listener.close(), true);
  assert.equal(listener.address(), null);
});

test("guards lifecycle misuse", async () => {
  assert.throws(() => createLoopbackCallbackListener({ httpImpl: {} }), /http/i);

  const listener = createLoopbackCallbackListener();
  await assert.rejects(
    listener.waitForCode({ expectedState: "state-value-abcdefgh" }),
    (error) => error.code === "not-listening"
  );

  await listener.start();
  await assert.rejects(listener.waitForCode({ expectedState: "" }), (error) => error.code === "invalid-request");

  const first = listener.waitForCode({ expectedState: "state-value-abcdefgh" });
  await assert.rejects(
    listener.waitForCode({ expectedState: "state-value-abcdefgh" }),
    (error) => error.code === "invalid-request"
  );
  await httpRequest(`${listener.redirectUri}?code=CODE&state=state-value-abcdefgh`);
  assert.equal(await first, "CODE");
  await listener.close();
});

test("compares states without throwing on mismatched lengths", () => {
  assert.equal(timingSafeEqualStrings("abc", "abc"), true);
  assert.equal(timingSafeEqualStrings("abc", "abd"), false);
  assert.equal(timingSafeEqualStrings("abc", "abcd"), false);
  assert.equal(timingSafeEqualStrings("", "abc"), false);
  assert.equal(timingSafeEqualStrings(null, undefined), false);
});
