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
    const mode = ["black", "white", "image", "video"].includes(source.mode)
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

  const api = { DEFAULTS, buildRenderKey, normalizeBackgroundSettings };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (globalScope) {
    globalScope.InfiniteLofiBackgrounds = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
