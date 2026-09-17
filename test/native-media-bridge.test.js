const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  createNativeMediaBridge,
  normalizeNativeMediaCommand,
  normalizeNativeMediaState,
  resolveNativeMediaBridgePath
} = require("../src/native-media-bridge");

test("normalizes bounded native Now Playing state", () => {
  assert.deepEqual(normalizeNativeMediaState({
    title: `  ${"A".repeat(600)}  `,
    artist: " Artist ",
    album: " Album ",
    duration: 120,
    position: 150,
    playbackRate: 1,
    state: "paused"
  }), {
    title: "A".repeat(500),
    artist: "Artist",
    album: "Album",
    duration: 120,
    position: 120,
    playbackRate: 1,
    state: "paused"
  });
  assert.equal(normalizeNativeMediaState({ state: "invalid" }).state, "none");
});

test("accepts only known native media commands and finite seek positions", () => {
  assert.deepEqual(normalizeNativeMediaCommand("play"), { type: "play" });
  assert.deepEqual(normalizeNativeMediaCommand("seek:42.5"), { type: "seek", position: 42.5 });
  assert.equal(normalizeNativeMediaCommand("seek:-1"), null);
  assert.equal(normalizeNativeMediaCommand("seek:not-a-number"), null);
  assert.equal(normalizeNativeMediaCommand("launch"), null);
});

test("loads the macOS bridge, filters commands, and sanitizes updates", () => {
  const commands = [];
  const updates = [];
  let nativeCallback;
  let cleared = 0;
  let destroyed = 0;
  const bridge = createNativeMediaBridge({
    platform: "darwin",
    addonPath: "/test/bridge.node",
    loadAddon(modulePath) {
      assert.equal(modulePath, "/test/bridge.node");
      return {
        createBridge(callback) {
          nativeCallback = callback;
          return {
            update: (state) => updates.push(state),
            clear: () => { cleared += 1; },
            destroy: () => { destroyed += 1; }
          };
        }
      };
    },
    onCommand: (command) => commands.push(command)
  });

  assert.equal(bridge.isAvailable(), true);
  bridge.update({ title: " Focus ", duration: 60, position: -10, state: "playing" });
  bridge.clear();
  bridge.destroy();
  nativeCallback("play");
  nativeCallback("seek:12.5");
  nativeCallback("untrusted-command");

  assert.deepEqual(updates[0], {
    title: "Focus",
    artist: "",
    album: "",
    duration: 60,
    position: 0,
    playbackRate: 1,
    state: "playing"
  });
  assert.equal(cleared, 1);
  assert.equal(destroyed, 1);
  assert.deepEqual(commands, [{ type: "play" }, { type: "seek", position: 12.5 }]);
});

test("falls back without loading native code outside macOS", () => {
  let loaded = false;
  const bridge = createNativeMediaBridge({
    platform: "win32",
    loadAddon() {
      loaded = true;
    }
  });
  assert.equal(bridge.isAvailable(), false);
  assert.equal(loaded, false);
  assert.doesNotThrow(() => bridge.update({ state: "playing" }));
});

test("resolves development and packaged bridge locations", () => {
  assert.equal(
    resolveNativeMediaBridgePath({ appPath: "/repo", isPackaged: false, resourcesPath: "/resources" }),
    path.join("/repo", "native-bin", "macos_media_bridge.node")
  );
  assert.equal(
    resolveNativeMediaBridgePath({ appPath: "/repo", isPackaged: true, resourcesPath: "/resources" }),
    path.join("/resources", "native", "macos_media_bridge.node")
  );
});
