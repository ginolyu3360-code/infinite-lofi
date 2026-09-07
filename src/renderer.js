const MAX_TIMER_SECONDS = 6 * 60 * 60;
const DEFAULT_FOCUS_SECONDS = 25 * 60;
const DEFAULT_BREAK_SECONDS = 5 * 60;
const DEFAULT_SHORTCUT_SETTINGS = {
  helpToggle: true,
  closePanels: true,
  timerToggle: true,
  timerReset: true,
  playPause: true,
  nextTrack: true,
  prevTrack: true,
  togglePlaylist: true,
  toggleStats: true,
  statsToday: true,
  statsWeek: true,
  statsMonth: true,
  loadFolder: true,
  seekBack: true,
  seekForward: true,
  volumeUp: true,
  volumeDown: true,
  notesFocus: true,
  notesSave: true,
  notesClear: true
};
const DEFAULT_BACKGROUND_SETTINGS = {
  mode: "black",
  customImageUrl: "",
  customImageName: "",
  customVideoUrl: "",
  customVideoName: ""
};

if (!window.InfiniteLofiCore) {
  throw new Error("Infinite Lo-Fi core helpers failed to load");
}
if (!window.InfiniteLofiStorage) {
  throw new Error("Infinite Lo-Fi storage helpers failed to load");
}
if (
  !window.InfiniteLofiTimer ||
  !window.InfiniteLofiNotes ||
  !window.InfiniteLofiNotesController ||
  !window.InfiniteLofiPlayer ||
  !window.InfiniteLofiPlayerController ||
  !window.InfiniteLofiBackgrounds ||
  !window.InfiniteLofiStats ||
  !window.InfiniteLofiStatsController ||
  !window.InfiniteLofiWeather ||
  !window.InfiniteLofiWeatherController ||
  !window.InfiniteLofiUi ||
  !window.InfiniteLofiBindings
) {
  throw new Error("Infinite Lo-Fi feature modules failed to load");
}

const {
  clamp,
  formatTime,
  normalizeMinutes,
  normalizeVolume,
  remainingSecondsUntil,
  sanitizeNoteFiles: sanitizeLoadedNoteFiles
} = window.InfiniteLofiCore;

const appStorage = window.InfiniteLofiStorage.createRepository(window.localStorage);
const { createRuntimeSnapshot, resolveRestoredRuntime } = window.InfiniteLofiTimer;
const { createNotesController } = window.InfiniteLofiNotesController;
const { createPlayerController } = window.InfiniteLofiPlayerController;
const {
  buildRenderKey: buildBackgroundRenderKey,
  normalizeBackgroundSettings,
  resolveEffectiveBackground
} = window.InfiniteLofiBackgrounds;
const { createStatsController } = window.InfiniteLofiStatsController;
const { createWeatherController } = window.InfiniteLofiWeatherController;
const { normalizeToggleSettings } = window.InfiniteLofiUi;
const {
  applyHoverHints,
  bindKeyboardShortcuts: bindKeyboardShortcutEvents,
  bindUiEvents
} = window.InfiniteLofiBindings;

const backgroundConfig = {
  mode: "black",
  video: "../assets/background.mp4",
  image: "../assets/background.jpg"
};

