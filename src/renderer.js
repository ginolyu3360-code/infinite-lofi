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
if (!window.InfiniteLofiCore) {
  throw new Error("Infinite Lo-Fi core helpers failed to load");
}
if (!window.InfiniteLofiStorage) {
  throw new Error("Infinite Lo-Fi storage helpers failed to load");
}
if (!window.InfiniteLofiI18n) {
  throw new Error("Infinite Lo-Fi language helpers failed to load");
}
if (
  !window.InfiniteLofiTimer ||
  !window.InfiniteLofiTasks ||
  !window.InfiniteLofiTasksController ||
  !window.InfiniteLofiNotes ||
  !window.InfiniteLofiNotesController ||
  !window.InfiniteLofiPlayer ||
  !window.InfiniteLofiMediaSession ||
  !window.InfiniteLofiPlayerController ||
  !window.InfiniteLofiBackgrounds ||
  !window.InfiniteLofiStats ||
  !window.InfiniteLofiFocusSession ||
  !window.InfiniteLofiStatsController ||
  !window.InfiniteLofiWeather ||
  !window.InfiniteLofiWeatherController ||
  !window.InfiniteLofiUi ||
  !window.InfiniteLofiAccessibility ||
  !window.InfiniteLofiBindings
) {
  throw new Error("Infinite Lo-Fi feature modules failed to load");
}

const {
  DEFAULT_TIMER_SETTINGS,
  clamp,
  formatTime,
  getLocalDayKey,
  normalizeDailyGoalSeconds,
  normalizeMinutes,
  normalizeTimerSettings,
  normalizeVolume,
  remainingSecondsUntil,
  sanitizeNoteFiles: sanitizeLoadedNoteFiles
} = window.InfiniteLofiCore;

const appStorage = window.InfiniteLofiStorage.createRepository(window.localStorage);
const i18n = window.InfiniteLofiI18n.createI18n(appStorage.getState().settings.ui?.language || "en");
const t = (key, params) => i18n.t(key, params);
const {
  advanceTimerPhase,
  createRuntimeSnapshot,
  getPhaseDuration,
  resolveRestoredRuntime
} = window.InfiniteLofiTimer;
const { createNotesController } = window.InfiniteLofiNotesController;
const { createPlayerController } = window.InfiniteLofiPlayerController;
const { createMediaSessionController } = window.InfiniteLofiMediaSession;
const {
  DEFAULTS: DEFAULT_BACKGROUND_SETTINGS,
  applyBackgroundSource,
  applyCuratedPreset,
  buildRenderKey: buildBackgroundRenderKey,
  getCuratedPreset,
  normalizeBackgroundSettings,
  resolveEffectiveBackground
} = window.InfiniteLofiBackgrounds;
const { createStatsController } = window.InfiniteLofiStatsController;
const { commitFocusCompletion } = window.InfiniteLofiFocusSession;
const { createTasksController } = window.InfiniteLofiTasksController;
const { createWeatherController } = window.InfiniteLofiWeatherController;
const { normalizeToggleSettings } = window.InfiniteLofiUi;
const {
  announce,
  createFocusManager,
  setDisclosureState
} = window.InfiniteLofiAccessibility;
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
const playlistStatus = document.getElementById("playlistStatus");
const volumeSlider = document.getElementById("volumeSlider");
const brightnessSlider = document.getElementById("brightnessSlider");
const shortcutHelpBtn = document.getElementById("shortcutHelpBtn");
const focusPlanToggleBtn = document.getElementById("focusPlanToggleBtn");
const focusPlanDrawer = document.getElementById("focusPlanDrawer");
const focusPlanCloseBtn = document.getElementById("focusPlanCloseBtn");
const focusPlanApplyBtn = document.getElementById("focusPlanApplyBtn");
const focusMinutesInput = document.getElementById("focusMinutesInput");
const shortBreakMinutesInput = document.getElementById("shortBreakMinutesInput");
const longBreakMinutesInput = document.getElementById("longBreakMinutesInput");
const focusSessionsInput = document.getElementById("focusSessionsInput");
const autoStartBreaksInput = document.getElementById("autoStartBreaksInput");
const autoStartFocusInput = document.getElementById("autoStartFocusInput");
const dailyGoalMinutesInput = document.getElementById("dailyGoalMinutesInput");
const focusPlanLockHint = document.getElementById("focusPlanLockHint");
const timerConfigPanel = document.getElementById("timerConfigPanel");
const timerPlanSummary = document.getElementById("timerPlanSummary");
const timerPlanStatus = document.getElementById("timerPlanStatus");
const timerIntentSummary = document.getElementById("timerIntentSummary");
const timerIntentLabel = document.getElementById("timerIntentLabel");
const timerIntentValue = document.getElementById("timerIntentValue");
const tasksToggleBtn = document.getElementById("tasksToggleBtn");
const tasksDrawer = document.getElementById("tasksDrawer");
const tasksCloseBtn = document.getElementById("tasksCloseBtn");
const tasksCurrentLabel = document.getElementById("tasksCurrentLabel");
const tasksCurrentValue = document.getElementById("tasksCurrentValue");
const tasksNextLabel = document.getElementById("tasksNextLabel");
const tasksNextValue = document.getElementById("tasksNextValue");
const taskAddForm = document.getElementById("taskAddForm");
const taskTitleInput = document.getElementById("taskTitleInput");
const taskCapacity = document.getElementById("taskCapacity");
const openTasksCount = document.getElementById("openTasksCount");
const openTasksEmpty = document.getElementById("openTasksEmpty");
const openTasksList = document.getElementById("openTasksList");
const openTasksPagination = document.getElementById("openTasksPagination");
const completedTasksToggle = document.getElementById("completedTasksToggle");
const completedTasksCount = document.getElementById("completedTasksCount");
const completedTasksBody = document.getElementById("completedTasksBody");
const completedTasksEmpty = document.getElementById("completedTasksEmpty");
const completedTasksList = document.getElementById("completedTasksList");
const completedTasksPagination = document.getElementById("completedTasksPagination");
const todayFocusStat = document.getElementById("todayFocusStat");
const todayGoalProgress = document.getElementById("todayGoalProgress");
const todayGoalBar = document.getElementById("todayGoalBar");
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
const statsActiveDaysValue = document.getElementById("statsActiveDaysValue");
const statsStreakValue = document.getElementById("statsStreakValue");
const statsComparisonValue = document.getElementById("statsComparisonValue");
const sessionHistoryCount = document.getElementById("sessionHistoryCount");
const sessionHistoryDateInput = document.getElementById("sessionHistoryDateInput");
const sessionHistoryMinutesInput = document.getElementById("sessionHistoryMinutesInput");
const sessionHistoryAddBtn = document.getElementById("sessionHistoryAddBtn");
const sessionHistoryEmpty = document.getElementById("sessionHistoryEmpty");
const sessionHistoryList = document.getElementById("sessionHistoryList");
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
const rescanMusicFolderBtn = document.getElementById("rescanMusicFolderBtn");
const removeMissingTracksBtn = document.getElementById("removeMissingTracksBtn");
const useDefaultTracksBtn = document.getElementById("useDefaultTracksBtn");
const musicFolderDisplay = document.getElementById("musicFolderDisplay");
const bgToggleBtn = document.getElementById("bgToggleBtn");
const backgroundDrawer = document.getElementById("backgroundDrawer");
const backgroundCloseBtn = document.getElementById("backgroundCloseBtn");
const bgBlackBtn = document.getElementById("bgBlackBtn");
const bgMidnightBtn = document.getElementById("bgMidnightBtn");
const bgMossBtn = document.getElementById("bgMossBtn");
const bgWhiteBtn = document.getElementById("bgWhiteBtn");
const bgCoverBtn = document.getElementById("bgCoverBtn");
const bgWallpaperBtn = document.getElementById("bgWallpaperBtn");
const bgImageBtn = document.getElementById("bgImageBtn");
const bgResetBtn = document.getElementById("bgResetBtn");
const bgPreviewSurface = document.getElementById("bgPreviewSurface");
const bgPresetLabel = document.getElementById("bgPresetLabel");
const bgModeLabel = document.getElementById("bgModeLabel");
const bgPathLabel = document.getElementById("bgPathLabel");
const bgVideoBtn = document.getElementById("bgVideoBtn");
const drawerBackdrop = document.getElementById("drawerBackdrop");
const showcaseToggleBtn = document.getElementById("showcaseToggleBtn");
const shortcutHelpOverlay = document.getElementById("shortcutHelpOverlay");
const shortcutHelpPanel = document.getElementById("shortcutHelpPanel");
const shortcutHelpCloseBtn = document.getElementById("shortcutHelpCloseBtn");
const displayLanguageSelect = document.getElementById("displayLanguageSelect");
const storageRecoveryNotice = document.getElementById("storageRecoveryNotice");
const storageRecoveryMessage = document.getElementById("storageRecoveryMessage");
const storageRecoveryDownloadBtn = document.getElementById("storageRecoveryDownloadBtn");
const storageRecoveryRestoreBtn = document.getElementById("storageRecoveryRestoreBtn");
const storageRecoveryDismissBtn = document.getElementById("storageRecoveryDismissBtn");
const a11yStatus = document.getElementById("a11yStatus");

