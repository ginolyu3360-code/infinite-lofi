(function exposeInfiniteLofiTimer(globalScope) {
  const core =
    typeof module !== "undefined" && module.exports
      ? require("./core")
      : globalScope.InfiniteLofiCore;

  if (!core) {
    throw new Error("Infinite Lo-Fi core helpers are required by timer");
  }

  function normalizePhase(phase) {
    if (phase === "longBreak") return "longBreak";
    if (phase === "shortBreak" || phase === "break") return "shortBreak";
    return "focus";
  }

  function getPhaseDuration(phase, settings) {
    const normalized = core.normalizeTimerSettings(settings);
    const normalizedPhase = normalizePhase(phase);
    if (normalizedPhase === "longBreak") return normalized.longBreakSeconds;
    if (normalizedPhase === "shortBreak") return normalized.shortBreakSeconds;
    return normalized.focusSeconds;
  }

  function normalizeCycleCount(value, settings, phase) {
    if (normalizePhase(phase) === "longBreak") return 0;
    return core.clamp(
      Math.round(Number(value) || 0),
      0,
      core.normalizeTimerSettings(settings).focusSessionsPerLongBreak - 1
    );
  }

  function advanceTimerPhase(runtime, settings) {
    const normalizedSettings = core.normalizeTimerSettings(settings);
    const phase = normalizePhase(runtime?.phase);
    const completedFocusesInCycle = normalizeCycleCount(
      runtime?.completedFocusesInCycle,
      normalizedSettings,
      phase
    );

    if (phase === "focus") {
      const nextCompleted = completedFocusesInCycle + 1;
      const isLongBreak = nextCompleted >= normalizedSettings.focusSessionsPerLongBreak;
      return {
        phase: isLongBreak ? "longBreak" : "shortBreak",
        completedFocusesInCycle: isLongBreak ? 0 : nextCompleted,
        completedFocus: true,
        shouldAutoStart: normalizedSettings.autoStartBreaks
      };
    }

    return {
      phase: "focus",
      completedFocusesInCycle,
      completedFocus: false,
      shouldAutoStart: normalizedSettings.autoStartFocus
    };
  }

  function createRuntimeSnapshot(
    { phase, completedFocusesInCycle, remainingSeconds, deadlineMs, isRunning },
    settings
  ) {
    const normalizedDeadline = Number(deadlineMs);
    const normalizedPhase = normalizePhase(phase);
    return {
      phase: normalizedPhase,
      completedFocusesInCycle: normalizeCycleCount(
        completedFocusesInCycle,
        settings,
        normalizedPhase
      ),
      remainingSeconds: core.clamp(
        Math.round(Number(remainingSeconds) || 0),
        0,
        core.MAX_TIMER_SECONDS
      ),
      deadlineMs:
        isRunning && Number.isFinite(normalizedDeadline) && normalizedDeadline > 0
          ? normalizedDeadline
          : null,
      isRunning:
        isRunning === true && Number.isFinite(normalizedDeadline) && normalizedDeadline > 0
    };
  }

  function resolveRestoredRuntime(runtime, settings, nowMs = Date.now()) {
    const safeSettings = core.normalizeTimerSettings(settings);
    const phase = normalizePhase(runtime?.phase);
    const completedFocusesInCycle = normalizeCycleCount(
      runtime?.completedFocusesInCycle,
      safeSettings,
      phase
    );
    const savedRemaining = core.clamp(
      Number.isFinite(Number(runtime?.remainingSeconds))
        ? Math.round(Number(runtime.remainingSeconds))
        : getPhaseDuration(phase, safeSettings),
      0,
      core.MAX_TIMER_SECONDS
    );
    const deadlineMs = Number(runtime?.deadlineMs);
    const canResume = runtime?.isRunning === true && Number.isFinite(deadlineMs) && deadlineMs > 0;

    if (!canResume) {
      return {
        phase,
        completedFocusesInCycle,
        remainingSeconds: savedRemaining > 0 ? savedRemaining : getPhaseDuration(phase, safeSettings),
        deadlineMs: null,
        isRunning: false,
        completedFocusDuringAbsence: false,
        completedFocusAtMs: null
      };
    }

    const remainingSeconds = core.remainingSecondsUntil(deadlineMs, nowMs);
    if (remainingSeconds > 0) {
      return {
        phase,
        completedFocusesInCycle,
        remainingSeconds,
        deadlineMs,
        isRunning: true,
        completedFocusDuringAbsence: false,
        completedFocusAtMs: null
      };
    }

    const transition = advanceTimerPhase(
      { phase, completedFocusesInCycle },
      safeSettings
    );
    return {
      phase: transition.phase,
      completedFocusesInCycle: transition.completedFocusesInCycle,
      remainingSeconds: getPhaseDuration(transition.phase, safeSettings),
      deadlineMs: null,
      isRunning: false,
      completedFocusDuringAbsence: transition.completedFocus,
      completedFocusAtMs: transition.completedFocus ? deadlineMs : null
    };
  }

  const api = {
    advanceTimerPhase,
    createRuntimeSnapshot,
    getPhaseDuration,
    normalizePhase,
    resolveRestoredRuntime
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (globalScope) {
    globalScope.InfiniteLofiTimer = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
