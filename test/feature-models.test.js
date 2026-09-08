const test = require("node:test");
const assert = require("node:assert/strict");

const {
  advanceTimerPhase,
  createRuntimeSnapshot,
  resolveRestoredRuntime
} = require("../src/timer");
const { reorderById, resolveActiveId, sortPinnedFirst } = require("../src/notes");
const { applyTrackOrder, findActiveTrackIndex, getTrackKey } = require("../src/player");
const { buildRenderKey, normalizeBackgroundSettings, resolveEffectiveBackground } = require("../src/backgrounds");
const {
  buildRangeDays,
  recordFocusSession,
  removeFocusSession,
  summarizeDailyGoal,
  summarizeFocusRows,
  summarizeFocusTrends,
  upsertFocusSession
} = require("../src/stats");
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

test("restores an active timer from its deadline", () => {
  const restored = resolveRestoredRuntime(
    { phase: "focus", remainingSeconds: 999, deadlineMs: 10_000, isRunning: true },
    { focusSeconds: 1500, shortBreakSeconds: 300 },
    7_500
  );

  assert.deepEqual(restored, {
    phase: "focus",
    completedFocusesInCycle: 0,
    remainingSeconds: 3,
    deadlineMs: 10_000,
    isRunning: true,
    completedFocusDuringAbsence: false,
    completedFocusAtMs: null
  });
});

test("moves an expired saved timer to a paused next phase", () => {
  const restored = resolveRestoredRuntime(
    { phase: "focus", remainingSeconds: 1, deadlineMs: 10_000, isRunning: true },
    { focusSeconds: 1500, shortBreakSeconds: 420 },
    12_000
  );

  assert.equal(restored.phase, "shortBreak");
  assert.equal(restored.remainingSeconds, 420);
  assert.equal(restored.isRunning, false);
  assert.equal(restored.completedFocusDuringAbsence, true);
  assert.equal(restored.completedFocusAtMs, 10_000);
  assert.deepEqual(
    createRuntimeSnapshot({
      phase: restored.phase,
      completedFocusesInCycle: restored.completedFocusesInCycle,
      remainingSeconds: restored.remainingSeconds,
      deadlineMs: restored.deadlineMs,
      isRunning: restored.isRunning
    }, { focusSeconds: 1500, shortBreakSeconds: 420 }),
    {
      phase: "shortBreak",
      completedFocusesInCycle: 1,
      remainingSeconds: 420,
      deadlineMs: null,
      isRunning: false
    }
  );
});

test("restores short and long breaks with their own durations", () => {
  const settings = {
    focusSeconds: 1500,
    shortBreakSeconds: 420,
    longBreakSeconds: 1200,
    focusSessionsPerLongBreak: 4
  };
  const activeLongBreak = resolveRestoredRuntime(
    {
      phase: "longBreak",
      completedFocusesInCycle: 3,
      remainingSeconds: 999,
      deadlineMs: 20_000,
      isRunning: true
    },
    settings,
    15_000
  );
  assert.equal(activeLongBreak.phase, "longBreak");
  assert.equal(activeLongBreak.completedFocusesInCycle, 0);
  assert.equal(activeLongBreak.remainingSeconds, 5);
  assert.equal(activeLongBreak.isRunning, true);

  const expiredShortBreak = resolveRestoredRuntime(
    {
      phase: "shortBreak",
      completedFocusesInCycle: 2,
      remainingSeconds: 1,
      deadlineMs: 20_000,
      isRunning: true
    },
    settings,
    21_000
  );
  assert.equal(expiredShortBreak.phase, "focus");
  assert.equal(expiredShortBreak.completedFocusesInCycle, 2);
  assert.equal(expiredShortBreak.remainingSeconds, 1500);
  assert.equal(expiredShortBreak.isRunning, false);
  assert.equal(expiredShortBreak.completedFocusDuringAbsence, false);
});