const timerDisplay = document.getElementById("timerDisplay");
const timerPhaseLabel = document.getElementById("timerPhaseLabel");
const timerToggle = document.getElementById("timerToggle");
const timerReset = document.getElementById("timerReset");
const notesInput = document.getElementById("notesInput");
const noteTabs = document.getElementById("noteTabs");
const noteNewBtn = document.getElementById("noteNewBtn");
const notePinBtn = document.getElementById("notePinBtn");
const noteDeleteBtn = document.getElementById("noteDeleteBtn");
const bgVideo = document.getElementById("bgVideo");
const bgImage = document.getElementById("bgImage");
const lofiPlayer = document.getElementById("lofiPlayer");
const playPauseBtn = document.getElementById("playPauseBtn");
const nextTrackBtn = document.getElementById("nextTrackBtn");
const prevTrackBtn = document.getElementById("prevTrackBtn");
const progressSlider = document.getElementById("progressSlider");
const currentTimeLabel = document.getElementById("currentTimeLabel");
const durationLabel = document.getElementById("durationLabel");
const playlistToggleBtn = document.getElementById("playlistToggleBtn");
const trackLabel = document.getElementById("trackLabel");
const playlistPanel = document.getElementById("playlistPanel");
const playlistItems = document.getElementById("playlistItems");
const volumeSlider = document.getElementById("volumeSlider");
const brightnessSlider = document.getElementById("brightnessSlider");
const windowMinBtn = document.getElementById("windowMinBtn");
const windowCloseBtn = document.getElementById("windowCloseBtn");
const focusMinutesInput = document.getElementById("focusMinutesInput");
const breakMinutesInput = document.getElementById("breakMinutesInput");
const timerConfigPanel = document.getElementById("timerConfigPanel");
const closeModeToggleBtn = document.getElementById("closeModeToggleBtn");
const todayFocusStat = document.getElementById("todayFocusStat");
const statsBars = document.getElementById("statsBars");
const statsRangeTodayBtn = document.getElementById("statsRangeTodayBtn");
const statsRangeWeekBtn = document.getElementById("statsRangeWeekBtn");
const statsRangeMonthBtn = document.getElementById("statsRangeMonthBtn");
const exportStatsBtn = document.getElementById("exportStatsBtn");
const backupStatsBtn = document.getElementById("backupStatsBtn");
const restoreBackupBtn = document.getElementById("restoreBackupBtn");
const backupFileInput = document.getElementById("backupFileInput");
const clearStatsBtn = document.getElementById("clearStatsBtn");
const statsHeadingLabel = document.getElementById("statsHeadingLabel");
const statsTooltip = document.getElementById("statsTooltip");
const statsTotalValue = document.getElementById("statsTotalValue");
const statsAverageValue = document.getElementById("statsAverageValue");
const statsPeakValue = document.getElementById("statsPeakValue");
const appLayout = document.getElementById("appLayout");
const notesPanel = document.getElementById("notesPanel");
const mainRightColumn = document.getElementById("mainRightColumn");
const timerCard = document.getElementById("timerCard");
const timerContent = document.getElementById("timerContent");
const notesToggleBtn = document.getElementById("notesToggleBtn");
const notesCloseBtn = document.getElementById("notesCloseBtn");
const miniModeToggleBtn = document.getElementById("miniModeToggleBtn");
const statsToggleBtn = document.getElementById("statsToggleBtn");
const statsDrawer = document.getElementById("statsDrawer");
const statsCloseBtn = document.getElementById("statsCloseBtn");
const statusTime = document.getElementById("statusTime");
const statusDate = document.getElementById("statusDate");
const statusWeather = document.getElementById("statusWeather");
const weatherModeSelect = document.getElementById("weatherModeSelect");
const weatherCityInput = document.getElementById("weatherCityInput");
const weatherApplyBtn = document.getElementById("weatherApplyBtn");
const weatherPrivacyHint = document.getElementById("weatherPrivacyHint");
const loadMusicFolderBtn = document.getElementById("loadMusicFolderBtn");
const musicFolderDisplay = document.getElementById("musicFolderDisplay");
const bgToggleBtn = document.getElementById("bgToggleBtn");
const backgroundDrawer = document.getElementById("backgroundDrawer");
const backgroundCloseBtn = document.getElementById("backgroundCloseBtn");
const bgBlackBtn = document.getElementById("bgBlackBtn");
const bgWhiteBtn = document.getElementById("bgWhiteBtn");
const bgCoverBtn = document.getElementById("bgCoverBtn");
const bgWallpaperBtn = document.getElementById("bgWallpaperBtn");
const bgImageBtn = document.getElementById("bgImageBtn");
const bgResetBtn = document.getElementById("bgResetBtn");
const bgPreviewSurface = document.getElementById("bgPreviewSurface");
const bgModeLabel = document.getElementById("bgModeLabel");
const bgPathLabel = document.getElementById("bgPathLabel");
const bgVideoBtn = document.getElementById("bgVideoBtn");
const drawerBackdrop = document.getElementById("drawerBackdrop");
const showcaseToggleBtn = document.getElementById("showcaseToggleBtn");
const shortcutHelpOverlay = document.getElementById("shortcutHelpOverlay");
const shortcutHelpPanel = document.getElementById("shortcutHelpPanel");
const shortcutHelpCloseBtn = document.getElementById("shortcutHelpCloseBtn");
const storageRecoveryNotice = document.getElementById("storageRecoveryNotice");
const storageRecoveryMessage = document.getElementById("storageRecoveryMessage");
const storageRecoveryDownloadBtn = document.getElementById("storageRecoveryDownloadBtn");
const storageRecoveryRestoreBtn = document.getElementById("storageRecoveryRestoreBtn");
const storageRecoveryDismissBtn = document.getElementById("storageRecoveryDismissBtn");

let timerId = null;
let timerDeadlineMs = null;
let focusDurationSeconds = DEFAULT_FOCUS_SECONDS;
let breakDurationSeconds = DEFAULT_BREAK_SECONDS;
let remainingSeconds = focusDurationSeconds;
let timerPhase = "focus";
let closeBehavior = "quit";
let miniModeEnabled = false;
let shortcutSettings = { ...DEFAULT_SHORTCUT_SETTINGS };
let backgroundSettings = { ...DEFAULT_BACKGROUND_SETTINGS };
let weatherSettings = window.InfiniteLofiWeather.normalizeWeatherSettings();
let showcaseModeEnabled = false;
let currentTrackArtwork = null;
let backgroundRenderKey = "";
let backgroundFadeRaf = 0;
let isRestoringBackup = false;

const playerController = createPlayerController({
  appStorage,
  desktopApp: window.desktopApp,
  playerModel: window.InfiniteLofiPlayer,
  defaultTracks: [
    { label: "Track 01", src: "../assets/track-01.wav" },
    { label: "Track 02", src: "../assets/track-02.wav" },
    { label: "Track 03", src: "../assets/track-03.wav" }
  ],
  elements: {
    document,
    lofiPlayer,
    playPauseBtn,
    playlistPanel,
    playlistItems,
    trackLabel,
    volumeSlider,
    musicFolderDisplay
  },
  onArtworkChange: (artwork) => {
    currentTrackArtwork = artwork;
    renderBackgroundUi();
    applyBackground();
  }
});
const {
  loadMusicFolder,
  persistState: persistPlayerState,
  prevTrack,
  restorePersistedPlayer,
  switchTrack,
  togglePlayback,
  togglePlaylistPanel,
  updateTrack,
  updateVolume
} = playerController;

