(function exposeInfiniteLofiPlayerController(globalScope) {
  function createPlayerController(options) {
    const {
      appStorage,
      desktopApp,
      elements,
      playerModel,
      defaultTracks,
      onArtworkChange = () => {},
      alert: showAlert = globalScope.alert?.bind(globalScope) || (() => {}),
      logger = globalScope.console
    } = options;

    let playlist = defaultTracks.map((track) => ({ ...track }));
    let currentTrackIndex = 0;
    let draggedItem = null;
    let localMusicFolder = null;
    let preserveUnavailableState = false;

    function persistState() {
      if (preserveUnavailableState) return;
      const activeTrack = playlist[currentTrackIndex];
      appStorage.update((state) => {
        state.player = {
          folderPath: localMusicFolder || "",
          trackOrder: playlist.map(playerModel.getTrackKey).filter(Boolean),
          activeTrackSrc: playerModel.getTrackKey(activeTrack)
        };
      });
    }

    function renderPlaylist() {
      elements.playlistItems.innerHTML = "";
      playlist.forEach((track, index) => {
        const itemButton = elements.document.createElement("button");
        itemButton.type = "button";
        itemButton.className = `playlist-item ${index === currentTrackIndex ? "is-active" : ""}`;
        itemButton.textContent = track.label;
        itemButton.draggable = true;
        itemButton.dataset.index = String(index);
        itemButton.title = `Play ${track.label}`;
        itemButton.addEventListener("click", () => playSelectedTrack(index));
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
    }

    function updateTrack() {
      const track = playlist[currentTrackIndex];
      if (!track) {
        elements.trackLabel.textContent = "No playable tracks";
        elements.lofiPlayer.removeAttribute("src");
        onArtworkChange(null);
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
      renderPlaylist();
    }

    async function restorePersistedPlayer() {
      const saved = appStorage.getState().player;
      if (!saved.folderPath) {
        playlist = playerModel.applyTrackOrder(playlist, saved.trackOrder);
        currentTrackIndex = playerModel.findActiveTrackIndex(playlist, saved.activeTrackSrc);
        updateTrack();
        return;
      }

      localMusicFolder = saved.folderPath;
      const folderName = localMusicFolder.split(/[\\/]/).pop() || "Local";
      if (!desktopApp || typeof desktopApp.scanMusicFolder !== "function") {
        preserveUnavailableState = true;
        elements.musicFolderDisplay.textContent = `${folderName} · Restore unavailable`;
        return;
      }

      try {
        const result = await desktopApp.scanMusicFolder(localMusicFolder);
        if (!result || result.error || !Array.isArray(result.tracks) || result.tracks.length === 0) {
          preserveUnavailableState = true;
          elements.musicFolderDisplay.textContent = `${folderName} · Folder unavailable`;
          elements.musicFolderDisplay.title = "Choose Load Folder to reconnect or select another music folder.";
          return;
        }
        playlist = playerModel.applyTrackOrder(result.tracks, saved.trackOrder);
        currentTrackIndex = playerModel.findActiveTrackIndex(playlist, saved.activeTrackSrc);
        elements.musicFolderDisplay.textContent = folderName;
        elements.musicFolderDisplay.title = localMusicFolder;
        updateTrack();
        persistState();
      } catch (error) {
        preserveUnavailableState = true;
        logger.error("Error restoring music folder:", error);
        elements.musicFolderDisplay.textContent = `${folderName} · Folder unreadable`;
        elements.musicFolderDisplay.title = "Choose Load Folder to reconnect or select another music folder.";
      }
    }

    async function loadMusicFolder() {
      if (!desktopApp || typeof desktopApp.selectMusicFolder !== "function") {
        showAlert("Music folder selection not supported");
        return;
      }
      try {
        const result = await desktopApp.selectMusicFolder();
        if (!result || !Array.isArray(result.tracks) || result.tracks.length === 0) {
          showAlert("No music files found in the selected folder");
          return;
        }
        playlist = result.tracks;
        localMusicFolder = result.folderPath;
        preserveUnavailableState = false;
        elements.musicFolderDisplay.textContent = localMusicFolder.split(/[\\/]/).pop() || "Local";
        currentTrackIndex = 0;
        updateTrack();
        persistState();
      } catch (error) {
        logger.error("Error loading music folder:", error);
        elements.musicFolderDisplay.textContent = "Folder unreadable · Try another";
      }
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
      currentTrackIndex = index;
      updateTrack();
      persistState();
      elements.lofiPlayer.play().catch(() => {
        elements.playPauseBtn.textContent = "Play";
      });
    }

    function togglePlayback() {
      if (!elements.lofiPlayer.src) updateTrack();
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

    function switchTrack() {
      currentTrackIndex = (currentTrackIndex + 1) % playlist.length;
      updateTrack();
      persistState();
      if (!elements.lofiPlayer.paused) elements.lofiPlayer.play().catch(() => {
        elements.playPauseBtn.textContent = "Play";
      });
    }

    function prevTrack() {
      currentTrackIndex = (currentTrackIndex - 1 + playlist.length) % playlist.length;
      updateTrack();
      persistState();
      if (!elements.lofiPlayer.paused) elements.lofiPlayer.play().catch(() => {
        elements.playPauseBtn.textContent = "Play";
      });
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
      restorePersistedPlayer,
      switchTrack,
      togglePlayback,
      togglePlaylistPanel,
      updateTrack,
      updateVolume
    };
  }

  const api = { createPlayerController };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalScope) globalScope.InfiniteLofiPlayerController = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
