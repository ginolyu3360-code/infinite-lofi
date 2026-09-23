(function exposeInfiniteLofiMediaSession(globalScope) {
  function inferArtworkType(url) {
    const extension = String(url || "").split(/[?#]/)[0].split(".").pop()?.toLowerCase();
    return {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      gif: "image/gif",
      bmp: "image/bmp"
    }[extension] || "";
  }

  function createMediaSessionController(options = {}) {
    const {
      mediaSession,
      MediaMetadata,
      audio,
      publishNativeState,
      initialOwnershipEnabled = true,
      logger = globalScope.console
    } = options;
    const browserSupported = Boolean(
      mediaSession &&
      typeof mediaSession.setActionHandler === "function" &&
      typeof MediaMetadata === "function" &&
      audio
    );
    const nativePublisherSupported = typeof publishNativeState === "function" && Boolean(audio);
    let nativeMode = false;
    let ownershipEnabled = initialOwnershipEnabled === true;
    let currentMetadata = null;
    let installedActions = {};
    let audioListenersInstalled = false;

    const actionNames = [
      "play",
      "pause",
      "stop",
      "previoustrack",
      "nexttrack",
      "seekbackward",
      "seekforward",
      "seekto"
    ];

    function getPlaybackState() {
      return !audio?.src
        ? "none"
        : audio.paused
        ? "paused"
        : "playing";
    }

    function publishNativeMediaState(stateOverride) {
      if (!ownershipEnabled || !nativeMode || !nativePublisherSupported) return;
      const duration = Number(audio.duration);
      const position = Number(audio.currentTime);
      const playbackRate = Number(audio.playbackRate);
      publishNativeState({
        title: currentMetadata?.title || "",
        artist: currentMetadata?.artist || "",
        album: currentMetadata?.album || "",
        duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
        position: Number.isFinite(position) && position > 0 ? position : 0,
        playbackRate: Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1,
        state: currentMetadata ? stateOverride || getPlaybackState() : "none"
      });
    }

    function syncPlaybackIntent(state) {
      if (!ownershipEnabled || !["playing", "paused", "stopped"].includes(state)) return;
      if (nativeMode) publishNativeMediaState(state);
      else setPlaybackState(state === "stopped" ? "paused" : state);
    }

    function setActionHandler(action, handler) {
      if (!browserSupported) return false;
      try {
        mediaSession.setActionHandler(action, handler);
        return true;
      } catch (error) {
        logger?.warn?.(`Media Session action ${action} is unavailable:`, error);
        return false;
      }
    }

    function setPlaybackState(state) {
      if (!ownershipEnabled || !browserSupported || nativeMode) return;
      try {
        mediaSession.playbackState = state;
      } catch {}
    }

    function syncPlaybackState() {
      if (!ownershipEnabled) return;
      if (nativeMode) {
        publishNativeMediaState();
        return;
      }
      setPlaybackState(getPlaybackState());
    }

    function syncPositionState() {
      if (!ownershipEnabled) return;
      if (nativeMode) {
        publishNativeMediaState();
        return;
      }
      if (!browserSupported || typeof mediaSession.setPositionState !== "function") return;
      const duration = Number(audio.duration);
      const currentTime = Number(audio.currentTime);
      const playbackRate = Number(audio.playbackRate);
      if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(currentTime)) return;
      try {
        mediaSession.setPositionState({
          duration,
          playbackRate: Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1,
          position: Math.min(duration, Math.max(0, currentTime))
        });
      } catch {}
    }

    function syncAllState() {
      if (!ownershipEnabled) return;
      if (nativeMode) {
        publishNativeMediaState();
        return;
      }
      syncPlaybackState();
      syncPositionState();
    }

    function updateMetadata(track) {
      if (!track || track.isMissing === true) {
        currentMetadata = null;
        if (!ownershipEnabled) return;
        if (nativeMode) publishNativeMediaState();
        else if (browserSupported) {
          try {
            mediaSession.metadata = null;
          } catch {}
          syncPlaybackState();
        }
        return;
      }
      const artwork = [];
      if (typeof track.artworkUrl === "string" && track.artworkUrl) {
        const artworkItem = { src: track.artworkUrl };
        const artworkType = track.artworkMimeType || inferArtworkType(track.artworkUrl);
        if (artworkType) artworkItem.type = artworkType;
        artwork.push(artworkItem);
      }
      const metadata = {
        title: track.label || "Untitled track",
        artist: track.isLocal ? "Local Music" : "Infinite Lo-Fi",
        album: "Infinite Lo-Fi",
        artwork
      };
      currentMetadata = metadata;
      if (!ownershipEnabled) return;
      if (nativeMode) {
        publishNativeMediaState();
        return;
      }
      if (!browserSupported) return;
      try {
        mediaSession.metadata = new MediaMetadata(metadata);
      } catch (error) {
        logger?.warn?.("Media Session metadata artwork is unavailable:", error);
        try {
          mediaSession.metadata = new MediaMetadata({ ...metadata, artwork: [] });
        } catch {}
      }
      syncAllState();
    }

    function runTransportAction(action, fallback, optimisticState) {
      // Claim the intended state before an asynchronous fade completes. On
      // macOS this keeps a paused session resumable instead of briefly leaving
      // the OS with a stale "playing" session that can be handed to Music.
      if (optimisticState) setPlaybackState(optimisticState);
      let result;
      try {
        result = typeof action === "function" ? action() : fallback?.();
      } catch {
        syncAllState();
        return Promise.resolve(false);
      }
      return Promise.resolve(result).then(
        () => {
          syncAllState();
          return true;
        },
        () => {
          syncAllState();
          return false;
        }
      );
    }

    function installBrowserActionHandlers() {
      if (!browserSupported || nativeMode || !ownershipEnabled) return;
      const actions = installedActions;
      setActionHandler("play", () => runTransportAction(actions.play, () => audio.play(), "playing"));
      setActionHandler("pause", () => runTransportAction(actions.pause, () => audio.pause(), "paused"));
      setActionHandler("stop", () => runTransportAction(
        actions.stop,
        () => {
          audio.pause();
          if (Number.isFinite(Number(audio.duration)) && Number(audio.duration) > 0) {
            audio.currentTime = 0;
          }
        },
        "paused"
      ));
      setActionHandler("previoustrack", () => runTransportAction(actions.previousTrack));
      setActionHandler("nexttrack", () => runTransportAction(actions.nextTrack));
      setActionHandler("seekbackward", (details = {}) => {
        const offset = Number.isFinite(Number(details.seekOffset)) ? Number(details.seekOffset) : 10;
        audio.currentTime = Math.max(0, Number(audio.currentTime || 0) - offset);
        syncPositionState();
      });
      setActionHandler("seekforward", (details = {}) => {
        const duration = Number(audio.duration);
        const offset = Number.isFinite(Number(details.seekOffset)) ? Number(details.seekOffset) : 10;
        const target = Number(audio.currentTime || 0) + offset;
        audio.currentTime = Number.isFinite(duration) && duration > 0 ? Math.min(duration, target) : target;
        syncPositionState();
      });
      setActionHandler("seekto", (details = {}) => {
        const duration = Number(audio.duration);
        const seekTime = Number(details.seekTime);
        if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(seekTime)) return;
        const target = Math.min(duration, Math.max(0, seekTime));
        if (details.fastSeek === true && typeof audio.fastSeek === "function") audio.fastSeek(target);
        else audio.currentTime = target;
        syncPositionState();
      });
    }

    function installActionHandlers(actions = {}) {
      if (!audio || (!browserSupported && !nativePublisherSupported)) return false;
      installedActions = actions && typeof actions === "object" ? actions : {};
      installBrowserActionHandlers();
      if (!audioListenersInstalled) {
        ["play", "pause", "ended", "loadedmetadata", "durationchange", "ratechange", "timeupdate", "emptied"]
        .forEach((eventName) => {
          audio.addEventListener(eventName, eventName === "timeupdate" ? syncPositionState : syncAllState);
        });
        audioListenersInstalled = true;
      }
      syncPlaybackState();
      return true;
    }

    function enableNativeMode() {
      if (!nativePublisherSupported) return false;
      nativeMode = true;
      if (browserSupported) {
        actionNames.forEach((action) => setActionHandler(action, null));
        try {
          mediaSession.metadata = null;
          mediaSession.playbackState = "none";
        } catch {}
      }
      if (ownershipEnabled) publishNativeMediaState();
      return true;
    }

    function disableNativeMode() {
      nativeMode = false;
      if (ownershipEnabled) acquireOwnership();
      return browserSupported;
    }

    function clearBrowserOwnership() {
      if (!browserSupported) return;
      actionNames.forEach((action) => setActionHandler(action, null));
      try {
        mediaSession.metadata = null;
        mediaSession.playbackState = "none";
      } catch {}
    }

    function releaseOwnership() {
      if (!ownershipEnabled) return browserSupported || nativePublisherSupported;
      ownershipEnabled = false;
      clearBrowserOwnership();
      if (nativeMode && nativePublisherSupported) {
        publishNativeState({
          title: "",
          artist: "",
          album: "",
          duration: 0,
          position: 0,
          playbackRate: 1,
          state: "none"
        });
      }
      return browserSupported || nativePublisherSupported;
    }

    function acquireOwnership() {
      ownershipEnabled = true;
      if (nativeMode) {
        publishNativeMediaState();
        return nativePublisherSupported;
      }
      if (!browserSupported) return nativePublisherSupported;
      installBrowserActionHandlers();
      if (currentMetadata) {
        try {
          mediaSession.metadata = new MediaMetadata(currentMetadata);
        } catch {
          try {
            mediaSession.metadata = new MediaMetadata({ ...currentMetadata, artwork: [] });
          } catch {}
        }
      } else {
        try {
          mediaSession.metadata = null;
        } catch {}
      }
      syncAllState();
      return true;
    }

    return {
      acquireOwnership,
      disableNativeMode,
      enableNativeMode,
      hasOwnership: () => ownershipEnabled,
      installActionHandlers,
      isNativeMode: () => nativeMode,
      isSupported: () => browserSupported || nativePublisherSupported,
      releaseOwnership,
      syncPlaybackIntent,
      syncPlaybackState,
      syncPositionState,
      updateMetadata
    };
  }

  const api = { createMediaSessionController, inferArtworkType };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalScope) globalScope.InfiniteLofiMediaSession = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