const notesController = createNotesController({
  appStorage,
  noteModel: window.InfiniteLofiNotes,
  sanitizeNoteFiles: sanitizeLoadedNoteFiles,
  elements: { document, notesInput, noteTabs, notePinBtn }
});
const {
  clearNotesWithConfirm,
  createNewNoteFile,
  deleteActiveNoteFile,
  loadNotes,
  saveNotesNow,
  saveNotesSoon,
  toggleActiveNotePin
} = notesController;

const statsController = createStatsController({
  appStorage,
  statsModel: window.InfiniteLofiStats,
  core: window.InfiniteLofiCore,
  elements: {
    document,
    statsDrawer,
    statsToggleBtn,
    todayFocusStat,
    statsHeadingLabel,
    statsTotalValue,
    statsAverageValue,
    statsPeakValue,
    statsBars,
    statsRangeTodayBtn,
    statsRangeWeekBtn,
    statsRangeMonthBtn,
    statsTooltip,
    drawerBackdrop,
    storageRecoveryNotice,
    storageRecoveryMessage
  },
  beforeBackup: () => {
    saveNotesNow();
    saveTimerRuntime();
    persistPlayerState();
  },
  beforeRestore: () => {
    isRestoringBackup = true;
  }
});
const {
  clearStats,
  dismissStorageRecovery,
  downloadStorageRecoveryCopy,
  exportStatsBackup,
  exportStatsCsv,
  loadStatsRange,
  recordCompletedFocusSession,
  renderStats,
  renderStorageRecoveryNotice,
  restoreStatsBackup,
  setStatsRange,
  toggleStatsDrawer
} = statsController;

function isShortcutEnabled(name) {
  return shortcutSettings[name] !== false;
}

// persisted UI settings helper
function loadUiSettings() {
  const stored = appStorage.getState().settings.ui || {};
  shortcutSettings = normalizeToggleSettings(stored.shortcuts, DEFAULT_SHORTCUT_SETTINGS);
  backgroundSettings = normalizeBackgroundSettings(stored.background);
  weatherSettings = window.InfiniteLofiWeather.normalizeWeatherSettings(stored.weather);
  showcaseModeEnabled = Boolean(stored.showcaseMode);

  // volume
  const storedVol = Number(stored.volume);
  if (Number.isFinite(storedVol)) {
    const safeVolume = normalizeVolume(storedVol);
    if (volumeSlider) volumeSlider.value = String(Math.round(safeVolume * 100));
    if (lofiPlayer) lofiPlayer.volume = safeVolume;
  }

  // brightness
  const storedBright = Number(stored.brightness);
  if (Number.isFinite(storedBright)) {
    const safeBrightness = clamp(storedBright, 0.4, 1.3);
    if (brightnessSlider) brightnessSlider.value = String(Math.round(safeBrightness * 100));
    document.documentElement.style.setProperty("--scene-brightness", String(safeBrightness));
  }

  applyShowcaseMode();
  applyBackground();
  renderBackgroundUi();
}

function saveUiSettings() {
  const payload = {
    volume: normalizeVolume(lofiPlayer.volume),
    brightness: Number(getComputedStyle(document.documentElement).getPropertyValue("--scene-brightness")) || 1,
    shortcuts: shortcutSettings,
    background: backgroundSettings,
    weather: weatherSettings,
    showcaseMode: showcaseModeEnabled
  };
  appStorage.update((state) => {
    state.settings.ui = payload;
  });
}

function renderBackgroundUi() {
  if (bgModeLabel) {
    bgModeLabel.textContent =
      backgroundSettings.mode === "image"
        ? "Image"
        : backgroundSettings.mode === "white"
        ? "White"
        : backgroundSettings.mode === "video"
        ? "Video"
        : backgroundSettings.mode === "cover"
        ? "Track Cover"
        : "Black";
  }
  if (bgPathLabel) {
    if (backgroundSettings.mode === "image") {
      bgPathLabel.textContent = backgroundSettings.customImageName || backgroundSettings.customImageUrl || "Imported Image";
    } else if (backgroundSettings.mode === "video") {
      bgPathLabel.textContent = backgroundSettings.customVideoName || backgroundSettings.customVideoUrl || "Built-in Video";
    } else if (backgroundSettings.mode === "cover") {
      bgPathLabel.textContent = currentTrackArtwork?.name || "No cover for current track";
    } else {
      bgPathLabel.textContent = "None";
    }
  }
  if (bgPreviewSurface) {
    bgPreviewSurface.style.display = "block";
    bgPreviewSurface.style.alignItems = "";
    bgPreviewSurface.style.justifyContent = "";
    bgPreviewSurface.style.fontSize = "";
    bgPreviewSurface.style.color = "";
    if (backgroundSettings.mode === "image" && backgroundSettings.customImageUrl) {
      bgPreviewSurface.style.backgroundImage = `url('${backgroundSettings.customImageUrl}')`;
      bgPreviewSurface.style.backgroundColor = "rgba(0, 0, 0, 0.35)";
      bgPreviewSurface.textContent = "";
    } else if (backgroundSettings.mode === "video") {
      bgPreviewSurface.style.backgroundImage = "none";
      bgPreviewSurface.style.backgroundColor = "#000000";
      // show a subtle play indicator
      bgPreviewSurface.style.display = "flex";
      bgPreviewSurface.style.alignItems = "center";
      bgPreviewSurface.style.justifyContent = "center";
      bgPreviewSurface.textContent = "▶";
      bgPreviewSurface.style.fontSize = "1.8rem";
      bgPreviewSurface.style.color = "rgba(255,255,255,0.8)";
    } else if (backgroundSettings.mode === "cover" && currentTrackArtwork?.url) {
      bgPreviewSurface.style.backgroundImage = `url('${currentTrackArtwork.url}')`;
      bgPreviewSurface.style.backgroundColor = "rgba(0, 0, 0, 0.35)";
      bgPreviewSurface.textContent = "";
    } else if (backgroundSettings.mode === "white") {
      bgPreviewSurface.style.backgroundImage = "none";
      bgPreviewSurface.style.backgroundColor = "#ffffff";
      bgPreviewSurface.textContent = "";
    } else {
      bgPreviewSurface.style.backgroundImage = "none";
      bgPreviewSurface.style.backgroundColor = "#000000";
      bgPreviewSurface.textContent = "";
    }
  }
}

