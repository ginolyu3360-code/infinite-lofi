const test = require("node:test");
const assert = require("node:assert/strict");

const {
  GLOBAL_TIMER_ACCELERATOR,
  createDesktopControlManager,
  createRendererCommandDispatcher,
  isDesktopControlPreferencesPayload,
  normalizeDesktopControlPreferences
} = require("../src/desktop-controls");

function createShortcutHarness({ registrationSucceeds = true } = {}) {
  const registrations = [];
  const unregistrations = [];
  let registered = false;
  let callback = null;
  return {
    globalShortcut: {
      isRegistered: () => registered,
      register(accelerator, handler) {
        registrations.push(accelerator);
        callback = handler;
        registered = registrationSucceeds;
        return registrationSucceeds;
      },
      unregister(accelerator) {
        unregistrations.push(accelerator);
        registered = false;
      }
    },
    registrations,
    unregistrations,
    trigger: () => callback?.()
  };
}

function createWindowHarness() {
  const alwaysOnTopCalls = [];
  let alwaysOnTop = false;
  return {
    alwaysOnTopCalls,
    window: {
      isDestroyed: () => false,
      isAlwaysOnTop: () => alwaysOnTop,
      setAlwaysOnTop(enabled, level) {
        alwaysOnTop = enabled;
        alwaysOnTopCalls.push([enabled, level]);
      }
    }
  };
}

test("normalizes desktop control preferences to explicit booleans", () => {
  assert.deepEqual(normalizeDesktopControlPreferences(), {
    globalTimerShortcutEnabled: false,
    miniAlwaysOnTop: false
  });
  assert.deepEqual(normalizeDesktopControlPreferences({
    globalTimerShortcutEnabled: 1,
    miniAlwaysOnTop: true
  }), {
    globalTimerShortcutEnabled: false,
    miniAlwaysOnTop: true
  });
});

test("accepts only the two expected boolean IPC preference fields", () => {
  assert.equal(isDesktopControlPreferencesPayload({
    globalTimerShortcutEnabled: true,
    miniAlwaysOnTop: false
  }), true);
  assert.equal(isDesktopControlPreferencesPayload({
    globalTimerShortcutEnabled: 1,
    miniAlwaysOnTop: false
  }), false);
  assert.equal(isDesktopControlPreferencesPayload({
    globalTimerShortcutEnabled: true,
    miniAlwaysOnTop: false,
    accelerator: "Alt+Space"
  }), false);
});

test("registers the fixed timer shortcut once and forwards its command", () => {
  const shortcuts = createShortcutHarness();
  const windowHarness = createWindowHarness();
  let toggles = 0;
  const manager = createDesktopControlManager({
    globalShortcut: shortcuts.globalShortcut,
    getWindow: () => windowHarness.window,
    isMiniMode: () => false,
    onToggleTimer: () => { toggles += 1; }
  });

  const first = manager.applyPreferences({ globalTimerShortcutEnabled: true });
  const second = manager.applyPreferences({ globalTimerShortcutEnabled: true });
  shortcuts.trigger();

  assert.equal(first.globalShortcutStatus, "registered");
  assert.equal(second.accelerator, GLOBAL_TIMER_ACCELERATOR);
  assert.deepEqual(shortcuts.registrations, [GLOBAL_TIMER_ACCELERATOR]);
  assert.equal(toggles, 1);
});

test("reports unavailable shortcut registration without throwing and retries later", () => {
  const shortcuts = createShortcutHarness({ registrationSucceeds: false });
  const manager = createDesktopControlManager({ globalShortcut: shortcuts.globalShortcut });

  assert.equal(
    manager.applyPreferences({ globalTimerShortcutEnabled: true }).globalShortcutStatus,
    "unavailable"
  );
  assert.equal(
    manager.applyPreferences({ globalTimerShortcutEnabled: true }).globalShortcutStatus,
    "unavailable"
  );
  assert.deepEqual(shortcuts.registrations, [GLOBAL_TIMER_ACCELERATOR, GLOBAL_TIMER_ACCELERATOR]);
});

