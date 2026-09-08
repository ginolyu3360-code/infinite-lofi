(function exposeInfiniteLofiStats(globalScope) {
  const core =
    typeof module !== "undefined" && module.exports
      ? require("./core")
      : globalScope.InfiniteLofiCore;

  if (!core) {
    throw new Error("Infinite Lo-Fi core helpers are required by stats");
  }

  function buildRangeDays(now = new Date(), mode = "week", locale) {
    const start = new Date(now);
    if (Number.isNaN(start.getTime())) {
      throw new TypeError("A valid date is required");
    }
    start.setHours(0, 0, 0, 0);
    const rangeDays = mode === "today" ? 1 : mode === "month" ? 30 : 7;
    const days = [];

    for (let index = rangeDays - 1; index >= 0; index -= 1) {
      const date = new Date(start);
      date.setDate(start.getDate() - index);
      days.push({
        key: core.getLocalDayKey(date),
        label: rangeDays === 1 ? "Today" : String(date.getDate()),
        fullLabel: date.toLocaleDateString(locale, {
          weekday: "short",
          month: "short",
          day: "numeric"
        })
      });
    }
    return days;
  }

  function summarizeFocusRows(rows, days) {
    const totals = new Map(
      core.aggregateFocusRows(rows).map((row) => [row.day, row.focusSeconds])
    );
    const values = days.map((day) => totals.get(day.key) || 0);
    const totalMinutes = Math.round(values.reduce((sum, value) => sum + value, 0) / 60);
    return {
      totals,
      values,
      maxSeconds: Math.max(...values, 60),
      totalMinutes,
      averageMinutes: Math.round(totalMinutes / Math.max(days.length, 1)),
      peakMinutes: Math.round(Math.max(...values, 0) / 60)
    };
  }

  function recordFocusSession(rows, day, focusSeconds) {
    const seconds = Number(focusSeconds);
    if (typeof day !== "string" || !day.trim() || !Number.isFinite(seconds) || seconds <= 0) {
      return core.aggregateFocusRows(rows).slice(-core.MAX_FOCUS_HISTORY_DAYS);
    }
    return core
      .aggregateFocusRows([...(Array.isArray(rows) ? rows : []), { day, focusSeconds: seconds }])
      .slice(-core.MAX_FOCUS_HISTORY_DAYS);
  }

  function summarizeDailyGoal(rows, day, goalSeconds) {
    const totals = new Map(
      core.aggregateFocusRows(rows).map((row) => [row.day, row.focusSeconds])
    );
    const focusSeconds = totals.get(day) || 0;
    const normalizedGoal = core.normalizeDailyGoalSeconds(goalSeconds);
    return {
      focusSeconds,
      goalSeconds: normalizedGoal,
      isEnabled: normalizedGoal > 0,
      isComplete: normalizedGoal > 0 && focusSeconds >= normalizedGoal,
      progress: normalizedGoal > 0 ? core.clamp(focusSeconds / normalizedGoal, 0, 1) : 0
    };
  }

  const api = { buildRangeDays, recordFocusSession, summarizeDailyGoal, summarizeFocusRows };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (globalScope) {
    globalScope.InfiniteLofiStats = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