function getEffectiveBackground() {
  return resolveEffectiveBackground(backgroundSettings, currentTrackArtwork);
}

function applyShowcaseMode() {
  document.body.classList.toggle("is-showcase-mode", showcaseModeEnabled);
  if (showcaseToggleBtn) {
    showcaseToggleBtn.textContent = "Show";
    showcaseToggleBtn.title = "Enter showcase mode";
  }
  if (timerCard) {
    timerCard.classList.toggle("is-showcase-exit-target", showcaseModeEnabled);
    timerCard.setAttribute("aria-label", showcaseModeEnabled ? "Click to exit showcase mode" : "Timer card");
    timerCard.title = showcaseModeEnabled ? "Click anywhere on this card to exit showcase mode" : "";
    timerCard.style.cursor = showcaseModeEnabled ? "pointer" : "default";
  }
  if (backgroundDrawer && showcaseModeEnabled) {
    toggleBackgroundDrawer(false);
  }
  if (statsDrawer && showcaseModeEnabled) {
    toggleStatsDrawer(false);
  }
  if (shortcutHelpOverlay && showcaseModeEnabled) {
    toggleShortcutHelp(false);
  }
}

function toggleShowcaseMode(forceValue) {
  const nextEnabled = typeof forceValue === "boolean" ? forceValue : !showcaseModeEnabled;
  showcaseModeEnabled = nextEnabled;
  applyShowcaseMode();
  applyBackground();
  saveUiSettings();
}

function toggleBackgroundDrawer(forceOpen) {
  if (!backgroundDrawer) {
    return;
  }

  const nextOpen = typeof forceOpen === "boolean" ? forceOpen : !backgroundDrawer.classList.contains("is-open");
  backgroundDrawer.classList.toggle("is-open", nextOpen);
  if (drawerBackdrop) {
    drawerBackdrop.classList.toggle("visible", nextOpen);
  }
}

function setBackgroundMode(mode) {
  if (!["black", "white", "image", "cover"].includes(mode)) {
    return;
  }

  backgroundSettings.mode = mode;
  if (mode !== "image") {
    backgroundSettings.customImageUrl = backgroundSettings.customImageUrl || "";
    backgroundSettings.customImageName = backgroundSettings.customImageName || "";
  }
  renderBackgroundUi();
  applyBackground();
  saveUiSettings();
}

async function useDesktopWallpaperBackground() {
  if (!window.desktopApp || typeof window.desktopApp.getWallpaperBackground !== "function") {
    alert("Wallpaper background is not supported.");
    return;
  }

  try {
    const result = await window.desktopApp.getWallpaperBackground();
    if (!result || !result.fileUrl) {
      alert("Could not read the current desktop wallpaper.");
      return;
    }

    backgroundSettings.mode = "image";
    backgroundSettings.customImageUrl = result.fileUrl;
    backgroundSettings.customImageName = result.filePath ? result.filePath.split(/[\\/]/).pop() || "Wallpaper" : "Wallpaper";
    renderBackgroundUi();
    applyBackground();
    saveUiSettings();
  } catch (error) {
    console.error("Failed to load wallpaper background:", error);
  }
}

async function importBackgroundImage() {
  if (!window.desktopApp || typeof window.desktopApp.selectBackgroundImage !== "function") {
    alert("Background image selection is not supported.");
    return;
  }

  try {
    const result = await window.desktopApp.selectBackgroundImage();
    if (!result || !result.fileUrl) {
      return;
    }

    backgroundSettings.mode = "image";
    backgroundSettings.customImageUrl = result.fileUrl;
    backgroundSettings.customImageName = result.filePath ? result.filePath.split(/[\\/]/).pop() || "Imported Image" : "Imported Image";
    renderBackgroundUi();
    applyBackground();
    saveUiSettings();
  } catch (error) {
    console.error("Failed to import background image:", error);
  }
}

async function importBackgroundVideo() {
  if (!window.desktopApp || typeof window.desktopApp.selectBackgroundVideo !== "function") {
    alert("Background video selection is not supported.");
    return;
  }

  try {
    const result = await window.desktopApp.selectBackgroundVideo();
    if (!result || !result.fileUrl) {
      return;
    }

    backgroundSettings.mode = "video";
    backgroundSettings.customVideoUrl = result.fileUrl;
    backgroundSettings.customVideoName = result.filePath ? result.filePath.split(/[\\/\\\\]/).pop() || "Imported Video" : "Imported Video";
    renderBackgroundUi();
    applyBackground();
    saveUiSettings();
  } catch (error) {
    console.error("Failed to import background video:", error);
  }
}

