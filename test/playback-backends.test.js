const test = require("node:test");
const assert = require("node:assert/strict");

const {
  PLAYBACK_CAPABILITIES,
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
