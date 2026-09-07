const MAX_TIMER_SECONDS = 6 * 60 * 60;
const DEFAULT_FOCUS_SECONDS = 25 * 60;
const DEFAULT_BREAK_SECONDS = 5 * 60;
const NOTES_STORAGE_KEY = "infiniteLofiNotes";
const NOTES_FILES_STORAGE_KEY = "infiniteLofiNoteFiles";
const NOTES_ACTIVE_ID_KEY = "infiniteLofiActiveNoteId";
const TIMER_SETTINGS_KEY = "infiniteLofiTimerSettings";
const FOCUS_STATS_KEY = "infiniteLofiFocusStats";
const STATS_RANGE_KEY = "infiniteLofiStatsRange";
const UI_SETTINGS_KEY = "infiniteLofiUiSettings";
const WEATHER_CACHE_KEY = "infiniteLofiWeatherCache";
const WEATHER_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const WEATHER_HINT_REFRESH_INTERVAL_MS = 60 * 1000;
const WEATHER_RETRY_DELAYS_MS = [0, 1800, 5000];
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

const backgroundConfig = {
  mode: "black",
  video: "../assets/background.mp4",
  image: "../assets/background.jpg"
};

let playlist = [
  { label: "Track 01", src: "../assets/track-01.wav" },
  { label: "Track 02", src: "../assets/track-02.wav" },
  { label: "Track 03", src: "../assets/track-03.wav" }
];

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
const timerScrollFadeTop = document.getElementById("timerScrollFadeTop");
const timerScrollFadeBottom = document.getElementById("timerScrollFadeBottom");
const statsToggleBtn = document.getElementById("statsToggleBtn");
const statsDrawer = document.getElementById("statsDrawer");
const statsCloseBtn = document.getElementById("statsCloseBtn");
const statusTime = document.getElementById("statusTime");
const statusDate = document.getElementById("statusDate");
const statusWeather = document.getElementById("statusWeather");
const loadMusicFolderBtn = document.getElementById("loadMusicFolderBtn");
const musicFolderDisplay = document.getElementById("musicFolderDisplay");
const bgToggleBtn = document.getElementById("bgToggleBtn");
const backgroundDrawer = document.getElementById("backgroundDrawer");
const backgroundCloseBtn = document.getElementById("backgroundCloseBtn");
const bgBlackBtn = document.getElementById("bgBlackBtn");
const bgWhiteBtn = document.getElementById("bgWhiteBtn");
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

let timerId = null;
let focusDurationSeconds = DEFAULT_FOCUS_SECONDS;
let breakDurationSeconds = DEFAULT_BREAK_SECONDS;
let remainingSeconds = focusDurationSeconds;
let timerPhase = "focus";
let currentTrackIndex = 0;
let noteSaveTimer = null;
let statsRangeMode = "week";
let closeBehavior = "quit";
let timerScrollFadeRaf = 0;
let draggedItem = null;
let localMusicFolder = null;
let shortcutSettings = { ...DEFAULT_SHORTCUT_SETTINGS };
let noteFiles = [];
let activeNoteId = "";
let draggedNoteId = "";
let renamingNoteId = "";
let backgroundSettings = { ...DEFAULT_BACKGROUND_SETTINGS };
let showcaseModeEnabled = false;
let currentTrackArtwork = null;
let backgroundRenderKey = "";
let backgroundFadeRaf = 0;

function normalizeShortcutSettings(raw) {
  const merged = { ...DEFAULT_SHORTCUT_SETTINGS };
  if (!raw || typeof raw !== "object") {
    return merged;
  }

  for (const key of Object.keys(merged)) {
    if (typeof raw[key] === "boolean") {
      merged[key] = raw[key];
    }
  }
  return merged;
}

function isShortcutEnabled(name) {
  return shortcutSettings[name] !== false;
}

// persisted UI settings helper
function loadUiSettings() {
  const stored = parseStoredJson(UI_SETTINGS_KEY, null) || {};
  shortcutSettings = normalizeShortcutSettings(stored.shortcuts);
  backgroundSettings = normalizeBackgroundSettings(stored.background);
  showcaseModeEnabled = Boolean(stored.showcaseMode);

  // volume
  const storedVol = Number(stored.volume);
  if (Number.isFinite(storedVol)) {
    if (volumeSlider) volumeSlider.value = String(Math.round(storedVol * 100));
    if (lofiPlayer) lofiPlayer.volume = storedVol;
  }

  // brightness
  const storedBright = Number(stored.brightness);
  if (Number.isFinite(storedBright)) {
    if (brightnessSlider) brightnessSlider.value = String(Math.round(storedBright * 100));
    document.documentElement.style.setProperty("--scene-brightness", String(storedBright));
  }

  applyShowcaseMode();
  applyBackground();
  renderBackgroundUi();
}

function saveUiSettings() {
  const payload = {
    volume: Number(lofiPlayer.volume) || 0.68,
    brightness: Number(getComputedStyle(document.documentElement).getPropertyValue("--scene-brightness")) || 1,
    shortcuts: shortcutSettings,
    background: backgroundSettings,
    showcaseMode: showcaseModeEnabled
  };
  window.localStorage.setItem(UI_SETTINGS_KEY, JSON.stringify(payload));
}

