(function exposeInfiniteLofiLyricsController(globalScope) {
  const lyricsModel = typeof module !== "undefined" && module.exports
    ? require("./lyrics")
    : globalScope.InfiniteLofiLyrics;

  function createLyricsController(options = {}) {
    const {
      audio,
      desktopApp,
      elements,
      onEnabledChange = () => {},
      t = (key) => key
    } = options;
    let enabled = false;
    let currentTrack = null;
    let currentLyrics = null;
    let activeIndex = -1;
    let requestVersion = 0;
    let currentStatusKey = "lyrics.loading";
    let currentStatusValues;

    function sourceLabel(source) {
      return t({
        sidecar: "lyrics.sourceSidecar",
        embedded: "lyrics.sourceEmbedded",
        lrclib: "lyrics.sourceOnline",
        qqmusic: "lyrics.sourceQqMusic",
        lyricsovh: "lyrics.sourceLyricsOvh",
        cache: "lyrics.sourceCache"
      }[source] || "lyrics.sourceLocal");
    }

    function setStatus(key, values) {
      currentStatusKey = key;
      currentStatusValues = values;
      if (elements.status) elements.status.textContent = t(key, values);
    }

    function clearLines() {
      activeIndex = -1;
      currentLyrics = null;
      if (elements.lines) elements.lines.replaceChildren();
    }

    function renderLyrics(lyrics) {
      clearLines();
      currentLyrics = lyricsModel.normalizeLyrics(lyrics);
      if (!currentLyrics) {
        setStatus("lyrics.notFound");
        return;
      }
      if (currentLyrics.instrumental) {
        setStatus("lyrics.instrumental");
        return;
      }
      if (currentLyrics.lines.length === 0) {
        setStatus("lyrics.notFound");
        return;
      }
      setStatus(currentLyrics.synced ? "lyrics.synced" : "lyrics.unsynced");
      if (elements.source) elements.source.textContent = sourceLabel(currentLyrics.source);
      const fragment = elements.document.createDocumentFragment();
      currentLyrics.lines.forEach((line, index) => {
        const item = elements.document.createElement(currentLyrics.synced ? "button" : "p");
        if (currentLyrics.synced) item.type = "button";
        item.className = "lyrics-line";
        item.textContent = line.text || "· · ·";
        item.dataset.index = String(index);
        if (Number.isFinite(line.time)) item.dataset.time = String(line.time);
        fragment.appendChild(item);
      });
      elements.lines.appendChild(fragment);
      syncToPlayback();
    }

    function syncToPlayback() {
      if (!enabled || !currentLyrics?.synced) return;
      const nextIndex = lyricsModel.findActiveLyricIndex(currentLyrics.lines, audio?.currentTime);
      if (nextIndex === activeIndex) return;
      const previous = elements.lines.querySelector?.(".lyrics-line.is-active");
      previous?.classList?.remove("is-active");
      previous?.removeAttribute?.("aria-current");
      activeIndex = nextIndex;
      if (activeIndex < 0) return;
      const active = elements.lines.querySelector?.(`[data-index="${activeIndex}"]`);
      active?.classList?.add("is-active");
      active?.setAttribute?.("aria-current", "true");
      active?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    }

    async function loadCurrentLyrics() {
      const version = ++requestVersion;
      clearLines();
      if (!enabled) return;
      if (!currentTrack || currentTrack.isMissing === true) {
        setStatus("lyrics.noTrack");
        return;
      }
      setStatus("lyrics.loading");
      if (elements.source) elements.source.textContent = "";
      if (typeof desktopApp?.getLyrics !== "function") {
        setStatus("lyrics.unavailable");
        return;
      }
      let result;
      try {
        result = await desktopApp.getLyrics({
          key: currentTrack.key,
          label: currentTrack.label,
          title: currentTrack.title,
          artist: currentTrack.artist,
          album: currentTrack.album,
          duration: currentTrack.duration,
          src: currentTrack.src,
          isLocal: currentTrack.isLocal === true
        }, { allowOnline: true });
      } catch {
        result = { status: "unavailable" };
      }
      if (version !== requestVersion || !enabled) return;
      if (result?.status === "ok") {
        renderLyrics(result.lyrics);
        return;
      }
      setStatus({
        "metadata-missing": "lyrics.metadataMissing",
        "rate-limited": "lyrics.rateLimited",
        unavailable: "lyrics.unavailable"
      }[result?.status] || "lyrics.notFound");
    }

    function setEnabled(nextEnabled, { persist = true } = {}) {
      enabled = nextEnabled === true;
      elements.panel.hidden = !enabled;
      elements.toggleButton.setAttribute("aria-pressed", String(enabled));
      elements.toggleButton.setAttribute("aria-expanded", String(enabled));
      elements.document.body.classList.toggle("lyrics-enabled", enabled);
      if (persist) onEnabledChange(enabled);
      if (enabled) loadCurrentLyrics();
      else {
        requestVersion += 1;
        clearLines();
      }
    }

    function setTrack(track) {
      currentTrack = track && typeof track === "object" ? track : null;
      if (enabled) loadCurrentLyrics();
    }

    function refreshLanguage() {
      elements.toggleButton.textContent = t("lyrics.toggle");
      elements.toggleButton.title = t("lyrics.toggleTitle");
      elements.toggleButton.setAttribute("aria-label", t("lyrics.toggleTitle"));
      setStatus(currentStatusKey, currentStatusValues);
      if (currentLyrics) {
        setStatus(currentLyrics.instrumental
          ? "lyrics.instrumental"
          : currentLyrics.synced ? "lyrics.synced" : "lyrics.unsynced");
        if (elements.source) elements.source.textContent = sourceLabel(currentLyrics.source);
      }
    }

    elements.toggleButton.addEventListener("click", () => setEnabled(!enabled));
    elements.lines.addEventListener("click", (event) => {
      const line = event.target.closest?.(".lyrics-line[data-time]");
      const time = Number(line?.dataset.time);
      if (Number.isFinite(time) && audio) audio.currentTime = time;
    });
    audio?.addEventListener?.("timeupdate", syncToPlayback);
    audio?.addEventListener?.("seeked", syncToPlayback);

    return {
      isEnabled: () => enabled,
      refreshLanguage,
      reload: loadCurrentLyrics,
      setEnabled,
      setTrack,
      syncToPlayback
    };
  }

  const api = { createLyricsController };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalScope) globalScope.InfiniteLofiLyricsController = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