test("disabling and disposing unregister only the fixed shortcut", () => {
  const shortcuts = createShortcutHarness();
  const manager = createDesktopControlManager({ globalShortcut: shortcuts.globalShortcut });
  manager.applyPreferences({ globalTimerShortcutEnabled: true });
  assert.equal(manager.applyPreferences({ globalTimerShortcutEnabled: false }).globalShortcutStatus, "off");
  manager.dispose();
  assert.deepEqual(shortcuts.unregistrations, [GLOBAL_TIMER_ACCELERATOR, GLOBAL_TIMER_ACCELERATOR]);
});

test("applies always-on-top only while Mini Mode is active and retains preference", () => {
  const windowHarness = createWindowHarness();
  let miniMode = false;
  const manager = createDesktopControlManager({
    getWindow: () => windowHarness.window,
    isMiniMode: () => miniMode
  });

  let status = manager.applyPreferences({ miniAlwaysOnTop: true });
  assert.equal(status.miniAlwaysOnTopPreferred, true);
  assert.equal(status.miniAlwaysOnTopApplied, false);

  miniMode = true;
  status = manager.refreshWindowState();
  assert.equal(status.miniAlwaysOnTopApplied, true);

  miniMode = false;
  status = manager.refreshWindowState();
  assert.equal(status.miniAlwaysOnTopApplied, false);
  assert.equal(status.miniAlwaysOnTopPreferred, true);
  assert.deepEqual(windowHarness.alwaysOnTopCalls, [
    [false, undefined],
    [true, "floating"],
    [false, undefined]
  ]);
});

test("dispatches without showing a loaded hidden or minimized window", () => {
  const sent = [];
  const existingWindow = {
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => false,
      isLoadingMainFrame: () => false,
      isLoading: () => false,
      send: (...args) => sent.push(args)
    }
  };
  let createCalls = 0;
  const dispatcher = createRendererCommandDispatcher({
    getWindow: () => existingWindow,
    createWindow: () => { createCalls += 1; }
  });

  assert.equal(dispatcher.dispatch("toggle-timer"), true);
  assert.equal(createCalls, 0);
  assert.deepEqual(sent, [["app:command", "toggle-timer"]]);
});

test("does not create a renderer for ordinary commands when no window exists", () => {
  let createCalls = 0;
  const dispatcher = createRendererCommandDispatcher({
    getWindow: () => null,
    createWindow: () => { createCalls += 1; }
  });

  assert.equal(dispatcher.dispatch("reset-timer"), false);
  assert.equal(createCalls, 0);
});

test("creates a hidden renderer and waits for load before dispatching", () => {
  const sent = [];
  let ready = false;
  const createdWindow = {
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => false,
      send: (...args) => sent.push(args)
    }
  };
  const createOptions = [];
  const dispatcher = createRendererCommandDispatcher({
    getWindow: () => createOptions.length > 0 ? createdWindow : null,
    createWindow: (options) => {
      createOptions.push(options);
      return createdWindow;
    },
    isRendererReady: () => ready
  });

  assert.equal(dispatcher.dispatch("toggle-timer", { createIfMissing: true }), true);
  assert.deepEqual(createOptions, [{ show: false }]);
  assert.deepEqual(sent, []);
  ready = true;
  dispatcher.markReady();
  assert.deepEqual(sent, [["app:command", "toggle-timer"]]);
});

test("clears commands queued for a renderer that closed before becoming ready", () => {
  const sent = [];
  let ready = false;
  const browserWindow = {
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => false,
      send: (...args) => sent.push(args)
    }
  };
  const dispatcher = createRendererCommandDispatcher({
    getWindow: () => browserWindow,
    isRendererReady: () => ready
  });
  dispatcher.dispatch("toggle-timer");
  dispatcher.clear();
  ready = true;
  dispatcher.markReady();
  assert.deepEqual(sent, []);
});
