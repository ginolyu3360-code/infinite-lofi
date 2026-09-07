const test = require("node:test");
const assert = require("node:assert/strict");

const { createRuntimeSnapshot, resolveRestoredRuntime } = require("../src/timer");
const { reorderById, resolveActiveId, sortPinnedFirst } = require("../src/notes");
const { applyTrackOrder, findActiveTrackIndex, getTrackKey } = require("../src/player");
const { buildRenderKey, normalizeBackgroundSettings, resolveEffectiveBackground } = require("../src/backgrounds");
const { buildRangeDays, recordFocusSession, summarizeFocusRows } = require("../src/stats");
const {
  buildForecastUrl,
  buildGeocodingUrl,
  formatUpdatedAgo,
  normalizeWeatherSettings,
  sanitizeWeatherText,
  weatherCodeToText
} = require("../src/weather");
const { normalizeToggleSettings } = require("../src/ui");
const { bindSwipeToClose, isTypingElement } = require("../src/bindings");
const { isTrustedNavigationUrl } = require("../src/security");
const { resolveWindowCloseAction } = require("../src/app-lifecycle");

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
  assert.equal(resolveEffectiveBackground({ mode: "white" }, { url: "cover.jpg" }).mode, "white");
  assert.deepEqual(resolveEffectiveBackground({ mode: "cover" }, { url: "cover.jpg", name: "Album" }), {
    mode: "image",
    customImageUrl: "cover.jpg",
    customImageName: "Album",
    customVideoUrl: "",
    customVideoName: "",
    fromTrackArtwork: true
  });
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

test("records focus sessions without truncating a year of imported history", () => {
  const rows = Array.from({ length: 365 }, (_, index) => ({
    day: `2025-${String(Math.floor(index / 31) + 1).padStart(2, "0")}-${String((index % 31) + 1).padStart(2, "0")}`,
    focusSeconds: 60
  }));
  const updated = recordFocusSession(rows, "2026-01-01", 1500);

  assert.equal(updated.length, 366);
  assert.deepEqual(updated.at(-1), { day: "2026-01-01", focusSeconds: 1500 });
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
  assert.deepEqual(normalizeWeatherSettings(), { mode: "off", city: "" });
  assert.deepEqual(normalizeWeatherSettings({ mode: "city", city: "  Hong   Kong  " }), {
    mode: "city",
    city: "Hong Kong"
  });
  assert.match(buildGeocodingUrl("New York"), /name=New%20York/);
  assert.match(buildForecastUrl(22.3, 114.2), /latitude=22.3&longitude=114.2/);
});

test("allows only the trusted application document to navigate", () => {
  const trusted = "file:///Applications/Infinite%20Lo-Fi.app/Contents/Resources/app.asar/src/index.html";
  assert.equal(isTrustedNavigationUrl(`${trusted}#timer`, trusted), true);
  assert.equal(isTrustedNavigationUrl(`${trusted}?external=1`, trusted), false);
  assert.equal(isTrustedNavigationUrl("https://example.com/", trusted), false);
  assert.equal(isTrustedNavigationUrl("not a URL", trusted), false);
});

test("maps window close requests to quit, hide, or final close consistently", () => {
  assert.equal(resolveWindowCloseAction({ closeBehavior: "quit", isQuitting: false }), "quit");
  assert.equal(resolveWindowCloseAction({ closeBehavior: "tray", isQuitting: false }), "hide");
  assert.equal(resolveWindowCloseAction({ closeBehavior: "tray", isQuitting: true }), "close");
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

test("closes a drawer only for a clear touch swipe to the right", () => {
  const listeners = new Map();
  const element = {
    addEventListener(name, handler) {
      listeners.set(name, handler);
    }
  };
  let closeCount = 0;
  bindSwipeToClose(element, () => { closeCount += 1; }, 60);

  listeners.get("pointerdown")({ pointerType: "touch", button: 0, pointerId: 1, clientX: 10, clientY: 20 });
  listeners.get("pointerup")({ pointerId: 1, clientX: 90, clientY: 28 });
  assert.equal(closeCount, 1);

  listeners.get("pointerdown")({ pointerType: "touch", button: 0, pointerId: 2, clientX: 10, clientY: 20 });
  listeners.get("pointerup")({ pointerId: 2, clientX: 35, clientY: 100 });
  assert.equal(closeCount, 1);
});