function normalizeBackgroundSettings(raw) {
  const merged = { ...DEFAULT_BACKGROUND_SETTINGS };
  if (!raw || typeof raw !== "object") {
    return merged;
  }

  const mode = typeof raw.mode === "string" ? raw.mode : "black";
  merged.mode = ["black", "white", "image", "video"].includes(mode) ? mode : "black";
  merged.customImageUrl = typeof raw.customImageUrl === "string" ? raw.customImageUrl : "";
  merged.customImageName = typeof raw.customImageName === "string" ? raw.customImageName : "";
  merged.customVideoUrl = typeof raw.customVideoUrl === "string" ? raw.customVideoUrl : "";
  merged.customVideoName = typeof raw.customVideoName === "string" ? raw.customVideoName : "";
  return merged;
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
        : "Black";
  }
  if (bgPathLabel) {
    if (backgroundSettings.mode === "image") {
      bgPathLabel.textContent = backgroundSettings.customImageName || backgroundSettings.customImageUrl || "Imported Image";
    } else if (backgroundSettings.mode === "video") {
      bgPathLabel.textContent = backgroundSettings.customVideoName || backgroundSettings.customVideoUrl || "Built-in Video";
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
  if (currentTrackArtwork && currentTrackArtwork.url) {
    return {
      mode: "image",
      customImageUrl: currentTrackArtwork.url,
      customImageName: currentTrackArtwork.name || "Track Cover",
      fromTrackArtwork: true
    };
  }

  return {
    ...backgroundSettings,
    fromTrackArtwork: false
  };
}

function buildBackgroundRenderKey(background) {
  return [
    background.mode,
    background.customImageUrl || "",
    background.customVideoUrl || "",
    showcaseModeEnabled ? "showcase" : "normal"
  ].join("|");
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
  if (!["black", "white", "image"].includes(mode)) {
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
    const nextKey = buildBackgroundRenderKey(effectiveBackground);
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

// Clock & weather
function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchJsonWithTimeout(url, timeoutMs = 6000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: ctrl.signal
    });
    if (!res.ok) {
      throw new Error(`request failed: ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTextWithTimeout(url, timeoutMs = 6000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: ctrl.signal
    });
    if (!res.ok) {
      throw new Error(`request failed: ${res.status}`);
    }
    return (await res.text()).trim();
  } finally {
    clearTimeout(timer);
  }
}

function weatherCodeToText(code) {
  if (code === 0) return "Clear";
  if ([1, 2].includes(code)) return "Partly Cloudy";
  if (code === 3) return "Cloudy";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Thunderstorm";
  return "Unknown";
}

async function fetchWeatherViaOpenMeteo() {
  const geo = await fetchJsonWithTimeout("https://ipapi.co/json/", 6000);
  const latitude = Number(geo && geo.latitude);
  const longitude = Number(geo && geo.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("invalid geo location");
  }

  const city = typeof geo.city === "string" && geo.city.trim() ? geo.city.trim() : "Local";
  const forecast = await fetchJsonWithTimeout(
    `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}&current=temperature_2m,weather_code&timezone=auto`,
    7000
  );

  const current = forecast && forecast.current;
  const temp = Number(current && current.temperature_2m);
  const code = Number(current && current.weather_code);
  if (!Number.isFinite(temp)) {
    throw new Error("invalid weather payload");
  }

  const rounded = Math.round(temp);
  const weatherText = weatherCodeToText(code);
  return `${city}: ${weatherText} ${rounded}°C`;
}

async function fetchWeatherViaWttr() {
  return await fetchTextWithTimeout("https://wttr.in/?format=%l:+%c+%t", 7000);
}

function sanitizeWeatherText(rawText) {
  if (typeof rawText !== "string") {
    return "";
  }

  let text = rawText.trim();
  if (!text) {
    return "";
  }

  const htmlLike = /<!doctype|<html|<head|<body|<style|<script|<div|<span|<pre/i.test(text);
  if (htmlLike) {
    try {
      const parsed = new DOMParser().parseFromString(text, "text/html");
      text = (parsed.body && parsed.body.textContent ? parsed.body.textContent : "").trim();
    } catch {
      return "";
    }
  }

  if (!text) {
    return "";
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const candidates = lines.length > 0 ? lines : [text.replace(/\s+/g, " ").trim()];
  const weatherLine = candidates.find((line) => /°\s*[CF]|[+\-]?\d+\s*°/.test(line));
  const picked = weatherLine || candidates[0] || "";

  if (!picked || picked.length > 120) {
    return "";
  }

  return picked;
}

function formatWeatherUpdatedAgo(updatedAt) {
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) {
    return "";
  }

  const diffMs = Math.max(0, Date.now() - updatedAt);
  const minutes = Math.floor(diffMs / (60 * 1000));
  if (minutes < 1) {
    return "刚刚";
  }
  if (minutes < 60) {
    return `${minutes}分钟前`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}小时前`;
  }

  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}天前`;
  }

  const date = new Date(updatedAt);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}/${day}`;
}

function formatWeatherDisplay(text, updatedAt) {
  const safeText = sanitizeWeatherText(text);
  if (!safeText) {
    return "";
  }
  const ago = formatWeatherUpdatedAgo(updatedAt);
  return ago ? `${safeText} · ${ago}更新` : safeText;
}

function readCachedWeather() {
  const cache = parseStoredJson(WEATHER_CACHE_KEY, null);
  if (!cache || typeof cache !== "object") {
    return null;
  }

  const text = sanitizeWeatherText(typeof cache.text === "string" ? cache.text : "");
  if (!text) {
    return null;
  }

  const updatedAt = Number(cache.updatedAt);
  return {
    text,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0
  };
}

function writeCachedWeatherText(text, updatedAt = Date.now()) {
  const normalizedText = sanitizeWeatherText(text);
  if (!normalizedText) {
    return;
  }

  window.localStorage.setItem(
    WEATHER_CACHE_KEY,
    JSON.stringify({
      text: normalizedText,
      updatedAt
    })
  );
}

function refreshWeatherHintFromCache() {
  const cached = readCachedWeather();
  if (!cached || !statusWeather) {
    return;
  }
  statusWeather.textContent = formatWeatherDisplay(cached.text, cached.updatedAt);
}

function updateClockDisplay() {
  try {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    if (statusTime) statusTime.textContent = `${hh}:${mm}`;
    if (statusDate) statusDate.textContent = now.toLocaleDateString();
  } catch (e) {
    // ignore
  }
}

async function fetchWeatherText() {
  const providers = [fetchWeatherViaOpenMeteo, fetchWeatherViaWttr];

  for (const delayMs of WEATHER_RETRY_DELAYS_MS) {
    if (delayMs > 0) {
      await wait(delayMs);
    }

    for (const provider of providers) {
      try {
        const txt = sanitizeWeatherText(await provider());
        if (txt && txt.length > 0) {
          const updatedAt = Date.now();
          if (statusWeather) statusWeather.textContent = formatWeatherDisplay(txt, updatedAt);
          writeCachedWeatherText(txt, updatedAt);
          return;
        }
      } catch (e) {
        // try next provider / retry round
      }
    }
  }

  const cached = readCachedWeather();
  if (cached) {
    if (statusWeather) statusWeather.textContent = formatWeatherDisplay(cached.text, cached.updatedAt);
    return;
  }

  if (statusWeather) statusWeather.textContent = "Weather unavailable";
}

function initClockWeather() {
  updateClockDisplay();
  setInterval(updateClockDisplay, 1000);
  const cached = readCachedWeather();
  if (cached && statusWeather) {
    statusWeather.textContent = formatWeatherDisplay(cached.text, cached.updatedAt);
  }
  setInterval(refreshWeatherHintFromCache, WEATHER_HINT_REFRESH_INTERVAL_MS);
  // initial fetch and periodic refresh every 10 minutes
  fetchWeatherText();
  setInterval(fetchWeatherText, WEATHER_REFRESH_INTERVAL_MS);
}


function toggleStatsDrawer(forceOpen) {
  const nextOpen = typeof forceOpen === "boolean" ? forceOpen : !statsDrawer.classList.contains("is-open");
  statsDrawer.classList.toggle("is-open", nextOpen);
  statsToggleBtn.textContent = nextOpen ? "Hide Stats" : "Stats";
}

function clamp(number, min, max) {
  return Math.min(Math.max(number, min), max);
}

