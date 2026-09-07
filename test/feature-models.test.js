const test = require("node:test");
const assert = require("node:assert/strict");

const { createRuntimeSnapshot, resolveRestoredRuntime } = require("../src/timer");
const { reorderById, resolveActiveId, sortPinnedFirst } = require("../src/notes");
const { applyTrackOrder, findActiveTrackIndex, getTrackKey } = require("../src/player");
const { buildRenderKey, normalizeBackgroundSettings } = require("../src/backgrounds");
const { buildRangeDays, summarizeFocusRows } = require("../src/stats");
const { formatUpdatedAgo, sanitizeWeatherText, weatherCodeToText } = require("../src/weather");
const { normalizeToggleSettings } = require("../src/ui");
const { isTypingElement } = require("../src/bindings");

test("restores an active timer from its deadline", () => {
  const restored = resolveRestoredRuntime(
    { phase: "focus", remainingSeconds: 999, deadlineMs: 10_000, isRunning: true },
    { focusSeconds: 1500, breakSeconds: 300 },
    7_500
  );

  assert.deepEqual(restored, {
    phase: "focus",
    remainingSeconds: 3,
    deadlineMs: 10_000,
    isRunning: true,
    completedFocusDuringAbsence: false
  });
});

test("moves an expired saved timer to a paused next phase", () => {
  const restored = resolveRestoredRuntime(
    { phase: "focus", remainingSeconds: 1, deadlineMs: 10_000, isRunning: true },
    { focusSeconds: 1500, breakSeconds: 420 },
    12_000
  );

  assert.equal(restored.phase, "break");
  assert.equal(restored.remainingSeconds, 420);
  assert.equal(restored.isRunning, false);
  assert.equal(restored.completedFocusDuringAbsence, true);
  assert.deepEqual(
    createRuntimeSnapshot({
      phase: restored.phase,
      remainingSeconds: restored.remainingSeconds,
      deadlineMs: restored.deadlineMs,
      isRunning: restored.isRunning
    }),
    { phase: "break", remainingSeconds: 420, deadlineMs: null, isRunning: false }
  );
});

test("keeps pinned notes first while reordering and resolves the active note", () => {
  const files = [
    { id: "pinned", pinned: true },
    { id: "one", pinned: false },
    { id: "two", pinned: false }
  ];

  assert.deepEqual(sortPinnedFirst([files[1], files[0], files[2]]).map((file) => file.id), [
    "pinned",
    "one",
    "two"
  ]);
  assert.deepEqual(reorderById(files, "two", "one").map((file) => file.id), [
    "pinned",
    "two",
    "one"
  ]);
  assert.equal(resolveActiveId(files, "two"), "two");
  assert.equal(resolveActiveId(files, "missing"), "pinned");
});

test("restores playlist order and the selected track by stable source", () => {
  const tracks = [
    { label: "A", src: "a.wav" },
    { label: "B", src: "b.wav" },
    { label: "C", srcUrl: "file:///c.wav" }
  ];
  const restored = applyTrackOrder(tracks, ["file:///c.wav", "a.wav"]);

  assert.deepEqual(restored.map((track) => track.label), ["C", "A", "B"]);
  assert.equal(getTrackKey(restored[0]), "file:///c.wav");
  assert.equal(findActiveTrackIndex(restored, "a.wav"), 1);
  assert.equal(findActiveTrackIndex(restored, "missing.wav"), 0);
});

test("normalizes background and shortcut settings", () => {
  assert.deepEqual(normalizeBackgroundSettings({ mode: "invalid", customImageUrl: 42 }), {
    mode: "black",
    customImageUrl: "",
    customImageName: "",
    customVideoUrl: "",
    customVideoName: ""
  });
  assert.equal(buildRenderKey({ mode: "image", customImageUrl: "cover.jpg" }, true), "image|cover.jpg||showcase");
  assert.deepEqual(normalizeToggleSettings({ play: false, unknown: true }, { play: true, next: true }), {
    play: false,
    next: true
  });
});

test("builds and summarizes local focus-stat ranges", () => {
  const days = buildRangeDays(new Date(2026, 8, 7, 12), "today", "en-US");
  assert.equal(days.length, 1);
  assert.equal(days[0].key, "2026-09-07");
  const summary = summarizeFocusRows(
    [{ day: "2026-09-07", focusSeconds: 900 }],
    days
  );
  assert.deepEqual(summary.values, [900]);
  assert.equal(summary.totalMinutes, 15);
  assert.equal(summary.averageMinutes, 15);
  assert.equal(summary.peakMinutes, 15);
});

test("normalizes weather labels, payloads, and cache age", () => {
  assert.equal(weatherCodeToText(61), "Rain");
  assert.equal(sanitizeWeatherText("Hong Kong: ☀️ +28°C"), "Hong Kong: ☀️ +28°C");
  assert.equal(
    sanitizeWeatherText("<html><body>Hong Kong: +28°C</body></html>", () => "Hong Kong: +28°C"),
    "Hong Kong: +28°C"
  );
  assert.equal(formatUpdatedAgo(1_000, 31_000), "刚刚");
  assert.equal(formatUpdatedAgo(1_000, 121_000), "2分钟前");
});

test("detects typing targets without depending on Electron", () => {
  class MockElement {}
  const input = new MockElement();
  input.tagName = "INPUT";
  input.isContentEditable = false;
  const div = new MockElement();
  div.tagName = "DIV";
  div.isContentEditable = false;
  assert.equal(isTypingElement(input, MockElement), true);
  assert.equal(isTypingElement(div, MockElement), false);
  div.isContentEditable = true;
  assert.equal(isTypingElement(div, MockElement), true);
});
