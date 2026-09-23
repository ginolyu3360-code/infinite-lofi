(function exposeInfiniteLofiLocalMedia(globalScope) {
  const AUDIO_EXTENSIONS = Object.freeze([".mp3", ".wav", ".flac", ".aac", ".m4a", ".ogg"]);
  const NATIVE_VIDEO_EXTENSIONS = Object.freeze([".mp4", ".m4v", ".webm", ".mov", ".ogv"]);
  const PROXY_VIDEO_EXTENSIONS = Object.freeze([
    ".mkv", ".avi", ".wmv", ".flv", ".f4v", ".mpg", ".mpeg",
    ".ts", ".mts", ".m2ts", ".3gp", ".3g2"
  ]);
  const VIDEO_EXTENSIONS = Object.freeze([...NATIVE_VIDEO_EXTENSIONS, ...PROXY_VIDEO_EXTENSIONS]);
  const audioExtensions = new Set(AUDIO_EXTENSIONS);
  const nativeVideoExtensions = new Set(NATIVE_VIDEO_EXTENSIONS);
  const proxyVideoExtensions = new Set(PROXY_VIDEO_EXTENSIONS);
  const videoExtensions = new Set(VIDEO_EXTENSIONS);

  function extensionFromPath(value) {
    const clean = String(value || "").split(/[?#]/, 1)[0].replace(/\\/g, "/");
    const fileName = clean.split("/").pop() || "";
    const dotIndex = fileName.lastIndexOf(".");
    return dotIndex > 0 ? fileName.slice(dotIndex).toLowerCase() : "";
  }

  function inferMediaKind(value) {
    const extension = extensionFromPath(value);
    if (videoExtensions.has(extension)) return "video";
    if (audioExtensions.has(extension)) return "audio";
    return null;
  }

  function normalizeMediaKind(value, source = "") {
    if (value === "video" || value === "audio") return value;
    return inferMediaKind(source) || "audio";
  }

  function normalizeVideoDisplayMode(value) {
    return value === "background" ? "background" : "audio-only";
  }

  function getVideoPlaybackPolicy(value) {
    const extension = extensionFromPath(value);
    if (nativeVideoExtensions.has(extension)) return "native-first";
    if (proxyVideoExtensions.has(extension)) return "proxy-first";
    return null;
  }

  function isSupportedMediaFile(value) {
    return inferMediaKind(value) !== null;
  }

  function shouldShowVideoBackground(options = {}) {
    return options.sourceMode === "local" &&
      options.mediaKind === "video" &&
      options.videoDisplayMode === "background" &&
      options.hasPlaybackError !== true;
  }

  const api = {
    AUDIO_EXTENSIONS,
    NATIVE_VIDEO_EXTENSIONS,
    PROXY_VIDEO_EXTENSIONS,
    VIDEO_EXTENSIONS,
    extensionFromPath,
    getVideoPlaybackPolicy,
    inferMediaKind,
    isSupportedMediaFile,
    normalizeMediaKind,
    normalizeVideoDisplayMode,
    shouldShowVideoBackground
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalScope) globalScope.InfiniteLofiLocalMedia = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
