(function exposeInfiniteLofiBindings(globalScope) {
  function isTypingElement(target, HTMLElementType) {
    if (!target || typeof HTMLElementType !== "function" || !(target instanceof HTMLElementType)) {
      return false;
    }
    return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
  }

  function bindKeyboardShortcuts(options) {
    const {
      window: targetWindow,
      HTMLElement: HTMLElementType,
      elements,
      actions,
      isShortcutEnabled,
      isShowcaseModeEnabled,
      clamp
    } = options;

    targetWindow.addEventListener("keydown", (event) => {
      const key = event.key;
      const lowerKey = typeof key === "string" ? key.toLowerCase() : "";
      const isMeta = event.metaKey || event.ctrlKey;
      const isTyping = isTypingElement(event.target, HTMLElementType);

      if ((key === "?" || (key === "/" && event.shiftKey)) && isShortcutEnabled("helpToggle")) {
        event.preventDefault();
        actions.toggleShortcutHelp();
        return;
      }
      if (key === "Escape" && isShowcaseModeEnabled()) {
        event.preventDefault();
        actions.toggleShowcaseMode(false);
        return;
      }
      if (key === "Escape" && isShortcutEnabled("closePanels")) {
        if (elements.shortcutHelpOverlay && !elements.shortcutHelpOverlay.classList.contains("hidden")) {
          event.preventDefault();
          actions.toggleShortcutHelp(false);
        }
        if (!elements.playlistPanel.classList.contains("hidden")) {
          event.preventDefault();
          elements.playlistPanel.classList.add("hidden");
        }
        if (elements.statsDrawer.classList.contains("is-open")) {
          event.preventDefault();
          actions.toggleStatsDrawer(false);
        }
        if (elements.backgroundDrawer?.classList.contains("is-open")) {
          event.preventDefault();
          actions.toggleBackgroundDrawer(false);
        }
        if (elements.focusPlanDrawer?.classList.contains("is-open")) {
          event.preventDefault();
          actions.toggleFocusPlanDrawer(false);
        }
        return;
      }
      if (isTyping && !isMeta) return;

      if (isShortcutEnabled("timerToggle") && isMeta && key === "Enter") {
        event.preventDefault();
        actions.toggleTimer();
        return;
      }
      if (isShortcutEnabled("timerReset") && isMeta && lowerKey === "backspace" && !event.shiftKey) {
        event.preventDefault();
        actions.resetTimer();
        return;
      }
      if (isShortcutEnabled("notesFocus") && isMeta && event.shiftKey && lowerKey === "n") {
        event.preventDefault();
        elements.notesInput.focus();
        elements.notesInput.setSelectionRange(elements.notesInput.value.length, elements.notesInput.value.length);
        return;
      }
      if (isShortcutEnabled("notesSave") && isMeta && lowerKey === "s") {
        event.preventDefault();
        actions.saveNotesNow();
        return;
      }
      if (isShortcutEnabled("notesClear") && isMeta && event.shiftKey && lowerKey === "backspace") {
        event.preventDefault();
        actions.clearNotesWithConfirm();
        return;
      }
      if (isShortcutEnabled("playPause") && lowerKey === "p") {
        event.preventDefault();
        actions.togglePlayback();
        return;
      }
      if (isShortcutEnabled("nextTrack") && lowerKey === "n") {
        event.preventDefault();
        actions.switchTrack();
        return;
      }
      if (isShortcutEnabled("prevTrack") && lowerKey === "b") {
        event.preventDefault();
        actions.prevTrack();
        return;
      }
      if (isShortcutEnabled("togglePlaylist") && lowerKey === "l") {
        event.preventDefault();
        actions.togglePlaylistPanel();
        return;
      }
      if (isShortcutEnabled("toggleStats") && lowerKey === "s") {
        event.preventDefault();
        actions.toggleStatsDrawer();
        return;
      }
      if (isShortcutEnabled("statsToday") && key === "1") {
        event.preventDefault();
        actions.setStatsRange("today");
        return;
      }
      if (isShortcutEnabled("statsWeek") && key === "2") {
        event.preventDefault();
        actions.setStatsRange("week");
        return;
      }
      if (isShortcutEnabled("statsMonth") && key === "3") {
        event.preventDefault();
        actions.setStatsRange("month");
        return;
      }
      if (isShortcutEnabled("loadFolder") && isMeta && lowerKey === "o") {
        event.preventDefault();
        actions.loadMusicFolder();
        return;
      }
      if (isShortcutEnabled("seekBack") && key === "ArrowLeft") {
        event.preventDefault();
        elements.lofiPlayer.currentTime = Math.max(0, (elements.lofiPlayer.currentTime || 0) - 5);
        return;
      }
      if (isShortcutEnabled("seekForward") && key === "ArrowRight") {
        event.preventDefault();
        const duration = Number.isFinite(elements.lofiPlayer.duration) ? elements.lofiPlayer.duration : 0;
        elements.lofiPlayer.currentTime = Math.min(
          duration || Number.MAX_SAFE_INTEGER,
          (elements.lofiPlayer.currentTime || 0) + 5
        );
        return;
      }
      if (isShortcutEnabled("volumeUp") && key === "ArrowUp") {
        event.preventDefault();
        elements.volumeSlider.value = String(
          clamp(Math.round((elements.lofiPlayer.volume + 0.05) * 100), 0, 100)
        );
        actions.updateVolume();
        actions.saveUiSettings();
        return;
      }
      if (isShortcutEnabled("volumeDown") && key === "ArrowDown") {
        event.preventDefault();
        elements.volumeSlider.value = String(
          clamp(Math.round((elements.lofiPlayer.volume - 0.05) * 100), 0, 100)
        );
        actions.updateVolume();
        actions.saveUiSettings();
      }
    });
  }

  function applyHoverHints(document, HTMLElementType) {
    const elements = document.querySelectorAll(
      ["button", "input[type='range']", "input[type='number']", "input[type='checkbox']", ".note-tab", ".playlist-item"].join(",")
    );
    elements.forEach((element) => {
      if (!(element instanceof HTMLElementType) || (element.title && element.title.trim())) return;
      const explicitLabel = element.getAttribute("aria-label") || "";
      const textLabel = typeof element.textContent === "string" ? element.textContent.trim() : "";
      const label = (explicitLabel || textLabel).replace(/\s+/g, " ").trim();
      if (label) element.title = label.length > 52 ? `${label.slice(0, 49)}...` : label;
    });
  }

  function bindSwipeToClose(element, onClose, threshold = 72) {
    if (!element || typeof onClose !== "function") return;
    let gesture = null;
    element.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" || event.button !== 0) return;
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY };
    });
    element.addEventListener("pointerup", (event) => {
      if (!gesture || gesture.id !== event.pointerId) return;
      const horizontalDistance = event.clientX - gesture.x;
      const verticalDistance = Math.abs(event.clientY - gesture.y);
      gesture = null;
      if (horizontalDistance >= threshold && horizontalDistance > verticalDistance * 1.2) onClose();
    });
    element.addEventListener("pointercancel", () => {
      gesture = null;
    });
  }

  function bindUiEvents(options) {
    const { window: targetWindow, document, elements: e, actions: a, formatTime } = options;
    const on = (element, eventName, handler, listenerOptions) => {
      if (element) element.addEventListener(eventName, handler, listenerOptions);
    };

    on(e.timerToggle, "click", a.toggleTimer);
    on(e.timerReset, "click", a.resetTimer);
    on(e.focusPlanToggleBtn, "click", () => a.toggleFocusPlanDrawer());
    on(e.focusPlanCloseBtn, "click", () => a.toggleFocusPlanDrawer(false));
    on(e.focusPlanApplyBtn, "click", a.applyFocusPlanSettings);
    [
      e.focusMinutesInput,
      e.shortBreakMinutesInput,
      e.longBreakMinutesInput,
      e.focusSessionsInput,
      e.dailyGoalMinutesInput
    ].forEach((input) => on(input, "blur", a.normalizeConfigInputDisplay));
    on(e.statsToggleBtn, "click", () => a.toggleStatsDrawer());
    on(e.statsCloseBtn, "click", () => a.toggleStatsDrawer(false));
    on(e.statsRangeTodayBtn, "click", () => a.setStatsRange("today"));
    on(e.statsRangeWeekBtn, "click", () => a.setStatsRange("week"));
    on(e.statsRangeMonthBtn, "click", () => a.setStatsRange("month"));
    on(e.exportStatsBtn, "click", a.exportStatsCsv);
    on(e.backupStatsBtn, "click", a.exportStatsBackup);
    on(e.restoreBackupBtn, "click", () => e.backupFileInput?.click());
    on(e.backupFileInput, "change", a.restoreStatsBackup);
    on(e.storageRecoveryDownloadBtn, "click", a.downloadStorageRecoveryCopy);
    on(e.storageRecoveryRestoreBtn, "click", () => e.backupFileInput?.click());
    on(e.storageRecoveryDismissBtn, "click", a.dismissStorageRecovery);
    on(e.clearStatsBtn, "click", a.clearStats);

    on(e.notesInput, "input", a.saveNotesSoon);
    on(e.noteNewBtn, "click", a.createNewNoteFile);
    on(e.notePinBtn, "click", a.toggleActiveNotePin);
    on(e.noteDeleteBtn, "click", a.deleteActiveNoteFile);

    on(e.bgToggleBtn, "click", () => a.toggleBackgroundDrawer());
    on(e.backgroundCloseBtn, "click", () => a.toggleBackgroundDrawer(false));
    on(e.bgVideoBtn, "click", a.importBackgroundVideo);
    on(e.bgCoverBtn, "click", () => a.setBackgroundMode("cover"));
    on(e.drawerBackdrop, "click", () => {
      a.toggleBackgroundDrawer(false);
      a.toggleStatsDrawer(false);
      a.toggleFocusPlanDrawer(false);
    });
    on(e.bgBlackBtn, "click", () => a.setBackgroundMode("black"));
    on(e.bgWhiteBtn, "click", () => a.setBackgroundMode("white"));
    on(e.bgWallpaperBtn, "click", a.useDesktopWallpaperBackground);
    on(e.bgImageBtn, "click", a.importBackgroundImage);
    on(e.bgResetBtn, "click", a.resetBackground);
    bindSwipeToClose(e.statsDrawer, () => a.toggleStatsDrawer(false));
    bindSwipeToClose(e.backgroundDrawer, () => a.toggleBackgroundDrawer(false));
    bindSwipeToClose(e.focusPlanDrawer, () => a.toggleFocusPlanDrawer(false));
    on(e.showcaseToggleBtn, "click", (event) => {
      event.stopPropagation();
      a.toggleShowcaseMode();
    });
    on(e.timerCard, "click", () => {
      if (a.isShowcaseModeEnabled()) a.toggleShowcaseMode(false);
    });
    on(e.timerDisplay, "click", () => {
      if (a.isShowcaseModeEnabled()) a.toggleShowcaseMode(false);
    });

    on(e.playPauseBtn, "click", a.togglePlayback);
    on(e.nextTrackBtn, "click", a.switchTrack);
    on(e.prevTrackBtn, "click", a.prevTrack);
    on(e.playlistToggleBtn, "click", a.togglePlaylistPanel);
    on(e.loadMusicFolderBtn, "click", a.loadMusicFolder);

    on(e.shortcutHelpCloseBtn, "click", () => a.toggleShortcutHelp(false));
    on(e.shortcutHelpOverlay, "click", (event) => {
      if (event.target === e.shortcutHelpOverlay) a.toggleShortcutHelp(false);
    });
    on(e.shortcutHelpPanel, "click", (event) => event.stopPropagation());
    e.shortcutHelpPanel?.querySelectorAll("input[data-shortcut]").forEach((input) => {
      const key = input.dataset.shortcut;
      if (!key) return;
      input.checked = a.isShortcutEnabled(key);
      on(input, "change", () => a.setShortcutEnabled(key, input.checked));
    });

    on(e.volumeSlider, "input", () => {
      a.updateVolume();
      a.saveUiSettings();
    });
    on(e.brightnessSlider, "input", () => a.updateBrightness(e.brightnessSlider.value));
    on(e.progressSlider, "input", () => {
      const duration = e.lofiPlayer.duration;
      if (!Number.isFinite(duration) || duration <= 0) return;
      const preview = Math.max(0, Math.min(duration, (Number(e.progressSlider.value) / 1000) * duration));
      e.currentTimeLabel.textContent = formatTime(Math.floor(preview));
    });
    on(e.progressSlider, "change", () => {
      const duration = e.lofiPlayer.duration;
      if (!Number.isFinite(duration) || duration <= 0) return;
      e.lofiPlayer.currentTime = Math.max(
        0,
        Math.min(duration, (Number(e.progressSlider.value) / 1000) * duration)
      );
    });
    on(targetWindow, "focus", a.syncTimerToClock);
    on(targetWindow, "beforeunload", a.persistBeforeUnload);
    on(document, "visibilitychange", () => {
      if (!document.hidden) a.syncTimerToClock();
    });
    on(e.lofiPlayer, "loadedmetadata", () => {
      e.durationLabel.textContent = formatTime(Math.floor(e.lofiPlayer.duration || 0));
      e.currentTimeLabel.textContent = formatTime(Math.floor(e.lofiPlayer.currentTime || 0));
    });
    on(e.lofiPlayer, "timeupdate", () => {
      const duration = e.lofiPlayer.duration;
      if (!Number.isFinite(duration) || duration <= 0) {
        e.progressSlider.value = 0;
        e.currentTimeLabel.textContent = formatTime(Math.floor(e.lofiPlayer.currentTime || 0));
        return;
      }
      e.progressSlider.value = String(Math.round((e.lofiPlayer.currentTime / duration) * 1000));
      e.currentTimeLabel.textContent = formatTime(Math.floor(e.lofiPlayer.currentTime));
    });
    on(e.lofiPlayer, "ended", a.switchTrack);
    on(e.lofiPlayer, "pause", () => {
      e.playPauseBtn.textContent = "Play";
    });
    on(e.lofiPlayer, "play", () => {
      e.playPauseBtn.textContent = "Pause";
    });
  }

  const api = { applyHoverHints, bindKeyboardShortcuts, bindSwipeToClose, bindUiEvents, isTypingElement };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalScope) globalScope.InfiniteLofiBindings = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
