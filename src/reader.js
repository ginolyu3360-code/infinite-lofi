(function exposeInfiniteLofiReader(globalScope) {
  const DOCUMENT_EXTENSIONS = Object.freeze([
    ".txt", ".text", ".md", ".markdown", ".log", ".csv", ".json", ".yaml", ".yml"
  ]);
  const DOCUMENT_EXTENSION_SET = new Set(DOCUMENT_EXTENSIONS);
  const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
  const MAX_DOCUMENTS = 1000;
  const MAX_SCAN_DEPTH = 8;
  const MAX_SCROLL_ENTRIES = 100;

  function extensionFromPath(value) {
    const clean = String(value || "").replace(/\\/g, "/").split(/[?#]/, 1)[0];
    const name = clean.split("/").pop() || "";
    const dotIndex = name.lastIndexOf(".");
    return dotIndex > 0 ? name.slice(dotIndex).toLowerCase() : "";
  }

  function isSupportedDocument(value) {
    return DOCUMENT_EXTENSION_SET.has(extensionFromPath(value));
  }

  function documentFormat(value) {
    const extension = extensionFromPath(value);
    if (extension === ".md" || extension === ".markdown") return "markdown";
    if (extension === ".json") return "json";
    if ([".csv", ".log", ".yaml", ".yml"].includes(extension)) return "monospace";
    return "text";
  }

  function clamp(value, minimum, maximum, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
  }

  function normalizeReaderState(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const scrollSource = source.scrollPositions && typeof source.scrollPositions === "object"
      ? source.scrollPositions
      : {};
    const scrollPositions = {};
    for (const [key, rawRatio] of Object.entries(scrollSource).slice(-MAX_SCROLL_ENTRIES)) {
      if (typeof key !== "string" || !key || key.length > 8192) continue;
      scrollPositions[key] = clamp(rawRatio, 0, 1, 0);
    }
    return {
      folderPath: typeof source.folderPath === "string" ? source.folderPath.slice(0, 8192) : "",
      lastDocumentKey: typeof source.lastDocumentKey === "string" ? source.lastDocumentKey.slice(0, 8192) : "",
      fontScale: Math.round(clamp(source.fontScale, 80, 160, 100)),
      lineWidth: ["narrow", "medium", "wide"].includes(source.lineWidth) ? source.lineWidth : "medium",
      theme: ["auto", "paper", "dark"].includes(source.theme) ? source.theme : "auto",
      sidebarOpen: source.sidebarOpen !== false,
      scrollPositions
    };
  }

  function mergeDocumentSources(mediaDocuments, readerDocuments) {
    const seen = new Set();
    const merge = (documents, source) => (Array.isArray(documents) ? documents : [])
      .filter((document) => {
        const realPath = typeof document?.realPath === "string" ? document.realPath : "";
        const identity = realPath || `${source}:${document?.key || document?.relativePath || ""}`;
        if (!identity || seen.has(identity)) return false;
        seen.add(identity);
        return true;
      })
      .map((document) => ({ ...document, source }));
    return {
      media: merge(mediaDocuments, "media"),
      reader: merge(readerDocuments, "reader")
    };
  }

  const api = {
    DOCUMENT_EXTENSIONS,
    MAX_DOCUMENT_BYTES,
    MAX_DOCUMENTS,
    MAX_SCAN_DEPTH,
    MAX_SCROLL_ENTRIES,
    documentFormat,
    extensionFromPath,
    isSupportedDocument,
    mergeDocumentSources,
    normalizeReaderState
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalScope) globalScope.InfiniteLofiReader = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