function toMinutes(seconds) {
  return Math.max(1, Math.round(seconds / 60));
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatShortDuration(totalMinutes) {
  const safeMinutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function getDayKey(date) {
  return date.toISOString().slice(0, 10);
}

function parseStoredJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function saveStatsRange() {
  window.localStorage.setItem(STATS_RANGE_KEY, statsRangeMode);
}

function loadStatsRange() {
  const stored = window.localStorage.getItem(STATS_RANGE_KEY);
  if (stored === "today" || stored === "week" || stored === "month") {
    statsRangeMode = stored;
  }
}

function saveTimerSettings() {
  window.localStorage.setItem(
    TIMER_SETTINGS_KEY,
    JSON.stringify({
      focusSeconds: focusDurationSeconds,
      breakSeconds: breakDurationSeconds
    })
  );
}

function loadTimerSettings() {
  const settings = parseStoredJson(TIMER_SETTINGS_KEY, null);
  if (!settings) {
    return;
  }

  const focusSeconds = clamp(Number(settings.focusSeconds) || DEFAULT_FOCUS_SECONDS, 60, MAX_TIMER_SECONDS);
  const breakSeconds = clamp(Number(settings.breakSeconds) || DEFAULT_BREAK_SECONDS, 60, MAX_TIMER_SECONDS);
  focusDurationSeconds = focusSeconds;
  breakDurationSeconds = breakSeconds;
  remainingSeconds = timerPhase === "focus" ? focusDurationSeconds : breakDurationSeconds;
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
  if (!window.desktopApp || typeof window.desktopApp.getCloseBehavior !== "function") {
    return;
  }
  try {
    const behavior = await window.desktopApp.getCloseBehavior();
    closeBehavior = behavior === "tray" ? "tray" : "quit";
  } catch {
    closeBehavior = "quit";
  }
  renderCloseModeToggle();
}

function toggleCloseBehavior() {
  closeBehavior = closeBehavior === "tray" ? "quit" : "tray";
  renderCloseModeToggle();
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
      queueUpdateTimerScrollIndicators();
    } catch (e) {
      // ignore
    }
  });
}

function queueUpdateTimerScrollIndicators() {
  if (!timerContent || !timerScrollFadeTop || !timerScrollFadeBottom) {
    return;
  }

  const maxScroll = timerContent.scrollHeight - timerContent.clientHeight;
  const atTop = timerContent.scrollTop <= 4;
  const atBottom = maxScroll <= 4 || timerContent.scrollTop >= maxScroll - 4;

  timerScrollFadeTop.classList.toggle("hidden", atTop);
  timerScrollFadeBottom.classList.toggle("hidden", atBottom);
}

// Compute and set a font-size (px) for the timer display so the full text always fits
function adjustTimerFont() {
  if (!timerCard || !timerDisplay) return;

  // Prefer measuring the visible timer content area (may be scrollable)
  let availableWidth = 0;
  let availableHeight = 0;
  if (timerContent) {
    availableWidth = Math.max(40, timerContent.clientWidth * 0.96);
    // constrain height by visible content area and a fraction of window height
    availableHeight = Math.max(28, Math.min(timerContent.clientHeight * 0.88, window.innerHeight * 0.5));
  } else {
    const cardRect = timerCard.getBoundingClientRect();
    if (!cardRect.width || !cardRect.height) return;
    availableWidth = Math.max(40, cardRect.width * 0.92);
    availableHeight = Math.max(28, cardRect.height * 0.72);
  }

  const text = timerDisplay.textContent || "00:00";
  const cs = getComputedStyle(timerDisplay);
  const fontFamily = cs.fontFamily || "IBM Plex Mono, monospace";
  const fontWeight = cs.fontWeight || "700";

  // start from a size that's a fraction of card height
  const maxCandidate = Math.min(240, Math.round(availableHeight * 1.0));
  const minCandidate = 12;

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
    clearInterval(timerId);
    timerId = null;
  }
  timerToggle.textContent = "Start";
  setTimerInputsLocked(false);
  if (!lofiPlayer.paused) {
    lofiPlayer.pause();
  }
  sendTrayStatus();
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

function recordCompletedFocusSession() {
  const rows = parseStoredJson(FOCUS_STATS_KEY, []);
  const map = new Map();

  for (const row of rows) {
    if (!row || typeof row.day !== "string") {
      continue;
    }
    const secs = Number(row.focusSeconds);
    if (!Number.isFinite(secs) || secs < 0) {
      continue;
    }
    map.set(row.day, (map.get(row.day) || 0) + secs);
  }

  const today = getDayKey(new Date());
  map.set(today, (map.get(today) || 0) + focusDurationSeconds);

  const serialized = Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, focusSeconds]) => ({ day, focusSeconds }))
    .slice(-60);

  window.localStorage.setItem(FOCUS_STATS_KEY, JSON.stringify(serialized));
  renderStats();
}

