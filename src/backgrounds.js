(function exposeInfiniteLofiBackgrounds(globalScope) {
  const CURATED_PRESETS = Object.freeze({
    "quiet-studio": Object.freeze({
      id: "quiet-studio",
      label: "Quiet Studio",
      mode: "black",
      themeClass: "",
      backgroundColor: "#000000",
      previewBackground: "radial-gradient(circle at 78% 12%, #3b2b19, transparent 38%), linear-gradient(145deg, #191816, #080807)"
    }),
    midnight: Object.freeze({
      id: "midnight",
      label: "Midnight",
      mode: "black",
      themeClass: "theme-midnight",
      backgroundColor: "#07111d",
      previewBackground: "radial-gradient(circle at 76% 10%, #194766, transparent 38%), linear-gradient(145deg, #101c2a, #050a11)"
    }),
    moss: Object.freeze({
      id: "moss",
      label: "Moss",
      mode: "black",
      themeClass: "theme-moss",
      backgroundColor: "#0b1510",
      previewBackground: "radial-gradient(circle at 76% 10%, #36573f, transparent 38%), linear-gradient(145deg, #17251c, #070c09)"
    }),
    paper: Object.freeze({
      id: "paper",
      label: "Paper",
      mode: "white",
      themeClass: "bg-white-background",
      backgroundColor: "#f3efe7",
      previewBackground: "radial-gradient(circle at 76% 10%, #fffdf7, transparent 38%), linear-gradient(145deg, #f8f4ec, #ddd3c3)"
    })
  });

  const DEFAULTS = {
    presetId: "quiet-studio",
    mode: "black",
    customImageUrl: "",
    customImageName: "",
    customVideoUrl: "",
    customVideoName: ""
  };

  function inferPresetId(mode) {
    if (mode === "white") return "paper";
    if (mode === "black") return DEFAULTS.presetId;
    return "custom";
  }

  function normalizeBackgroundSettings(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const mode = ["black", "white", "image", "video", "cover"].includes(source.mode)
      ? source.mode
      : DEFAULTS.mode;
    const requestedPreset = typeof source.presetId === "string" ? source.presetId : "";
    const curatedPreset = CURATED_PRESETS[requestedPreset];
    const presetId = curatedPreset && curatedPreset.mode === mode
      ? requestedPreset
      : requestedPreset === "custom" && ["image", "video", "cover"].includes(mode)
        ? "custom"
        : inferPresetId(mode);
    return {
      presetId,
      mode,
      customImageUrl: typeof source.customImageUrl === "string" ? source.customImageUrl : "",
      customImageName: typeof source.customImageName === "string" ? source.customImageName : "",
      customVideoUrl: typeof source.customVideoUrl === "string" ? source.customVideoUrl : "",
      customVideoName: typeof source.customVideoName === "string" ? source.customVideoName : ""
    };
  }

  function applyCuratedPreset(background, presetId) {
    const normalized = normalizeBackgroundSettings(background);
    const preset = CURATED_PRESETS[presetId] || CURATED_PRESETS[DEFAULTS.presetId];
    return {
      ...normalized,
      presetId: preset.id,
      mode: preset.mode
    };
  }

  function applyBackgroundSource(background, mode) {
    const normalized = normalizeBackgroundSettings(background);
    if (!["image", "video", "cover"].includes(mode)) return normalized;
    return { ...normalized, presetId: "custom", mode };
  }

  function getCuratedPreset(presetId) {
    return CURATED_PRESETS[presetId] || null;
  }

  function buildRenderKey(background, showcaseModeEnabled = false) {
    const normalized = normalizeBackgroundSettings(background);
    return [
      normalized.presetId,
      normalized.mode,
      normalized.customImageUrl,
      normalized.customVideoUrl,
      showcaseModeEnabled ? "showcase" : "normal"
    ].join("|");
  }

  function resolveEffectiveBackground(background, trackArtwork) {
    const normalized = normalizeBackgroundSettings(background);
    if (normalized.mode !== "cover") {
      return { ...normalized, fromTrackArtwork: false };
    }
    if (trackArtwork && typeof trackArtwork.url === "string" && trackArtwork.url) {
      return {
        ...normalized,
        mode: "image",
        customImageUrl: trackArtwork.url,
        customImageName: trackArtwork.name || "Track Cover",
        fromTrackArtwork: true
      };
    }
    return { ...normalized, mode: "black", fromTrackArtwork: false };
  }

  const api = {
    CURATED_PRESETS,
    DEFAULTS,
    applyBackgroundSource,
    applyCuratedPreset,
    buildRenderKey,
    getCuratedPreset,
    normalizeBackgroundSettings,
    resolveEffectiveBackground
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (globalScope) {
    globalScope.InfiniteLofiBackgrounds = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
