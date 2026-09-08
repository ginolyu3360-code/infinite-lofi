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
      logger = globalScope.console
    } = options;
    const supported = Boolean(
      mediaSession &&
      typeof mediaSession.setActionHandler === "function" &&
      typeof MediaMetadata === "function" &&
      audio
    );

    function setActionHandler(action, handler) {
      if (!supported) return false;
      try {
        mediaSession.setActionHandler(action, handler);
        return true;
      } catch (error) {
        logger?.warn?.(`Media Session action ${action} is unavailable:`, error);
        return false;
      }
    }

    function syncPlaybackState() {
      if (!supported) return;
      try {
        mediaSession.playbackState = !audio.src
          ? "none"
          : audio.paused
          ? "paused"
          : "playing";
      } catch {}
    }

    function syncPositionState() {
      if (!supported || typeof mediaSession.setPositionState !== "function") return;
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

    function updateMetadata(track) {
      if (!supported) return;
      if (!track || track.isMissing === true) {
        try {
          mediaSession.metadata = null;
        } catch {}
        syncPlaybackState();
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
      try {
        mediaSession.metadata = new MediaMetadata(metadata);
      } catch (error) {
        logger?.warn?.("Media Session metadata artwork is unavailable:", error);
        try {
          mediaSession.metadata = new MediaMetadata({ ...metadata, artwork: [] });
        } catch {}
      }
      syncPlaybackState();
      syncPositionState();
    }

    function installActionHandlers(actions = {}) {
      if (!supported) return false;
      setActionHandler("play", () => {
        Promise.resolve(audio.play()).catch(() => {});
      });
      setActionHandler("pause", () => audio.pause());
      setActionHandler("stop", () => {
        audio.pause();
        if (Number.isFinite(Number(audio.duration)) && Number(audio.duration) > 0) {
          audio.currentTime = 0;
        }
        syncPlaybackState();
        syncPositionState();
      });
      setActionHandler("previoustrack", () => actions.previousTrack?.());
      setActionHandler("nexttrack", () => actions.nextTrack?.());
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

      ["play", "pause", "ended", "loadedmetadata", "durationchange", "ratechange", "timeupdate", "emptied"]
        .forEach((eventName) => {
          audio.addEventListener(eventName, eventName === "timeupdate" ? syncPositionState : () => {
            syncPlaybackState();
            syncPositionState();
          });
        });
      syncPlaybackState();
      return true;
    }

    return {
      installActionHandlers,
      isSupported: () => supported,
      syncPlaybackState,
      syncPositionState,
      updateMetadata
    };
  }

  const api = { createMediaSessionController, inferArtworkType };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalScope) globalScope.InfiniteLofiMediaSession = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