function switchTimerPhase() {
  if (timerPhase === "focus") {
    recordCompletedFocusSession();
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
}

function tick() {
  if (remainingSeconds <= 0) {
    switchTimerPhase();
    return;
  }
  remainingSeconds -= 1;
  renderTimer();
  sendTrayStatus();
}

function toggleTimer() {
  if (timerId !== null) {
    stopTimer();
    return;
  }

  timerToggle.textContent = "Pause";
  setTimerInputsLocked(true);
  timerId = setInterval(tick, 1000);
  if (!lofiPlayer.src) {
    updateTrack();
  }
  lofiPlayer.play().catch(() => {
    playPauseBtn.textContent = "Play";
  });
  sendTrayStatus();
}

function resetTimer() {
  stopTimer();
  timerPhase = "focus";
  remainingSeconds = focusDurationSeconds;
  renderTimer();
  sendTrayStatus();
}

function normalizeMinutes(inputValue, fallbackSeconds) {
  const fallbackMinutes = toMinutes(fallbackSeconds);
  const maybe = Number(inputValue);
  if (!Number.isFinite(maybe)) {
    return fallbackMinutes;
  }
  const rounded = Math.round(maybe);
  return clamp(rounded, 1, 360);
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
}

function normalizeConfigInputDisplay() {
  if (timerId !== null) {
    return;
  }
  focusMinutesInput.value = String(normalizeMinutes(focusMinutesInput.value, focusDurationSeconds));
  breakMinutesInput.value = String(normalizeMinutes(breakMinutesInput.value, breakDurationSeconds));
}

function createNoteFile(name = "Untitled", content = "") {
  return {
    id: `note-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    name: (name || "Untitled").trim().slice(0, 40) || "Untitled",
    content: content || "",
    pinned: false,
    updatedAt: Date.now()
  };
}

function finalizeNoteRename(noteId, rawName) {
  const target = noteFiles.find((f) => f.id === noteId);
  if (!target) {
    renamingNoteId = "";
    return;
  }

  const nextName = String(rawName || "").trim().slice(0, 40);
  if (nextName) {
    target.name = nextName;
    target.updatedAt = Date.now();
  }

  renamingNoteId = "";
  renderNoteTabs();
  persistNoteFiles();
}

function beginRenameNoteFile(noteId) {
  if (!noteId) {
    return;
  }

  renamingNoteId = noteId;
  renderNoteTabs();
  requestAnimationFrame(() => {
    const renameInput = document.getElementById("noteTabRenameInput");
    if (renameInput) {
      renameInput.focus();
      renameInput.select();
    }
  });
}

function sanitizeLoadedNoteFiles(rawList) {
  if (!Array.isArray(rawList)) {
    return [];
  }

  const files = [];
  rawList.forEach((item, index) => {
    if (!item || typeof item !== "object") {
      return;
    }

    const id = typeof item.id === "string" && item.id.trim() ? item.id.trim() : `note-import-${index}`;
    const name = typeof item.name === "string" && item.name.trim() ? item.name.trim().slice(0, 40) : `Note ${index + 1}`;
    const content = typeof item.content === "string" ? item.content : "";
    const pinned = item.pinned === true;
    const updatedAt = Number(item.updatedAt);
    files.push({
      id,
      name,
      content,
      pinned,
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now()
    });
  });

  return files;
}

function persistNoteFiles() {
  window.localStorage.setItem(NOTES_FILES_STORAGE_KEY, JSON.stringify(noteFiles));
  window.localStorage.setItem(NOTES_ACTIVE_ID_KEY, activeNoteId || "");
}

function getActiveNoteFile() {
  return noteFiles.find((f) => f.id === activeNoteId) || null;
}

function sortNoteFilesPinnedFirst() {
  const pinned = [];
  const normal = [];
  noteFiles.forEach((file) => {
    if (file.pinned) {
      pinned.push(file);
    } else {
      normal.push(file);
    }
  });
  noteFiles = [...pinned, ...normal];
}

function updateNotePinButtonState() {
  if (!notePinBtn) {
    return;
  }

  const active = getActiveNoteFile();
  if (!active) {
    notePinBtn.textContent = "Pin";
    return;
  }

  notePinBtn.textContent = active.pinned ? "Unpin" : "Pin";
}

function reorderNoteFiles(fromId, toId) {
  if (!fromId || !toId || fromId === toId) {
    return;
  }

  const fromIndex = noteFiles.findIndex((f) => f.id === fromId);
  const toIndex = noteFiles.findIndex((f) => f.id === toId);
  if (fromIndex < 0 || toIndex < 0) {
    return;
  }

  const [moved] = noteFiles.splice(fromIndex, 1);
  noteFiles.splice(toIndex, 0, moved);
  sortNoteFilesPinnedFirst();
  renderNoteTabs();
  persistNoteFiles();
}

function renderNoteTabs() {
  if (!noteTabs) {
    return;
  }

  noteTabs.innerHTML = "";
  noteFiles.forEach((file) => {
    const isRenaming = renamingNoteId === file.id;
    const tab = document.createElement(isRenaming ? "div" : "button");
    if (!isRenaming) {
      tab.type = "button";
    }
    tab.className = "note-tab";
    if (file.id === activeNoteId) {
      tab.classList.add("is-active");
    }
    if (file.pinned) {
      tab.classList.add("is-pinned");
    }
    tab.draggable = !isRenaming;
    tab.dataset.noteId = file.id;

    let nameNode = null;
    if (isRenaming) {
      const renameInput = document.createElement("input");
      renameInput.id = "noteTabRenameInput";
      renameInput.className = "note-tab-name";
      renameInput.value = file.name;
      renameInput.maxLength = 40;
      renameInput.style.background = "rgba(0, 0, 0, 0.22)";
      renameInput.style.border = "1px solid rgba(251, 191, 36, 0.52)";
      renameInput.style.borderRadius = "0.45rem";
      renameInput.style.padding = "0.1rem 0.3rem";
      renameInput.style.outline = "none";
      renameInput.addEventListener("click", (event) => event.stopPropagation());
      renameInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          finalizeNoteRename(file.id, renameInput.value);
        }
        if (event.key === "Escape") {
          event.preventDefault();
          renamingNoteId = "";
          renderNoteTabs();
        }
      });
      renameInput.addEventListener("blur", () => {
        finalizeNoteRename(file.id, renameInput.value);
      });
      nameNode = renameInput;
    } else {
      const nameSpan = document.createElement("span");
      nameSpan.className = "note-tab-name";
      nameSpan.textContent = file.name;
      nameNode = nameSpan;
    }

    const pinSpan = document.createElement("span");
    pinSpan.className = "note-tab-pin";
    pinSpan.textContent = file.pinned ? "PIN" : "";

    tab.appendChild(nameNode);
    tab.appendChild(pinSpan);

    if (!isRenaming) {
      tab.addEventListener("click", () => setActiveNoteFile(file.id));
      tab.addEventListener("dblclick", () => beginRenameNoteFile(file.id));
    }
    tab.title = isRenaming ? `Rename note ${file.name}` : `Open note ${file.name}`;
    tab.addEventListener("dragstart", (event) => {
      draggedNoteId = file.id;
      tab.classList.add("is-dragging");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
      }
    });
    tab.addEventListener("dragend", () => {
      draggedNoteId = "";
      tab.classList.remove("is-dragging");
      noteTabs.querySelectorAll(".note-tab.is-drag-over").forEach((el) => el.classList.remove("is-drag-over"));
    });
    tab.addEventListener("dragover", (event) => {
      event.preventDefault();
      if (draggedNoteId && draggedNoteId !== file.id) {
        tab.classList.add("is-drag-over");
      }
    });
    tab.addEventListener("dragleave", () => {
      tab.classList.remove("is-drag-over");
    });
    tab.addEventListener("drop", (event) => {
      event.preventDefault();
      tab.classList.remove("is-drag-over");
      reorderNoteFiles(draggedNoteId, file.id);
    });

    noteTabs.appendChild(tab);
  });

  updateNotePinButtonState();
}

function setActiveNoteFile(noteId) {
  const target = noteFiles.find((f) => f.id === noteId) || noteFiles[0] || null;
  if (!target) {
    return;
  }

  activeNoteId = target.id;
  if (notesInput) {
    notesInput.value = target.content || "";
  }
  renderNoteTabs();
  persistNoteFiles();
}

function loadNoteFiles() {
  const loaded = sanitizeLoadedNoteFiles(parseStoredJson(NOTES_FILES_STORAGE_KEY, []));
  if (loaded.length > 0) {
    noteFiles = loaded;
  } else {
    const legacyText = window.localStorage.getItem(NOTES_STORAGE_KEY) || "";
    noteFiles = [createNoteFile("Note 1", legacyText)];
  }

  sortNoteFilesPinnedFirst();

  const savedActiveId = window.localStorage.getItem(NOTES_ACTIVE_ID_KEY) || "";
  activeNoteId = noteFiles.some((f) => f.id === savedActiveId) ? savedActiveId : noteFiles[0].id;
  setActiveNoteFile(activeNoteId);
}

function createNewNoteFile() {
  const defaultName = `Note ${noteFiles.length + 1}`;
  const file = createNoteFile(defaultName, "");
  noteFiles.push(file);
  sortNoteFilesPinnedFirst();
  setActiveNoteFile(file.id);
  beginRenameNoteFile(file.id);
}

function renameActiveNoteFile() {
  const active = getActiveNoteFile();
  if (!active) {
    return;
  }

  beginRenameNoteFile(active.id);
}

function toggleActiveNotePin() {
  const active = getActiveNoteFile();
  if (!active) {
    return;
  }

  active.pinned = !active.pinned;
  active.updatedAt = Date.now();
  sortNoteFilesPinnedFirst();
  setActiveNoteFile(active.id);
}

function deleteActiveNoteFile() {
  if (noteFiles.length <= 1) {
    clearNotesWithConfirm();
    return;
  }

  const active = getActiveNoteFile();
  if (!active) {
    return;
  }

  const confirmed = window.confirm(`Delete note \"${active.name}\"?`);
  if (!confirmed) {
    return;
  }

  noteFiles = noteFiles.filter((f) => f.id !== active.id);
  const fallback = noteFiles[0];
  setActiveNoteFile(fallback.id);
}

function loadNotes() {
  loadNoteFiles();
}

function saveNotesSoon() {
  if (noteSaveTimer) {
    clearTimeout(noteSaveTimer);
  }
  noteSaveTimer = setTimeout(() => {
    const active = getActiveNoteFile();
    if (!active) {
      return;
    }
    active.content = notesInput.value;
    active.updatedAt = Date.now();
    persistNoteFiles();
    // keep legacy key for compatibility with old exports
    window.localStorage.setItem(NOTES_STORAGE_KEY, notesInput.value);
  }, 180);
}

function saveNotesNow() {
  if (noteSaveTimer) {
    clearTimeout(noteSaveTimer);
    noteSaveTimer = null;
  }
  const active = getActiveNoteFile();
  if (active) {
    active.content = notesInput.value || "";
    active.updatedAt = Date.now();
    persistNoteFiles();
  }
  window.localStorage.setItem(NOTES_STORAGE_KEY, notesInput.value || "");
}

function clearNotesWithConfirm() {
  const confirmed = window.confirm("Clear all notes?");
  if (!confirmed) {
    return;
  }

  notesInput.value = "";
  if (noteSaveTimer) {
    clearTimeout(noteSaveTimer);
    noteSaveTimer = null;
  }
  const active = getActiveNoteFile();
  if (active) {
    active.content = "";
    active.updatedAt = Date.now();
    persistNoteFiles();
  }
  window.localStorage.setItem(NOTES_STORAGE_KEY, "");
}

function updateTrack() {
  const track = playlist[currentTrackIndex];
  trackLabel.textContent = track.label;
  lofiPlayer.src = track.srcUrl || track.src;
  currentTrackArtwork = track && track.artworkUrl ? { url: track.artworkUrl, name: track.artworkName || `${track.label} Cover` } : null;
  renderBackgroundUi();
  applyBackground();
  renderPlaylist();
}

async function loadMusicFolder() {
  if (!window.desktopApp || typeof window.desktopApp.selectMusicFolder !== "function") {
    alert("Music folder selection not supported");
    return;
  }

  try {
    const result = await window.desktopApp.selectMusicFolder();
    if (!result || !result.tracks || result.tracks.length === 0) {
      alert("No music files found in the selected folder");
      return;
    }

    playlist = result.tracks;
    localMusicFolder = result.folderPath;
    const folderName = localMusicFolder.split(/[\\/]/).pop() || "Local";
    if (musicFolderDisplay) {
      musicFolderDisplay.textContent = folderName;
    }
    currentTrackIndex = 0;
    updateTrack();
    renderPlaylist();
  } catch (e) {
    console.error("Error loading music folder:", e);
  }
}

function reorderPlaylist(fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= playlist.length || toIndex >= playlist.length) {
    return;
  }

  const [track] = playlist.splice(fromIndex, 1);
  playlist.splice(toIndex, 0, track);

  if (currentTrackIndex === fromIndex) {
    currentTrackIndex = toIndex;
  } else if (fromIndex < currentTrackIndex && toIndex >= currentTrackIndex) {
    currentTrackIndex -= 1;
  } else if (fromIndex > currentTrackIndex && toIndex <= currentTrackIndex) {
    currentTrackIndex += 1;
  }

  renderPlaylist();
}

function playSelectedTrack(index) {
  currentTrackIndex = index;
  updateTrack();
  lofiPlayer.play().catch(() => {
    playPauseBtn.textContent = "Play";
  });
}

function renderPlaylist() {
  playlistItems.innerHTML = "";
  playlist.forEach((track, index) => {
    const itemButton = document.createElement("button");
    itemButton.type = "button";
    itemButton.className = `playlist-item ${index === currentTrackIndex ? "is-active" : ""}`;
    itemButton.textContent = track.label;
    itemButton.draggable = true;
    itemButton.dataset.index = String(index);
    itemButton.title = `Play ${track.label}`;
    itemButton.addEventListener("click", () => playSelectedTrack(index));
    
    // Drag event listeners
    itemButton.addEventListener("dragstart", (e) => {
      draggedItem = itemButton;
      itemButton.classList.add("is-dragging");
      e.dataTransfer.effectAllowed = "move";
    });

    itemButton.addEventListener("dragend", (e) => {
      itemButton.classList.remove("is-dragging");
      draggedItem = null;
    });

    itemButton.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (draggedItem && draggedItem !== itemButton) {
        itemButton.classList.add("is-drag-over");
      }
    });

    itemButton.addEventListener("dragleave", (e) => {
      itemButton.classList.remove("is-drag-over");
    });

    itemButton.addEventListener("drop", (e) => {
      e.preventDefault();
      itemButton.classList.remove("is-drag-over");
      if (draggedItem && draggedItem !== itemButton) {
        const fromIndex = Number(draggedItem.dataset.index);
        const toIndex = Number(itemButton.dataset.index);
        reorderPlaylist(fromIndex, toIndex);
      }
    });

    playlistItems.appendChild(itemButton);
  });
}

