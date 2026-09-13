(function exposeInfiniteLofiAmbienceController(globalScope) {
  const ambienceModel = typeof module !== "undefined" && module.exports
    ? require("./ambience")
    : globalScope.InfiniteLofiAmbience;

  function createAmbienceController(options = {}) {
    const {
      appStorage,
      elements,
      sounds = ambienceModel.AMBIENCE_SOUNDS,
      onError = () => {},
      announce = () => {},
      t = (key) => key
    } = options;
    const { audio, soundSelect, toggleButton, volumeSlider, status } = elements;
    let settings = ambienceModel.normalizeAmbienceSettings(appStorage.getState().player?.ambience);
    let commandVersion = 0;
    let destroyed = false;
    let loadedSoundId = null;
    const unavailableSoundIds = new Set();

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
        audio.volume = settings.volume;
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
      ensureSource(sound);
      audio.volume = settings.volume;
      try {
        await audio.play();
        if (destroyed || version !== commandVersion || settings.soundId !== sound.id) {
          const expected = new URL(sound.src, elements.document.baseURI).href;
          if (loadedSoundId === sound.id && audio.src === expected) stopElement();
          return false;
        }
        render();
        announce(t("ambience.started", { sound: t(sound.labelKey) }));
        return true;
      } catch (error) {
        if (version === commandVersion) markUnavailable(sound.id, error);
        return false;
      }
    }

    function pause({ resetTime = false } = {}) {
      commandVersion += 1;
      stopElement({ resetTime });
      render();
      return true;
    }

    function stop() {
      return pause({ resetTime: true });
    }

    function toggle() {
      if (isPlaying()) {
        pause();
        announce(t("ambience.paused"));
        return Promise.resolve(false);
      }
      return play();
    }

    function markUnavailable(soundId, error) {
      if (!soundId) return;
      commandVersion += 1;
      unavailableSoundIds.add(soundId);
      stopElement({ resetTime: true, clearSource: true });
      render();
      onError(error instanceof Error ? error : new Error(`Ambience sound ${soundId} is unavailable.`));
    }

    async function setSound(soundId) {
      const nextSoundId = sounds.some((sound) => sound.id === soundId) ? soundId : null;
      const previousSettings = settings;
      const shouldResume = isPlaying();
      commandVersion += 1;
      stopElement({ resetTime: true, clearSource: true });
      try {
        persist({ ...settings, soundId: nextSoundId });
      } catch (error) {
        settings = previousSettings;
        render();
        onError(error);
        return false;
      }
      render();
      if (shouldResume && nextSoundId) return play();
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
      audio.volume = settings.volume;
      render();
      return true;
    }

    function restore() {
      commandVersion += 1;
      stopElement({ resetTime: true, clearSource: true });
      settings = ambienceModel.normalizeAmbienceSettings(appStorage.getState().player?.ambience);
      audio.loop = true;
      audio.volume = settings.volume;
      render();
    }

    function refreshLanguage() {
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
      stop,
      toggle
    };
  }

  const api = { createAmbienceController };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalScope) globalScope.InfiniteLofiAmbienceController = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
