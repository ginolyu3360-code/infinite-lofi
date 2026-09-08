const test = require("node:test");
const assert = require("node:assert/strict");

const {
  BACKUP_FORMAT,
  CURRENT_SCHEMA_VERSION,
  RECOVERY_KEY,
  STORAGE_KEY,
  createRepository,
  importBackup,
  migrateStoredState
} = require("../src/storage");

function createMemoryStorage(initial = {}) {
  const entries = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return entries.has(key) ? entries.get(key) : null;
    },
    setItem(key, value) {
      entries.set(key, String(value));
    },
    removeItem(key) {
      entries.delete(key);
    }
  };
}

test("migrates legacy local storage without losing notes or stats", () => {
  const storage = createMemoryStorage({
    infiniteLofiNotes: "legacy draft",
    infiniteLofiTimerSettings: JSON.stringify({ focusSeconds: 1800, breakSeconds: 600 }),
    infiniteLofiFocusStats: JSON.stringify([
      { day: "2026-09-07", focusSeconds: 600 },
      { day: "2026-09-07", focusSeconds: 120 }
    ]),
    infiniteLofiStatsRange: "month"
  });

  const repository = createRepository(storage, () => 1000);
  const state = repository.getState();

  assert.equal(state.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(state.notes.files[0].content, "legacy draft");
  assert.deepEqual(state.settings.timer, {
    focusSeconds: 1800,
    shortBreakSeconds: 600,
    longBreakSeconds: 900,
    focusSessionsPerLongBreak: 4,
    autoStartBreaks: true,
    autoStartFocus: true
  });
  assert.deepEqual(state.settings.goals, { dailyFocusSeconds: 0 });
  assert.equal(state.settings.statsRange, "month");
  assert.deepEqual(state.stats.focusRows, [
    { day: "2026-09-07", focusSeconds: 720 }
  ]);
  assert.deepEqual(state.stats.focusSessions, [{
    id: "focus-migrated-2026-09-07-0",
    day: "2026-09-07",
    focusSeconds: 720,
    completedAt: "",
    source: "migrated"
  }]);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).schemaVersion, CURRENT_SCHEMA_VERSION);
});

test("normalizes versioned state and rejects unsafe values", () => {
  const storage = createMemoryStorage({
    [STORAGE_KEY]: JSON.stringify({
      schemaVersion: 1,
      settings: {
        timer: { focusSeconds: -20, breakSeconds: 999999 },
        statsRange: "forever"
      },
      notes: { files: [{ id: "a", name: "A", content: "ok" }], activeId: "missing" },
      stats: { focusRows: [{ day: "2026-09-07", focusSeconds: -1 }] },
      player: { trackOrder: ["one", null, "two"] },
      timerRuntime: { phase: "unknown", remainingSeconds: 999999, isRunning: true }
    })
  });

  const state = migrateStoredState(storage, 2000);
  assert.deepEqual(state.settings.timer, {
    focusSeconds: 60,
    shortBreakSeconds: 21600,
    longBreakSeconds: 900,
    focusSessionsPerLongBreak: 4,
    autoStartBreaks: true,
    autoStartFocus: true
  });
  assert.equal(state.settings.statsRange, "week");
  assert.equal(state.notes.activeId, "a");
  assert.deepEqual(state.stats.focusRows, []);
  assert.deepEqual(state.player.queue, [
    { key: "one", label: "one", relativePath: "", isLocal: false },
    { key: "two", label: "two", relativePath: "", isLocal: false }
  ]);
  assert.equal(state.timerRuntime.isRunning, false);
});

test("bounds and sanitizes schema v4 playlist snapshots", () => {
  const queue = [null, { key: "", label: "ignored" }];
  for (let index = 0; index < 1005; index += 1) {
    queue.push({
      key: `local:${index}.mp3`,
      label: index === 0 ? "" : `Track ${index}`,
      relativePath: `${index}.mp3`,
      isLocal: true
    });
  }
  queue.push({ key: "local:0.mp3", label: "duplicate" });
  const storage = createMemoryStorage({
    [STORAGE_KEY]: JSON.stringify({
      schemaVersion: 4,
      player: { folderPath: "/Music", queue, activeTrackKey: 42 }
    })
  });

  const player = migrateStoredState(storage, 2500).player;
  assert.equal(player.queue.length, 1000);
  assert.equal(player.queue[0].label, "Untitled track");
  assert.equal(player.queue[0].key, "local:0.mp3");
  assert.equal(player.activeTrackKey, "");
});

