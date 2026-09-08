(function exposeInfiniteLofiPlayerController(globalScope) {
  function createPlayerController(options) {
    const {
      appStorage,
      desktopApp,
      elements,
      playerModel,
      defaultTracks,
      onArtworkChange = () => {},
      onTrackChange = () => {},
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
          folderPath: localMusicFolder || "",
          queue: playerModel.createQueueSnapshot(playlist),
          activeTrackKey: playerModel.getTrackKey(activeTrack)
        };
      });
    }

    function updateFolderStatus() {
      const missingCount = getMissingCount();
      const playableCount = playlist.filter(playerModel.isTrackPlayable).length;
      const folderName = localMusicFolder?.split(/[\\/]/).pop() || "Default";
      let status = `${folderName} · ${playableCount} track${playableCount === 1 ? "" : "s"}`;
      if (isScanning) status = `${folderName} · Scanning…`;
      else if (folderUnavailable) status = `${folderName} · Reconnect needed`;
      else if (missingCount > 0) status += ` · ${missingCount} missing`;
      elements.musicFolderDisplay.textContent = status;
      elements.musicFolderDisplay.title = localMusicFolder || "Bundled Infinite Lo-Fi tracks";
      if (elements.playlistStatus) {
        elements.playlistStatus.textContent = folderUnavailable
          ? "The saved folder cannot be read. Choose Reconnect Folder to locate it again."
          : missingCount > 0
          ? `${missingCount} saved track${missingCount === 1 ? " is" : "s are"} unavailable. Restore the file and rescan, or remove missing entries.`
          : localMusicFolder
          ? "Queue order and the current track are saved automatically."
          : "Using the bundled offline playlist.";
      }
      if (elements.loadMusicFolderBtn) {
        elements.loadMusicFolderBtn.textContent = folderUnavailable ? "Reconnect Folder" : "Load Folder";
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

        const label = elements.document.createElement("span");
        label.className = "playlist-item-label";
        label.textContent = track.label;
        itemButton.appendChild(label);
        if (track.isMissing === true) {
          const status = elements.document.createElement("span");
          status.className = "playlist-item-status";
          status.textContent = "Missing";
          itemButton.appendChild(status);
        }

        itemButton.title = track.isMissing === true
          ? `${track.label} is unavailable. Restore it and choose Rescan.`
          : `Play ${track.label}`;
        itemButton.addEventListener("click", () => {
          if (track.isMissing === true) {
            showAlert("This track is missing. Restore the file and choose Rescan, or remove missing entries.");
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
      const track = getActiveTrack();
      if (!playerModel.isTrackPlayable(track)) {
        elements.trackLabel.textContent = playlist.length > 0 ? "No playable tracks" : "Playlist is empty";
        elements.lofiPlayer.pause();
        elements.lofiPlayer.removeAttribute("src");
        elements.lofiPlayer.load?.();
        elements.playPauseBtn.textContent = "Play";
        onArtworkChange(null);
        onTrackChange(null);
        renderPlaylist();
        return;
      }
      elements.trackLabel.textContent = track.label;
      elements.lofiPlayer.src = track.srcUrl || track.src;
      onArtworkChange(
        track.artworkUrl
          ? { url: track.artworkUrl, name: track.artworkName || `${track.label} Cover` }
          : null
      );
      onTrackChange(track);
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
      const shouldResume = !elements.lofiPlayer.paused;
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
        setPlaylistFromScan(result.tracks, savedQueue, activeTrackKey);
        persistState();
        if (shouldResume && playerModel.isTrackPlayable(getActiveTrack())) {
          elements.lofiPlayer.play().catch(() => {
            elements.playPauseBtn.textContent = "Play";
          });
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
        showAlert("Music folder selection is not supported.");
        return;
      }
      try {
        const result = await desktopApp.selectMusicFolder();
        if (!result) return;
        if (!Array.isArray(result.tracks) || result.tracks.length === 0) {
          showAlert("No music files were found in the selected folder.");
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
        elements.musicFolderDisplay.textContent = "Folder unreadable · Try another";
      }
    }

    async function rescanMusicFolder() {
      if (!localMusicFolder) return;
      const queue = playerModel.createQueueSnapshot(playlist);
      const activeTrackKey = playerModel.getTrackKey(getActiveTrack());
      await scanCurrentFolder(queue, activeTrackKey);
    }

    function useDefaultTracks() {
      elements.lofiPlayer.pause();
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

    function playSelectedTrack(index) {
      if (!playerModel.isTrackPlayable(playlist[index])) return;
      currentTrackIndex = index;
      updateTrack();
      persistState();
      elements.lofiPlayer.play().catch(() => {
        elements.playPauseBtn.textContent = "Play";
      });
    }

    function togglePlayback() {
      if (!elements.lofiPlayer.src) updateTrack();
      if (!elements.lofiPlayer.src) return;
      if (elements.lofiPlayer.paused) {
        elements.lofiPlayer.play().then(() => {
          elements.playPauseBtn.textContent = "Pause";
        }).catch(() => {
          elements.playPauseBtn.textContent = "Play";
        });
      } else {
        elements.lofiPlayer.pause();
        elements.playPauseBtn.textContent = "Play";
      }
    }

    function moveToAdjacentTrack(direction) {
      const shouldResume = !elements.lofiPlayer.paused || elements.lofiPlayer.ended;
      const nextIndex = playerModel.findAdjacentPlayableIndex(playlist, currentTrackIndex, direction);
      if (nextIndex < 0) return;
      currentTrackIndex = nextIndex;
      updateTrack();
      persistState();
      if (shouldResume) elements.lofiPlayer.play().catch(() => {
        elements.playPauseBtn.textContent = "Play";
      });
    }

    function switchTrack() {
      moveToAdjacentTrack(1);
    }

    function prevTrack() {
      moveToAdjacentTrack(-1);
    }

    function togglePlaylistPanel() {
      elements.playlistPanel.classList.toggle("hidden");
    }

    function updateVolume() {
      const normalized = Number(elements.volumeSlider.value) / 100;
      elements.lofiPlayer.volume = Number.isFinite(normalized) ? normalized : 0.68;
    }

    return {
      loadMusicFolder,
      persistState,
      prevTrack,
      removeMissingTracks,
      rescanMusicFolder,
      restorePersistedPlayer,
      switchTrack,
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
