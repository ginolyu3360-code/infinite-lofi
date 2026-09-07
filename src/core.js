(function exposeInfiniteLofiCore(globalScope) {
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
        if (!row || typeof row.day !== "string" || !row.day.trim()) {
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

  const api = {
    aggregateFocusRows,
    clamp,
    formatTime,
    getLocalDayKey,
    normalizeMinutes,
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