test("exports and restores a complete versioned backup", () => {
  const storage = createMemoryStorage();
  const repository = createRepository(storage, () => 3000);
  repository.update((state) => {
    state.settings.goals.dailyFocusSeconds = 5400;
    state.stats.focusSessions = [{
      id: "focus-1",
      day: "2026-09-07",
      focusSeconds: 1800,
      completedAt: "2026-09-07T10:00:00.000Z",
      source: "timer"
    }];
    state.player.folderPath = "/Music/Focus";
    state.notes.files = [
      { id: "note-1", name: "Ideas", content: "Keep me", pinned: true, updatedAt: 10 }
    ];
    state.notes.activeId = "note-1";
  });

  const backup = repository.exportBackup("2026-09-07T00:00:00.000Z");
  assert.equal(backup.format, BACKUP_FORMAT);
  assert.equal(backup.schemaVersion, CURRENT_SCHEMA_VERSION);

  const restored = importBackup(JSON.stringify(backup), 4000);
  assert.equal(restored.player.folderPath, "/Music/Focus");
  assert.equal(restored.notes.files[0].content, "Keep me");
  assert.equal(restored.settings.goals.dailyFocusSeconds, 5400);
  assert.equal(restored.stats.focusSessions[0].id, "focus-1");
  assert.deepEqual(restored.stats.focusRows, [{ day: "2026-09-07", focusSeconds: 1800 }]);
});

test("imports old backups and rejects unrelated or newer files", () => {
  const oldBackup = {
    focusStats: [{ day: "2026-09-01", focusSeconds: 60 }],
    timerSettings: { focusSeconds: 1200, breakSeconds: 300 },
    notes: "old note"
  };
  const restored = importBackup(oldBackup, 5000);
  assert.equal(restored.notes.files[0].content, "old note");
  assert.equal(restored.settings.timer.focusSeconds, 1200);

  const versionOneBackup = {
    format: BACKUP_FORMAT,
    schemaVersion: 1,
    state: {
      schemaVersion: 1,
      settings: { timer: { focusSeconds: 2100, breakSeconds: 480 } },
      timerRuntime: {
        phase: "break",
        remainingSeconds: 120,
        deadlineMs: null,
        isRunning: false
      }
    }
  };
  const migratedVersionOne = importBackup(versionOneBackup, 5001);
  assert.equal(migratedVersionOne.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(migratedVersionOne.settings.timer.shortBreakSeconds, 480);
  assert.equal(migratedVersionOne.timerRuntime.phase, "shortBreak");
  assert.equal(migratedVersionOne.settings.goals.dailyFocusSeconds, 0);

  const versionTwoBackup = {
    format: BACKUP_FORMAT,
    schemaVersion: 2,
    state: {
      schemaVersion: 2,
      stats: {
        focusRows: [
          { day: "2026-09-07", focusSeconds: 1200 },
          { day: "2026-09-07", focusSeconds: 600 }
        ]
      }
    }
  };
  const migratedVersionTwo = importBackup(versionTwoBackup, 5002);
  assert.equal(migratedVersionTwo.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.deepEqual(migratedVersionTwo.stats.focusRows, [
    { day: "2026-09-07", focusSeconds: 1800 }
  ]);
  assert.equal(migratedVersionTwo.stats.focusSessions.length, 1);
  assert.equal(migratedVersionTwo.stats.focusSessions[0].source, "migrated");

  const versionThreeBackup = {
    format: BACKUP_FORMAT,
    schemaVersion: 3,
    state: {
      schemaVersion: 3,
      player: {
        folderPath: "/Old/Music",
        trackOrder: ["/Old/Music/two.mp3", "/Old/Music/one.mp3"],
        activeTrackSrc: "/Old/Music/two.mp3"
      }
    }
  };
  const migratedVersionThree = importBackup(versionThreeBackup, 5003);
  assert.deepEqual(migratedVersionThree.player, {
    folderPath: "/Old/Music",
    queue: [
      { key: "local:two.mp3", label: "two", relativePath: "two.mp3", isLocal: true },
      { key: "local:one.mp3", label: "one", relativePath: "one.mp3", isLocal: true }
    ],
    activeTrackKey: "local:two.mp3"
  });

  const migratedBuiltIns = importBackup({
    format: BACKUP_FORMAT,
    schemaVersion: 3,
    state: {
      schemaVersion: 3,
      player: {
        folderPath: "",
        trackOrder: ["../assets/track-03.wav", "../assets/track-01.wav"],
        activeTrackSrc: "../assets/track-03.wav"
      }
    }
  }, 5004);
  assert.deepEqual(migratedBuiltIns.player.queue.map((track) => track.key), [
    "builtin:track-03",
    "builtin:track-01"
  ]);
  assert.equal(migratedBuiltIns.player.activeTrackKey, "builtin:track-03");

  assert.throws(() => importBackup({ hello: "world" }), /not an Infinite Lo-Fi backup/);
  assert.throws(
    () =>
      importBackup({
        format: BACKUP_FORMAT,
        schemaVersion: CURRENT_SCHEMA_VERSION + 1,
        state: {}
      }),
    /not supported/
  );
});

test("preserves unreadable stored data and exposes a dismissible recovery notice", () => {
  const corrupted = '{"schemaVersion":1,"notes":';
  const storage = createMemoryStorage({ [STORAGE_KEY]: corrupted });
  const repository = createRepository(storage, () => 6000);

  const notice = repository.getRecoveryNotice();
  assert.match(notice.message, /invalid JSON/);
  assert.equal(notice.rawState, corrupted);
  assert.equal(JSON.parse(storage.getItem(RECOVERY_KEY)).rawState, corrupted);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).schemaVersion, CURRENT_SCHEMA_VERSION);

  repository.dismissRecoveryNotice();
  assert.equal(repository.getRecoveryNotice(), null);
  assert.equal(storage.getItem(RECOVERY_KEY), null);
});

