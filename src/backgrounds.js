(function exposeInfiniteLofiBackgrounds(globalScope) {
  const DEFAULTS = {
    mode: "black",
    customImageUrl: "",
    customImageName: "",
    customVideoUrl: "",
    customVideoName: ""
  };

  function normalizeBackgroundSettings(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const mode = ["black", "white", "image", "video", "cover"].includes(source.mode)
      ? source.mode
      : DEFAULTS.mode;
    return {
      mode,
      customImageUrl: typeof source.customImageUrl === "string" ? source.customImageUrl : "",
      customImageName: typeof source.customImageName === "string" ? source.customImageName : "",
      customVideoUrl: typeof source.customVideoUrl === "string" ? source.customVideoUrl : "",
      customVideoName: typeof source.customVideoName === "string" ? source.customVideoName : ""
    };
  }

  function buildRenderKey(background, showcaseModeEnabled = false) {
    const normalized = normalizeBackgroundSettings(background);
    return [
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

  const api = { DEFAULTS, buildRenderKey, normalizeBackgroundSettings, resolveEffectiveBackground };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (globalScope) {
    globalScope.InfiniteLofiBackgrounds = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