function togglePlayback() {
  if (!lofiPlayer.src) {
    updateTrack();
  }

  if (lofiPlayer.paused) {
    lofiPlayer
      .play()
      .then(() => {
        playPauseBtn.textContent = "Pause";
      })
      .catch(() => {
        playPauseBtn.textContent = "Play";
      });
  } else {
    lofiPlayer.pause();
    playPauseBtn.textContent = "Play";
  }
}

function switchTrack() {
  currentTrackIndex = (currentTrackIndex + 1) % playlist.length;
  updateTrack();

  if (!lofiPlayer.paused) {
    lofiPlayer.play().catch(() => {
      playPauseBtn.textContent = "Play";
    });
  }
}

function prevTrack() {
  currentTrackIndex = (currentTrackIndex - 1 + playlist.length) % playlist.length;
  updateTrack();

  if (!lofiPlayer.paused) {
    lofiPlayer.play().catch(() => {
      playPauseBtn.textContent = "Play";
    });
  }
}

function togglePlaylistPanel() {
  playlistPanel.classList.toggle("hidden");
}

function updateVolume() {
  const normalized = Number(volumeSlider.value) / 100;
  lofiPlayer.volume = Number.isFinite(normalized) ? normalized : 0.68;
}

function bindWindowControls() {
  if (!window.desktopWindow) {
    return;
  }
  windowMinBtn.addEventListener("click", () => window.desktopWindow.minimize());
  windowCloseBtn.addEventListener("click", () => window.desktopWindow.close());
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

function getLastSevenDays() {
  const days = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const rangeDays = statsRangeMode === "today" ? 1 : statsRangeMode === "month" ? 30 : 7;

  for (let i = rangeDays - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const fullLabel = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    const shortLabel = rangeDays === 1 ? "Today" : String(d.getDate());
    days.push({
      key: getDayKey(d),
      label: shortLabel,
      fullLabel
    });
  }

  return days;
}

function renderStats() {
  const rows = parseStoredJson(FOCUS_STATS_KEY, []);
  const map = new Map();

  for (const row of rows) {
    if (row && typeof row.day === "string") {
      const secs = Number(row.focusSeconds);
      if (Number.isFinite(secs) && secs >= 0) {
        map.set(row.day, secs);
      }
    }
  }

  const days = getLastSevenDays();
  const values = days.map((d) => map.get(d.key) || 0);
  const maxValue = Math.max(...values, 60);
  const totalMinutes = Math.round(values.reduce((sum, value) => sum + value, 0) / 60);
  const averageMinutes = Math.round(totalMinutes / Math.max(days.length, 1));
  const peakMinutes = Math.round(Math.max(...values, 0) / 60);

  const todayKey = getDayKey(new Date());
  const todayMinutes = Math.round((map.get(todayKey) || 0) / 60);
  todayFocusStat.textContent = `Today ${todayMinutes}m`;
  const headingMap = {
    today: "Focus Stats (Today)",
    week: "Focus Stats (This Week)",
    month: "Focus Stats (This Month)"
  };
  statsHeadingLabel.textContent = headingMap[statsRangeMode] || headingMap.week;
  statsTotalValue.textContent = formatShortDuration(totalMinutes);
  statsAverageValue.textContent = `${averageMinutes}m`;
  statsPeakValue.textContent = `${peakMinutes}m`;
  statsBars.style.gridTemplateColumns = `repeat(${days.length}, minmax(0, 1fr))`;

  statsBars.innerHTML = "";
  days.forEach((day, index) => {
    const value = values[index];
    const height = Math.max(6, Math.round((value / maxValue) * 100));
    const bob = ((index % 3) - 1) * 0.65;
    const wobble = ((index % 5) - 2) * 0.22;

    const barWrap = document.createElement("div");
    barWrap.className = `stat-bar stat-bar-${(index % 4) + 1}`;
    barWrap.style.transform = `rotate(${wobble}deg) translateY(${bob}px)`;

    const fill = document.createElement("div");
    fill.className = `stat-bar-fill stat-bar-fill-${(index % 4) + 1}`;
    fill.style.height = `${height}%`;
    fill.style.width = `${clamp(92 + (index % 4) * 2, 92, 100)}%`;
    fill.style.marginLeft = `${((index % 3) - 1) * 0.6}px`;

    const paperStripe = document.createElement("div");
    paperStripe.className = "stat-bar-paper";
    paperStripe.style.opacity = String(0.3 + (index % 4) * 0.07);

    const label = document.createElement("div");
    label.className = "stat-bar-label";
    label.textContent = day.label;

    const minutes = Math.round(value / 60);
    barWrap.dataset.day = day.key;
    barWrap.dataset.label = day.label;
    if (day.fullLabel) {
      barWrap.dataset.fullLabel = day.fullLabel;
    }
    barWrap.dataset.minutes = String(minutes);
    barWrap.setAttribute("aria-label", `${day.label} ${minutes} minutes`);
    barWrap.addEventListener("mouseenter", (event) => showStatsTooltip(event, barWrap));
    barWrap.addEventListener("mousemove", (event) => moveStatsTooltip(event));
    barWrap.addEventListener("mouseleave", hideStatsTooltip);

    fill.title = `${Math.round(value / 60)} min`;
    barWrap.appendChild(paperStripe);
    barWrap.appendChild(fill);
    barWrap.appendChild(label);
    statsBars.appendChild(barWrap);
  });

  statsRangeTodayBtn.classList.toggle("is-active", statsRangeMode === "today");
  statsRangeWeekBtn.classList.toggle("is-active", statsRangeMode === "week");
  statsRangeMonthBtn.classList.toggle("is-active", statsRangeMode === "month");
}

function setStatsRange(mode) {
  statsRangeMode = mode === "today" || mode === "month" ? mode : "week";
  saveStatsRange();
  renderStats();
}

function exportStatsCsv() {
  const rows = parseStoredJson(FOCUS_STATS_KEY, []);
  const map = new Map();

  if (Array.isArray(rows)) {
    rows.forEach((row) => {
      if (!row || typeof row.day !== "string") {
        return;
      }
      const secs = Number(row.focusSeconds);
      if (!Number.isFinite(secs) || secs < 0) {
        return;
      }
      map.set(row.day, (map.get(row.day) || 0) + secs);
    });
  }

  const days = getLastSevenDays();
  const normalizedRows = days.map((day) => ({
    day: day.key,
    focusMinutes: Math.round((map.get(day.key) || 0) / 60)
  }));

  const lines = ["day,focusMinutes"];
  normalizedRows.forEach((row) => {
    lines.push(`${row.day},${row.focusMinutes}`);
  });

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `infinite-lofi-focus-stats-${getDayKey(new Date())}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function exportStatsBackup() {
  const rows = parseStoredJson(FOCUS_STATS_KEY, []);
  const activeNote = getActiveNoteFile();
  const payload = {
    exportedAt: new Date().toISOString(),
    focusStats: Array.isArray(rows) ? rows : [],
    timerSettings: {
      focusSeconds: focusDurationSeconds,
      breakSeconds: breakDurationSeconds
    },
    notes: activeNote ? activeNote.content : window.localStorage.getItem(NOTES_STORAGE_KEY) || "",
    noteFiles,
    activeNoteId
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `infinite-lofi-backup-${getDayKey(new Date())}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function clearStats() {
  const confirmed = window.confirm("Clear all focus stats? This cannot be undone.");
  if (!confirmed) {
    return;
  }

  window.localStorage.removeItem(FOCUS_STATS_KEY);
  renderStats();
}

function showStatsTooltip(event, barWrap) {
  const full = barWrap.dataset.fullLabel || barWrap.dataset.label || "";
  const minutes = barWrap.dataset.minutes || "0";
  statsTooltip.textContent = `${full} · ${minutes}m`;
  statsTooltip.classList.remove("hidden");
  moveStatsTooltip(event);
}

function moveStatsTooltip(event) {
  const bounds = statsBars.getBoundingClientRect();
  const x = clamp(event.clientX - bounds.left, 12, bounds.width - 12);
  const y = clamp(event.clientY - bounds.top - 16, 0, bounds.height - 8);
  statsTooltip.style.left = `${x}px`;
  statsTooltip.style.top = `${Math.max(0, y)}px`;
}

function hideStatsTooltip() {
  statsTooltip.classList.add("hidden");
}

function toggleShortcutHelp(forceOpen) {
  if (!shortcutHelpOverlay) {
    return;
  }

  const nextOpen = typeof forceOpen === "boolean" ? forceOpen : shortcutHelpOverlay.classList.contains("hidden");
  shortcutHelpOverlay.classList.toggle("hidden", !nextOpen);
  shortcutHelpOverlay.setAttribute("aria-hidden", String(!nextOpen));
}

function isTypingElement(target) {
  if (!target || !(target instanceof HTMLElement)) {
    return false;
  }

  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    return true;
  }

  return target.isContentEditable;
}

function bindKeyboardShortcuts() {
  window.addEventListener("keydown", (event) => {
    const key = event.key;
    const lowerKey = typeof key === "string" ? key.toLowerCase() : "";
    const isMeta = event.metaKey || event.ctrlKey;
    const isTyping = isTypingElement(event.target);

    if (key === "?" || (key === "/" && event.shiftKey)) {
      event.preventDefault();
      toggleShortcutHelp();
      return;
    }

    if (key === "Escape" && showcaseModeEnabled) {
      event.preventDefault();
      toggleShowcaseMode(false);
      return;
    }

    // Escape can always close transient panels.
    if (key === "Escape" && isShortcutEnabled("closePanels")) {
      if (shortcutHelpOverlay && !shortcutHelpOverlay.classList.contains("hidden")) {
        event.preventDefault();
        toggleShortcutHelp(false);
      }
      if (!playlistPanel.classList.contains("hidden")) {
        event.preventDefault();
        playlistPanel.classList.add("hidden");
      }
      if (statsDrawer.classList.contains("is-open")) {
        event.preventDefault();
        toggleStatsDrawer(false);
      }
      return;
    }

    // Avoid hijacking regular typing except selected meta shortcuts.
    if (isTyping && !isMeta) {
      return;
    }

    // Timer shortcuts
    if (isShortcutEnabled("timerToggle") && isMeta && key === "Enter") {
      event.preventDefault();
      toggleTimer();
      return;
    }
    if (isShortcutEnabled("timerReset") && isMeta && lowerKey === "backspace" && !event.shiftKey) {
      event.preventDefault();
      resetTimer();
      return;
    }

    // Notes shortcuts
    if (isShortcutEnabled("notesFocus") && isMeta && event.shiftKey && lowerKey === "n") {
      event.preventDefault();
      notesInput.focus();
      notesInput.setSelectionRange(notesInput.value.length, notesInput.value.length);
      return;
    }
    if (isShortcutEnabled("notesSave") && isMeta && lowerKey === "s") {
      event.preventDefault();
      saveNotesNow();
      return;
    }
    if (isShortcutEnabled("notesClear") && isMeta && event.shiftKey && lowerKey === "backspace") {
      event.preventDefault();
      clearNotesWithConfirm();
      return;
    }

    // Player shortcuts
    if (isShortcutEnabled("playPause") && lowerKey === "p") {
      event.preventDefault();
      togglePlayback();
      return;
    }
    if (isShortcutEnabled("nextTrack") && lowerKey === "n") {
      event.preventDefault();
      switchTrack();
      return;
    }
    if (isShortcutEnabled("prevTrack") && lowerKey === "b") {
      event.preventDefault();
      prevTrack();
      return;
    }

    // Panels and stats
    if (isShortcutEnabled("togglePlaylist") && lowerKey === "l") {
      event.preventDefault();
      togglePlaylistPanel();
      return;
    }
    if (isShortcutEnabled("toggleStats") && lowerKey === "s") {
      event.preventDefault();
      toggleStatsDrawer();
      return;
    }
    if (isShortcutEnabled("statsToday") && key === "1") {
      event.preventDefault();
      setStatsRange("today");
      return;
    }
    if (isShortcutEnabled("statsWeek") && key === "2") {
      event.preventDefault();
      setStatsRange("week");
      return;
    }
    if (isShortcutEnabled("statsMonth") && key === "3") {
      event.preventDefault();
      setStatsRange("month");
      return;
    }

    // Quick load local folder
    if (isShortcutEnabled("loadFolder") && isMeta && lowerKey === "o") {
      event.preventDefault();
      loadMusicFolder();
      return;
    }

    // Seek / volume adjustments
    if (isShortcutEnabled("seekBack") && key === "ArrowLeft") {
      event.preventDefault();
      const next = Math.max(0, (lofiPlayer.currentTime || 0) - 5);
      lofiPlayer.currentTime = next;
      return;
    }
    if (isShortcutEnabled("seekForward") && key === "ArrowRight") {
      event.preventDefault();
      const dur = Number.isFinite(lofiPlayer.duration) ? lofiPlayer.duration : 0;
      const next = Math.min(dur || Number.MAX_SAFE_INTEGER, (lofiPlayer.currentTime || 0) + 5);
      lofiPlayer.currentTime = next;
      return;
    }
    if (isShortcutEnabled("volumeUp") && key === "ArrowUp") {
      event.preventDefault();
      const nextVol = clamp(Math.round((lofiPlayer.volume + 0.05) * 100), 0, 100);
      volumeSlider.value = String(nextVol);
      updateVolume();
      saveUiSettings();
      return;
    }
    if (isShortcutEnabled("volumeDown") && key === "ArrowDown") {
      event.preventDefault();
      const nextVol = clamp(Math.round((lofiPlayer.volume - 0.05) * 100), 0, 100);
      volumeSlider.value = String(nextVol);
      updateVolume();
      saveUiSettings();
    }
  });
}

function bindEvents() {
  timerToggle.addEventListener("click", toggleTimer);
  timerReset.addEventListener("click", resetTimer);
  focusMinutesInput.addEventListener("input", applyTimerConfigLive);
  breakMinutesInput.addEventListener("input", applyTimerConfigLive);
  focusMinutesInput.addEventListener("blur", normalizeConfigInputDisplay);
  breakMinutesInput.addEventListener("blur", normalizeConfigInputDisplay);
  closeModeToggleBtn.addEventListener("click", toggleCloseBehavior);
  statsToggleBtn.addEventListener("click", () => toggleStatsDrawer());
  statsCloseBtn.addEventListener("click", () => toggleStatsDrawer(false));
  statsRangeTodayBtn.addEventListener("click", () => setStatsRange("today"));
  statsRangeWeekBtn.addEventListener("click", () => setStatsRange("week"));
  statsRangeMonthBtn.addEventListener("click", () => setStatsRange("month"));
  exportStatsBtn.addEventListener("click", exportStatsCsv);
  backupStatsBtn.addEventListener("click", exportStatsBackup);
  clearStatsBtn.addEventListener("click", clearStats);

  notesInput.addEventListener("input", saveNotesSoon);
  if (noteNewBtn) {
    noteNewBtn.addEventListener("click", createNewNoteFile);
  }
  if (notePinBtn) {
    notePinBtn.addEventListener("click", toggleActiveNotePin);
  }
  if (noteDeleteBtn) {
    noteDeleteBtn.addEventListener("click", deleteActiveNoteFile);
  }
  if (bgToggleBtn) {
    bgToggleBtn.addEventListener("click", () => toggleBackgroundDrawer());
  }
  if (backgroundCloseBtn) {
    backgroundCloseBtn.addEventListener("click", () => toggleBackgroundDrawer(false));
  }
  if (bgVideoBtn) {
    bgVideoBtn.addEventListener("click", importBackgroundVideo);
  }
  if (drawerBackdrop) {
    drawerBackdrop.addEventListener("click", () => toggleBackgroundDrawer(false));
  }
  if (bgBlackBtn) {
    bgBlackBtn.addEventListener("click", () => setBackgroundMode("black"));
  }
  if (bgWhiteBtn) {
    bgWhiteBtn.addEventListener("click", () => setBackgroundMode("white"));
  }
  if (bgWallpaperBtn) {
    bgWallpaperBtn.addEventListener("click", useDesktopWallpaperBackground);
  }
  if (bgImageBtn) {
    bgImageBtn.addEventListener("click", importBackgroundImage);
  }
  if (bgResetBtn) {
    bgResetBtn.addEventListener("click", () => {
      backgroundSettings = { ...DEFAULT_BACKGROUND_SETTINGS };
      renderBackgroundUi();
      applyBackground();
      saveUiSettings();
    });
  }
  if (showcaseToggleBtn) {
    showcaseToggleBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleShowcaseMode();
    });
  }
  if (timerCard) {
    timerCard.addEventListener("click", () => {
      if (showcaseModeEnabled) {
        toggleShowcaseMode(false);
      }
    });
  }
  if (timerDisplay) {
    timerDisplay.addEventListener("click", () => {
      if (showcaseModeEnabled) {
        toggleShowcaseMode(false);
      }
    });
  }
  playPauseBtn.addEventListener("click", togglePlayback);
  nextTrackBtn.addEventListener("click", switchTrack);
  prevTrackBtn.addEventListener("click", prevTrack);
  playlistToggleBtn.addEventListener("click", togglePlaylistPanel);
  if (loadMusicFolderBtn) {
    loadMusicFolderBtn.addEventListener("click", loadMusicFolder);
  }
  if (shortcutHelpCloseBtn) {
    shortcutHelpCloseBtn.addEventListener("click", () => toggleShortcutHelp(false));
  }
  if (shortcutHelpOverlay) {
    shortcutHelpOverlay.addEventListener("click", (event) => {
      if (event.target === shortcutHelpOverlay) {
        toggleShortcutHelp(false);
      }
    });
  }
  if (shortcutHelpPanel) {
    shortcutHelpPanel.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    const shortcutToggleInputs = shortcutHelpPanel.querySelectorAll("input[data-shortcut]");
    shortcutToggleInputs.forEach((input) => {
      if (!(input instanceof HTMLInputElement)) {
        return;
      }

      const key = input.dataset.shortcut;
      if (!key) {
        return;
      }

      input.checked = isShortcutEnabled(key);
      input.addEventListener("change", () => {
        shortcutSettings[key] = input.checked;
        saveUiSettings();
      });
    });
  }
  volumeSlider.addEventListener("input", () => {
    updateVolume();
    saveUiSettings();
  });
  brightnessSlider.addEventListener("input", () => {
    const val = Number(brightnessSlider.value) / 100;
    if (Number.isFinite(val) && val > 0) {
      document.documentElement.style.setProperty("--scene-brightness", String(val));
      saveUiSettings();
    }
  });

  // Progress / seek handling (use normalized 0..1000 slider)
  progressSlider.addEventListener("input", () => {
    const dur = lofiPlayer.duration;
    if (!Number.isFinite(dur) || dur <= 0) return;
    const fraction = Number(progressSlider.value) / 1000;
    const preview = Math.max(0, Math.min(dur, fraction * dur));
    currentTimeLabel.textContent = formatTime(Math.floor(preview));
  });

  progressSlider.addEventListener("change", () => {
    const dur = lofiPlayer.duration;
    if (!Number.isFinite(dur) || dur <= 0) return;
    const fraction = Number(progressSlider.value) / 1000;
    const seekTo = Math.max(0, Math.min(dur, fraction * dur));
    lofiPlayer.currentTime = seekTo;
  });

  if (timerContent) {
    timerContent.addEventListener("scroll", queueUpdateTimerScrollIndicators, { passive: true });
  }

  lofiPlayer.addEventListener("loadedmetadata", () => {
    const dur = lofiPlayer.duration || 0;
    durationLabel.textContent = formatTime(Math.floor(dur));
    // ensure current time shows correctly
    currentTimeLabel.textContent = formatTime(Math.floor(lofiPlayer.currentTime || 0));
  });

  lofiPlayer.addEventListener("timeupdate", () => {
    const dur = lofiPlayer.duration;
    if (!Number.isFinite(dur) || dur <= 0) {
      progressSlider.value = 0;
      currentTimeLabel.textContent = formatTime(Math.floor(lofiPlayer.currentTime || 0));
      return;
    }
    const fraction = lofiPlayer.currentTime / dur;
    progressSlider.value = String(Math.round(fraction * 1000));
    currentTimeLabel.textContent = formatTime(Math.floor(lofiPlayer.currentTime));
  });

  lofiPlayer.addEventListener("ended", switchTrack);
  lofiPlayer.addEventListener("pause", () => {
    playPauseBtn.textContent = "Play";
  });
  lofiPlayer.addEventListener("play", () => {
    playPauseBtn.textContent = "Pause";
  });

}

