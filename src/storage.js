(function exposeInfiniteLofiStorage(globalScope) {
  const core =
    typeof module !== "undefined" && module.exports
      ? require("./core")
      : globalScope.InfiniteLofiCore;

  if (!core) {
    throw new Error("Infinite Lo-Fi core helpers are required by storage");
  }

  const CURRENT_SCHEMA_VERSION = 1;
  const STORAGE_KEY = "infiniteLofiState";
  const RECOVERY_KEY = "infiniteLofiStateRecovery";
  const BACKUP_FORMAT = "infinite-lofi-backup";
  const DEFAULT_FOCUS_SECONDS = 25 * 60;
  const DEFAULT_BREAK_SECONDS = 5 * 60;
  const MAX_TIMER_SECONDS = 6 * 60 * 60;
  const LEGACY_KEYS = {
    notes: "infiniteLofiNotes",
    noteFiles: "infiniteLofiNoteFiles",
    activeNoteId: "infiniteLofiActiveNoteId",
    timerSettings: "infiniteLofiTimerSettings",
    focusStats: "infiniteLofiFocusStats",
    statsRange: "infiniteLofiStatsRange",
    uiSettings: "infiniteLofiUiSettings"
  };

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function parseJson(raw, fallback = null) {
    if (typeof raw !== "string" || !raw.trim()) {
      return fallback;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeString(value, maxLength = 4096) {
    return typeof value === "string" ? value.slice(0, maxLength) : "";
  }

  function normalizeStringList(value, maxItems = 1000) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .filter((item) => typeof item === "string" && item.length > 0)
      .slice(0, maxItems)
      .map((item) => item.slice(0, 8192));
  }

  function createDefaultState(now = Date.now()) {
    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      updatedAt: now,
      settings: {
        timer: {
          focusSeconds: DEFAULT_FOCUS_SECONDS,
          breakSeconds: DEFAULT_BREAK_SECONDS
        },
        ui: {},
        statsRange: "week"
      },
      notes: {
        files: [],
        activeId: ""
      },
      stats: {
        focusRows: []
      },
      player: {
        folderPath: "",
        trackOrder: [],
        activeTrackSrc: ""
      },
      timerRuntime: {
        phase: "focus",
        remainingSeconds: DEFAULT_FOCUS_SECONDS,
        deadlineMs: null,
        isRunning: false
      }
    };
  }

  function normalizeState(raw, now = Date.now()) {
    const defaults = createDefaultState(now);
    const source = isObject(raw) ? raw : {};
    const settings = isObject(source.settings) ? source.settings : {};
    const timerSettings = isObject(settings.timer) ? settings.timer : {};
    const focusSeconds = core.clamp(
      Number(timerSettings.focusSeconds) || DEFAULT_FOCUS_SECONDS,
      60,
      MAX_TIMER_SECONDS
    );
    const breakSeconds = core.clamp(
      Number(timerSettings.breakSeconds) || DEFAULT_BREAK_SECONDS,
      60,
      MAX_TIMER_SECONDS
    );

    const notesSource = isObject(source.notes) ? source.notes : {};
    const files = core.sanitizeNoteFiles(notesSource.files, now);
    const requestedActiveId = normalizeString(notesSource.activeId, 256);
    const activeId = files.some((file) => file.id === requestedActiveId)
      ? requestedActiveId
      : files[0]?.id || "";

    const statsSource = isObject(source.stats) ? source.stats : {};
    const playerSource = isObject(source.player) ? source.player : {};
    const runtimeSource = isObject(source.timerRuntime) ? source.timerRuntime : {};
    const runtimePhase = runtimeSource.phase === "break" ? "break" : "focus";
    const runtimeDefault = runtimePhase === "focus" ? focusSeconds : breakSeconds;
    const runtimeRemaining = core.clamp(
      Number.isFinite(Number(runtimeSource.remainingSeconds))
        ? Math.round(Number(runtimeSource.remainingSeconds))
        : runtimeDefault,
      0,
      MAX_TIMER_SECONDS
    );
    const deadline = Number(runtimeSource.deadlineMs);
    const hasDeadline = Number.isFinite(deadline) && deadline > 0;

    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      updatedAt: Number.isFinite(Number(source.updatedAt)) ? Number(source.updatedAt) : now,
      settings: {
        timer: { focusSeconds, breakSeconds },
        ui: isObject(settings.ui) ? clone(settings.ui) : {},
        statsRange: ["today", "week", "month"].includes(settings.statsRange)
          ? settings.statsRange
          : defaults.settings.statsRange
      },
      notes: { files, activeId },
      stats: {
        focusRows: core.aggregateFocusRows(statsSource.focusRows).slice(-core.MAX_FOCUS_HISTORY_DAYS)
      },
      player: {
        folderPath: normalizeString(playerSource.folderPath, 8192),
        trackOrder: normalizeStringList(playerSource.trackOrder),
        activeTrackSrc: normalizeString(playerSource.activeTrackSrc, 8192)
      },
      timerRuntime: {
        phase: runtimePhase,
        remainingSeconds: runtimeRemaining,
        deadlineMs: hasDeadline ? deadline : null,
        isRunning: runtimeSource.isRunning === true && hasDeadline
      }
    };
  }

  function readLegacyState(storage, now = Date.now()) {
    const state = createDefaultState(now);
    const timerSettings = parseJson(storage.getItem(LEGACY_KEYS.timerSettings), {});
    const uiSettings = parseJson(storage.getItem(LEGACY_KEYS.uiSettings), {});
    const noteFiles = parseJson(storage.getItem(LEGACY_KEYS.noteFiles), []);
    const focusRows = parseJson(storage.getItem(LEGACY_KEYS.focusStats), []);
    const legacyNotes = storage.getItem(LEGACY_KEYS.notes) || "";
    const storedRange = storage.getItem(LEGACY_KEYS.statsRange);

    state.settings.timer = isObject(timerSettings) ? timerSettings : state.settings.timer;
    state.settings.ui = isObject(uiSettings) ? uiSettings : {};
    state.settings.statsRange = ["today", "week", "month"].includes(storedRange)
      ? storedRange
      : "week";
    state.notes.files = Array.isArray(noteFiles) ? noteFiles : [];
    if (state.notes.files.length === 0 && legacyNotes) {
      state.notes.files = [
        {
          id: `note-migrated-${now}`,
          name: "Note 1",
          content: legacyNotes,
          pinned: false,
          updatedAt: now
        }
      ];
    }
    state.notes.activeId = storage.getItem(LEGACY_KEYS.activeNoteId) || "";
    state.stats.focusRows = Array.isArray(focusRows) ? focusRows : [];
    return normalizeState(state, now);
  }

  function migrateStoredState(storage, now = Date.now()) {
    const stored = parseJson(storage.getItem(STORAGE_KEY), null);
    if (isObject(stored)) {
      const storedVersion = Number(stored.schemaVersion) || 1;
      if (storedVersion > CURRENT_SCHEMA_VERSION) {
        throw new Error(
          `Stored schema version ${stored.schemaVersion} is newer than this app supports.`
        );
      }
      return normalizeState(stored, now);
    }
    return readLegacyState(storage, now);
  }

  function normalizeRecoveryNotice(raw) {
    if (!isObject(raw) || typeof raw.rawState !== "string") {
      return null;
    }
    return {
      detectedAt: normalizeString(raw.detectedAt, 64),
      message: normalizeString(raw.message, 500) || "Stored app data could not be read.",
      rawState: raw.rawState
    };
  }

  function preserveCorruptedState(storage, notice) {
    const serialized = JSON.stringify(notice);
    try {
      storage.setItem(RECOVERY_KEY, serialized);
      return;
    } catch (initialError) {
      if (typeof storage.removeItem !== "function") {
        throw initialError;
      }

      const originalState = storage.getItem(STORAGE_KEY);
      storage.removeItem(STORAGE_KEY);
      try {
        storage.setItem(RECOVERY_KEY, serialized);
      } catch (recoveryError) {
        if (originalState !== null) {
          storage.setItem(STORAGE_KEY, originalState);
        }
        throw recoveryError;
      }
    }
  }

  function createBackup(state, exportedAt = new Date().toISOString()) {
    const normalized = normalizeState(state);
    return {
      format: BACKUP_FORMAT,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      exportedAt,
      state: normalized
    };
  }

  function importBackup(input, now = Date.now()) {
    const payload = typeof input === "string" ? parseJson(input, null) : input;
    if (!isObject(payload)) {
      throw new Error("Backup is not valid JSON.");
    }

    if (payload.format === BACKUP_FORMAT && isObject(payload.state)) {
      const version = Number(payload.schemaVersion);
      if (!Number.isInteger(version) || version < 1 || version > CURRENT_SCHEMA_VERSION) {
        throw new Error(`Backup schema version ${payload.schemaVersion} is not supported.`);
      }
      return normalizeState(payload.state, now);
    }

    const isLegacyBackup =
      Array.isArray(payload.focusStats) ||
      isObject(payload.timerSettings) ||
      Array.isArray(payload.noteFiles) ||
      typeof payload.notes === "string";
    if (!isLegacyBackup) {
      throw new Error("This file is not an Infinite Lo-Fi backup.");
    }

    const migrated = createDefaultState(now);
    migrated.settings.timer = isObject(payload.timerSettings)
      ? payload.timerSettings
      : migrated.settings.timer;
    migrated.notes.files = Array.isArray(payload.noteFiles) ? payload.noteFiles : [];
    if (migrated.notes.files.length === 0 && typeof payload.notes === "string") {
      migrated.notes.files = [
        {
          id: `note-import-${now}`,
          name: "Note 1",
          content: payload.notes,
          pinned: false,
          updatedAt: now
        }
      ];
    }
    migrated.notes.activeId = normalizeString(payload.activeNoteId, 256);
    migrated.stats.focusRows = Array.isArray(payload.focusStats) ? payload.focusStats : [];
    return normalizeState(migrated, now);
  }

  function createRepository(storage, nowProvider = () => Date.now()) {
    if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
      throw new TypeError("A Web Storage-compatible object is required");
    }

    let recoveryNotice = normalizeRecoveryNotice(
      parseJson(storage.getItem(RECOVERY_KEY), null)
    );
    const storedRaw = storage.getItem(STORAGE_KEY);
    let state;

    try {
      if (storedRaw !== null && !isObject(parseJson(storedRaw, null))) {
        throw new Error("Stored app data contains invalid JSON.");
      }
      state = migrateStoredState(storage, nowProvider());
    } catch (error) {
      recoveryNotice = {
        detectedAt: new Date(nowProvider()).toISOString(),
        message: error instanceof Error ? error.message : "Stored app data could not be read.",
        rawState: storedRaw || ""
      };
      preserveCorruptedState(storage, recoveryNotice);
      state = readLegacyState(storage, nowProvider());
    }

    function persist() {
      state.updatedAt = nowProvider();
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    persist();

    return {
      getState() {
        return clone(state);
      },
      getRecoveryNotice() {
        return recoveryNotice ? clone(recoveryNotice) : null;
      },
      dismissRecoveryNotice() {
        recoveryNotice = null;
        if (typeof storage.removeItem === "function") {
          storage.removeItem(RECOVERY_KEY);
        }
      },
      update(mutator) {
        const draft = clone(state);
        mutator(draft);
        state = normalizeState(draft, nowProvider());
        persist();
        return clone(state);
      },
      exportBackup(exportedAt) {
        return createBackup(state, exportedAt);
      },
      importBackup(input) {
        state = importBackup(input, nowProvider());
        persist();
        return clone(state);
      }
    };
  }

  const api = {
    BACKUP_FORMAT,
    CURRENT_SCHEMA_VERSION,
    LEGACY_KEYS,
    RECOVERY_KEY,
    STORAGE_KEY,
    createBackup,
    createDefaultState,
    createRepository,
    importBackup,
    migrateStoredState,
    normalizeState
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (globalScope) {
    globalScope.InfiniteLofiStorage = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
