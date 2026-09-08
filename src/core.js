(function exposeInfiniteLofiCore(globalScope) {
  const MAX_FOCUS_HISTORY_DAYS = 366;
  const MAX_FOCUS_SESSIONS = 5000;
  const MAX_TIMER_SECONDS = 6 * 60 * 60;
  const DEFAULT_TIMER_SETTINGS = Object.freeze({
    focusSeconds: 25 * 60,
    shortBreakSeconds: 5 * 60,
    longBreakSeconds: 15 * 60,
    focusSessionsPerLongBreak: 4,
    autoStartBreaks: true,
    autoStartFocus: true
  });

  function clamp(number, min, max) {
    return Math.min(Math.max(number, min), max);
  }

  function formatTime(totalSeconds) {
    const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, "0");
    const seconds = (safeSeconds % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  }

  function getLocalDayKey(date) {
    const value = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(value.getTime())) {
      throw new TypeError("A valid date is required");
    }

    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function isValidLocalDayKey(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day, 12);
    return !Number.isNaN(date.getTime()) && getLocalDayKey(date) === value;
  }

  function remainingSecondsUntil(deadlineMs, nowMs = Date.now()) {
    const deadline = Number(deadlineMs);
    const now = Number(nowMs);
    if (!Number.isFinite(deadline) || !Number.isFinite(now)) {
      return 0;
    }
    return Math.max(0, Math.ceil((deadline - now) / 1000));
  }

  function normalizeMinutes(inputValue, fallbackSeconds) {
    const fallbackMinutes = Math.max(1, Math.round((Number(fallbackSeconds) || 60) / 60));
    const maybe = Number(inputValue);
    if (!Number.isFinite(maybe)) {
      return fallbackMinutes;
    }
    return clamp(Math.round(maybe), 1, 360);
  }

  function normalizeTimerSettings(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const shortBreakValue = source.shortBreakSeconds ?? source.breakSeconds;
    const normalizeDuration = (value, fallback) =>
      clamp(Number(value) || fallback, 60, MAX_TIMER_SECONDS);
    const normalizeBoolean = (value, fallback) =>
      typeof value === "boolean" ? value : fallback;

    return {
      focusSeconds: normalizeDuration(source.focusSeconds, DEFAULT_TIMER_SETTINGS.focusSeconds),
      shortBreakSeconds: normalizeDuration(
        shortBreakValue,
        DEFAULT_TIMER_SETTINGS.shortBreakSeconds
      ),
      longBreakSeconds: normalizeDuration(
        source.longBreakSeconds,
        DEFAULT_TIMER_SETTINGS.longBreakSeconds
      ),
      focusSessionsPerLongBreak: clamp(
        Math.round(Number(source.focusSessionsPerLongBreak) || DEFAULT_TIMER_SETTINGS.focusSessionsPerLongBreak),
        1,
        12
      ),
      autoStartBreaks: normalizeBoolean(
        source.autoStartBreaks,
        DEFAULT_TIMER_SETTINGS.autoStartBreaks
      ),
      autoStartFocus: normalizeBoolean(
        source.autoStartFocus,
        DEFAULT_TIMER_SETTINGS.autoStartFocus
      )
    };
  }

  function normalizeDailyGoalSeconds(value) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return 0;
    }
    return clamp(Math.round(seconds), 15 * 60, 12 * 60 * 60);
  }

  function normalizeVolume(volume, fallback = 0.68) {
    const value = Number(volume);
    if (!Number.isFinite(value)) {
      return clamp(Number(fallback) || 0.68, 0, 1);
    }
    return clamp(value, 0, 1);
  }

  function sanitizeNoteFiles(rawList, now = Date.now()) {
    if (!Array.isArray(rawList)) {
      return [];
    }

    const files = [];
    rawList.forEach((item, index) => {
      if (!item || typeof item !== "object") {
        return;
      }

      const id = typeof item.id === "string" && item.id.trim() ? item.id.trim() : `note-import-${index}`;
      const name = typeof item.name === "string" && item.name.trim() ? item.name.trim().slice(0, 40) : `Note ${index + 1}`;
      const content = typeof item.content === "string" ? item.content : "";
      const updatedAt = Number(item.updatedAt);
      files.push({
        id,
        name,
        content,
        pinned: item.pinned === true,
        updatedAt: Number.isFinite(updatedAt) ? updatedAt : now
      });
    });

    return files;
  }

  function aggregateFocusRows(rows) {
    const totals = new Map();
    if (Array.isArray(rows)) {
      rows.forEach((row) => {
        if (!row || !isValidLocalDayKey(row.day)) {
          return;
        }
        const seconds = Number(row.focusSeconds);
        if (!Number.isFinite(seconds) || seconds < 0) {
          return;
        }
        totals.set(row.day, (totals.get(row.day) || 0) + seconds);
      });
    }

    return Array.from(totals.entries())
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([day, focusSeconds]) => ({ day, focusSeconds }));
  }

  function normalizeFocusSessions(rawSessions, fallbackRows, now = Date.now()) {
    const hasSessionLedger = Array.isArray(rawSessions);
    const source = hasSessionLedger
      ? rawSessions
      : aggregateFocusRows(fallbackRows).map((row, index) => ({
          id: `focus-migrated-${row.day}-${index}`,
          day: row.day,
          focusSeconds: row.focusSeconds,
          completedAt: "",
          source: "migrated"
        }));
    const seenIds = new Set();
    const sessions = [];

    source.forEach((item, index) => {
      if (!item || typeof item !== "object" || !isValidLocalDayKey(item.day)) return;
      const seconds = Math.round(Number(item.focusSeconds));
      if (!Number.isSafeInteger(seconds) || seconds <= 0) return;
      const requestedId = typeof item.id === "string" ? item.id.trim().slice(0, 128) : "";
      let id = requestedId || `focus-${item.day}-${now}-${index}`;
      while (seenIds.has(id)) id = `${id}-${index}`;
      seenIds.add(id);
      const completedAt = typeof item.completedAt === "string" && !Number.isNaN(Date.parse(item.completedAt))
        ? item.completedAt.slice(0, 64)
        : "";
      const sourceType = ["timer", "manual", "migrated"].includes(item.source)
        ? item.source
        : hasSessionLedger
        ? "manual"
        : "migrated";
      sessions.push({ id, day: item.day, focusSeconds: seconds, completedAt, source: sourceType });
    });

    sessions.sort((left, right) =>
      left.day.localeCompare(right.day) ||
      left.completedAt.localeCompare(right.completedAt) ||
      left.id.localeCompare(right.id)
    );
    const retainedDays = new Set(
      [...new Set(sessions.map((session) => session.day))]
        .sort()
        .slice(-MAX_FOCUS_HISTORY_DAYS)
    );
    return sessions
      .filter((session) => retainedDays.has(session.day))
      .slice(-MAX_FOCUS_SESSIONS);
  }

  const api = {
    DEFAULT_TIMER_SETTINGS,
    MAX_FOCUS_HISTORY_DAYS,
    MAX_FOCUS_SESSIONS,
    MAX_TIMER_SECONDS,
    aggregateFocusRows,
    clamp,
    formatTime,
    getLocalDayKey,
    isValidLocalDayKey,
    normalizeDailyGoalSeconds,
    normalizeMinutes,
    normalizeFocusSessions,
    normalizeTimerSettings,
    normalizeVolume,
    remainingSecondsUntil,
    sanitizeNoteFiles
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (globalScope) {
    globalScope.InfiniteLofiCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
