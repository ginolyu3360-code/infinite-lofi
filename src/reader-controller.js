(function exposeInfiniteLofiReaderController(globalScope) {
  const readerModel = typeof module !== "undefined" && module.exports
    ? require("./reader")
    : globalScope.InfiniteLofiReader;

  function appendInlineMarkdown(document, parent, source, openExternal = () => {}) {
    const pattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_|!?\[[^\]\n]*\]\([^\s)]+\))/g;
    let cursor = 0;
    for (const match of source.matchAll(pattern)) {
      parent.appendChild(document.createTextNode(source.slice(cursor, match.index)));
      const token = match[0];
      let node = null;
      if (token.startsWith("![")) {
        node = document.createTextNode(token);
      } else if (token.startsWith("[")) {
        const parts = token.match(/^\[([^\]]*)\]\(([^)]+)\)$/);
        let url = null;
        try {
          url = new URL(parts?.[2] || "");
        } catch {}
        if (parts && url && ["http:", "https:"].includes(url.protocol)) {
          node = document.createElement("a");
          node.href = url.href;
          node.textContent = parts[1] || url.href;
          node.rel = "noopener noreferrer";
          node.addEventListener("click", (event) => {
            event.preventDefault();
            openExternal(url.href);
          });
        } else {
          node = document.createTextNode(token);
        }
      } else if (token.startsWith("`")) {
        node = document.createElement("code");
        node.textContent = token.slice(1, -1);
      } else {
        node = document.createElement(token.startsWith("**") || token.startsWith("__") ? "strong" : "em");
        node.textContent = token.replace(/^(\*\*|__|\*|_)/, "").replace(/(\*\*|__|\*|_)$/, "");
      }
      parent.appendChild(node);
      cursor = match.index + token.length;
    }
    parent.appendChild(document.createTextNode(source.slice(cursor)));
  }

  function renderSafeMarkdown(document, root, markdown, openExternal = () => {}) {
    root.replaceChildren();
    const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
    let paragraph = [];
    let list = null;
    let code = null;

    function flushParagraph() {
      if (paragraph.length === 0) return;
      const element = document.createElement("p");
      appendInlineMarkdown(document, element, paragraph.join(" "), openExternal);
      root.appendChild(element);
      paragraph = [];
    }
    function flushList() {
      list = null;
    }
    function flushCode() {
      if (!code) return;
      const pre = document.createElement("pre");
      const child = document.createElement("code");
      child.textContent = code.join("\n");
      pre.appendChild(child);
      root.appendChild(pre);
      code = null;
    }

    for (const line of lines) {
      if (line.trimStart().startsWith("```")) {
        flushParagraph(); flushList();
        if (code) flushCode();
        else code = [];
        continue;
      }
      if (code) { code.push(line); continue; }
      const heading = line.match(/^(#{1,3})\s+(.+)$/);
      const unordered = line.match(/^\s*[-+*]\s+(.+)$/);
      const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
      const quote = line.match(/^>\s?(.*)$/);
      if (heading) {
        flushParagraph(); flushList();
        const element = document.createElement(`h${heading[1].length}`);
        appendInlineMarkdown(document, element, heading[2], openExternal);
        root.appendChild(element);
      } else if (unordered || ordered) {
        flushParagraph();
        const listName = unordered ? "ul" : "ol";
        if (!list || list.tagName.toLowerCase() !== listName) {
          list = document.createElement(listName);
          root.appendChild(list);
        }
        const item = document.createElement("li");
        appendInlineMarkdown(document, item, (unordered || ordered)[1], openExternal);
        list.appendChild(item);
      } else if (quote) {
        flushParagraph(); flushList();
        const element = document.createElement("blockquote");
        appendInlineMarkdown(document, element, quote[1], openExternal);
        root.appendChild(element);
      } else if (/^\s*$/.test(line)) {
        flushParagraph(); flushList();
      } else if (/^\s*</.test(line)) {
        flushParagraph(); flushList();
        const element = document.createElement("p");
        element.textContent = line;
        root.appendChild(element);
      } else {
        paragraph.push(line.trim());
      }
    }
    flushParagraph(); flushList(); flushCode();
  }

  function createReaderController(options) {
    const {
      appStorage,
      desktopApp,
      elements,
      focusManager,
      getMediaFolder = () => "",
      isMiniMode = () => false,
      announce = () => {},
      t = (key) => key
    } = options;
    let state = readerModel.normalizeReaderState(appStorage.getState().reader);
    let sourceDocuments = { media: [], reader: [] };
    let sources = { media: [], reader: [] };
    let activeDocument = null;
    let scrollSaveTimer = null;

    function persist(patch = {}) {
      state = readerModel.normalizeReaderState({ ...state, ...patch });
      appStorage.update((stored) => { stored.reader = state; });
      applyPreferences();
    }

    function applyPreferences() {
      elements.overlay.classList.toggle("sidebar-open", state.sidebarOpen);
      elements.overlay.dataset.theme = state.theme;
      elements.content.dataset.width = state.lineWidth;
      elements.content.style.setProperty("--reader-scale", String(state.fontScale / 100));
      elements.sidebarToggle.setAttribute("aria-pressed", String(state.sidebarOpen));
      elements.fontScale.value = String(state.fontScale);
      elements.lineWidth.value = state.lineWidth;
      elements.theme.value = state.theme;
    }

    function renderDocumentList() {
      const query = elements.filter.value.trim().toLocaleLowerCase();
      for (const [source, container] of [["media", elements.mediaDocuments], ["reader", elements.readerDocuments]]) {
        container.replaceChildren();
        const documents = sources[source].filter((document) => !query || `${document.name} ${document.relativePath}`.toLocaleLowerCase().includes(query));
        for (const documentEntry of documents) {
          const button = elements.document.createElement("button");
          button.type = "button";
          button.className = `reader-document-button${activeDocument?.key === documentEntry.key ? " is-active" : ""}`;
          button.dataset.source = source;
          button.dataset.key = documentEntry.key;
          button.textContent = documentEntry.name;
          const pathLabel = elements.document.createElement("small");
          pathLabel.textContent = documentEntry.relativePath;
          button.appendChild(pathLabel);
          container.appendChild(button);
        }
        if (documents.length === 0) {
          const empty = elements.document.createElement("p");
          empty.className = "reader-status";
          empty.textContent = t("reader.noDocuments");
          container.appendChild(empty);
        }
      }
    }

    function mergeSources() {
      sources = readerModel.mergeDocumentSources(sourceDocuments.media, sourceDocuments.reader);
      renderDocumentList();
    }

    function clearSource(source) {
      sourceDocuments[source] = [];
      return { error: null, truncated: false };
    }

    async function scanSource(source, folderPath, { choose = false } = {}) {
      if (!desktopApp) return { error: "unavailable" };
      let outcome = { error: null, truncated: false };
      try {
        const result = choose
          ? await desktopApp.selectReaderFolder()
          : await desktopApp.scanReaderFolder(source, folderPath);
        if (!result) return { cancelled: true };
        if (result.error) throw Object.assign(new Error(result.error), { code: result.error });
        sourceDocuments[source] = Array.isArray(result.documents) ? result.documents : [];
        if (source === "reader" && result.folderPath !== state.folderPath) persist({ folderPath: result.folderPath || "" });
        outcome.truncated = result.truncated === true;
      } catch (error) {
        sourceDocuments[source] = [];
        outcome.error = error?.code || "scan-error";
      }
      return outcome;
    }

    function renderScanStatus(outcomes) {
      const results = outcomes.filter((outcome) => outcome && !outcome.cancelled);
      const folderUnavailable = results.some((outcome) =>
        ["folder-unavailable", "folder-not-approved", "ENOENT", "ENOTDIR"].includes(outcome.error)
      );
      if (folderUnavailable) elements.status.textContent = t("reader.folderUnavailable");
      else if (results.some((outcome) => outcome.error)) elements.status.textContent = t("reader.scanError");
      else if (results.some((outcome) => outcome.truncated)) elements.status.textContent = t("reader.scanTruncated");
      else elements.status.textContent = t("reader.documentCount", { count: sources.media.length + sources.reader.length });
    }

    async function refresh() {
      elements.status.textContent = t("reader.scanning");
      const mediaFolder = getMediaFolder();
      const outcomes = await Promise.all([
        mediaFolder ? scanSource("media", mediaFolder) : Promise.resolve(clearSource("media")),
        state.folderPath ? scanSource("reader", state.folderPath) : Promise.resolve(clearSource("reader"))
      ]);
      mergeSources();
      renderScanStatus(outcomes);
    }

    function saveScroll() {
      if (!activeDocument) return;
      const maximum = elements.viewport.scrollHeight - elements.viewport.clientHeight;
      const ratio = maximum > 0 ? elements.viewport.scrollTop / maximum : 0;
      const positions = { ...state.scrollPositions };
      delete positions[activeDocument.key];
      positions[activeDocument.key] = ratio;
      persist({ scrollPositions: positions });
    }

    async function openDocument(source, key) {
      if (!source || !key) return;
      saveScroll();
      elements.status.textContent = t("reader.loading");
      try {
        const result = await desktopApp.readReaderDocument(source, key);
        if (result?.error) throw Object.assign(new Error(result.error), { code: result.error });
        const documentEntry = result?.document || result;
        if (!documentEntry || typeof documentEntry.text !== "string") throw new Error("Reader returned an invalid document.");
        activeDocument = documentEntry;
        elements.content.dataset.format = documentEntry.format;
        if (documentEntry.format === "markdown") {
          renderSafeMarkdown(elements.document, elements.content, documentEntry.text, (url) => desktopApp.openExternalUrl(url));
        } else {
          elements.content.textContent = documentEntry.text;
        }
        persist({ lastDocumentKey: key });
        renderDocumentList();
        const ratio = state.scrollPositions[key] || 0;
        globalScope.requestAnimationFrame(() => {
          elements.viewport.scrollTop = ratio * Math.max(0, elements.viewport.scrollHeight - elements.viewport.clientHeight);
        });
        elements.status.textContent = documentEntry.warning === "invalid-json" ? t("reader.invalidJson") : `${documentEntry.encoding} · ${documentEntry.name}`;
      } catch (error) {
        elements.status.textContent = t(error?.code === "encoding-unrecognized" ? "reader.encodingError" : "reader.readError");
      }
    }

    async function open() {
      if (isMiniMode()) {
        announce(t("reader.miniUnavailable"));
        return false;
      }
      elements.overlay.hidden = false;
      elements.overlay.inert = false;
      elements.overlay.setAttribute("aria-hidden", "false");
      elements.toggle.setAttribute("aria-expanded", "true");
      applyPreferences();
      focusManager?.open?.(elements.overlay, { trigger: elements.toggle, initialFocus: elements.close });
      await refresh();
      const last = [...sources.media, ...sources.reader].find((documentEntry) => documentEntry.key === state.lastDocumentKey);
      if (last) await openDocument(last.source, last.key);
      return true;
    }

    function close() {
      saveScroll();
      elements.overlay.hidden = true;
      elements.overlay.inert = true;
      elements.overlay.setAttribute("aria-hidden", "true");
      elements.toggle.setAttribute("aria-expanded", "false");
      focusManager?.close?.(elements.overlay, { fallbackFocus: elements.toggle });
    }

    function bindEvents() {
      elements.toggle.addEventListener("click", open);
      elements.close.addEventListener("click", close);
      elements.sidebarToggle.addEventListener("click", () => persist({ sidebarOpen: !state.sidebarOpen }));
      elements.chooseFolder.addEventListener("click", async () => {
        elements.status.textContent = t("reader.scanning");
        const outcome = await scanSource("reader", "", { choose: true });
        mergeSources();
        renderScanStatus([outcome]);
      });
      elements.refresh.addEventListener("click", refresh);
      elements.filter.addEventListener("input", renderDocumentList);
      elements.mediaDocuments.addEventListener("click", (event) => {
        const button = event.target.closest?.(".reader-document-button");
        if (button) openDocument("media", button.dataset.key);
      });
      elements.readerDocuments.addEventListener("click", (event) => {
        const button = event.target.closest?.(".reader-document-button");
        if (button) openDocument("reader", button.dataset.key);
      });
      elements.fontScale.addEventListener("input", () => persist({ fontScale: Number(elements.fontScale.value) }));
      elements.lineWidth.addEventListener("change", () => persist({ lineWidth: elements.lineWidth.value }));
      elements.theme.addEventListener("change", () => persist({ theme: elements.theme.value }));
      elements.findNext.addEventListener("click", () => globalScope.find?.(elements.find.value, false, false, true));
      elements.find.addEventListener("keydown", (event) => {
        if (event.key === "Enter") globalScope.find?.(elements.find.value, false, false, true);
      });
      elements.viewport.addEventListener("scroll", () => {
        if (scrollSaveTimer) globalScope.clearTimeout(scrollSaveTimer);
        scrollSaveTimer = globalScope.setTimeout(saveScroll, 250);
      }, { passive: true });
      elements.document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !elements.overlay.hidden) {
          event.preventDefault();
          close();
        }
      });
    }

    applyPreferences();
    return { bindEvents, close, isOpen: () => !elements.overlay.hidden, open, refresh, setTimerText: (text) => { elements.timerLabel.textContent = text; } };
  }

  const api = { appendInlineMarkdown, createReaderController, renderSafeMarkdown };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalScope) globalScope.InfiniteLofiReaderController = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