function applyBackground() {
  try {
    const effectiveBackground = getEffectiveBackground();
    const showcaseActive = showcaseModeEnabled;
    const backgroundOpacity = effectiveBackground.mode === "white" || showcaseActive ? "1" : effectiveBackground.fromTrackArtwork ? "0.9" : "0.45";
    const nextKey = buildBackgroundRenderKey(effectiveBackground, showcaseModeEnabled);
    const shouldFade = nextKey !== backgroundRenderKey;
    backgroundRenderKey = nextKey;

    const applyLayerState = () => {
      if (bgVideo) {
        bgVideo.style.opacity = backgroundOpacity;
        bgVideo.style.filter = showcaseActive ? "brightness(1.04) contrast(1.05) saturate(1.08)" : "brightness(var(--scene-brightness))";
      }
      if (bgImage) {
        bgImage.style.opacity = backgroundOpacity;
        bgImage.style.filter = showcaseActive ? "brightness(1.04) contrast(1.05) saturate(1.08)" : "brightness(var(--scene-brightness))";
      }

      if (effectiveBackground.mode === "video") {
        const src = effectiveBackground.customVideoUrl || backgroundConfig.video || "";
        if (bgImage) bgImage.style.display = "none";
        document.body.classList.remove("bg-white-background");
        if (bgVideo) {
          if (src) {
            bgVideo.src = src;
            bgVideo.style.display = "block";
            bgVideo.play().catch(() => {
              if (bgVideo) bgVideo.style.display = "none";
              if (bgImage) {
                bgImage.style.display = "block";
                bgImage.style.backgroundImage = `url('${backgroundConfig.image}')`;
                bgImage.style.backgroundColor = "#000000";
              }
            });
          } else {
            if (bgVideo) bgVideo.style.display = "none";
            if (bgImage) {
              bgImage.style.display = "block";
              bgImage.style.backgroundImage = `url('${backgroundConfig.image}')`;
              bgImage.style.backgroundColor = "#000000";
            }
          }
        }
        return;
      }

      if (effectiveBackground.mode === "image" && effectiveBackground.customImageUrl) {
        if (bgVideo) bgVideo.style.display = "none";
        document.body.classList.remove("bg-white-background");
        if (bgImage) {
          bgImage.style.display = "block";
          bgImage.style.backgroundImage = `url('${effectiveBackground.customImageUrl}')`;
          bgImage.style.backgroundSize = "cover";
          bgImage.style.backgroundPosition = "center";
          bgImage.style.backgroundColor = "#000000";
        }
        return;
      }

      if (bgVideo) bgVideo.style.display = "none";
      if (bgImage) {
        bgImage.style.display = "block";
        bgImage.style.backgroundImage = "none";
        bgImage.style.backgroundSize = "cover";
        bgImage.style.backgroundPosition = "center";
        if (effectiveBackground.mode === "white") {
          bgImage.style.backgroundColor = "#ffffff";
          document.body.classList.add("bg-white-background");
        } else {
          bgImage.style.backgroundColor = "#000000";
          document.body.classList.remove("bg-white-background");
        }
      }
    };

    if (shouldFade) {
      if (backgroundFadeRaf) {
        cancelAnimationFrame(backgroundFadeRaf);
      }
      if (bgVideo) bgVideo.style.opacity = "0";
      if (bgImage) bgImage.style.opacity = "0";
      backgroundFadeRaf = requestAnimationFrame(() => {
        applyLayerState();
        backgroundFadeRaf = requestAnimationFrame(() => {
          if (bgVideo && bgVideo.style.display !== "none") {
            bgVideo.style.opacity = backgroundOpacity;
          }
          if (bgImage && bgImage.style.display !== "none") {
            bgImage.style.opacity = backgroundOpacity;
          }
        });
      });
      return;
    }

    applyLayerState();
  } catch (e) {
    console.error("applyBackground error:", e);
  }
}




function toMinutes(seconds) {
  return Math.max(1, Math.round(seconds / 60));
}


function saveTimerSettings() {
  appStorage.update((state) => {
    state.settings.timer = {
      focusSeconds: focusDurationSeconds,
      breakSeconds: breakDurationSeconds
    };
  });
}

function loadTimerSettings() {
  const settings = appStorage.getState().settings.timer;
  if (!settings) {
    return;
  }

  const focusSeconds = clamp(Number(settings.focusSeconds) || DEFAULT_FOCUS_SECONDS, 60, MAX_TIMER_SECONDS);
  const breakSeconds = clamp(Number(settings.breakSeconds) || DEFAULT_BREAK_SECONDS, 60, MAX_TIMER_SECONDS);
  focusDurationSeconds = focusSeconds;
  breakDurationSeconds = breakSeconds;
  remainingSeconds = timerPhase === "focus" ? focusDurationSeconds : breakDurationSeconds;
}

function saveTimerRuntime() {
  appStorage.update((state) => {
    state.timerRuntime = createRuntimeSnapshot({
      phase: timerPhase,
      remainingSeconds,
      deadlineMs: timerId !== null ? timerDeadlineMs : null,
      isRunning: timerId !== null && timerDeadlineMs !== null
    });
  });
}

function loadTimerRuntime(nowMs = Date.now()) {
  const restored = resolveRestoredRuntime(
    appStorage.getState().timerRuntime,
    { focusSeconds: focusDurationSeconds, breakSeconds: breakDurationSeconds },
    nowMs
  );
  timerPhase = restored.phase;
  remainingSeconds = restored.remainingSeconds;
  timerDeadlineMs = restored.deadlineMs;

  if (restored.completedFocusDuringAbsence) {
    recordCompletedFocusSession(focusDurationSeconds);
    saveTimerRuntime();
  }
  if (restored.isRunning) {
    timerId = setInterval(tick, 250);
    timerToggle.textContent = "Pause";
    setTimerInputsLocked(true);
  }
}

