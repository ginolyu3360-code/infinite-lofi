(function exposeInfiniteLofiAmbienceController(globalScope) {
  const ambienceModel = typeof module !== "undefined" && module.exports
    ? require("./ambience")
    : globalScope.InfiniteLofiAmbience;
  const audioTransition = typeof module !== "undefined" && module.exports
    ? require("./audio-transition")
    : globalScope.InfiniteLofiAudioTransition;

  function createAmbienceController(options = {}) {
    const {
      appStorage,
      elements,
      sounds = ambienceModel.AMBIENCE_SOUNDS,
      getAudioTransitionSettings = () => audioTransition.DEFAULT_AUDIO_TRANSITIONS,
      gainEnvelopeFactory = audioTransition.createGainEnvelope,
      onError = () => {},
      announce = () => {},
      t = (key) => key
    } = options;
    const { audio, soundSelect, toggleButton, volumeSlider, status } = elements;
    let settings = ambienceModel.normalizeAmbienceSettings(appStorage.getState().player?.ambience);
    let commandVersion = 0;
    let destroyed = false;
    let loadedSoundId = null;
    let desiredPlaying = false;
    const unavailableSoundIds = new Set();
    const ambientEnvelope = gainEnvelopeFactory({ audio, userVolume: settings.volume });

    function transitionSettings() {
      return audioTransition.normalizeAudioTransitions(getAudioTransitionSettings());
    }

    function selectedSound() {
      return sounds.find((sound) => sound.id === settings.soundId) || null;
    }

    function isPlaying() {
      const hasSource = typeof audio.hasAttribute === "function"
        ? audio.hasAttribute("src")
        : Boolean(audio.src);
      return hasSource && audio.paused === false;
    }

    function persist(nextSettings) {
      const normalized = ambienceModel.normalizeAmbienceSettings(nextSettings);
      const committed = appStorage.update((state) => {
        state.player = state.player && typeof state.player === "object" ? state.player : {};
        state.player.ambience = normalized;
      });
      settings = ambienceModel.normalizeAmbienceSettings(committed.player.ambience);
      return settings;
    }

    function stopElement({ resetTime = false, clearSource = false } = {}) {
      ambientEnvelope.cancel({ gain: 1 });
      audio.pause();
      if (resetTime) {
        try { audio.currentTime = 0; } catch {}
      }
      if (clearSource) {
        loadedSoundId = null;
        audio.removeAttribute?.("src");
        audio.load?.();
      }
    }

    function renderOptions() {
      const currentValue = settings.soundId || "";
      soundSelect.innerHTML = "";
      const offOption = elements.document.createElement("option");
      offOption.value = "";
      offOption.textContent = t("ambience.off");
      soundSelect.appendChild(offOption);
      sounds.forEach((sound) => {
        const option = elements.document.createElement("option");
        option.value = sound.id;
        option.textContent = unavailableSoundIds.has(sound.id)
          ? t("ambience.unavailableOption", { sound: t(sound.labelKey) })
          : t(sound.labelKey);
        option.disabled = unavailableSoundIds.has(sound.id);
        soundSelect.appendChild(option);
      });
      soundSelect.value = currentValue;
    }

    function render() {
      const sound = selectedSound();
      renderOptions();
      volumeSlider.value = String(Math.round(settings.volume * 100));
      toggleButton.disabled = !sound || unavailableSoundIds.has(sound.id);
      toggleButton.textContent = t(isPlaying() ? "ambience.pause" : "ambience.play");
      toggleButton.setAttribute("aria-pressed", String(isPlaying()));
      if (!sound) status.textContent = t("ambience.offStatus");
      else if (unavailableSoundIds.has(sound.id)) status.textContent = t("ambience.unavailable", { sound: t(sound.labelKey) });
      else status.textContent = t(isPlaying() ? "ambience.playing" : "ambience.ready", { sound: t(sound.labelKey) });
    }

    function ensureSource(sound) {
      const expected = new URL(sound.src, elements.document.baseURI).href;
      if (loadedSoundId !== sound.id || audio.src !== expected) {
        stopElement({ resetTime: true, clearSource: true });
        loadedSoundId = sound.id;
        audio.src = sound.src;
        audio.loop = true;
        audio.preload = "auto";
        ambientEnvelope.setUserVolume(settings.volume);
        audio.load?.();
      }
    }

    async function play() {
      const sound = selectedSound();
      if (!sound || unavailableSoundIds.has(sound.id) || destroyed) {
        render();
        return false;
      }
      const version = ++commandVersion;
      desiredPlaying = true;
      ensureSource(sound);
      const transitions = transitionSettings();
      ambientEnvelope.cancel({ gain: transitions.enabled ? 0 : 1 });
      try {
        await audio.play();
        if (destroyed || version !== commandVersion || !desiredPlaying || settings.soundId !== sound.id) {
          const expected = new URL(sound.src, elements.document.baseURI).href;
          if (loadedSoundId === sound.id && audio.src === expected) stopElement();
          return false;
        }
        if (transitions.enabled) {
          await ambientEnvelope.fadeTo(1, transitions.durationMs);
          if (destroyed || version !== commandVersion || !desiredPlaying || settings.soundId !== sound.id) return false;
        }
        render();
        announce(t("ambience.started", { sound: t(sound.labelKey) }));
        return true;
      } catch (error) {
        if (version === commandVersion) {
          desiredPlaying = false;
          markUnavailable(sound.id, error);
        }
        return false;
      }
    }

    async function pause({ resetTime = false, immediate = false } = {}) {
      const version = ++commandVersion;
      desiredPlaying = false;
      const transitions = transitionSettings();
      if (!immediate && transitions.enabled && isPlaying()) {
        await ambientEnvelope.fadeTo(0, transitions.durationMs);
        if (version !== commandVersion || desiredPlaying) return false;
      }
      stopElement({ resetTime });
      render();
      return true;
    }

    function stop() {
      commandVersion += 1;
      desiredPlaying = false;
      stopElement({ resetTime: true });
      render();
      return true;
    }

    function toggle() {
      if (desiredPlaying) {
        const result = pause();
        announce(t("ambience.paused"));
        return result;
      }
      return play();
    }

    function markUnavailable(soundId, error) {
      if (!soundId) return;
      commandVersion += 1;
      desiredPlaying = false;
      unavailableSoundIds.add(soundId);
      stopElement({ resetTime: true, clearSource: true });
      render();
      onError(error instanceof Error ? error : new Error(`Ambience sound ${soundId} is unavailable.`));
    }

    async function setSound(soundId) {
      const nextSoundId = sounds.some((sound) => sound.id === soundId) ? soundId : null;
      const previousSettings = settings;
      const shouldResume = desiredPlaying || isPlaying();
      const version = ++commandVersion;
      desiredPlaying = shouldResume;
      const transitions = transitionSettings();
      if (shouldResume && transitions.enabled && isPlaying()) {
        await ambientEnvelope.fadeTo(0, transitions.durationMs);
        if (version !== commandVersion) return false;
      }
      stopElement({ resetTime: true, clearSource: true });
      try {
        persist({ ...settings, soundId: nextSoundId });
      } catch (error) {
        settings = previousSettings;
        desiredPlaying = false;
        render();
        onError(error);
        return false;
      }
      render();
      desiredPlaying = shouldResume && Boolean(nextSoundId);
      if (desiredPlaying) return play();
      return true;
    }

    function setVolume(rawVolume) {
      const previousSettings = settings;
      const volume = ambienceModel.normalizeVolume(rawVolume, settings.volume);
      try {
        persist({ ...settings, volume });
      } catch (error) {
        settings = previousSettings;
        render();
        onError(error);
        return false;
      }
      ambientEnvelope.setUserVolume(settings.volume);
      render();
      return true;
    }

    function restore() {
      commandVersion += 1;
      desiredPlaying = false;
      stopElement({ resetTime: true, clearSource: true });
      settings = ambienceModel.normalizeAmbienceSettings(appStorage.getState().player?.ambience);
      audio.loop = true;
      ambientEnvelope.setUserVolume(settings.volume);
      render();
    }

    function refreshLanguage() {
      render();
    }

    function settleTransition() {
      commandVersion += 1;
      ambientEnvelope.cancel({ gain: 1 });
      if (!desiredPlaying) audio.pause();
      render();
    }

    function bindEvents() {
      soundSelect.addEventListener("change", () => setSound(soundSelect.value));
      toggleButton.addEventListener("click", toggle);
      volumeSlider.addEventListener("input", () => setVolume(Number(volumeSlider.value) / 100));
      audio.addEventListener("error", () => {
        if (loadedSoundId) markUnavailable(loadedSoundId, new Error("Ambient audio could not be decoded."));
      });
      audio.addEventListener("play", render);
      audio.addEventListener("pause", render);
    }

    function destroy() {
      destroyed = true;
      commandVersion += 1;
      desiredPlaying = false;
      stopElement({ resetTime: true, clearSource: true });
    }

    return {
      bindEvents,
      destroy,
      getSettings: () => ({ ...settings }),
      isPlaying,
      pause,
      play,
      refreshLanguage,
      restore,
      setSound,
      setVolume,
      settleTransition,
      stop,
      toggle
    };
  }

  const api = { createAmbienceController };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalScope) globalScope.InfiniteLofiAmbienceController = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
