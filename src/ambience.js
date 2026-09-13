(function exposeInfiniteLofiAmbience(globalScope) {
  const DEFAULT_AMBIENCE_SETTINGS = Object.freeze({ soundId: null, volume: 0.35 });
  const AMBIENCE_SOUNDS = Object.freeze([
    Object.freeze({
      id: "soft-rain",
      labelKey: "ambience.softRain",
      src: "../assets/ambience/soft-rain.wav",
      author: "Infinite Lo-Fi contributors",
      license: "MIT"
    }),
    Object.freeze({
      id: "quiet-cafe",
      labelKey: "ambience.quietCafe",
      src: "../assets/ambience/quiet-cafe.wav",
      author: "Infinite Lo-Fi contributors",
      license: "MIT"
    }),
    Object.freeze({
      id: "brown-noise",
      labelKey: "ambience.brownNoise",
      src: "../assets/ambience/brown-noise.wav",
      author: "Infinite Lo-Fi contributors",
      license: "MIT"
    })
  ]);
  const SOUND_IDS = new Set(AMBIENCE_SOUNDS.map((sound) => sound.id));

  function normalizeVolume(value, fallback = DEFAULT_AMBIENCE_SETTINGS.volume) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(1, Math.max(0, numeric));
  }

  function normalizeAmbienceSettings(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return {
      soundId: SOUND_IDS.has(source.soundId) ? source.soundId : null,
      volume: normalizeVolume(source.volume)
    };
  }

  function getAmbienceSound(soundId) {
    return AMBIENCE_SOUNDS.find((sound) => sound.id === soundId) || null;
  }

  const api = {
    AMBIENCE_SOUNDS,
    DEFAULT_AMBIENCE_SETTINGS,
    getAmbienceSound,
    normalizeAmbienceSettings,
    normalizeVolume
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalScope) globalScope.InfiniteLofiAmbience = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