function updateConfigInputs() {
  focusMinutesInput.value = String(toMinutes(focusDurationSeconds));
  breakMinutesInput.value = String(toMinutes(breakDurationSeconds));
}

function setTimerInputsLocked(locked) {
  focusMinutesInput.disabled = locked;
  breakMinutesInput.disabled = locked;
  timerConfigPanel.classList.toggle("is-locked", locked);
}

function renderCloseModeToggle() {
  closeModeToggleBtn.textContent = closeBehavior === "tray" ? "To Tray" : "Quit App";
}

async function loadCloseBehavior() {
  closeBehavior = appStorage.getState().settings.closeBehavior === "tray" ? "tray" : "quit";
  if (window.desktopApp && typeof window.desktopApp.setCloseBehavior === "function") {
    window.desktopApp.setCloseBehavior(closeBehavior);
  }
  renderCloseModeToggle();
}

function toggleCloseBehavior() {
  closeBehavior = closeBehavior === "tray" ? "quit" : "tray";
  renderCloseModeToggle();
  appStorage.update((state) => {
    state.settings.closeBehavior = closeBehavior;
  });
  if (window.desktopApp && typeof window.desktopApp.setCloseBehavior === "function") {
    window.desktopApp.setCloseBehavior(closeBehavior);
  }
}

function renderTimer() {
  timerDisplay.textContent = formatTime(remainingSeconds);
  timerPhaseLabel.textContent = timerPhase === "focus" ? "Focus Session" : "Break Session";
  // ensure font recalculation when timer text changes
  requestAnimationFrame(() => {
    try {
      adjustTimerFont();
    } catch (e) {
      // ignore
    }
  });
}

// Compute and set a font-size (px) for the timer display so the full text always fits
function adjustTimerFont() {
  if (!timerCard || !timerDisplay) return;

  const cardRect = timerCard.getBoundingClientRect();
  if (!cardRect.width || !cardRect.height) return;
  const isMiniMode = document.body.classList.contains("is-mini-mode");
  const availableWidth = Math.max(120, cardRect.width - (isMiniMode ? 32 : 80));
  const availableHeight = Math.max(42, cardRect.height * (isMiniMode ? 0.52 : 0.34));

  const text = timerDisplay.textContent || "00:00";
  const cs = getComputedStyle(timerDisplay);
  const fontFamily = cs.fontFamily || "IBM Plex Mono, monospace";
  const fontWeight = cs.fontWeight || "700";

  const maxCandidate = Math.min(isMiniMode ? 88 : 190, Math.round(availableHeight));
  const minCandidate = isMiniMode ? 38 : 48;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  let chosen = minCandidate;
  for (let size = maxCandidate; size >= minCandidate; size -= 1) {
    ctx.font = `${fontWeight} ${size}px ${fontFamily}`;
    const metrics = ctx.measureText(text);
    const textWidth = Math.ceil(metrics.width);
    // approximate text height as size * 1.0
    const textHeight = Math.ceil(size * 1.0);
    if (textWidth <= availableWidth && textHeight <= availableHeight) {
      chosen = size;
      break;
    }
  }

  timerCard.style.setProperty("--timer-display-size", `${chosen}px`);
}

function toggleNotesPanel(forceOpen) {
  const nextOpen = typeof forceOpen === "boolean"
    ? forceOpen
    : !document.body.classList.contains("notes-panel-open");
  document.body.classList.toggle("notes-panel-open", nextOpen);
  notesToggleBtn?.setAttribute("aria-expanded", String(nextOpen));
}

async function toggleMiniMode(forceEnabled) {
  const nextEnabled = typeof forceEnabled === "boolean" ? forceEnabled : !miniModeEnabled;
  if (!window.desktopWindow || typeof window.desktopWindow.setMiniMode !== "function") return;
  if (nextEnabled) {
    toggleStatsDrawer(false);
    toggleBackgroundDrawer(false);
    toggleShortcutHelp(false);
    toggleNotesPanel(false);
    if (showcaseModeEnabled) toggleShowcaseMode(false);
  }
  miniModeEnabled = await window.desktopWindow.setMiniMode(nextEnabled);
  document.body.classList.toggle("is-mini-mode", miniModeEnabled);
  miniModeToggleBtn.textContent = miniModeEnabled ? "Full" : "Mini";
  miniModeToggleBtn.title = miniModeEnabled ? "Return to full view" : "Enter Mini Mode";
  miniModeToggleBtn.setAttribute("aria-label", miniModeToggleBtn.title);
  requestAnimationFrame(adjustTimerFont);
}

function sendTrayStatus() {
  if (!window.desktopApp) {
    return;
  }

  window.desktopApp.sendTrayStatus({
    timerText: formatTime(remainingSeconds),
    phaseText: timerPhase === "focus" ? "Focus Session" : "Break Session",
    isRunning: timerId !== null
  });
}

function stopTimer() {
  if (timerId !== null) {
    syncTimerToClock();
    clearInterval(timerId);
    timerId = null;
  }
  timerDeadlineMs = null;
  timerToggle.textContent = "Start";
  setTimerInputsLocked(false);
  if (!lofiPlayer.paused) {
    lofiPlayer.pause();
  }
  sendTrayStatus();
  saveTimerRuntime();
}

