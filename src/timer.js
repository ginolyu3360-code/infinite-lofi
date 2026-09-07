(function exposeInfiniteLofiTimer(globalScope) {
  const core =
    typeof module !== "undefined" && module.exports
      ? require("./core")
      : globalScope.InfiniteLofiCore;

  if (!core) {
    throw new Error("Infinite Lo-Fi core helpers are required by timer");
  }

  const MAX_TIMER_SECONDS = 6 * 60 * 60;

  function getPhaseDuration(phase, settings) {
    return phase === "break" ? settings.breakSeconds : settings.focusSeconds;
  }

  function createRuntimeSnapshot({ phase, remainingSeconds, deadlineMs, isRunning }) {
    const normalizedDeadline = Number(deadlineMs);
    return {
      phase: phase === "break" ? "break" : "focus",
      remainingSeconds: core.clamp(Math.round(Number(remainingSeconds) || 0), 0, MAX_TIMER_SECONDS),
      deadlineMs:
        isRunning && Number.isFinite(normalizedDeadline) && normalizedDeadline > 0
          ? normalizedDeadline
          : null,
      isRunning:
        isRunning === true && Number.isFinite(normalizedDeadline) && normalizedDeadline > 0
    };
  }

  function resolveRestoredRuntime(runtime, settings, nowMs = Date.now()) {
    const safeSettings = {
      focusSeconds: core.clamp(Number(settings?.focusSeconds) || 25 * 60, 60, MAX_TIMER_SECONDS),
      breakSeconds: core.clamp(Number(settings?.breakSeconds) || 5 * 60, 60, MAX_TIMER_SECONDS)
    };
    const phase = runtime?.phase === "break" ? "break" : "focus";
    const savedRemaining = core.clamp(
      Number.isFinite(Number(runtime?.remainingSeconds))
        ? Math.round(Number(runtime.remainingSeconds))
        : getPhaseDuration(phase, safeSettings),
      0,
      MAX_TIMER_SECONDS
    );
    const deadlineMs = Number(runtime?.deadlineMs);
    const canResume = runtime?.isRunning === true && Number.isFinite(deadlineMs) && deadlineMs > 0;

    if (!canResume) {
      return {
        phase,
        remainingSeconds: savedRemaining > 0 ? savedRemaining : getPhaseDuration(phase, safeSettings),
        deadlineMs: null,
        isRunning: false,
        completedFocusDuringAbsence: false
      };
    }

    const remainingSeconds = core.remainingSecondsUntil(deadlineMs, nowMs);
    if (remainingSeconds > 0) {
      return {
        phase,
        remainingSeconds,
        deadlineMs,
        isRunning: true,
        completedFocusDuringAbsence: false
      };
    }

    const nextPhase = phase === "focus" ? "break" : "focus";
    return {
      phase: nextPhase,
      remainingSeconds: getPhaseDuration(nextPhase, safeSettings),
      deadlineMs: null,
      isRunning: false,
      completedFocusDuringAbsence: phase === "focus"
    };
  }

  const api = { createRuntimeSnapshot, getPhaseDuration, resolveRestoredRuntime };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (globalScope) {
    globalScope.InfiniteLofiTimer = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
