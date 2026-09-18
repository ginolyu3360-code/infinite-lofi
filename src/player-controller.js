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
      onLayoutChange = () => {},
      announce = () => {},
      getAudioTransitionSettings = () => audioTransition.DEFAULT_AUDIO_TRANSITIONS,
      gainEnvelopeFactory = audioTransition.createGainEnvelope,
      random = Math.random,
      scheduleDelayed = globalScope.setTimeout?.bind(globalScope) || setTimeout,
      cancelDelayed = globalScope.clearTimeout?.bind(globalScope) || clearTimeout,
      t = defaultTranslate,
      setDisclosureState = (trigger, expanded) => trigger?.setAttribute?.("aria-expanded", String(expanded)),
      alert: showAlert = globalScope.alert?.bind(globalScope) || (() => {}),
      logger = globalScope.console
    } = options;

    const bundledTracks = defaultTracks.map((track) => ({ ...track, isMissing: false }));
    let playlist = bundledTracks.map((track) => ({ ...track }));
    let currentTrackIndex = 0;
    let draggedItem = null;
    let swapSourceKey = "";
    let pendingSingleClick = null;
    let localMusicFolder = null;
    let folderUnavailable = false;
    let duplicateCount = 0;
    let isScanning = false;
    let scanCommandVersion = 0;
    let playbackMode = "sequential";
    let shuffleRemainingKeys = [];
    let shuffleHistoryKeys = [];
    let playbackCommandVersion = 0;
    let desiredPlaying = false;
    const musicEnvelope = gainEnvelopeFactory({
      audio: elements.lofiPlayer,
      userVolume: Number(elements.volumeSlider.value) / 100
    });
    const compactPlaylistParent = elements.playlistPanel.parentNode || null;
    const compactPlaylistNextSibling = elements.playlistPanel.nextSibling || null;

    function movePlaylistToViewportLayer() {
      const target = elements.document.body;
      if (!compactPlaylistParent || !target?.appendChild || elements.playlistPanel.parentNode === target) return;
      target.appendChild(elements.playlistPanel);
    }

    function restorePlaylistToPlayer() {
      if (!compactPlaylistParent?.appendChild || elements.playlistPanel.parentNode === compactPlaylistParent) return;
      if (compactPlaylistNextSibling?.parentNode === compactPlaylistParent && compactPlaylistParent.insertBefore) {
        compactPlaylistParent.insertBefore(elements.playlistPanel, compactPlaylistNextSibling);
      } else {
        compactPlaylistParent.appendChild(elements.playlistPanel);
      }
    }

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
          activeTrackKey: playerModel.getTrackKey(activeTrack),
          playbackMode
        };
      });
    }

    function resetShuffleState() {
      shuffleRemainingKeys = [];
      shuffleHistoryKeys = [];
    }

    function renderPlaybackMode() {
      if (elements.repeatModeBtn) {
        const active = playbackMode === "repeat-one";
        elements.repeatModeBtn.classList.toggle("is-active", active);
        elements.repeatModeBtn.setAttribute("aria-pressed", String(active));
      }
      if (elements.shuffleModeBtn) {
        const active = playbackMode === "shuffle";
        elements.shuffleModeBtn.classList.toggle("is-active", active);
        elements.shuffleModeBtn.setAttribute("aria-pressed", String(active));
      }
      elements.lofiPlayer.loop = playbackMode === "repeat-one";
    }

    function setPlaybackMode(nextMode) {
      playbackMode = ["repeat-one", "shuffle"].includes(nextMode) ? nextMode : "sequential";
      resetShuffleState();
      renderPlaybackMode();
      persistState();
      announce(t(playbackMode === "repeat-one"
        ? "player.repeatOneEnabled"
        : playbackMode === "shuffle"
        ? "player.shuffleEnabled"
        : "player.sequentialEnabled"));
    }

    function toggleRepeatMode() {
      setPlaybackMode(playbackMode === "repeat-one" ? "sequential" : "repeat-one");
    }

    function toggleShuffleMode() {
      setPlaybackMode(playbackMode === "shuffle" ? "sequential" : "shuffle");
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
        const baseStatus = folderUnavailable
          ? t("player.folderUnavailable")
          : missingCount > 0
          ? t(missingCount === 1 ? "player.savedMissingOne" : "player.savedMissing", { count: missingCount })
          : localMusicFolder
          ? t("player.localStatus")
          : t("player.bundledStatus");
        const duplicateStatus = duplicateCount > 0
          ? t(duplicateCount === 1 ? "player.duplicateSkippedOne" : "player.duplicatesSkipped", { count: duplicateCount })
          : "";
        elements.playlistStatus.textContent = [baseStatus, duplicateStatus].filter(Boolean).join(" ");
      }
      if (elements.loadMusicFolderBtn) {
        elements.loadMusicFolderBtn.textContent = t(folderUnavailable ? "player.reconnectFolder" : "player.loadFolder");
      }
      if (elements.rescanMusicFolderBtn) {
        elements.rescanMusicFolderBtn.hidden = false;
        elements.rescanMusicFolderBtn.disabled = isScanning;
      }
      elements.playlistPanel.setAttribute("aria-busy", String(isScanning));
      if (elements.removeMissingTracksBtn) elements.removeMissingTracksBtn.hidden = missingCount === 0;
      if (elements.useDefaultTracksBtn) elements.useDefaultTracksBtn.hidden = !localMusicFolder;
      if (elements.showAllQueueBtn) elements.showAllQueueBtn.hidden = playlist.length <= 6;
    }

    function cancelPendingSingleClick() {
      if (pendingSingleClick !== null) cancelDelayed(pendingSingleClick);
      pendingSingleClick = null;
    }

    function swapPlaylistPositions(fromIndex, toIndex) {
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= playlist.length || toIndex >= playlist.length) return false;
      const activeKey = playerModel.getTrackKey(getActiveTrack());
      [playlist[fromIndex], playlist[toIndex]] = [playlist[toIndex], playlist[fromIndex]];
      currentTrackIndex = playerModel.findActiveTrackIndex(playlist, activeKey);
      resetShuffleState();
      renderPlaylist();
      persistState();
      return true;
    }

    function handleSwapSelection(trackKey) {
      if (!trackKey) return;
      if (!swapSourceKey) {
        swapSourceKey = trackKey;
        updatePlaylistItemStates();
        announce(t("player.swapSelected"));
        return;
      }
      if (swapSourceKey === trackKey) {
        swapSourceKey = "";
        updatePlaylistItemStates();
        announce(t("player.swapCancelled"));
        return;
      }
      const fromIndex = playlist.findIndex((track) => playerModel.getTrackKey(track) === swapSourceKey);
      const toIndex = playlist.findIndex((track) => playerModel.getTrackKey(track) === trackKey);
      swapSourceKey = "";
      if (swapPlaylistPositions(fromIndex, toIndex)) announce(t("player.swapComplete"));
    }

    function updatePlaylistItemStates() {
      Array.from(elements.playlistItems.children || []).forEach((itemButton) => {
        const itemIndex = Number(itemButton.dataset.index);
        const trackKey = itemButton.dataset.trackKey || "";
        const isActive = itemIndex === currentTrackIndex;
        const isSwapSource = trackKey === swapSourceKey;
        itemButton.classList.toggle("is-active", isActive);
        itemButton.classList.toggle("is-swap-source", isSwapSource);
        itemButton.setAttribute("aria-pressed", String(isSwapSource));
        if (isActive) itemButton.setAttribute("aria-current", "true");
        else itemButton.removeAttribute("aria-current");
      });
      renderPlaybackMode();
      updateFolderStatus();
    }

    function getPlaylistItem(event) {
      return event?.target?.closest?.(".playlist-item") || null;
    }

    function handlePlaylistClick(event) {
      const itemButton = getPlaylistItem(event);
      if (!itemButton) return;
      const detail = Number(event.detail);
      if (Number.isFinite(detail) && detail > 1) return;
      const trackKey = itemButton.dataset.trackKey || "";
      cancelPendingSingleClick();
      if (!Number.isFinite(detail) || detail === 0) {
        handleSwapSelection(trackKey);
        return;
      }
      pendingSingleClick = scheduleDelayed(() => {
        pendingSingleClick = null;
        handleSwapSelection(trackKey);
      }, 220);
    }

    function handlePlaylistDoubleClick(event) {
      const itemButton = getPlaylistItem(event);
      if (!itemButton) return;
      cancelPendingSingleClick();
      swapSourceKey = "";
      const selectedIndex = Number(itemButton.dataset.index);
      const track = playlist[selectedIndex];
      if (track?.isMissing === true) {
        showAlert(t("player.trackMissingAlert"));
        updatePlaylistItemStates();
        return;
      }
      playSelectedTrack(selectedIndex);
    }

    function handlePlaylistKeydown(event) {
      const itemButton = getPlaylistItem(event);
      if (!itemButton) return;
      if (event.key === "Escape" && swapSourceKey) {
        event.preventDefault();
        swapSourceKey = "";
        updatePlaylistItemStates();
        announce(t("player.swapCancelled"));
      } else if (event.key === "Enter" && event.shiftKey && itemButton.getAttribute("aria-disabled") !== "true") {
        event.preventDefault();
        cancelPendingSingleClick();
        swapSourceKey = "";
        playSelectedTrack(Number(itemButton.dataset.index));
      }
    }

    function handlePlaylistDragStart(event) {
      const itemButton = getPlaylistItem(event);
      if (!itemButton) return;
      cancelPendingSingleClick();
      swapSourceKey = "";
      draggedItem = itemButton;
      updatePlaylistItemStates();
      itemButton.classList.add("is-dragging");
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    }

    function handlePlaylistDragEnd(event) {
      const itemButton = getPlaylistItem(event);
      itemButton?.classList.remove("is-dragging");
      draggedItem = null;
    }

    function handlePlaylistDragOver(event) {
      const itemButton = getPlaylistItem(event);
      if (!itemButton) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      if (draggedItem && draggedItem !== itemButton) itemButton.classList.add("is-drag-over");
    }

    function handlePlaylistDragLeave(event) {
      getPlaylistItem(event)?.classList.remove("is-drag-over");
    }

    function handlePlaylistDrop(event) {
      const itemButton = getPlaylistItem(event);
      if (!itemButton) return;
      event.preventDefault();
      itemButton.classList.remove("is-drag-over");
      if (draggedItem && draggedItem !== itemButton) {
        reorderPlaylist(Number(draggedItem.dataset.index), Number(itemButton.dataset.index));
      }
    }

    function renderPlaylist() {
      elements.playlistItems.innerHTML = "";
      playlist.forEach((track, index) => {
        const trackKey = playerModel.getTrackKey(track);
        const itemButton = elements.document.createElement("button");
        itemButton.type = "button";
        itemButton.className = [
          "playlist-item",
          index === currentTrackIndex ? "is-active" : "",
          trackKey === swapSourceKey ? "is-swap-source" : "",
          track.isMissing === true ? "is-missing" : ""
        ].filter(Boolean).join(" ");
        itemButton.draggable = true;
        itemButton.dataset.index = String(index);
        itemButton.dataset.trackKey = trackKey;
        itemButton.setAttribute("aria-disabled", String(track.isMissing === true));
        itemButton.setAttribute("aria-pressed", String(trackKey === swapSourceKey));
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
          : t("player.queueTrackTitle", { title: track.label });
        elements.playlistItems.appendChild(itemButton);
      });
      renderPlaybackMode();
      updateFolderStatus();
    }

    function updateTrack({ rebuildPlaylist = true } = {}) {
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
        if (rebuildPlaylist) renderPlaylist();
        else updatePlaylistItemStates();
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
      if (rebuildPlaylist) renderPlaylist();
      else updatePlaylistItemStates();
    }

    function setPlaylistFromScan(tracks, savedQueue, activeTrackKey) {
      playlist = playerModel.mergePlaylistTracks(tracks, savedQueue);
      currentTrackIndex = playerModel.findActiveTrackIndex(playlist, activeTrackKey);
      folderUnavailable = false;
      swapSourceKey = "";
      resetShuffleState();
      updateTrack();
    }

    function removeSkippedDuplicates(savedQueue, duplicateKeys) {
      const skippedKeys = new Set(Array.isArray(duplicateKeys) ? duplicateKeys.filter((key) => typeof key === "string") : []);
      return skippedKeys.size > 0
        ? savedQueue.filter((track) => !skippedKeys.has(playerModel.getTrackKey(track)))
        : savedQueue;
    }

    function loadDefaultLibrary(savedQueue = [], activeTrackKey = "", { shouldStop = true } = {}) {
      scanCommandVersion += 1;
      isScanning = false;
      if (shouldStop) stop();
      localMusicFolder = null;
      folderUnavailable = false;
      duplicateCount = 0;
      setPlaylistFromScan(bundledTracks, savedQueue, activeTrackKey);
      persistState();
    }

    async function scanCurrentFolder(savedQueue, activeTrackKey) {
      if (!localMusicFolder || !desktopApp || typeof desktopApp.scanMusicFolder !== "function") {
        folderUnavailable = Boolean(localMusicFolder);
        renderPlaylist();
        return false;
      }
      const folderPath = localMusicFolder;
      const scanVersion = ++scanCommandVersion;
      const shouldResume = desiredPlaying || !elements.lofiPlayer.paused;
      const playbackVersionBeforeScan = playbackCommandVersion;
      isScanning = true;
      updateFolderStatus();
      try {
        const result = await desktopApp.scanMusicFolder(folderPath);
        if (scanVersion !== scanCommandVersion || localMusicFolder !== folderPath) return false;
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
        duplicateCount = Math.max(0, Math.floor(Number(result.duplicateCount) || 0));
        const resumeAfterScan = shouldResume && playbackCommandVersion === playbackVersionBeforeScan;
        setPlaylistFromScan(
          result.tracks,
          removeSkippedDuplicates(savedQueue, result.duplicateKeys),
          activeTrackKey
        );
        persistState();
        if (resumeAfterScan && playerModel.isTrackPlayable(getActiveTrack())) {
          play();
        }
        return true;
      } catch (error) {
        if (scanVersion !== scanCommandVersion || localMusicFolder !== folderPath) return false;
        folderUnavailable = true;
        logger.error("Error scanning music folder:", error);
        renderPlaylist();
        return false;
      } finally {
        if (scanVersion === scanCommandVersion) {
          isScanning = false;
          updateFolderStatus();
        }
      }
    }

    async function restorePersistedPlayer() {
      const saved = appStorage.getState().player;
      const savedQueue = Array.isArray(saved.queue) ? saved.queue : [];
      playbackMode = ["repeat-one", "shuffle"].includes(saved.playbackMode)
        ? saved.playbackMode
        : "sequential";
      renderPlaybackMode();
      if (!saved.folderPath) {
        loadDefaultLibrary(savedQueue, saved.activeTrackKey, { shouldStop: false });
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
        scanCommandVersion += 1;
        isScanning = false;
        localMusicFolder = result.folderPath;
        duplicateCount = Math.max(0, Math.floor(Number(result.duplicateCount) || 0));
        setPlaylistFromScan(
          result.tracks,
          removeSkippedDuplicates(savedQueue, result.duplicateKeys),
          activeTrackKey
        );
        persistState();
      } catch (error) {
        logger.error("Error loading music folder:", error);
        elements.musicFolderDisplay.textContent = t("player.folderUnreadable");
      }
    }

    async function rescanMusicFolder() {
      const queue = playerModel.createQueueSnapshot(playlist);
      const activeTrackKey = playerModel.getTrackKey(getActiveTrack());
      if (!localMusicFolder) {
        loadDefaultLibrary(queue, activeTrackKey, { shouldStop: false });
        return;
      }
      await scanCurrentFolder(queue, activeTrackKey);
    }

    function useDefaultTracks() {
      loadDefaultLibrary([], "", { shouldStop: true });
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
      resetShuffleState();
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
      if (desiredPlaying && !elements.lofiPlayer.paused && !elements.lofiPlayer.ended) {
        return Promise.resolve(true);
      }
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
      updateTrack({ rebuildPlaylist: false });
      const sourceVersion = playbackCommandVersion;
      persistState();
      desiredPlaying = shouldResume;
      if (shouldResume) return startPlayback(sourceVersion);
      return true;
    }

    function playSelectedTrack(index) {
      if (playbackMode === "shuffle" && index !== currentTrackIndex) {
        const currentKey = playerModel.getTrackKey(getActiveTrack());
        if (currentKey) shuffleHistoryKeys.push(currentKey);
        const selectedKey = playerModel.getTrackKey(playlist[index]);
        shuffleRemainingKeys = shuffleRemainingKeys.filter((key) => key !== selectedKey);
      }
      return changeTrack(index, true);
    }

    function togglePlayback() {
      if (!elements.lofiPlayer.src) updateTrack();
      if (!elements.lofiPlayer.src) return;
      return desiredPlaying
        ? pause({ announcePlayback: true })
        : play({ announcePlayback: true });
    }

    function shuffleKeys(keys) {
      const shuffled = [...keys];
      for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.max(0, Math.min(0.999999, Number(random()) || 0)) * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
      }
      return shuffled;
    }

    function nextShuffleIndex(direction) {
      const playableKeys = playlist.filter(playerModel.isTrackPlayable).map(playerModel.getTrackKey);
      const currentKey = playerModel.getTrackKey(getActiveTrack());
      if (direction < 0) {
        while (shuffleHistoryKeys.length > 0) {
          const previousKey = shuffleHistoryKeys.pop();
          const previousIndex = playlist.findIndex((track) => playerModel.getTrackKey(track) === previousKey && playerModel.isTrackPlayable(track));
          if (previousIndex >= 0) {
            if (currentKey) shuffleRemainingKeys.unshift(currentKey);
            return previousIndex;
          }
        }
        return playerModel.findAdjacentPlayableIndex(playlist, currentTrackIndex, -1);
      }
      shuffleRemainingKeys = shuffleRemainingKeys.filter((key) => playableKeys.includes(key) && key !== currentKey);
      if (shuffleRemainingKeys.length === 0) {
        shuffleRemainingKeys = shuffleKeys(playableKeys.filter((key) => key !== currentKey));
      }
      const nextKey = shuffleRemainingKeys.shift();
      const nextIndex = playlist.findIndex((track) => playerModel.getTrackKey(track) === nextKey);
      if (nextIndex >= 0 && nextIndex !== currentTrackIndex) {
        if (currentKey) shuffleHistoryKeys.push(currentKey);
        return nextIndex;
      }
      return playerModel.findAdjacentPlayableIndex(playlist, currentTrackIndex, 1);
    }

    function moveToAdjacentTrack(direction) {
      const shouldResume = desiredPlaying || !elements.lofiPlayer.paused || elements.lofiPlayer.ended;
      const nextIndex = playbackMode === "shuffle"
        ? nextShuffleIndex(direction)
        : playerModel.findAdjacentPlayableIndex(playlist, currentTrackIndex, direction);
      if (nextIndex < 0) return;
      return changeTrack(nextIndex, shouldResume);
    }

    function switchTrack() {
      return moveToAdjacentTrack(1);
    }

    function prevTrack() {
      return moveToAdjacentTrack(-1);
    }

    function handleTrackEnded() {
      if (playbackMode === "repeat-one") {
        elements.lofiPlayer.currentTime = 0;
        desiredPlaying = false;
        return play();
      }
      return switchTrack();
    }

    function togglePlaylistPanel(forceOpen) {
      const nextOpen = typeof forceOpen === "boolean"
        ? forceOpen
        : elements.playlistPanel.classList.contains("hidden");
      elements.playlistPanel.classList.toggle("hidden", !nextOpen);
      if (!nextOpen) {
        elements.playlistPanel.classList.remove("is-expanded");
        restorePlaylistToPlayer();
      }
      elements.playlistPanel.setAttribute("aria-hidden", String(!nextOpen));
      setDisclosureState(elements.playlistToggleBtn, nextOpen);
      elements.document.body?.classList?.toggle("is-queue-open", nextOpen);
      elements.document.body?.classList?.toggle("is-queue-expanded", nextOpen && elements.playlistPanel.classList.contains("is-expanded"));
      if (!nextOpen) {
        setDisclosureState(elements.showAllQueueBtn, false);
        elements.drawerBackdrop?.classList?.remove("visible");
      }
      if (nextOpen) {
        const firstTrack = elements.playlistItems.querySelector?.(".playlist-item:not([aria-disabled='true'])");
        firstTrack?.focus?.({ preventScroll: true });
      } else if (elements.playlistPanel.contains?.(elements.document.activeElement)) {
        elements.playlistToggleBtn?.focus?.({ preventScroll: true });
      }
      onLayoutChange({ queueOpen: nextOpen, queueExpanded: false });
    }

    function toggleExpandedQueue(forceExpanded) {
      if (forceExpanded === false && elements.playlistPanel.classList.contains("hidden")) return;
      if (elements.playlistPanel.classList.contains("hidden")) togglePlaylistPanel(true);
      const nextExpanded = typeof forceExpanded === "boolean"
        ? forceExpanded
        : !elements.playlistPanel.classList.contains("is-expanded");
      if (nextExpanded) movePlaylistToViewportLayer();
      elements.playlistPanel.classList.toggle("is-expanded", nextExpanded);
      if (!nextExpanded) restorePlaylistToPlayer();
      elements.document.body?.classList?.toggle("is-queue-expanded", nextExpanded);
      setDisclosureState(elements.showAllQueueBtn, nextExpanded);
      elements.drawerBackdrop?.classList?.toggle("visible", nextExpanded);
      if (elements.showAllQueueBtn) {
        elements.showAllQueueBtn.textContent = t(nextExpanded ? "player.compactQueue" : "player.showAll");
        elements.showAllQueueBtn.title = t(nextExpanded ? "player.compactQueueTitle" : "player.showAllTitle");
      }
      onLayoutChange({ queueOpen: true, queueExpanded: nextExpanded });
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
      if (elements.showAllQueueBtn) {
        const expanded = elements.playlistPanel.classList.contains("is-expanded");
        elements.showAllQueueBtn.textContent = t(expanded ? "player.compactQueue" : "player.showAll");
        elements.showAllQueueBtn.title = t(expanded ? "player.compactQueueTitle" : "player.showAllTitle");
      }
      renderPlaylist();
    }

    elements.playlistItems.addEventListener("click", handlePlaylistClick);
    elements.playlistItems.addEventListener("dblclick", handlePlaylistDoubleClick);
    elements.playlistItems.addEventListener("keydown", handlePlaylistKeydown);
    elements.playlistItems.addEventListener("dragstart", handlePlaylistDragStart);
    elements.playlistItems.addEventListener("dragend", handlePlaylistDragEnd);
    elements.playlistItems.addEventListener("dragover", handlePlaylistDragOver);
    elements.playlistItems.addEventListener("dragleave", handlePlaylistDragLeave);
    elements.playlistItems.addEventListener("drop", handlePlaylistDrop);

    return {
      getUserVolume: () => musicEnvelope.getState().userVolume,
      handleTrackEnded,
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
      toggleExpandedQueue,
      togglePlayback,
      toggleRepeatMode,
      toggleShuffleMode,
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