const focusManager = createFocusManager({ document });
const announceStatus = (message) => announce(a11yStatus, message);

let timerId = null;
let timerDeadlineMs = null;
let timerSettings = { ...DEFAULT_TIMER_SETTINGS };
let dailyFocusGoalSeconds = 0;
let remainingSeconds = timerSettings.focusSeconds;
let timerPhase = "focus";
let completedFocusesInCycle = 0;
let currentFocusSession = null;
let miniModeEnabled = false;
let shortcutSettings = { ...DEFAULT_SHORTCUT_SETTINGS };
let backgroundSettings = { ...DEFAULT_BACKGROUND_SETTINGS };
let weatherSettings = window.InfiniteLofiWeather.normalizeWeatherSettings();
let showcaseModeEnabled = false;
let currentTrackArtwork = null;
let backgroundRenderKey = "";
let backgroundFadeRaf = 0;
let isRestoringBackup = false;
let timerGoalSummary = null;
let completionSaveErrorShown = false;
let tasksController = null;
let weatherController = null;

const mediaSessionController = createMediaSessionController({
  mediaSession: navigator.mediaSession,
  MediaMetadata: window.MediaMetadata,
  audio: lofiPlayer
});

const playerController = createPlayerController({
  appStorage,
  desktopApp: window.desktopApp,
  playerModel: window.InfiniteLofiPlayer,
  defaultTracks: [
    { key: "builtin:track-01", label: "Track 01", src: "../assets/track-01.wav" },
    { key: "builtin:track-02", label: "Track 02", src: "../assets/track-02.wav" },
    { key: "builtin:track-03", label: "Track 03", src: "../assets/track-03.wav" }
  ],
  elements: {
    document,
    lofiPlayer,
    playPauseBtn,
    playlistToggleBtn,
    playlistPanel,
    playlistItems,
    playlistStatus,
    trackLabel,
    volumeSlider,
    musicFolderDisplay,
    loadMusicFolderBtn,
    rescanMusicFolderBtn,
    removeMissingTracksBtn,
    useDefaultTracksBtn
  },
  onArtworkChange: (artwork) => {
    currentTrackArtwork = artwork;
    renderBackgroundUi();
    applyBackground();
  },
  onTrackChange: mediaSessionController.updateMetadata,
  announce: announceStatus,
  setDisclosureState,
  t
});
const {
  loadMusicFolder,
  persistState: persistPlayerState,
  prevTrack,
  removeMissingTracks,
  refreshLanguage: refreshPlayerLanguage,
  rescanMusicFolder,
  restorePersistedPlayer,
  switchTrack,
  togglePlayback,
  togglePlaylistPanel,
  updateTrack,
  updateVolume,
  useDefaultTracks
} = playerController;

mediaSessionController.installActionHandlers({
  previousTrack: prevTrack,
  nextTrack: switchTrack
});