function notifyPhaseSwitch() {
  const title = timerPhase === "focus" ? "Focus Time" : "Break Time";
  const body = timerPhase === "focus" ? "Back to deep focus." : "Take a short reset break.";

  if (typeof Notification !== "undefined") {
    if (Notification.permission === "granted") {
      new Notification(title, { body, silent: false });
    } else if (Notification.permission === "default") {
      Notification.requestPermission().then((permission) => {
        if (permission === "granted") {
          new Notification(title, { body, silent: false });
        }
      });
    }
  }
}


function switchTimerPhase() {
  if (timerPhase === "focus") {
    recordCompletedFocusSession(focusDurationSeconds);
  }

  timerPhase = timerPhase === "focus" ? "break" : "focus";
  remainingSeconds = timerPhase === "focus" ? focusDurationSeconds : breakDurationSeconds;
  renderTimer();
  sendTrayStatus();
  notifyPhaseSwitch();
  if (timerId !== null && lofiPlayer.paused) {
    lofiPlayer.play().catch(() => {
      playPauseBtn.textContent = "Play";
    });
  }
  saveTimerRuntime();
}

function syncTimerToClock(nowMs = Date.now()) {
  if (timerId === null || timerDeadlineMs === null) {
    return;
  }

  const nextRemainingSeconds = remainingSecondsUntil(timerDeadlineMs, nowMs);
  if (nextRemainingSeconds <= 0) {
    remainingSeconds = 0;
    renderTimer();
    sendTrayStatus();
    switchTimerPhase();
    timerDeadlineMs = nowMs + remainingSeconds * 1000;
    return;
  }

  if (nextRemainingSeconds === remainingSeconds) {
    return;
  }
  remainingSeconds = nextRemainingSeconds;
  renderTimer();
  sendTrayStatus();
}

function tick() {
  syncTimerToClock();
}

function toggleTimer() {
  if (timerId !== null) {
    stopTimer();
    return;
  }

  timerToggle.textContent = "Pause";
  setTimerInputsLocked(true);
  timerDeadlineMs = Date.now() + remainingSeconds * 1000;
  timerId = setInterval(tick, 250);
  if (!lofiPlayer.src) {
    updateTrack();
  }
  lofiPlayer.play().catch(() => {
    playPauseBtn.textContent = "Play";
  });
  sendTrayStatus();
  saveTimerRuntime();
}

function resetTimer() {
  stopTimer();
  timerPhase = "focus";
  remainingSeconds = focusDurationSeconds;
  renderTimer();
  sendTrayStatus();
  saveTimerRuntime();
}

function applyTimerConfigLive() {
  if (timerId !== null) {
    return;
  }

  const maybeFocus = Number(focusMinutesInput.value);
  const maybeBreak = Number(breakMinutesInput.value);
  let hasChanged = false;

  if (Number.isFinite(maybeFocus)) {
    const normalizedFocus = clamp(Math.round(maybeFocus), 1, 360) * 60;
    if (normalizedFocus !== focusDurationSeconds) {
      focusDurationSeconds = normalizedFocus;
      hasChanged = true;
    }
  }

  if (Number.isFinite(maybeBreak)) {
    const normalizedBreak = clamp(Math.round(maybeBreak), 1, 360) * 60;
    if (normalizedBreak !== breakDurationSeconds) {
      breakDurationSeconds = normalizedBreak;
      hasChanged = true;
    }
  }

  if (!hasChanged) {
    return;
  }

  saveTimerSettings();
  timerPhase = "focus";
  remainingSeconds = focusDurationSeconds;
  renderTimer();
  sendTrayStatus();
  saveTimerRuntime();
}

function normalizeConfigInputDisplay() {
  if (timerId !== null) {
    return;
  }
  focusMinutesInput.value = String(normalizeMinutes(focusMinutesInput.value, focusDurationSeconds));
  breakMinutesInput.value = String(normalizeMinutes(breakMinutesInput.value, breakDurationSeconds));
}



function bindWindowControls() {
  if (!window.desktopWindow) {
    return;
  }
  windowMinBtn.addEventListener("click", () => window.desktopWindow.minimize());
  windowCloseBtn.addEventListener("click", () => window.desktopWindow.close());
  miniModeToggleBtn.addEventListener("click", () => toggleMiniMode());
  notesToggleBtn.addEventListener("click", () => toggleNotesPanel());
  notesCloseBtn.addEventListener("click", () => toggleNotesPanel(false));
  drawerBackdrop?.addEventListener("click", () => toggleNotesPanel(false));
  window.addEventListener("resize", () => requestAnimationFrame(adjustTimerFont), { passive: true });
}

function bindAppCommands() {
  if (!window.desktopApp) {
    return;
  }

  window.desktopApp.onCommand((command) => {
    if (command === "toggle-timer") {
      toggleTimer();
      return;
    }
    if (command === "reset-timer") {
      resetTimer();
    }
  });
}


function toggleShortcutHelp(forceOpen) {
  if (!shortcutHelpOverlay) {
    return;
  }

  const nextOpen = typeof forceOpen === "boolean" ? forceOpen : shortcutHelpOverlay.classList.contains("hidden");
  shortcutHelpOverlay.classList.toggle("hidden", !nextOpen);
  shortcutHelpOverlay.setAttribute("aria-hidden", String(!nextOpen));
}




