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

  const FOCUS_REVIEW_PAGE_SIZE = 8;

  function summarizeFocusReview(rawSessions, rawTasks, days, options = {}) {
    const sessions = options.normalized && Array.isArray(rawSessions)
      ? rawSessions
      : core.normalizeFocusSessions(rawSessions, []);
    const selectedDays = new Set(
      Array.isArray(days) ? days.map((day) => day?.key).filter(core.isValidLocalDayKey) : []
    );
    const previousDays = buildPreviousRangeDays(days);
    const previousDayKeys = new Set(previousDays.map((day) => day.key));
    const currentSessions = sessions.filter((session) => selectedDays.has(session.day));
    const previousSessions = sessions.filter((session) => previousDayKeys.has(session.day));
    const liveTasks = new Map(
      (Array.isArray(rawTasks) ? rawTasks : [])
        .filter((task) => task && typeof task.id === "string" && typeof task.title === "string")
        .map((task) => [task.id, task])
    );
    const identifiableGroups = new Map();
    const snapshotGroups = [];
    let unassignedSeconds = 0;
    let importedSeconds = 0;

    for (const session of currentSessions) {
      if (session.source === "migrated") importedSeconds += session.focusSeconds;
      if (session.taskId) {
        let group = identifiableGroups.get(session.taskId);
        if (!group) {
          group = {
            key: `task:${session.taskId}`,
            type: "task",
            taskId: session.taskId,
            seconds: 0,
            latestSnapshot: ""
          };
          identifiableGroups.set(session.taskId, group);
        }
        group.seconds += session.focusSeconds;
        if (session.taskTitle) group.latestSnapshot = session.taskTitle;
      } else if (session.taskTitle) {
        snapshotGroups.push({
          key: `snapshot:${session.id}`,
          type: "snapshot",
          taskId: null,
          title: session.taskTitle,
          seconds: session.focusSeconds
        });
      } else {
        unassignedSeconds += session.focusSeconds;
      }
    }

    const taskGroups = [...identifiableGroups.values()].map((group) => {
      const liveTask = liveTasks.get(group.taskId);
      return {
        key: group.key,
        type: "task",
        taskId: group.taskId,
        title: liveTask?.title || group.latestSnapshot,
        seconds: group.seconds,
        deleted: !liveTask,
        missingSnapshot: !liveTask && !group.latestSnapshot
      };
    });
    const groups = [...taskGroups, ...snapshotGroups];
    if (unassignedSeconds > 0) {
      groups.push({
        key: "unassigned",
        type: "unassigned",
        taskId: null,
        title: "",
        seconds: unassignedSeconds
      });
    }
    groups.sort((left, right) =>
      right.seconds - left.seconds ||
      left.type.localeCompare(right.type) ||
      left.key.localeCompare(right.key)
    );

    const totalSeconds = currentSessions.reduce((sum, session) => sum + session.focusSeconds, 0);
    const previousTotalSeconds = previousSessions.reduce((sum, session) => sum + session.focusSeconds, 0);
    const groupedSeconds = groups.reduce((sum, group) => sum + group.seconds, 0);
    const distinctRetainedDays = new Set(sessions.map((session) => session.day)).size;
    const retentionLimitReached =
      sessions.length >= core.MAX_FOCUS_SESSIONS ||
      distinctRetainedDays >= core.MAX_FOCUS_HISTORY_DAYS;
    const displayedTotalMinutes = Math.round(totalSeconds / 60);
    const displayedGroupMinutes = groups.reduce(
      (sum, group) => sum + Math.round(group.seconds / 60),
      0
    );

    return {
      groups,
      totalSeconds,
      groupedSeconds,
      activeDays: new Set(currentSessions.map((session) => session.day)).size,
      previousTotalSeconds,
      comparisonPercent: previousTotalSeconds > 0
        ? Math.round(((totalSeconds - previousTotalSeconds) / previousTotalSeconds) * 100)
        : null,
      displayedTotalMinutes,
      roundingDifferenceMinutes: displayedGroupMinutes - displayedTotalMinutes,
      importedSeconds,
      reconciles: groupedSeconds === totalSeconds,
      rangeStart: days?.[0]?.key || "",
      rangeEnd: days?.at?.(-1)?.key || "",
      previousRangeStart: previousDays[0]?.key || "",
      previousRangeEnd: previousDays.at(-1)?.key || "",
      retainedSessionCount: sessions.length,
      retainedDayCount: distinctRetainedDays,
      earliestRetainedDay: sessions[0]?.day || "",
      retentionLimitReached,
      comparisonMayBeIncomplete: retentionLimitReached
    };
  }

  function paginateFocusReview(groups, page, pageSize = FOCUS_REVIEW_PAGE_SIZE) {
    const items = Array.isArray(groups) ? groups : [];
    const normalizedSize = Math.max(1, Math.min(20, Math.round(Number(pageSize)) || FOCUS_REVIEW_PAGE_SIZE));
    const totalPages = Math.max(1, Math.ceil(items.length / normalizedSize));
    const currentPage = Math.max(1, Math.min(totalPages, Math.round(Number(page)) || 1));
    return {
      items: items.slice((currentPage - 1) * normalizedSize, currentPage * normalizedSize),
      page: currentPage,
      totalPages,
      totalItems: items.length
    };
  }

  function buildDailyCsv(rows, days) {
    const summary = summarizeFocusRows(rows, days);
    return [
      "day,focusMinutes",
      ...days.map((day) => `${day.key},${Math.round((summary.totals.get(day.key) || 0) / 60)}`)
    ].join("\n");
  }

  function recordFocusSession(rows, day, focusSeconds, options = {}) {
    const sessions = core.normalizeFocusSessions(rows, []);
    const seconds = Math.round(Number(focusSeconds));
    if (!core.isValidLocalDayKey(day) || !Number.isSafeInteger(seconds) || seconds <= 0) {
      return sessions;
    }
    const completedAt = options.completedAt instanceof Date && !Number.isNaN(options.completedAt.getTime())
      ? options.completedAt.toISOString()
      : typeof options.completedAt === "string" && !Number.isNaN(Date.parse(options.completedAt))
      ? options.completedAt
      : "";
    const id = typeof options.id === "string" && options.id.trim()
      ? options.id.trim().slice(0, 128)
      : `focus-timer-${completedAt || day}-${sessions.length}`;
    if (sessions.some((session) => session.id === id)) return sessions;
    return core.normalizeFocusSessions([
      ...sessions,
      {
        id,
        day,
        focusSeconds: seconds,
        completedAt,
        source: options.source || "timer",
        taskId: options.taskId ?? null,
        taskTitle: options.taskTitle || ""
      }
    ], []);
  }

  function upsertFocusSession(sessions, session) {
    if (!session || typeof session !== "object") throw new TypeError("A focus session is required");
    const id = typeof session.id === "string" ? session.id.trim().slice(0, 128) : "";
    const seconds = Math.round(Number(session.focusSeconds));
    if (!id || !core.isValidLocalDayKey(session.day)) throw new Error("Choose a valid session date.");
    if (!Number.isSafeInteger(seconds) || seconds < 60 || seconds > 12 * 60 * 60) {
      throw new Error("Session duration must be between 1 and 720 minutes.");
    }
    const normalized = core.normalizeFocusSessions(sessions, []);
    const existing = normalized.find((item) => item.id === id);
    return core.normalizeFocusSessions([
      ...normalized.filter((item) => item.id !== id),
      {
        id,
        day: session.day,
        focusSeconds: seconds,
        completedAt: existing?.completedAt || session.completedAt || "",
        source: existing?.source || session.source || "manual",
        taskId: existing?.taskId ?? session.taskId ?? null,
        taskTitle: existing?.taskTitle || session.taskTitle || ""
      }
    ], []);
  }

  function removeFocusSession(sessions, id) {
    return core.normalizeFocusSessions(sessions, []).filter((session) => session.id !== id);
  }

  function buildPreviousRangeDays(days, locale) {
    if (!Array.isArray(days) || days.length === 0 || !core.isValidLocalDayKey(days[0].key)) return [];
    const [year, month, day] = days[0].key.split("-").map(Number);
    const first = new Date(year, month - 1, day, 12);
    return days.map((_item, index) => {
      const date = new Date(first);
      date.setDate(first.getDate() - days.length + index);
      return {
        key: core.getLocalDayKey(date),
        label: String(date.getDate()),
        fullLabel: date.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" })
      };
    });
  }

  function summarizeFocusTrends(rows, days, goalSeconds, now = new Date()) {
    const summary = summarizeFocusRows(rows, days);
    const previous = summarizeFocusRows(rows, buildPreviousRangeDays(days));
    const normalizedGoal = core.normalizeDailyGoalSeconds(goalSeconds);
    const activeDays = summary.values.filter((value) => value > 0).length;
    const goalDays = normalizedGoal > 0
      ? summary.values.filter((value) => value >= normalizedGoal).length
      : 0;
    const totals = new Map(core.aggregateFocusRows(rows).map((row) => [row.day, row.focusSeconds]));
    const cursor = new Date(now);
    cursor.setHours(12, 0, 0, 0);
    if ((totals.get(core.getLocalDayKey(cursor)) || 0) <= 0) cursor.setDate(cursor.getDate() - 1);
    let streakDays = 0;
    while ((totals.get(core.getLocalDayKey(cursor)) || 0) > 0 && streakDays < core.MAX_FOCUS_HISTORY_DAYS) {
      streakDays += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    const currentSeconds = summary.values.reduce((sum, value) => sum + value, 0);
    const previousSeconds = previous.values.reduce((sum, value) => sum + value, 0);
    const comparisonPercent = previousSeconds > 0
      ? Math.round(((currentSeconds - previousSeconds) / previousSeconds) * 100)
      : null;
    return {
      activeDays,
      goalDays,
      streakDays,
      comparisonPercent,
      previousTotalMinutes: previous.totalMinutes
    };
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

  const api = {
    FOCUS_REVIEW_PAGE_SIZE,
    buildDailyCsv,
    buildPreviousRangeDays,
    buildRangeDays,
    paginateFocusReview,
    recordFocusSession,
    removeFocusSession,
    summarizeDailyGoal,
    summarizeFocusReview,
    summarizeFocusRows,
    summarizeFocusTrends,
    upsertFocusSession
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (globalScope) {
    globalScope.InfiniteLofiStats = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