const notesController = createNotesController({
  appStorage,
  noteModel: window.InfiniteLofiNotes,
  sanitizeNoteFiles: sanitizeLoadedNoteFiles,
  elements: { document, notesInput, noteTabs, notePinBtn },
  onError: (error) => showStorageFailure(error, t("storage.notesError")),
  t
});
const {
  clearNotesWithConfirm,
  createNewNoteFile,
  deleteActiveNoteFile,
  loadNotes,
  refreshLanguage: refreshNotesLanguage,
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
    statsCloseBtn,
    todayFocusStat,
    todayGoalProgress,
    todayGoalBar,
    statsHeadingLabel,
    statsTotalValue,
    statsAverageValue,
    statsPeakValue,
    statsActiveDaysValue,
    statsStreakValue,
    statsComparisonValue,
    sessionHistoryCount,
    sessionHistoryDateInput,
    sessionHistoryMinutesInput,
    sessionHistoryEmpty,
    sessionHistoryList,
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
    tasksController?.cancelPendingEdits();
  },
  announce: announceStatus,
  onStatsChange: (state) => {
    refreshTimerGoalSummary(state);
    renderTimer();
  },
  focusManager,
  setDisclosureState,
  t,
  getLocale: () => i18n.getLocale()
});
const {
  clearStats,
  addFocusSessionFromForm,
  dismissStorageRecovery,
  downloadStorageRecoveryCopy,
  exportStatsBackup,
  exportStatsCsv,
  loadStatsRange,
  renderStats,
  renderStorageRecoveryNotice,
  restoreStatsBackup,
  setStatsRange,
  toggleStatsDrawer
} = statsController;

tasksController = createTasksController({
  appStorage,
  taskModel: window.InfiniteLofiTasks,
  elements: {
    document,
    drawerBackdrop,
    timerIntentSummary,
    timerIntentLabel,
    timerIntentValue,
    tasksToggleBtn,
    tasksDrawer,
    tasksCloseBtn,
    tasksCurrentLabel,
    tasksCurrentValue,
    tasksNextLabel,
    tasksNextValue,
    taskAddForm,
    taskTitleInput,
    taskCapacity,
    openTasksCount,
    openTasksEmpty,
    openTasksList,
    openTasksPagination,
    completedTasksToggle,
    completedTasksCount,
    completedTasksBody,
    completedTasksEmpty,
    completedTasksList,
    completedTasksPagination
  },
  focusManager,
  setDisclosureState,
  closeConflicts: () => {
    toggleFocusPlanDrawer(false);
    toggleStatsPanel(false);
    toggleBackgroundDrawer(false);
    toggleNotesPanel(false);
    toggleShortcutHelp(false);
    togglePlaylistPanel(false);
  },
  announce: announceStatus,
  onChange: () => renderTimer(),
  createId: (prefix) => `${prefix}-${crypto.randomUUID()}`,
  t
});

function toggleTasksDrawer(forceOpen) {
  tasksController?.toggleDrawer(forceOpen);
}

function isShortcutEnabled(name) {
  return shortcutSettings[name] !== false;
}

// persisted UI settings helper
function loadUiSettings() {
  const stored = appStorage.getState().settings.ui || {};
  i18n.setLanguage(stored.language || "en");
  i18n.applyDocument(document);
  if (displayLanguageSelect) displayLanguageSelect.value = i18n.getLanguage();
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
    showcaseMode: showcaseModeEnabled,
    language: i18n.getLanguage()
  };
  appStorage.update((state) => {
    state.settings.ui = payload;
  });
}

function refreshShortcutLabels() {
  document.querySelectorAll('.shortcut-setting input[type="checkbox"]').forEach((checkbox) => {
    const label = checkbox.closest(".shortcut-setting")?.querySelector(".shortcut-label")?.textContent?.trim();
    if (label) checkbox.setAttribute("aria-label", t("keys.toggleAria", { label }));
  });
}

function refreshLocalizedUi() {
  i18n.applyDocument(document);
  if (displayLanguageSelect) displayLanguageSelect.value = i18n.getLanguage();
  refreshShortcutLabels();
  refreshNotesLanguage?.();
  refreshPlayerLanguage?.();
  tasksController?.render();
  renderStats();
  weatherController?.refreshLanguage?.();
  updateConfigInputs();
  setTimerInputsLocked(timerId !== null);
  timerToggle.textContent = t(timerId !== null ? "timer.pause" : "timer.start");
  statsToggleBtn.textContent = t(statsDrawer.classList.contains("is-open") ? "player.hideStats" : "player.stats");
  renderTimer();
  renderBackgroundUi();
  applyShowcaseMode();
  miniModeToggleBtn.textContent = t(miniModeEnabled ? "nav.full" : "nav.mini");
  miniModeToggleBtn.title = t(miniModeEnabled ? "nav.returnFull" : "nav.enterMini");
  miniModeToggleBtn.setAttribute("aria-label", miniModeToggleBtn.title);
  applyHoverHints(document, HTMLElement);
  sendTrayStatus();
}

function setDisplayLanguage(rawLanguage) {
  const previousLanguage = i18n.getLanguage();
  const nextLanguage = window.InfiniteLofiI18n.normalizeLanguage(rawLanguage, previousLanguage);
  if (nextLanguage === previousLanguage) return true;
  try {
    appStorage.update((state) => {
      state.settings.ui = { ...state.settings.ui, language: nextLanguage };
    });
  } catch (error) {
    if (displayLanguageSelect) displayLanguageSelect.value = previousLanguage;
    showStorageFailure(error, t("language.saveError"));
    return false;
  }
  i18n.setLanguage(nextLanguage);
  refreshLocalizedUi();
  return true;
}

function translatedPresetName(preset) {
  if (!preset) return t("scene.customMedia");
  const key = {
    "quiet-studio": "scene.quietStudio",
    midnight: "scene.midnight",
    moss: "scene.moss",
    paper: "scene.paper"
  }[preset.id];
  return key ? t(key) : preset.label;
}