test("restores documented settings and active state after repository recreation", () => {
  const storage = createMemoryStorage();
  const firstRun = createRepository(storage, () => 7000);
  firstRun.update((state) => {
    state.settings.statsRange = "month";
    state.settings.timer = {
      focusSeconds: 1800,
      shortBreakSeconds: 420,
      longBreakSeconds: 1200,
      focusSessionsPerLongBreak: 3,
      autoStartBreaks: false,
      autoStartFocus: true
    };
    state.settings.goals = { dailyFocusSeconds: 7200 };
    state.settings.ui = { volume: 0, brightness: 1.2 };
    state.player = {
      folderPath: "/Music/Focus",
      queue: [
        { key: "local:b.wav", label: "B", relativePath: "b.wav", isLocal: true },
        { key: "local:a.wav", label: "A", relativePath: "a.wav", isLocal: true }
      ],
      activeTrackKey: "local:b.wav"
    };
    state.timerRuntime = {
      phase: "shortBreak",
      completedFocusesInCycle: 2,
      remainingSeconds: 120,
      deadlineMs: 20_000,
      isRunning: true
    };
  });

  const relaunched = createRepository(storage, () => 8000).getState();
  assert.equal(relaunched.settings.statsRange, "month");
  assert.equal(relaunched.settings.timer.longBreakSeconds, 1200);
  assert.equal(relaunched.settings.timer.autoStartBreaks, false);
  assert.equal(relaunched.settings.goals.dailyFocusSeconds, 7200);
  assert.deepEqual(relaunched.settings.ui, { volume: 0, brightness: 1.2 });
  assert.deepEqual(relaunched.player.queue.map((track) => track.key), ["local:b.wav", "local:a.wav"]);
  assert.equal(relaunched.player.activeTrackKey, "local:b.wav");
  assert.equal(relaunched.timerRuntime.isRunning, true);
  assert.equal(relaunched.timerRuntime.deadlineMs, 20_000);
  assert.equal(relaunched.timerRuntime.phase, "shortBreak");
  assert.equal(relaunched.timerRuntime.completedFocusesInCycle, 2);
});