function applyHoverHints() {
  const elements = document.querySelectorAll(
    [
      "button",
      "input[type='range']",
      "input[type='number']",
      "input[type='checkbox']",
      ".note-tab",
      ".playlist-item"
    ].join(",")
  );

  elements.forEach((element) => {
    if (!(element instanceof HTMLElement)) {
      return;
    }
    if (element.title && element.title.trim()) {
      return;
    }

    const explicitLabel = element.getAttribute("aria-label") || "";
    const textLabel = typeof element.textContent === "string" ? element.textContent.trim() : "";
    const label = (explicitLabel || textLabel).replace(/\s+/g, " ").trim();
    if (label) {
      element.title = label.length > 52 ? `${label.slice(0, 49)}...` : label;
    }
  });
}

function init() {
  loadUiSettings();
  loadStatsRange();
  loadTimerSettings();
  loadCloseBehavior();
  renderCloseModeToggle();
  updateConfigInputs();
  setTimerInputsLocked(false);
  applyBackground();
  renderTimer();
  renderStats();
  loadNotes();
  updateTrack();
  updateVolume();
  // ensure initial brightness is applied (may have been loaded)
  const bs = Number(brightnessSlider ? brightnessSlider.value : 100) / 100;
  if (Number.isFinite(bs)) document.documentElement.style.setProperty("--scene-brightness", String(bs));
  toggleStatsDrawer(false);
  bindWindowControls();
  bindAppCommands();
  bindEvents();
  bindKeyboardShortcuts();
  applyHoverHints();
  initClockWeather();
  sendTrayStatus();
}

init();