function renderBackgroundUi() {
  const preset = getCuratedPreset(backgroundSettings.presetId);
  if (bgPresetLabel) {
    bgPresetLabel.textContent = translatedPresetName(preset);
  }
  for (const button of [bgBlackBtn, bgMidnightBtn, bgMossBtn, bgWhiteBtn]) {
    if (button) {
      button.setAttribute("aria-pressed", String(button.dataset.preset === backgroundSettings.presetId));
    }
  }
  if (bgModeLabel) {
    bgModeLabel.textContent =
      backgroundSettings.mode === "image"
        ? t("scene.image")
        : backgroundSettings.mode === "white" || backgroundSettings.mode === "black"
        ? t("scene.builtIn")
        : backgroundSettings.mode === "video"
        ? t("scene.video")
        : backgroundSettings.mode === "cover"
        ? t("scene.trackCover")
        : t("scene.builtIn");
  }
  if (bgPathLabel) {
    if (backgroundSettings.mode === "image") {
      bgPathLabel.textContent = backgroundSettings.customImageName || backgroundSettings.customImageUrl || t("scene.importedImage");
    } else if (backgroundSettings.mode === "video") {
      bgPathLabel.textContent = backgroundSettings.customVideoName || backgroundSettings.customVideoUrl || t("scene.builtInVideo");
    } else if (backgroundSettings.mode === "cover") {
      bgPathLabel.textContent = currentTrackArtwork?.name || t("scene.noTrackCover");
    } else {
      bgPathLabel.textContent = t("common.none");
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
    } else if (preset) {
      bgPreviewSurface.style.backgroundImage = preset.previewBackground;
      bgPreviewSurface.style.backgroundColor = preset.backgroundColor;
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
    showcaseToggleBtn.textContent = t("timer.show");
    showcaseToggleBtn.title = t("timer.showTitle");
  }
  if (timerCard) {
    timerCard.classList.toggle("is-showcase-exit-target", showcaseModeEnabled);
    timerCard.setAttribute("aria-label", t(showcaseModeEnabled ? "timer.exitShowcase" : "timer.card"));
    timerCard.title = showcaseModeEnabled ? t("timer.exitShowcaseTitle") : "";
    timerCard.style.cursor = showcaseModeEnabled ? "pointer" : "default";
  }
  if (backgroundDrawer && showcaseModeEnabled) {
    toggleBackgroundDrawer(false);
  }
  if (statsDrawer && showcaseModeEnabled) {
    toggleStatsDrawer(false);
  }
  if (focusPlanDrawer && showcaseModeEnabled) {
    toggleFocusPlanDrawer(false);
  }
  if (tasksDrawer && showcaseModeEnabled) {
    toggleTasksDrawer(false);
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
  if (nextOpen) {
    toggleTasksDrawer(false);
    toggleFocusPlanDrawer(false);
    toggleStatsDrawer(false);
    toggleNotesPanel(false);
    toggleShortcutHelp(false);
    togglePlaylistPanel(false);
  }
  backgroundDrawer.classList.toggle("is-open", nextOpen);
  setDisclosureState(bgToggleBtn, nextOpen);
  if (nextOpen) {
    focusManager.open(backgroundDrawer, {
      trigger: bgToggleBtn,
      initialFocus: backgroundCloseBtn
    });
  } else {
    focusManager.close(backgroundDrawer, { fallbackFocus: bgToggleBtn });
  }
  if (drawerBackdrop) {
    drawerBackdrop.classList.toggle("visible", nextOpen);
  }
}

function toggleFocusPlanDrawer(forceOpen) {
  if (!focusPlanDrawer) return;
  const nextOpen = typeof forceOpen === "boolean"
    ? forceOpen
    : !focusPlanDrawer.classList.contains("is-open");
  if (nextOpen) {
    toggleTasksDrawer(false);
    toggleBackgroundDrawer(false);
    toggleStatsDrawer(false);
    toggleNotesPanel(false);
    toggleShortcutHelp(false);
    togglePlaylistPanel(false);
    updateConfigInputs();
  }
  focusPlanDrawer.classList.toggle("is-open", nextOpen);
  setDisclosureState(focusPlanToggleBtn, nextOpen);
  if (nextOpen) {
    focusManager.open(focusPlanDrawer, {
      trigger: focusPlanToggleBtn,
      initialFocus: focusPlanCloseBtn
    });
  } else {
    focusManager.close(focusPlanDrawer, { fallbackFocus: focusPlanToggleBtn });
  }
  drawerBackdrop?.classList.toggle("visible", nextOpen);
}

function toggleStatsPanel(forceOpen) {
  const nextOpen = typeof forceOpen === "boolean"
    ? forceOpen
    : !statsDrawer.classList.contains("is-open");
  if (nextOpen) {
    toggleTasksDrawer(false);
    toggleFocusPlanDrawer(false);
    toggleBackgroundDrawer(false);
    toggleNotesPanel(false);
    toggleShortcutHelp(false);
    togglePlaylistPanel(false);
  }
  toggleStatsDrawer(nextOpen);
}

function setBackgroundMode(mode) {
  if (!["image", "cover"].includes(mode)) {
    return;
  }

  backgroundSettings = applyBackgroundSource(backgroundSettings, mode);
  if (mode !== "image") {
    backgroundSettings.customImageUrl = backgroundSettings.customImageUrl || "";
    backgroundSettings.customImageName = backgroundSettings.customImageName || "";
  }
  renderBackgroundUi();
  applyBackground();
  saveUiSettings();
}

function setBackgroundPreset(presetId) {
  backgroundSettings = applyCuratedPreset(backgroundSettings, presetId);
  renderBackgroundUi();
  applyBackground();
  saveUiSettings();
  const preset = getCuratedPreset(backgroundSettings.presetId);
  const name = preset ? translatedPresetName(preset) : t("scene.title");
  announceStatus(t("scene.selected", { name }));
}

async function useDesktopWallpaperBackground() {
  if (!window.desktopApp || typeof window.desktopApp.getWallpaperBackground !== "function") {
    alert(t("scene.wallpaperUnsupported"));
    return;
  }

  try {
    const result = await window.desktopApp.getWallpaperBackground();
    if (!result || !result.fileUrl) {
      alert(t("scene.wallpaperUnreadable"));
      return;
    }

    backgroundSettings = applyBackgroundSource(backgroundSettings, "image");
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
    alert(t("scene.imageUnsupported"));
    return;
  }

  try {
    const result = await window.desktopApp.selectBackgroundImage();
    if (!result || !result.fileUrl) {
      return;
    }

    backgroundSettings = applyBackgroundSource(backgroundSettings, "image");
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
    alert(t("scene.videoUnsupported"));
    return;
  }

  try {
    const result = await window.desktopApp.selectBackgroundVideo();
    if (!result || !result.fileUrl) {
      return;
    }

    backgroundSettings = applyBackgroundSource(backgroundSettings, "video");
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
    const preset = getCuratedPreset(backgroundSettings.presetId);
    const showcaseActive = showcaseModeEnabled;
    const hasVisualBackground = effectiveBackground.mode === "video" || (effectiveBackground.mode === "image" && Boolean(effectiveBackground.customImageUrl));
    document.body.classList.toggle("has-visual-background", hasVisualBackground);
    // Theme colors are application state, so apply them immediately. The media
    // layer can still fade on the next animation frame, including in headless CI.
    document.body.classList.remove("theme-midnight", "theme-moss", "bg-white-background");
    if (preset?.themeClass) document.body.classList.add(preset.themeClass);
    const backgroundOpacity = effectiveBackground.mode === "white" || showcaseActive
      ? "1"
      : effectiveBackground.fromTrackArtwork
        ? "0.92"
        : hasVisualBackground
          ? "0.82"
          : "0.45";
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
        bgImage.style.backgroundColor = preset?.backgroundColor || "#000000";
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

function createSessionId() {
  return `focus-${crypto.randomUUID()}`;
}

function refreshTimerGoalSummary(state = appStorage.getState(), at = new Date()) {
  const day = getLocalDayKey(at);
  timerGoalSummary = {
    day,
    value: window.InfiniteLofiStats.summarizeDailyGoal(
      state.stats.focusRows,
      day,
      dailyFocusGoalSeconds
    )
  };
  return timerGoalSummary.value;
}

function showStorageFailure(error, fallback = t("storage.genericError")) {
  const message = error instanceof Error && error.message
    ? `${fallback} ${error.message}`
    : fallback;
  alert(message);
  announceStatus(message);
}

function currentRuntimeSnapshot(overrides = {}) {
  return createRuntimeSnapshot({
    phase: overrides.phase ?? timerPhase,
    completedFocusesInCycle: overrides.completedFocusesInCycle ?? completedFocusesInCycle,
    remainingSeconds: overrides.remainingSeconds ?? remainingSeconds,
    deadlineMs: Object.prototype.hasOwnProperty.call(overrides, "deadlineMs")
      ? overrides.deadlineMs
      : timerId !== null
      ? timerDeadlineMs
      : null,
    isRunning: Object.prototype.hasOwnProperty.call(overrides, "isRunning")
      ? overrides.isRunning
      : timerId !== null && timerDeadlineMs !== null,
    focusSession: Object.prototype.hasOwnProperty.call(overrides, "focusSession")
      ? overrides.focusSession
      : currentFocusSession
  }, timerSettings);
}

function loadTimerSettings() {
  const settings = appStorage.getState().settings;
  timerSettings = normalizeTimerSettings(settings.timer);
  dailyFocusGoalSeconds = normalizeDailyGoalSeconds(settings.goals?.dailyFocusSeconds);
  remainingSeconds = getPhaseDuration(timerPhase, timerSettings);
}

function saveTimerRuntime() {
  appStorage.update((state) => {
    state.timerRuntime = currentRuntimeSnapshot();
  });
}

function loadTimerRuntime(nowMs = Date.now()) {
  const savedRuntime = appStorage.getState().timerRuntime;
  const restored = resolveRestoredRuntime(
    savedRuntime,
    timerSettings,
    nowMs
  );

  if (restored.completedFocusDuringAbsence) {
    try {
      const completedAt = new Date(restored.completedFocusAtMs);
      const snapshot = restored.completedFocusSession || {
        id: createSessionId(),
        taskId: null,
        taskTitle: ""
      };
      const committed = commitFocusCompletion(appStorage, {
        focusSession: snapshot,
        focusSeconds: timerSettings.focusSeconds,
        completedAtMs: restored.completedFocusAtMs,
        createNextRuntime: () => createRuntimeSnapshot({
          phase: restored.phase,
          completedFocusesInCycle: restored.completedFocusesInCycle,
          remainingSeconds: restored.remainingSeconds,
          deadlineMs: null,
          isRunning: false,
          focusSession: null
        }, timerSettings)
      });
      refreshTimerGoalSummary(committed, completedAt);
    } catch (error) {
      timerPhase = savedRuntime.phase;
      completedFocusesInCycle = savedRuntime.completedFocusesInCycle;
      remainingSeconds = 0;
      timerDeadlineMs = savedRuntime.deadlineMs;
      currentFocusSession = savedRuntime.focusSession;
      timerId = setInterval(tick, 1000);
      showStorageFailure(error, t("storage.restoredCompletionError"));
      return;
    }
  }
  timerPhase = restored.phase;
  completedFocusesInCycle = restored.completedFocusesInCycle;
  remainingSeconds = restored.remainingSeconds;
  timerDeadlineMs = restored.deadlineMs;
  currentFocusSession = restored.focusSession;
  if (restored.isRunning) {
    timerId = setInterval(tick, 250);
    timerToggle.textContent = t("timer.pause");
    setTimerInputsLocked(true);
  }
}

function updateConfigInputs() {
  focusMinutesInput.value = String(toMinutes(timerSettings.focusSeconds));
  shortBreakMinutesInput.value = String(toMinutes(timerSettings.shortBreakSeconds));
  longBreakMinutesInput.value = String(toMinutes(timerSettings.longBreakSeconds));
  focusSessionsInput.value = String(timerSettings.focusSessionsPerLongBreak);
  autoStartBreaksInput.checked = timerSettings.autoStartBreaks;
  autoStartFocusInput.checked = timerSettings.autoStartFocus;
  dailyGoalMinutesInput.value = dailyFocusGoalSeconds > 0
    ? String(toMinutes(dailyFocusGoalSeconds))
    : "0";
  timerPlanSummary.textContent = t("timer.planSummary", {
    focus: toMinutes(timerSettings.focusSeconds),
    short: toMinutes(timerSettings.shortBreakSeconds),
    long: toMinutes(timerSettings.longBreakSeconds),
    count: timerSettings.focusSessionsPerLongBreak
  });
}

function setTimerInputsLocked(locked) {
  [
    focusMinutesInput,
    shortBreakMinutesInput,
    longBreakMinutesInput,
    focusSessionsInput,
    autoStartBreaksInput,
    autoStartFocusInput,
    dailyGoalMinutesInput,
    focusPlanApplyBtn
  ].forEach((element) => {
    if (element) element.disabled = locked;
  });
  timerConfigPanel.classList.toggle("is-locked", locked);
  focusPlanDrawer.classList.toggle("is-locked", locked);
  focusPlanLockHint.textContent = t(locked ? "plan.lockedHint" : "plan.readyHint");
}

function renderTimer() {
  timerDisplay.textContent = formatTime(remainingSeconds);
  timerPhaseLabel.textContent = titleForTimerPhase(timerPhase);
  const today = getLocalDayKey(new Date());
  const goal = timerGoalSummary?.day === today
    ? timerGoalSummary.value
    : refreshTimerGoalSummary(undefined, new Date());
  const focusPosition = Math.min(
    completedFocusesInCycle + 1,
    timerSettings.focusSessionsPerLongBreak
  );
  const cycleText = timerPhase === "longBreak"
    ? t("timer.cycleComplete")
    : t("timer.focusPosition", { current: focusPosition, total: timerSettings.focusSessionsPerLongBreak });
  const goalText = goal.isEnabled
    ? t("timer.todayGoal", { current: Math.round(goal.focusSeconds / 60), goal: Math.round(goal.goalSeconds / 60) })
    : t("timer.goalOff");
  timerPlanStatus.textContent = `${cycleText} · ${goalText}`;
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
  const availableHeight = Math.max(42, cardRect.height * (isMiniMode ? 0.48 : 0.34));

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
  if (nextOpen) {
    toggleTasksDrawer(false);
    toggleFocusPlanDrawer(false);
    toggleStatsDrawer(false);
    toggleBackgroundDrawer(false);
    toggleShortcutHelp(false);
    togglePlaylistPanel(false);
  }
  document.body.classList.toggle("notes-panel-open", nextOpen);
  setDisclosureState(notesToggleBtn, nextOpen);
  if (window.matchMedia("(max-width: 900px)").matches) {
    if (nextOpen) {
      focusManager.open(notesPanel, { trigger: notesToggleBtn, initialFocus: notesInput });
    } else {
      focusManager.close(notesPanel, { fallbackFocus: notesToggleBtn });
    }
  }
}

function syncNotesPanelAccessibility() {
  const isOverlay = window.matchMedia("(max-width: 900px)").matches;
  if (!isOverlay) {
    focusManager.close(notesPanel, { restoreFocus: false });
    notesPanel.inert = false;
    notesPanel.setAttribute("aria-hidden", "false");
    setDisclosureState(notesToggleBtn, true);
    return;
  }
  const isOpen = document.body.classList.contains("notes-panel-open");
  notesPanel.inert = !isOpen;
  notesPanel.setAttribute("aria-hidden", String(!isOpen));
  setDisclosureState(notesToggleBtn, isOpen);
}

async function toggleMiniMode(forceEnabled) {
  const nextEnabled = typeof forceEnabled === "boolean" ? forceEnabled : !miniModeEnabled;
  if (!window.desktopWindow || typeof window.desktopWindow.setMiniMode !== "function") return;
  if (nextEnabled) {
    toggleStatsPanel(false);
    toggleBackgroundDrawer(false);
    toggleFocusPlanDrawer(false);
    toggleTasksDrawer(false);
    toggleShortcutHelp(false);
    toggleNotesPanel(false);
    if (showcaseModeEnabled) toggleShowcaseMode(false);
  }
  miniModeEnabled = await window.desktopWindow.setMiniMode(nextEnabled);
  document.body.classList.toggle("is-mini-mode", miniModeEnabled);
  miniModeToggleBtn.textContent = t(miniModeEnabled ? "nav.full" : "nav.mini");
  miniModeToggleBtn.title = t(miniModeEnabled ? "nav.returnFull" : "nav.enterMini");
  miniModeToggleBtn.setAttribute("aria-label", miniModeToggleBtn.title);
  announceStatus(t(miniModeEnabled ? "timer.miniEnabled" : "timer.fullRestored"));
  requestAnimationFrame(adjustTimerFont);
}

function sendTrayStatus() {
  if (!window.desktopApp) {
    return;
  }

  window.desktopApp.sendTrayStatus({
    timerText: formatTime(remainingSeconds),
    phaseText: titleForTimerPhase(timerPhase),
    isRunning: timerId !== null,
    labels: {
      startTimer: t("tray.startTimer"),
      pauseTimer: t("tray.pauseTimer"),
      resetTimer: t("tray.resetTimer"),
      showWindow: t("tray.showWindow"),
      hideWindow: t("tray.hideWindow"),
      quit: t("tray.quit")
    }
  });
}

function titleForTimerPhase(phase) {
  return {
    focus: t("timer.focus"),
    shortBreak: t("timer.shortBreak"),
    longBreak: t("timer.longBreak")
  }[phase] || t("timer.infiniteFocus");
}

function stopTimer() {
  if (timerId === null) return true;
  if (!syncTimerToClock()) return false;
  if (timerId === null) return true;
  try {
    const committed = appStorage.update((state) => {
      state.timerRuntime = currentRuntimeSnapshot({ deadlineMs: null, isRunning: false });
    });
    clearInterval(timerId);
    timerId = null;
    timerDeadlineMs = null;
    currentFocusSession = committed.timerRuntime.focusSession;
    timerToggle.textContent = t("timer.start");
    setTimerInputsLocked(false);
    if (!lofiPlayer.paused) lofiPlayer.pause();
    sendTrayStatus();
    return true;
  } catch (error) {
    showStorageFailure(error, t("storage.timerPauseError"));
    return false;
  }
}

function notifyPhaseSwitch() {
  const title = t(timerPhase === "focus" ? "timer.focusTime" : timerPhase === "longBreak" ? "timer.longBreak" : "timer.shortBreak");
  const body = t(timerPhase === "focus" ? "timer.focusNotification" : timerPhase === "longBreak" ? "timer.longBreakNotification" : "timer.shortBreakNotification");

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


function commitTimerPhaseCompletion(completedAtMs = Date.now(), nowMs = Date.now()) {
  const transition = advanceTimerPhase(
    { phase: timerPhase, completedFocusesInCycle },
    timerSettings
  );
  const nextRemainingSeconds = getPhaseDuration(transition.phase, timerSettings);
  const nextDeadlineMs = transition.shouldAutoStart
    ? nowMs + nextRemainingSeconds * 1000
    : null;
  const nextSessionId = transition.phase === "focus" && transition.shouldAutoStart
    ? createSessionId()
    : null;
  const completedSnapshot = transition.completedFocus
    ? currentFocusSession || { id: createSessionId(), taskId: null, taskTitle: "" }
    : null;
  let committed;
  try {
    const createNextRuntime = (state) => {
      const nextFocusSession = transition.phase === "focus" && transition.shouldAutoStart
        ? window.InfiniteLofiTasks.snapshotSelectedTask(state.tasks, nextSessionId)
        : null;
      return createRuntimeSnapshot({
        phase: transition.phase,
        completedFocusesInCycle: transition.completedFocusesInCycle,
        remainingSeconds: nextRemainingSeconds,
        deadlineMs: nextDeadlineMs,
        isRunning: transition.shouldAutoStart,
        focusSession: nextFocusSession
      }, timerSettings);
    };
    committed = transition.completedFocus
      ? commitFocusCompletion(appStorage, {
          focusSession: completedSnapshot,
          focusSeconds: timerSettings.focusSeconds,
          completedAtMs,
          createNextRuntime
        })
      : appStorage.update((state) => {
          state.timerRuntime = createNextRuntime(state);
        });
  } catch (error) {
    if (!completionSaveErrorShown) {
      completionSaveErrorShown = true;
      showStorageFailure(error, t("storage.completionError"));
    }
    return false;
  }

  completionSaveErrorShown = false;
  timerPhase = committed.timerRuntime.phase;
  completedFocusesInCycle = committed.timerRuntime.completedFocusesInCycle;
  remainingSeconds = committed.timerRuntime.remainingSeconds;
  timerDeadlineMs = committed.timerRuntime.deadlineMs;
  currentFocusSession = committed.timerRuntime.focusSession;
  if (!committed.timerRuntime.isRunning && timerId !== null) {
    clearInterval(timerId);
    timerId = null;
    timerToggle.textContent = t("timer.start");
    setTimerInputsLocked(false);
    if (!lofiPlayer.paused) lofiPlayer.pause();
  }
  refreshTimerGoalSummary(committed, new Date(completedAtMs));
  renderStats();
  tasksController?.render(committed);
  renderTimer();
  sendTrayStatus();
  notifyPhaseSwitch();
  announceStatus(t("timer.phaseStartedAnnouncement", { phase: titleForTimerPhase(timerPhase), time: formatTime(remainingSeconds) }));
  if (timerId !== null && lofiPlayer.paused) {
    lofiPlayer.play().catch(() => {
      playPauseBtn.textContent = t("player.play");
    });
  }
  return true;
}

function syncTimerToClock(nowMs = Date.now()) {
  if (timerId === null || timerDeadlineMs === null) {
    return true;
  }

  const nextRemainingSeconds = remainingSecondsUntil(timerDeadlineMs, nowMs);
  if (nextRemainingSeconds <= 0) {
    const completedAtMs = timerDeadlineMs;
    remainingSeconds = 0;
    renderTimer();
    sendTrayStatus();
    return commitTimerPhaseCompletion(completedAtMs, nowMs);
  }

  if (nextRemainingSeconds === remainingSeconds) {
    return true;
  }
  remainingSeconds = nextRemainingSeconds;
  renderTimer();
  sendTrayStatus();
  return true;
}

function tick() {
  syncTimerToClock();
}

function toggleTimer() {
  if (timerId !== null) {
    if (stopTimer()) announceStatus(t("timer.pausedAnnouncement", { time: formatTime(remainingSeconds) }));
    return;
  }

  const nextDeadlineMs = Date.now() + remainingSeconds * 1000;
  try {
    const committed = appStorage.update((state) => {
      const focusSession = timerPhase === "focus"
        ? currentFocusSession || window.InfiniteLofiTasks.snapshotSelectedTask(state.tasks, createSessionId())
        : null;
      state.timerRuntime = createRuntimeSnapshot({
        phase: timerPhase,
        completedFocusesInCycle,
        remainingSeconds,
        deadlineMs: nextDeadlineMs,
        isRunning: true,
        focusSession
      }, timerSettings);
    });
    timerDeadlineMs = committed.timerRuntime.deadlineMs;
    currentFocusSession = committed.timerRuntime.focusSession;
    timerId = setInterval(tick, 250);
    timerToggle.textContent = t("timer.pause");
    setTimerInputsLocked(true);
    tasksController?.render(committed);
  } catch (error) {
    showStorageFailure(error, t("storage.timerStartError"));
    return;
  }
  if (!lofiPlayer.src) {
    updateTrack();
  }
  lofiPlayer.play().catch(() => {
    playPauseBtn.textContent = t("player.play");
  });
  sendTrayStatus();
  announceStatus(t("timer.startedAnnouncement", { phase: titleForTimerPhase(timerPhase), time: formatTime(remainingSeconds) }));
}

function resetTimer() {
  if (!syncTimerToClock()) return;
  try {
    const committed = appStorage.update((state) => {
      state.timerRuntime = createRuntimeSnapshot({
        phase: "focus",
        completedFocusesInCycle: 0,
        remainingSeconds: timerSettings.focusSeconds,
        deadlineMs: null,
        isRunning: false,
        focusSession: null
      }, timerSettings);
    });
    if (timerId !== null) clearInterval(timerId);
    timerId = null;
    timerDeadlineMs = null;
    timerPhase = "focus";
    completedFocusesInCycle = 0;
    remainingSeconds = timerSettings.focusSeconds;
    currentFocusSession = null;
    timerToggle.textContent = t("timer.start");
    setTimerInputsLocked(false);
    if (!lofiPlayer.paused) lofiPlayer.pause();
    tasksController?.render(committed);
  } catch (error) {
    showStorageFailure(error, t("storage.timerResetError"));
    return;
  }
  renderTimer();
  sendTrayStatus();
  announceStatus(t("timer.resetAnnouncement", { time: formatTime(remainingSeconds) }));
}

function applyFocusPlanSettings() {
  if (timerId !== null) {
    return;
  }

  timerSettings = normalizeTimerSettings({
    focusSeconds: normalizeMinutes(focusMinutesInput.value, timerSettings.focusSeconds) * 60,
    shortBreakSeconds: normalizeMinutes(
      shortBreakMinutesInput.value,
      timerSettings.shortBreakSeconds
    ) * 60,
    longBreakSeconds: normalizeMinutes(
      longBreakMinutesInput.value,
      timerSettings.longBreakSeconds
    ) * 60,
    focusSessionsPerLongBreak: focusSessionsInput.value,
    autoStartBreaks: autoStartBreaksInput.checked,
    autoStartFocus: autoStartFocusInput.checked
  });
  const goalMinutes = Number(dailyGoalMinutesInput.value);
  dailyFocusGoalSeconds = normalizeDailyGoalSeconds(
    Number.isFinite(goalMinutes) ? Math.round(goalMinutes) * 60 : dailyFocusGoalSeconds
  );
  let committed;
  try {
    committed = appStorage.update((state) => {
      state.settings.timer = { ...timerSettings };
      state.settings.goals = { dailyFocusSeconds: dailyFocusGoalSeconds };
      state.timerRuntime = createRuntimeSnapshot({
        phase: "focus",
        completedFocusesInCycle: 0,
        remainingSeconds: timerSettings.focusSeconds,
        deadlineMs: null,
        isRunning: false,
        focusSession: null
      }, timerSettings);
    });
  } catch (error) {
    showStorageFailure(error, t("storage.planError"));
    loadTimerSettings();
    updateConfigInputs();
    return;
  }
  timerPhase = "focus";
  completedFocusesInCycle = 0;
  remainingSeconds = timerSettings.focusSeconds;
  currentFocusSession = null;
  timerDeadlineMs = null;
  refreshTimerGoalSummary(committed);
  tasksController?.render(committed);
  updateConfigInputs();
  renderTimer();
  renderStats();
  sendTrayStatus();
  announceStatus(t("plan.applied"));
  toggleFocusPlanDrawer(false);
}

function normalizeConfigInputDisplay() {
  if (timerId !== null) {
    return;
  }
  focusMinutesInput.value = String(normalizeMinutes(focusMinutesInput.value, timerSettings.focusSeconds));
  shortBreakMinutesInput.value = String(normalizeMinutes(
    shortBreakMinutesInput.value,
    timerSettings.shortBreakSeconds
  ));
  longBreakMinutesInput.value = String(normalizeMinutes(
    longBreakMinutesInput.value,
    timerSettings.longBreakSeconds
  ));
  focusSessionsInput.value = String(clamp(Math.round(Number(focusSessionsInput.value) || 4), 1, 12));
  const goalMinutes = Number(dailyGoalMinutesInput.value);
  dailyGoalMinutesInput.value = String(
    goalMinutes <= 0 ? 0 : Math.round(normalizeDailyGoalSeconds(goalMinutes * 60) / 60)
  );
}



function bindWindowControls() {
  document.documentElement.dataset.platform = window.desktopWindow?.platform || "unknown";
  shortcutHelpBtn?.addEventListener("click", () => toggleShortcutHelp(true));
  miniModeToggleBtn.addEventListener("click", () => toggleMiniMode());
  notesToggleBtn.addEventListener("click", () => toggleNotesPanel());
  notesCloseBtn.addEventListener("click", () => toggleNotesPanel(false));
  drawerBackdrop?.addEventListener("click", () => toggleNotesPanel(false));
  displayLanguageSelect?.addEventListener("change", () => setDisplayLanguage(displayLanguageSelect.value));
  window.addEventListener("resize", () => requestAnimationFrame(() => {
    adjustTimerFont();
    syncNotesPanelAccessibility();
  }), { passive: true });
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
  if (nextOpen) {
    toggleTasksDrawer(false);
    toggleFocusPlanDrawer(false);
    toggleStatsDrawer(false);
    toggleBackgroundDrawer(false);
    toggleNotesPanel(false);
    togglePlaylistPanel(false);
  }
  shortcutHelpOverlay.classList.toggle("hidden", !nextOpen);
  setDisclosureState(shortcutHelpBtn, nextOpen);
  if (nextOpen) {
    focusManager.open(shortcutHelpOverlay, {
      trigger: shortcutHelpBtn,
      initialFocus: shortcutHelpCloseBtn
    });
  } else {
    focusManager.close(shortcutHelpOverlay, { fallbackFocus: shortcutHelpBtn });
  }
}




async function init() {
  tasksController.bindEvents();
  loadUiSettings();
  loadStatsRange();
  loadTimerSettings();
  loadTimerRuntime();
  tasksController.render();
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
  toggleStatsPanel(false);
  toggleTasksDrawer(false);
  toggleFocusPlanDrawer(false);
  toggleBackgroundDrawer(false);
  toggleShortcutHelp(false);
  syncNotesPanelAccessibility();
  bindWindowControls();
  bindAppCommands();
  bindUiEvents({
    window,
    document,
    elements: {
      timerToggle,
      timerReset,
      focusPlanToggleBtn,
      focusPlanDrawer,
      focusPlanCloseBtn,
      focusPlanApplyBtn,
      tasksDrawer,
      focusMinutesInput,
      shortBreakMinutesInput,
      longBreakMinutesInput,
      focusSessionsInput,
      dailyGoalMinutesInput,
      statsToggleBtn,
      statsDrawer,
      statsCloseBtn,
      statsRangeTodayBtn,
      statsRangeWeekBtn,
      statsRangeMonthBtn,
      sessionHistoryAddBtn,
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
      bgMidnightBtn,
      bgMossBtn,
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
      rescanMusicFolderBtn,
      removeMissingTracksBtn,
      useDefaultTracksBtn,
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
      toggleFocusPlanDrawer,
      toggleTasksDrawer,
      applyFocusPlanSettings,
      normalizeConfigInputDisplay,
      toggleStatsDrawer: toggleStatsPanel,
      setStatsRange,
      exportStatsCsv,
      exportStatsBackup,
      restoreStatsBackup,
      downloadStorageRecoveryCopy,
      dismissStorageRecovery,
      clearStats,
      addFocusSessionFromForm,
      saveNotesSoon,
      createNewNoteFile,
      toggleActiveNotePin,
      deleteActiveNoteFile,
      toggleBackgroundDrawer,
      importBackgroundVideo,
      setBackgroundMode,
      setBackgroundPreset,
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
      rescanMusicFolder,
      removeMissingTracks,
      useDefaultTracks,
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
    formatTime,
    t
  });
  refreshShortcutLabels();
  renderStorageRecoveryNotice();
  bindKeyboardShortcutEvents({
    window,
    HTMLElement,
    elements: {
      shortcutHelpOverlay,
      playlistPanel,
      statsDrawer,
      backgroundDrawer,
      focusPlanDrawer,
      tasksDrawer,
      notesPanel,
      notesInput,
      lofiPlayer,
      volumeSlider
    },
    actions: {
      toggleShortcutHelp,
      toggleShowcaseMode,
      toggleFocusPlanDrawer,
      toggleTasksDrawer,
      toggleStatsDrawer: toggleStatsPanel,
      toggleBackgroundDrawer,
      toggleNotesPanel,
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
  weatherController = createWeatherController({
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
    t,
    getLocale: () => i18n.getLocale(),
    onSettingsChange: (settings) => {
      weatherSettings = settings;
      saveUiSettings();
    }
  });
  weatherController.init();
  sendTrayStatus();
}

init().catch((error) => {
  console.error("Infinite Lo-Fi failed to initialize:", error);
});
