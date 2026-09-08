const test = require("node:test");
const assert = require("node:assert/strict");

const {
  MAX_FOCUS_HISTORY_DAYS,
  MAX_FOCUS_SESSIONS,
  aggregateFocusRows,
  formatTime,
  getLocalDayKey,
  normalizeDailyGoalSeconds,
  normalizeFocusSessions,
  normalizeMinutes,
  normalizeTimerSettings,
  normalizeVolume,
  remainingSecondsUntil,
  sanitizeNoteFiles
} = require("../src/core");

test("formats countdown values", () => {
  assert.equal(formatTime(0), "00:00");
  assert.equal(formatTime(65), "01:05");
  assert.equal(formatTime(6 * 60 * 60), "360:00");
});

test("uses the local calendar day instead of the UTC day", () => {
  const previousTimeZone = process.env.TZ;
  process.env.TZ = "Asia/Hong_Kong";
  try {
    const shortlyAfterLocalMidnight = new Date("2026-09-06T16:30:00.000Z");
    assert.equal(getLocalDayKey(shortlyAfterLocalMidnight), "2026-09-07");
  } finally {
    if (previousTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimeZone;
  }
});

test("derives countdown time from an absolute deadline", () => {
  assert.equal(remainingSecondsUntil(10_000, 1_000), 9);
  assert.equal(remainingSecondsUntil(10_000, 1_001), 9);
  assert.equal(remainingSecondsUntil(10_000, 10_000), 0);
  assert.equal(remainingSecondsUntil(10_000, 12_000), 0);
});

test("normalizes timer settings", () => {
  assert.equal(normalizeMinutes("30", 1_500), 30);
  assert.equal(normalizeMinutes(0, 1_500), 1);
  assert.equal(normalizeMinutes(999, 1_500), 360);
  assert.equal(normalizeMinutes("invalid", 1_500), 25);
  assert.deepEqual(normalizeTimerSettings({
    focusSeconds: -20,
    breakSeconds: 600,
    longBreakSeconds: 999999,
    focusSessionsPerLongBreak: 99,
    autoStartBreaks: false
  }), {
    focusSeconds: 60,
    shortBreakSeconds: 600,
    longBreakSeconds: 21600,
    focusSessionsPerLongBreak: 12,
    autoStartBreaks: false,
    autoStartFocus: true
  });
  assert.equal(normalizeDailyGoalSeconds(0), 0);
  assert.equal(normalizeDailyGoalSeconds(60), 900);
  assert.equal(normalizeDailyGoalSeconds(999999), 43200);
});

test("preserves an intentional zero volume", () => {
  assert.equal(normalizeVolume(0), 0);
  assert.equal(normalizeVolume(0.5), 0.5);
  assert.equal(normalizeVolume(3), 1);
  assert.equal(normalizeVolume("invalid"), 0.68);
});

test("sanitizes imported note files", () => {
  const notes = sanitizeNoteFiles([
    null,
    { id: " note-1 ", name: "  Focus  ", content: "Hello", pinned: true, updatedAt: 10 },
    { content: 42 }
  ], 99);

  assert.deepEqual(notes, [
    { id: "note-1", name: "Focus", content: "Hello", pinned: true, updatedAt: 10 },
    { id: "note-import-2", name: "Note 3", content: "", pinned: false, updatedAt: 99 }
  ]);
});

test("aggregates duplicate valid focus rows", () => {
  assert.deepEqual(aggregateFocusRows([
    { day: "2026-09-07", focusSeconds: 600 },
    { day: "2026-09-06", focusSeconds: 300 },
    { day: "2026-09-07", focusSeconds: "120" },
    { day: "", focusSeconds: 10 },
    { day: "2026-02-30", focusSeconds: 10 },
    { day: "2026-09-08", focusSeconds: -1 }
  ]), [
    { day: "2026-09-06", focusSeconds: 300 },
    { day: "2026-09-07", focusSeconds: 720 }
  ]);
});

test("bounds and sanitizes the per-session focus ledger", () => {
  const start = new Date(2025, 0, 1, 12);
  const datedSessions = Array.from({ length: MAX_FOCUS_HISTORY_DAYS + 1 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      id: `dated-${index}`,
      day: getLocalDayKey(date),
      focusSeconds: 60,
      source: "timer"
    };
  });
  const retainedDays = normalizeFocusSessions(datedSessions, [], 1000);
  assert.equal(retainedDays.length, MAX_FOCUS_HISTORY_DAYS);
  assert.equal(retainedDays[0].id, "dated-1");

  const manySessions = Array.from({ length: MAX_FOCUS_SESSIONS + 1 }, (_, index) => ({
    id: `same-day-${String(index).padStart(5, "0")}`,
    day: "2026-09-08",
    focusSeconds: 60
  }));
  assert.equal(normalizeFocusSessions(manySessions, [], 1000).length, MAX_FOCUS_SESSIONS);
  assert.deepEqual(normalizeFocusSessions(undefined, [
    { day: "2026-09-08", focusSeconds: 600 },
    { day: "2026-09-08", focusSeconds: 300 }
  ], 1000), [{
    id: "focus-migrated-2026-09-08-0",
    day: "2026-09-08",
    focusSeconds: 900,
    completedAt: "",
    source: "migrated"
  }]);
});
