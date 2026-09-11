(function exposeInfiniteLofiStorage(globalScope) {
  const core =
    typeof module !== "undefined" && module.exports
      ? require("./core")
      : globalScope.InfiniteLofiCore;
  const tasks =
    typeof module !== "undefined" && module.exports
      ? require("./tasks")
      : globalScope.InfiniteLofiTasks;

  if (!core || !tasks) {
    throw new Error("Infinite Lo-Fi core and task helpers are required by storage");
  }

  const CURRENT_SCHEMA_VERSION = 5;
  const STORAGE_KEY = "infiniteLofiState";
  const RECOVERY_KEY = "infiniteLofiStateRecovery";
  const BACKUP_FORMAT = "infinite-lofi-backup";
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

  function createStableId(prefix) {
    if (globalScope?.crypto?.randomUUID) return `${prefix}-${globalScope.crypto.randomUUID()}`;
    if (typeof require === "function") {
      try {
        return `${prefix}-${require("node:crypto").randomUUID()}`;
      } catch {}
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

  function fileNameFromPath(value) {
    if (typeof value !== "string" || !value) return "";
    let decoded = value;
    try {
      decoded = decodeURIComponent(value.replace(/^file:\/\//, ""));
    } catch {}
    return decoded.split(/[\\/]/).pop() || "";
  }

  function labelFromFileName(value) {
    const fileName = fileNameFromPath(value);
    const dotIndex = fileName.lastIndexOf(".");
    return (dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName) || "Untitled track";
  }

  function builtInKeyFromLegacy(value) {
    const match = fileNameFromPath(value).match(/^track-(\d+)\.wav$/i);
    return match ? `builtin:track-${match[1]}` : value;
  }

  function normalizePlayerQueue(value) {
    if (!Array.isArray(value)) return [];
    const result = [];
    const included = new Set();
    for (const entry of value) {
      if (result.length >= 1000) break;
      if (!isObject(entry)) continue;
      const key = normalizeString(entry.key, 8192);
      if (!key || included.has(key)) continue;
      included.add(key);
      result.push({
        key,
        label: normalizeString(entry.label, 512).trim() || "Untitled track",
        relativePath: normalizeString(entry.relativePath, 2048),
        isLocal: entry.isLocal === true
      });
    }
    return result;
  }

  function migrateLegacyPlayer(playerSource) {
    const folderPath = normalizeString(playerSource.folderPath, 8192);
    const isLocal = Boolean(folderPath);
    const trackOrder = normalizeStringList(playerSource.trackOrder);
    const queue = trackOrder.map((legacyKey) => {
      const relativePath = isLocal ? fileNameFromPath(legacyKey) : "";
      return {
        key: isLocal ? `local:${relativePath}` : builtInKeyFromLegacy(legacyKey),
        label: labelFromFileName(legacyKey),
        relativePath,
        isLocal
      };
    }).filter((entry) => entry.key !== "local:");
    const activeLegacyKey = normalizeString(playerSource.activeTrackSrc, 8192);
    const activeRelativePath = isLocal ? fileNameFromPath(activeLegacyKey) : "";
    return {
      folderPath,
      queue,
      activeTrackKey: isLocal && activeRelativePath
        ? `local:${activeRelativePath}`
        : builtInKeyFromLegacy(activeLegacyKey)
    };
  }

  function createDefaultState(now = Date.now()) {
    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      updatedAt: now,
      settings: {
        timer: { ...core.DEFAULT_TIMER_SETTINGS },
        goals: {
          dailyFocusSeconds: 0
        },
        ui: {},
        statsRange: "week"
      },
      notes: {
        files: [],
        activeId: ""
      },
      tasks: {
        items: [],
        selectedTaskId: null
      },
      stats: {
        focusSessions: [],
        focusRows: []
      },
      player: {
        folderPath: "",
        queue: [],
        activeTrackKey: ""
      },
      timerRuntime: {
        phase: "focus",
        completedFocusesInCycle: 0,
        remainingSeconds: core.DEFAULT_TIMER_SETTINGS.focusSeconds,
        deadlineMs: null,
        isRunning: false,
        focusSession: null
      }
    };
  }

  function normalizeState(raw, now = Date.now()) {
    const defaults = createDefaultState(now);
    const source = isObject(raw) ? raw : {};
    const settings = isObject(source.settings) ? source.settings : {};
    const requestedVersion = Number(source.schemaVersion);
    if (
      Object.prototype.hasOwnProperty.call(source, "schemaVersion") &&
      (!Number.isInteger(requestedVersion) || requestedVersion < 1 || requestedVersion > CURRENT_SCHEMA_VERSION)
    ) {
      throw new Error(`State schema version ${source.schemaVersion} is not supported.`);
    }
    const sourceVersion = Number.isInteger(requestedVersion) ? requestedVersion : 1;
    const timerSettings = core.normalizeTimerSettings(settings.timer);
    const goalSettings = isObject(settings.goals) ? settings.goals : {};

    const notesSource = isObject(source.notes) ? source.notes : {};
    const files = core.sanitizeNoteFiles(notesSource.files, now);
    const requestedActiveId = normalizeString(notesSource.activeId, 256);
    const activeId = files.some((file) => file.id === requestedActiveId)
      ? requestedActiveId
      : files[0]?.id || "";

    const statsSource = isObject(source.stats) ? source.stats : {};
    const playerSource = isObject(source.player) ? source.player : {};
    const normalizedPlayer = sourceVersion >= 4
      ? {
          folderPath: normalizeString(playerSource.folderPath, 8192),
          queue: normalizePlayerQueue(playerSource.queue),
          activeTrackKey: normalizeString(playerSource.activeTrackKey, 8192)
        }
      : migrateLegacyPlayer(playerSource);
    const runtimeSource = isObject(source.timerRuntime) ? source.timerRuntime : {};
    const runtimePhase = runtimeSource.phase === "longBreak"
      ? "longBreak"
      : runtimeSource.phase === "shortBreak" || runtimeSource.phase === "break"
      ? "shortBreak"
      : "focus";
    const runtimeDefault = runtimePhase === "focus"
      ? timerSettings.focusSeconds
      : runtimePhase === "longBreak"
      ? timerSettings.longBreakSeconds
      : timerSettings.shortBreakSeconds;
    let runtimeRemaining = core.clamp(
      Number.isFinite(Number(runtimeSource.remainingSeconds))
        ? Math.round(Number(runtimeSource.remainingSeconds))
        : runtimeDefault,
      0,
      core.MAX_TIMER_SECONDS
    );
    const deadline = Number(runtimeSource.deadlineMs);
    let hasDeadline = Number.isFinite(deadline) && deadline > 0;
    const normalizedTasks = sourceVersion >= 5
      ? tasks.normalizeTasksState(source.tasks, { strict: true })
      : { items: [], selectedTaskId: null };
    const hasStartedLegacyFocus = runtimePhase === "focus" && (
      runtimeSource.isRunning === true || runtimeRemaining < runtimeDefault
    );
    let focusSession = null;
    if (sourceVersion >= 5) {
      if (runtimePhase !== "focus" && runtimeSource.focusSession !== null && runtimeSource.focusSession !== undefined) {
        throw new Error("Break timer cannot contain a focus-session context.");
      }
      focusSession = runtimePhase === "focus"
        ? tasks.normalizeTaskSnapshot(runtimeSource.focusSession, { strict: true })
        : null;
      if (runtimePhase === "focus" && runtimeSource.isRunning === true && !focusSession) {
        throw new Error("Started focus timer is missing its stable session context.");
      }
      if (runtimePhase === "focus" && !focusSession) {
        runtimeRemaining = runtimeDefault;
        hasDeadline = false;
      }
    } else if (hasStartedLegacyFocus) {
      focusSession = {
        id: createStableId("focus"),
        taskId: null,
        taskTitle: ""
      };
    }

    const focusSessions = core.normalizeFocusSessions(
      sourceVersion >= 3 ? statsSource.focusSessions : undefined,
      statsSource.focusRows,
      now
    );

    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      updatedAt: Number.isFinite(Number(source.updatedAt)) ? Number(source.updatedAt) : now,
      settings: {
        timer: timerSettings,
        goals: {
          dailyFocusSeconds: core.normalizeDailyGoalSeconds(goalSettings.dailyFocusSeconds)
        },
        ui: isObject(settings.ui) ? clone(settings.ui) : {},
        statsRange: ["today", "week", "month"].includes(settings.statsRange)
          ? settings.statsRange
          : defaults.settings.statsRange
      },
      notes: { files, activeId },
      tasks: normalizedTasks,
      stats: {
        focusSessions,
        focusRows: core.aggregateFocusRows(focusSessions).slice(-core.MAX_FOCUS_HISTORY_DAYS)
      },
      player: normalizedPlayer,
      timerRuntime: {
        phase: runtimePhase,
        completedFocusesInCycle: runtimePhase === "longBreak"
          ? 0
          : core.clamp(
              Math.round(Number(runtimeSource.completedFocusesInCycle) || 0),
              0,
              timerSettings.focusSessionsPerLongBreak - 1
            ),
        remainingSeconds: runtimeRemaining,
        deadlineMs: hasDeadline ? deadline : null,
        isRunning: runtimeSource.isRunning === true && hasDeadline,
        focusSession
      }
    };
  }

  function readLegacyState(storage, now = Date.now()) {
    const state = createDefaultState(now);
    state.schemaVersion = 1;
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
      const innerVersion = Number(payload.state.schemaVersion);
      if (!Number.isInteger(innerVersion) || innerVersion !== version) {
        throw new Error("Backup wrapper and state schema versions do not match.");
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
    migrated.schemaVersion = 1;
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

    function persist(candidate) {
      candidate.updatedAt = nowProvider();
      storage.setItem(STORAGE_KEY, JSON.stringify(candidate));
    }

    persist(state);

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
        const candidate = normalizeState(draft, nowProvider());
        persist(candidate);
        state = candidate;
        return clone(state);
      },
      exportBackup(exportedAt) {
        return createBackup(state, exportedAt);
      },
      importBackup(input) {
        const candidate = importBackup(input, nowProvider());
        persist(candidate);
        state = candidate;
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
