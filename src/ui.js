(function exposeInfiniteLofiUi(globalScope) {
  function normalizeToggleSettings(raw, defaults) {
    const normalized = { ...(defaults || {}) };
    if (!raw || typeof raw !== "object") {
      return normalized;
    }
    for (const key of Object.keys(normalized)) {
      if (typeof raw[key] === "boolean") {
        normalized[key] = raw[key];
      }
    }
    return normalized;
  }

  const api = { normalizeToggleSettings };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (globalScope) {
    globalScope.InfiniteLofiUi = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
