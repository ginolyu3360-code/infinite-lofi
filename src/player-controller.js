(function exposeInfiniteLofiPlayerController(globalScope) {
  const i18n = typeof module !== "undefined" && module.exports ? require("./i18n") : globalScope.InfiniteLofiI18n;
  const audioTransition = typeof module !== "undefined" && module.exports
    ? require("./audio-transition")
    : globalScope.InfiniteLofiAudioTransition;
  const defaultTranslate = i18n.createI18n("en").t;
  function createPlayerController(options) {
    const {
      appStorage,
      desktopApp,
      elements,
      playerModel,
      defaultTracks,
      onArtworkChange = () => {},
      onTrackChange = () => {},
      announce = () => {},
      getAudioTransitionSettings = () => audioTransition.DEFAULT_AUDIO_TRANSITIONS,
      gainEnvelopeFactory = audioTransition.createGainEnvelope,
      t = defaultTranslate,
      setDisclosureState = (trigger, expanded) => trigger?.setAttribute?.("aria-expanded", String(expanded)),
      alert: showAlert = globalScope.alert?.bind(globalScope) || (() => {}),
      logger = globalScope.console
    } = options;

    const bundledTracks = defaultTracks.map((track) => ({ ...track, isMissing: false }));
    let playlist = bundledTracks.map((track) => ({ ...track }));
    let currentTrackIndex = 0;
    let draggedItem = null;
    let localMusicFolder = null;
    let folderUnavailable = false;
    let isScanning = false;
    let playbackCommandVersion = 0;
    let desiredPlaying = false;
    const musicEnvelope = gainEnvelopeFactory({
      audio: elements.lofiPlayer,
      userVolume: Number(elements.volumeSlider.value) / 100
    });

    function transitionSettings() {
      return audioTransition.normalizeAudioTransitions(getAudioTransitionSettings());
    }

    function getActiveTrack() {
      return playlist[currentTrackIndex] || null;
    }

    function getMissingCount() {
      return playlist.filter((track) => track.isMissing === true).length;
    }

    function persistState() {
      const activeTrack = getActiveTrack();
      appStorage.update((state) => {
        state.player = {
          ...state.player,
          folderPath: localMusicFolder || "",
          queue: playerModel.createQueueSnapshot(playlist),
          activeTrackKey: playerModel.getTrackKey(activeTrack)
        };
      });
    }

    function updateFolderStatus() {
      const missingCount = getMissingCount();
      const playableCount = playlist.filter(playerModel.isTrackPlayable).length;
      const folderName = localMusicFolder?.split(/[\\/]/).pop() || t("common.default");
      let status = t("player.folderTracks", { folder: folderName, count: playableCount });
      if (isScanning) status = t("player.scanning", { folder: folderName });
      else if (folderUnavailable) status = t("player.reconnectNeeded", { folder: folderName });
      else if (missingCount > 0) status += ` · ${t("player.missingCount", { count: missingCount })}`;
      elements.musicFolderDisplay.textContent = status;
      elements.musicFolderDisplay.title = localMusicFolder || t("player.bundledTitle");
      if (elements.playlistStatus) {
        elements.playlistStatus.textContent = folderUnavailable
          ? t("player.folderUnavailable")
          : missingCount > 0
          ? t(missingCount === 1 ? "player.savedMissingOne" : "player.savedMissing", { count: missingCount })
          : localMusicFolder
          ? t("player.localStatus")
          : t("player.bundledStatus");
      }
      if (elements.loadMusicFolderBtn) {
        elements.loadMusicFolderBtn.textContent = t(folderUnavailable ? "player.reconnectFolder" : "player.loadFolder");
      }
      if (elements.rescanMusicFolderBtn) elements.rescanMusicFolderBtn.hidden = !localMusicFolder;
      if (elements.removeMissingTracksBtn) elements.removeMissingTracksBtn.hidden = missingCount === 0;
      if (elements.useDefaultTracksBtn) elements.useDefaultTracksBtn.hidden = !localMusicFolder;
    }

    function renderPlaylist() {
      elements.playlistItems.innerHTML = "";
      playlist.forEach((track, index) => {
        const itemButton = elements.document.createElement("button");
        itemButton.type = "button";
        itemButton.className = [
          "playlist-item",
          index === currentTrackIndex ? "is-active" : "",
          track.isMissing === true ? "is-missing" : ""
        ].filter(Boolean).join(" ");
        itemButton.draggable = true;
        itemButton.dataset.index = String(index);
        itemButton.setAttribute("aria-disabled", String(track.isMissing === true));
        if (index === currentTrackIndex) itemButton.setAttribute("aria-current", "true");

        const label = elements.document.createElement("span");
        label.className = "playlist-item-label";
        label.textContent = track.label;
        itemButton.appendChild(label);
        if (track.isMissing === true) {
          const status = elements.document.createElement("span");
          status.className = "playlist-item-status";
          status.textContent = t("player.missing");
          itemButton.appendChild(status);
        }

        itemButton.title = track.isMissing === true
          ? t("player.trackUnavailableTitle", { title: track.label })
          : t("player.playTrackTitle", { title: track.label });
        itemButton.addEventListener("click", () => {
          if (track.isMissing === true) {
            showAlert(t("player.trackMissingAlert"));
            return;
          }
          playSelectedTrack(index);
        });
        itemButton.addEventListener("dragstart", (event) => {
          draggedItem = itemButton;
          itemButton.classList.add("is-dragging");
          event.dataTransfer.effectAllowed = "move";
        });
        itemButton.addEventListener("dragend", () => {
          itemButton.classList.remove("is-dragging");
          draggedItem = null;
        });
        itemButton.addEventListener("dragover", (event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          if (draggedItem && draggedItem !== itemButton) itemButton.classList.add("is-drag-over");
        });
        itemButton.addEventListener("dragleave", () => itemButton.classList.remove("is-drag-over"));
        itemButton.addEventListener("drop", (event) => {
          event.preventDefault();
          itemButton.classList.remove("is-drag-over");
          if (draggedItem && draggedItem !== itemButton) {
            reorderPlaylist(Number(draggedItem.dataset.index), Number(itemButton.dataset.index));
          }
        });
        elements.playlistItems.appendChild(itemButton);
      });
      updateFolderStatus();
    }

    function updateTrack() {
      playbackCommandVersion += 1;
      musicEnvelope.cancel({ gain: 1 });
      const track = getActiveTrack();
      if (!playerModel.isTrackPlayable(track)) {
        desiredPlaying = false;
        elements.trackLabel.textContent = t(playlist.length > 0 ? "player.noPlayable" : "player.empty");
        elements.lofiPlayer.pause();
        elements.lofiPlayer.removeAttribute("src");
        elements.lofiPlayer.load?.();
        elements.playPauseBtn.textContent = t("player.play");
        onArtworkChange(null);
        onTrackChange(null);
        renderPlaylist();
        return;
      }
      elements.trackLabel.textContent = track.label;
      elements.lofiPlayer.src = track.srcUrl || track.src;
      onArtworkChange(
        track.artworkUrl
          ? { url: track.artworkUrl, name: track.artworkName || t("player.cover", { title: track.label }) }
          : null
      );
      onTrackChange(track);
      announce(t("player.nowPlayingAnnouncement", { title: track.label }));
      renderPlaylist();
    }

    function setPlaylistFromScan(tracks, savedQueue, activeTrackKey) {
      playlist = playerModel.mergePlaylistTracks(tracks, savedQueue);
      currentTrackIndex = playerModel.findActiveTrackIndex(playlist, activeTrackKey);
      folderUnavailable = false;
      updateTrack();
    }

    async function scanCurrentFolder(savedQueue, activeTrackKey) {
      if (!localMusicFolder || !desktopApp || typeof desktopApp.scanMusicFolder !== "function") {
        folderUnavailable = Boolean(localMusicFolder);
        renderPlaylist();
        return false;
      }
      const shouldResume = desiredPlaying || !elements.lofiPlayer.paused;
      const playbackVersionBeforeScan = playbackCommandVersion;
      isScanning = true;
      updateFolderStatus();
      try {
        const result = await desktopApp.scanMusicFolder(localMusicFolder);
        if (!result || !Array.isArray(result.tracks)) {
          folderUnavailable = true;
          renderPlaylist();
          return false;
        }
        if (result.error && result.error !== "no-audio-files") {
          folderUnavailable = true;
          renderPlaylist();
          return false;
        }
        localMusicFolder = result.folderPath || localMusicFolder;
        const resumeAfterScan = shouldResume && playbackCommandVersion === playbackVersionBeforeScan;
        setPlaylistFromScan(result.tracks, savedQueue, activeTrackKey);
        persistState();
        if (resumeAfterScan && playerModel.isTrackPlayable(getActiveTrack())) {
          play();
        }
        return true;
      } catch (error) {
        folderUnavailable = true;
        logger.error("Error scanning music folder:", error);
        renderPlaylist();
        return false;
      } finally {
        isScanning = false;
        updateFolderStatus();
      }
    }

    async function restorePersistedPlayer() {
      const saved = appStorage.getState().player;
      const savedQueue = Array.isArray(saved.queue) ? saved.queue : [];
      if (!saved.folderPath) {
        localMusicFolder = null;
        folderUnavailable = false;
        playlist = playerModel.mergePlaylistTracks(bundledTracks, savedQueue);
        currentTrackIndex = playerModel.findActiveTrackIndex(playlist, saved.activeTrackKey);
        updateTrack();
        persistState();
        return;
      }

      localMusicFolder = saved.folderPath;
      playlist = playerModel.mergePlaylistTracks([], savedQueue);
      currentTrackIndex = playerModel.findActiveTrackIndex(playlist, saved.activeTrackKey);
      folderUnavailable = true;
      updateTrack();
      await scanCurrentFolder(savedQueue, saved.activeTrackKey);
    }

    async function loadMusicFolder() {
      if (!desktopApp || typeof desktopApp.selectMusicFolder !== "function") {
        showAlert(t("player.folderUnsupported"));
        return;
      }
      try {
        const result = await desktopApp.selectMusicFolder();
        if (!result) return;
        if (!Array.isArray(result.tracks) || result.tracks.length === 0) {
          showAlert(t("player.noMusicFiles"));
          return;
        }
        const shouldReconnect = folderUnavailable && Boolean(localMusicFolder);
        const savedQueue = shouldReconnect ? playerModel.createQueueSnapshot(playlist) : [];
        const activeTrackKey = shouldReconnect ? playerModel.getTrackKey(getActiveTrack()) : "";
        localMusicFolder = result.folderPath;
        setPlaylistFromScan(result.tracks, savedQueue, activeTrackKey);
        persistState();
      } catch (error) {
        logger.error("Error loading music folder:", error);
        elements.musicFolderDisplay.textContent = t("player.folderUnreadable");
      }
    }

    async function rescanMusicFolder() {
      if (!localMusicFolder) return;
      const queue = playerModel.createQueueSnapshot(playlist);
      const activeTrackKey = playerModel.getTrackKey(getActiveTrack());
      await scanCurrentFolder(queue, activeTrackKey);
    }

    function useDefaultTracks() {
      stop();
      localMusicFolder = null;
      folderUnavailable = false;
      playlist = bundledTracks.map((track) => ({ ...track }));
      currentTrackIndex = 0;
      updateTrack();
      persistState();
    }

    function removeMissingTracks() {
      const activeKey = playerModel.getTrackKey(getActiveTrack());
      playlist = playlist.filter((track) => track.isMissing !== true);
      currentTrackIndex = playerModel.findActiveTrackIndex(playlist, activeKey);
      if (playlist.length === 0) updateTrack();
      else renderPlaylist();
      persistState();
    }

    function reorderPlaylist(fromIndex, toIndex) {
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= playlist.length || toIndex >= playlist.length) return;
      const [track] = playlist.splice(fromIndex, 1);
      playlist.splice(toIndex, 0, track);
      if (currentTrackIndex === fromIndex) currentTrackIndex = toIndex;
      else if (fromIndex < currentTrackIndex && toIndex >= currentTrackIndex) currentTrackIndex -= 1;
      else if (fromIndex > currentTrackIndex && toIndex <= currentTrackIndex) currentTrackIndex += 1;
      renderPlaylist();
      persistState();
    }

    async function startPlayback(version, { announcePlayback = false } = {}) {
      if (!elements.lofiPlayer.src) return false;
      const settings = transitionSettings();
      musicEnvelope.cancel({ gain: settings.enabled ? 0 : 1 });
      try {
        await elements.lofiPlayer.play();
        if (version !== playbackCommandVersion || !desiredPlaying) return false;
        if (settings.enabled) {
          await musicEnvelope.fadeTo(1, settings.durationMs);
          if (version !== playbackCommandVersion || !desiredPlaying) return false;
        }
        elements.playPauseBtn.textContent = t("player.pause");
        if (announcePlayback) announce(t("player.started"));
        return true;
      } catch {
        if (version === playbackCommandVersion) desiredPlaying = false;
        musicEnvelope.cancel({ gain: 1 });
        elements.playPauseBtn.textContent = t("player.play");
        return false;
      }
    }

    function play(options = {}) {
      if (!elements.lofiPlayer.src) updateTrack();
      if (!elements.lofiPlayer.src) return Promise.resolve(false);
      const version = ++playbackCommandVersion;
      desiredPlaying = true;
      return startPlayback(version, options);
    }

    async function pause(options = {}) {
      const { immediate = false, announcePlayback = false } = options;
      const version = ++playbackCommandVersion;
      desiredPlaying = false;
      const settings = transitionSettings();
      if (!immediate && settings.enabled && !elements.lofiPlayer.paused) {
        await musicEnvelope.fadeTo(0, settings.durationMs);
        if (version !== playbackCommandVersion || desiredPlaying) return false;
      }
      elements.lofiPlayer.pause();
      musicEnvelope.cancel({ gain: 1 });
      elements.playPauseBtn.textContent = t("player.play");
      if (announcePlayback) announce(t("player.paused"));
      return true;
    }

    function stop() {
      playbackCommandVersion += 1;
      desiredPlaying = false;
      musicEnvelope.cancel({ gain: 1 });
      elements.lofiPlayer.pause();
      elements.playPauseBtn.textContent = t("player.play");
      if (Number.isFinite(Number(elements.lofiPlayer.duration)) && Number(elements.lofiPlayer.duration) > 0) {
        elements.lofiPlayer.currentTime = 0;
      }
    }

    async function changeTrack(index, shouldResume) {
      if (!playerModel.isTrackPlayable(playlist[index])) return false;
      const version = ++playbackCommandVersion;
      desiredPlaying = shouldResume;
      const settings = transitionSettings();
      if (shouldResume && settings.enabled && !elements.lofiPlayer.paused) {
        await musicEnvelope.fadeTo(0, settings.durationMs);
        if (version !== playbackCommandVersion) return false;
      }
      elements.lofiPlayer.pause();
      musicEnvelope.cancel({ gain: 1 });
      currentTrackIndex = index;
      updateTrack();
      const sourceVersion = playbackCommandVersion;
      persistState();
      desiredPlaying = shouldResume;
      if (shouldResume) return startPlayback(sourceVersion);
      return true;
    }

    function playSelectedTrack(index) {
      return changeTrack(index, true);
    }

    function togglePlayback() {
      if (!elements.lofiPlayer.src) updateTrack();
      if (!elements.lofiPlayer.src) return;
      return desiredPlaying
        ? pause({ announcePlayback: true })
        : play({ announcePlayback: true });
    }

    function moveToAdjacentTrack(direction) {
      const shouldResume = desiredPlaying || !elements.lofiPlayer.paused || elements.lofiPlayer.ended;
      const nextIndex = playerModel.findAdjacentPlayableIndex(playlist, currentTrackIndex, direction);
      if (nextIndex < 0) return;
      return changeTrack(nextIndex, shouldResume);
    }

    function switchTrack() {
      return moveToAdjacentTrack(1);
    }

    function prevTrack() {
      return moveToAdjacentTrack(-1);
    }

    function togglePlaylistPanel(forceOpen) {
      const nextOpen = typeof forceOpen === "boolean"
        ? forceOpen
        : elements.playlistPanel.classList.contains("hidden");
      elements.playlistPanel.classList.toggle("hidden", !nextOpen);
      elements.playlistPanel.setAttribute("aria-hidden", String(!nextOpen));
      setDisclosureState(elements.playlistToggleBtn, nextOpen);
      if (nextOpen) {
        const firstTrack = elements.playlistItems.querySelector?.(".playlist-item:not([aria-disabled='true'])");
        firstTrack?.focus?.({ preventScroll: true });
      } else if (elements.playlistPanel.contains?.(elements.document.activeElement)) {
        elements.playlistToggleBtn?.focus?.({ preventScroll: true });
      }
    }

    function updateVolume() {
      const normalized = Number(elements.volumeSlider.value) / 100;
      musicEnvelope.setUserVolume(Number.isFinite(normalized) ? normalized : 0.68);
    }

    function settleTransition() {
      playbackCommandVersion += 1;
      musicEnvelope.cancel({ gain: 1 });
      if (!desiredPlaying) elements.lofiPlayer.pause();
    }

    function refreshLanguage() {
      elements.playPauseBtn.textContent = t(elements.lofiPlayer.paused ? "player.play" : "player.pause");
      renderPlaylist();
    }

    return {
      getUserVolume: () => musicEnvelope.getState().userVolume,
      loadMusicFolder,
      pause,
      persistState,
      play,
      prevTrack,
      removeMissingTracks,
      refreshLanguage,
      rescanMusicFolder,
      restorePersistedPlayer,
      settleTransition,
      switchTrack,
      stop,
      togglePlayback,
      togglePlaylistPanel,
      updateTrack,
      updateVolume,
      useDefaultTracks
    };
  }

  const api = { createPlayerController };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalScope) globalScope.InfiniteLofiPlayerController = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