async function init() {
  loadUiSettings();
  loadStatsRange();
  loadTimerSettings();
  loadTimerRuntime();
  await loadCloseBehavior();
  renderCloseModeToggle();
  updateConfigInputs();
  setTimerInputsLocked(timerId !== null);
  applyBackground();
  renderTimer();
  renderStats();
  loadNotes();
  updateTrack();
  await restorePersistedPlayer();
  updateVolume();
  // ensure initial brightness is applied (may have been loaded)
  const bs = Number(brightnessSlider ? brightnessSlider.value : 100) / 100;
  if (Number.isFinite(bs)) document.documentElement.style.setProperty("--scene-brightness", String(bs));
  toggleStatsDrawer(false);
  bindWindowControls();
  bindAppCommands();
  bindUiEvents({
    window,
    document,
    elements: {
      timerToggle,
      timerReset,
      focusMinutesInput,
      breakMinutesInput,
      closeModeToggleBtn,
      statsToggleBtn,
      statsDrawer,
      statsCloseBtn,
      statsRangeTodayBtn,
      statsRangeWeekBtn,
      statsRangeMonthBtn,
      exportStatsBtn,
      backupStatsBtn,
      restoreBackupBtn,
      backupFileInput,
      storageRecoveryDownloadBtn,
      storageRecoveryRestoreBtn,
      storageRecoveryDismissBtn,
      clearStatsBtn,
      notesInput,
      noteNewBtn,
      notePinBtn,
      noteDeleteBtn,
      bgToggleBtn,
      backgroundDrawer,
      backgroundCloseBtn,
      bgVideoBtn,
      bgCoverBtn,
      drawerBackdrop,
      bgBlackBtn,
      bgWhiteBtn,
      bgWallpaperBtn,
      bgImageBtn,
      bgResetBtn,
      showcaseToggleBtn,
      timerCard,
      timerDisplay,
      playPauseBtn,
      nextTrackBtn,
      prevTrackBtn,
      playlistToggleBtn,
      loadMusicFolderBtn,
      shortcutHelpCloseBtn,
      shortcutHelpOverlay,
      shortcutHelpPanel,
      volumeSlider,
      brightnessSlider,
      progressSlider,
      lofiPlayer,
      currentTimeLabel,
      durationLabel,
      timerContent
    },
    actions: {
      toggleTimer,
      resetTimer,
      applyTimerConfigLive,
      normalizeConfigInputDisplay,
      toggleCloseBehavior,
      toggleStatsDrawer,
      setStatsRange,
      exportStatsCsv,
      exportStatsBackup,
      restoreStatsBackup,
      downloadStorageRecoveryCopy,
      dismissStorageRecovery,
      clearStats,
      saveNotesSoon,
      createNewNoteFile,
      toggleActiveNotePin,
      deleteActiveNoteFile,
      toggleBackgroundDrawer,
      importBackgroundVideo,
      setBackgroundMode,
      useDesktopWallpaperBackground,
      importBackgroundImage,
      resetBackground: () => {
        backgroundSettings = { ...DEFAULT_BACKGROUND_SETTINGS };
        renderBackgroundUi();
        applyBackground();
        saveUiSettings();
      },
      toggleShowcaseMode,
      isShowcaseModeEnabled: () => showcaseModeEnabled,
      togglePlayback,
      switchTrack,
      prevTrack,
      togglePlaylistPanel,
      loadMusicFolder,
      toggleShortcutHelp,
      isShortcutEnabled,
      setShortcutEnabled: (key, enabled) => {
        shortcutSettings[key] = enabled;
        saveUiSettings();
      },
      updateVolume,
      saveUiSettings,
      updateBrightness: (rawValue) => {
        const value = Number(rawValue) / 100;
        if (Number.isFinite(value) && value > 0) {
          document.documentElement.style.setProperty("--scene-brightness", String(value));
          saveUiSettings();
        }
      },
      syncTimerToClock,
      persistBeforeUnload: () => {
        if (isRestoringBackup || window.__infiniteLofiSkipBeforeUnloadPersistence === true) return;
        if (timerId !== null) syncTimerToClock();
        saveNotesNow();
        saveTimerRuntime();
        persistPlayerState();
      }
    },
    formatTime
  });
  renderStorageRecoveryNotice();
  bindKeyboardShortcutEvents({
    window,
    HTMLElement,
    elements: {
      shortcutHelpOverlay,
      playlistPanel,
      statsDrawer,
      notesInput,
      lofiPlayer,
      volumeSlider
    },
    actions: {
      toggleShortcutHelp,
      toggleShowcaseMode,
      toggleStatsDrawer,
      toggleTimer,
      resetTimer,
      saveNotesNow,
      clearNotesWithConfirm,
      togglePlayback,
      switchTrack,
      prevTrack,
      togglePlaylistPanel,
      setStatsRange,
      loadMusicFolder,
      updateVolume,
      saveUiSettings
    },
    isShortcutEnabled,
    isShowcaseModeEnabled: () => showcaseModeEnabled,
    clamp
  });
  applyHoverHints(document, HTMLElement);
  createWeatherController({
    storage: window.localStorage,
    statusTime,
    statusDate,
    statusWeather,
    modeSelect: weatherModeSelect,
    cityInput: weatherCityInput,
    applyButton: weatherApplyBtn,
    privacyHint: weatherPrivacyHint,
    weather: window.InfiniteLofiWeather,
    initialSettings: weatherSettings,
    onSettingsChange: (settings) => {
      weatherSettings = settings;
      saveUiSettings();
    }
  }).init();
  sendTrayStatus();
}

init().catch((error) => {
  console.error("Infinite Lo-Fi failed to initialize:", error);
});
