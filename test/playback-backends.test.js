const test = require("node:test");
const assert = require("node:assert/strict");

const {
  PLAYBACK_CAPABILITIES,
  PLAYBACK_OPERATION_CAPABILITIES,
  PLAYBACK_OPERATIONS,
  createPlaybackBackend,
  normalizePlaybackSourceMode
} = require("../src/playback-backends");

test("normalizes persisted playback source mode without inventing a provider", () => {
  assert.equal(normalizePlaybackSourceMode("local"), "local");
  assert.equal(normalizePlaybackSourceMode("external"), "external");
  assert.equal(normalizePlaybackSourceMode("spotify"), "local");
  assert.equal(normalizePlaybackSourceMode(null), "local");
});

test("creates an explicit capability-based backend contract", async () => {
  const calls = [];
  const backend = createPlaybackBackend({
    id: "external",
    mode: "external",
    label: "External player",
    capabilities: {
      open: true,
      play: false,
      playlists: false,
      unsupportedFutureCapability: true
    },
    activate: async () => calls.push("activate"),
    deactivate: async () => calls.push("deactivate")
  });

  assert.equal(backend.id, "external");
  assert.equal(backend.mode, "external");
  assert.deepEqual(Object.keys(backend.capabilities), PLAYBACK_CAPABILITIES);
  assert.equal(backend.capabilities.open, true);
  assert.equal(backend.capabilities.play, false);
  assert.equal(Object.hasOwn(backend.capabilities, "unsupportedFutureCapability"), false);
  await backend.activate();
  await backend.deactivate();
  assert.deepEqual(calls, ["activate", "deactivate"]);
  assert.equal(Object.isFrozen(backend.capabilities), true);
  assert.equal(Object.isFrozen(backend), true);
});

test("rejects malformed backend definitions", () => {
  assert.throws(() => createPlaybackBackend(), /definition/i);
  assert.throws(() => createPlaybackBackend({ id: "", mode: "local" }), /id/i);
  assert.throws(() => createPlaybackBackend({ id: "remote", mode: "remote" }), /mode/i);
});

test("covers the requested provider operations in order", () => {
  assert.deepEqual([...PLAYBACK_OPERATIONS], [
    "connect",
    "disconnect",
    "getAuthState",
    "listPlaylists",
    "getPlaybackState",
    "play",
    "pause",
    "stop",
    "previous",
    "next",
    "seek",
    "volume"
  ]);
  for (const operation of PLAYBACK_OPERATIONS) {
    assert.equal(PLAYBACK_CAPABILITIES.includes(PLAYBACK_OPERATION_CAPABILITIES[operation]), true);
  }
});

test("exposes every operation as a frozen function and fails predictably when unsupported", async () => {
  const backend = createPlaybackBackend({ id: "external", mode: "external" });
  for (const operation of PLAYBACK_OPERATIONS) {
    assert.equal(typeof backend[operation], "function");
  }
  assert.equal(Object.isFrozen(backend), true);
  await assert.rejects(backend.connect(), (error) => error.code === "unsupported-capability");
  await assert.rejects(backend.getAuthState(), (error) => error.code === "unsupported-capability");
  await assert.rejects(backend.getPlaybackState(), (error) => error.code === "unsupported-capability");
});

test("distinguishes an advertised operation from a missing implementation", async () => {
  const backend = createPlaybackBackend({
    id: "external",
    mode: "external",
    capabilities: { play: true }
  });
  await assert.rejects(backend.play(), (error) => error.code === "operation-not-implemented");
  await assert.rejects(backend.pause(), (error) => error.code === "unsupported-capability");
});

test("runs supported operations, forwards arguments, and propagates failures", async () => {
  const calls = [];
  const backend = createPlaybackBackend({
    id: "spotify",
    mode: "external",
    capabilities: { connect: true, playlists: true, play: true, volume: true },
    async connect(options) {
      calls.push(["connect", options]);
      return { status: "connected" };
    },
    listPlaylists(options) {
      calls.push(["listPlaylists", options]);
      return [{ id: "playlist-1" }];
    },
    play() {
      calls.push(["play"]);
      return true;
    },
    volume(level) {
      calls.push(["volume", level]);
      throw new Error("volume is unavailable");
    }
  });

  assert.deepEqual(await backend.connect({ force: true }), { status: "connected" });
  assert.deepEqual(await backend.listPlaylists({ limit: 20 }), [{ id: "playlist-1" }]);
  assert.equal(await backend.play(), true);
  await assert.rejects(backend.volume(0.5), /volume is unavailable/);
  assert.deepEqual(calls, [
    ["connect", { force: true }],
    ["listPlaylists", { limit: 20 }],
    ["play"],
    ["volume", 0.5]
  ]);
});
