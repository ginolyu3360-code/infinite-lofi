(function exposeInfiniteLofiFocusSession(globalScope) {
  const core =
    typeof module !== "undefined" && module.exports
      ? require("./core")
      : globalScope.InfiniteLofiCore;
  const stats =
    typeof module !== "undefined" && module.exports
      ? require("./stats")
      : globalScope.InfiniteLofiStats;

  if (!core || !stats) {
    throw new Error("Infinite Lo-Fi core and stats helpers are required by focus-session persistence");
  }

  function commitFocusCompletion(repository, options = {}) {
    if (!repository || typeof repository.update !== "function") {
      throw new TypeError("A state repository is required.");
    }
    const snapshot = options.focusSession;
    if (!snapshot || typeof snapshot.id !== "string" || !snapshot.id.trim()) {
      throw new Error("A stable focus session snapshot is required.");
    }
    const completedAt = new Date(options.completedAtMs);
    if (Number.isNaN(completedAt.getTime())) throw new Error("Focus completion time is invalid.");
    if (typeof options.createNextRuntime !== "function") {
      throw new TypeError("A next-runtime factory is required.");
    }

    return repository.update((state) => {
      state.stats.focusSessions = stats.recordFocusSession(
        state.stats.focusSessions,
        core.getLocalDayKey(completedAt),
        options.focusSeconds,
        {
          id: snapshot.id,
          completedAt,
          source: "timer",
          taskId: snapshot.taskId,
          taskTitle: snapshot.taskTitle
        }
      );
      state.timerRuntime = options.createNextRuntime(state);
    });
  }

  const api = { commitFocusCompletion };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalScope) globalScope.InfiniteLofiFocusSession = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