test("runs short breaks before the configured long break and resets the cycle", () => {
  const settings = {
    focusSessionsPerLongBreak: 4,
    autoStartBreaks: false,
    autoStartFocus: true
  };
  const first = advanceTimerPhase({ phase: "focus", completedFocusesInCycle: 0 }, settings);
  assert.deepEqual(first, {
    phase: "shortBreak",
    completedFocusesInCycle: 1,
    completedFocus: true,
    shouldAutoStart: false
  });
  const fourth = advanceTimerPhase({ phase: "focus", completedFocusesInCycle: 3 }, settings);
  assert.deepEqual(fourth, {
    phase: "longBreak",
    completedFocusesInCycle: 0,
    completedFocus: true,
    shouldAutoStart: false
  });
  const afterLongBreak = advanceTimerPhase(fourth, settings);
  assert.deepEqual(afterLongBreak, {
    phase: "focus",
    completedFocusesInCycle: 0,
    completedFocus: false,
    shouldAutoStart: true
  });
});

test("keeps break and focus auto-start choices independent", () => {
  for (const autoStartBreaks of [false, true]) {
    for (const autoStartFocus of [false, true]) {
      const settings = { autoStartBreaks, autoStartFocus };
      assert.equal(
        advanceTimerPhase({ phase: "focus", completedFocusesInCycle: 0 }, settings).shouldAutoStart,
        autoStartBreaks
      );
      assert.equal(
        advanceTimerPhase({ phase: "shortBreak", completedFocusesInCycle: 1 }, settings).shouldAutoStart,
        autoStartFocus
      );
    }
  }
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
  assert.deepEqual(
    summarizeDailyGoal([{ day: "2026-09-07", focusSeconds: 5400 }], "2026-09-07", 3600),
    {
      focusSeconds: 5400,
      goalSeconds: 3600,
      isEnabled: true,
      isComplete: true,
      progress: 1
    }
  );
  assert.equal(summarizeDailyGoal([], "2026-09-07", 0).isEnabled, false);
});

test("records focus sessions without truncating a year of imported history", () => {
  const start = new Date(2025, 0, 1, 12);
  const sessions = Array.from({ length: 365 }, (_, index) => ({
    id: `session-${index}`,
    day: (() => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    })(),
    focusSeconds: 60
  }));
  const updated = recordFocusSession(sessions, "2026-01-01", 1500, {
    id: "timer-new-year",
    completedAt: "2026-01-01T10:00:00.000Z"
  });

  assert.equal(updated.length, 366);
  assert.deepEqual(updated.at(-1), {
    id: "timer-new-year",
    day: "2026-01-01",
    focusSeconds: 1500,
    completedAt: "2026-01-01T10:00:00.000Z",
    source: "timer"
  });
});

test("edits and removes individual focus sessions without merging same-day entries", () => {
  const first = upsertFocusSession([], {
    id: "manual-1",
    day: "2026-09-06",
    focusSeconds: 1200,
    source: "manual"
  });
  const second = upsertFocusSession(first, {
    id: "manual-2",
    day: "2026-09-06",
    focusSeconds: 1800,
    source: "manual"
  });
  const edited = upsertFocusSession(second, {
    id: "manual-1",
    day: "2026-09-07",
    focusSeconds: 1500
  });

  assert.equal(edited.length, 2);
  assert.deepEqual(summarizeFocusRows(edited, [
    { key: "2026-09-06" },
    { key: "2026-09-07" }
  ]).values, [1800, 1500]);
  assert.deepEqual(removeFocusSession(edited, "manual-2").map((session) => session.id), ["manual-1"]);
  assert.throws(
    () => upsertFocusSession(edited, { id: "bad", day: "2026-02-30", focusSeconds: 60 }),
    /valid session date/
  );
});

test("summarizes bounded trends against the previous matching period", () => {
  const days = buildRangeDays(new Date(2026, 8, 8, 12), "week", "en-US");
  const rows = [
    { day: "2026-08-30", focusSeconds: 1800 },
    { day: "2026-09-05", focusSeconds: 3600 },
    { day: "2026-09-06", focusSeconds: 3600 },
    { day: "2026-09-07", focusSeconds: 1800 }
  ];
  assert.deepEqual(summarizeFocusTrends(rows, days, 3600, new Date(2026, 8, 8, 12)), {
    activeDays: 3,
    goalDays: 2,
    streakDays: 3,
    comparisonPercent: 400,
    previousTotalMinutes: 30
  });
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
