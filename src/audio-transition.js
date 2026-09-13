(function exposeInfiniteLofiAudioTransition(globalScope) {
  const DEFAULT_AUDIO_TRANSITIONS = Object.freeze({ enabled: false, durationMs: 200 });
  const MAX_AUDIO_TRANSITION_MS = 500;

  function clampUnit(value, fallback = 1) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(1, Math.max(0, numeric));
  }

  function normalizeAudioTransitions(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const duration = Number(source.durationMs);
    return {
      enabled: source.enabled === true,
      durationMs: Number.isFinite(duration)
        ? Math.min(MAX_AUDIO_TRANSITION_MS, Math.max(0, Math.round(duration)))
        : DEFAULT_AUDIO_TRANSITIONS.durationMs
    };
  }

  function createGainEnvelope(options = {}) {
    const {
      audio,
      now = () => globalScope.performance.now(),
      schedule = (callback) => globalScope.requestAnimationFrame(callback),
      cancelScheduled = (handle) => globalScope.cancelAnimationFrame(handle)
    } = options;
    let userVolume = clampUnit(options.userVolume, clampUnit(audio?.volume, 1));
    let transientGain = 1;
    let scheduledHandle = null;
    let activeResolve = null;
    let commandVersion = 0;

    function apply() {
      if (audio) audio.volume = clampUnit(userVolume * transientGain, 0);
    }

    function finishActive(completed) {
      if (!activeResolve) return;
      const resolve = activeResolve;
      activeResolve = null;
      resolve(completed);
    }

    function cancel(options = {}) {
      commandVersion += 1;
      if (scheduledHandle !== null) cancelScheduled(scheduledHandle);
      scheduledHandle = null;
      finishActive(false);
      if (Object.prototype.hasOwnProperty.call(options, "gain")) {
        transientGain = clampUnit(options.gain, transientGain);
        apply();
      }
      return transientGain;
    }

    function setUserVolume(value) {
      userVolume = clampUnit(value, userVolume);
      apply();
      return userVolume;
    }

    function setGain(value) {
      cancel({ gain: value });
      return transientGain;
    }

    function fadeTo(value, durationMs) {
      const target = clampUnit(value, transientGain);
      const duration = Math.min(MAX_AUDIO_TRANSITION_MS, Math.max(0, Number(durationMs) || 0));
      cancel();
      const version = commandVersion;
      const initial = transientGain;
      if (duration === 0 || initial === target) {
        transientGain = target;
        apply();
        return Promise.resolve(true);
      }
      const startedAt = now();
      return new Promise((resolve) => {
        activeResolve = resolve;
        const step = (timestamp) => {
          if (version !== commandVersion) return;
          const elapsed = Math.max(0, Number(timestamp) - startedAt);
          const progress = Math.min(1, elapsed / duration);
          transientGain = initial + (target - initial) * progress;
          apply();
          if (progress >= 1) {
            scheduledHandle = null;
            finishActive(true);
            return;
          }
          scheduledHandle = schedule(step);
        };
        scheduledHandle = schedule(step);
      });
    }

    apply();
    return {
      cancel,
      fadeTo,
      getState: () => ({
        userVolume,
        transientGain,
        effectiveVolume: clampUnit(userVolume * transientGain, 0),
        isActive: scheduledHandle !== null
      }),
      setGain,
      setUserVolume
    };
  }

  const api = {
    DEFAULT_AUDIO_TRANSITIONS,
    MAX_AUDIO_TRANSITION_MS,
    clampUnit,
    createGainEnvelope,
    normalizeAudioTransitions
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalScope) globalScope.InfiniteLofiAudioTransition = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
