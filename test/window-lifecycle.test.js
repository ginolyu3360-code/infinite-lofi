const test = require("node:test");
const assert = require("node:assert/strict");

const { bindWindowBackgroundLifecycle } = require("../src/window-lifecycle");

test("keeps minimized media controls responsive without disabling foreground throttling", () => {
  const listeners = new Map();
  const changes = [];
  const browserWindow = {
    on(name, handler) { listeners.set(name, handler); },
    webContents: {
      isDestroyed: () => false,
      setBackgroundThrottling(allowed) { changes.push(allowed); }
    }
  };

  bindWindowBackgroundLifecycle(browserWindow);
  listeners.get("minimize")();
  listeners.get("restore")();

  assert.deepEqual(changes, [false, true]);
});

test("ignores lifecycle events after the renderer is destroyed", () => {
  const listeners = new Map();
  const browserWindow = {
    on(name, handler) { listeners.set(name, handler); },
    webContents: {
      isDestroyed: () => true,
      setBackgroundThrottling() { throw new Error("should not be called"); }
    }
  };

  bindWindowBackgroundLifecycle(browserWindow);
  assert.doesNotThrow(() => listeners.get("minimize")());
  assert.doesNotThrow(() => listeners.get("restore")());
});
