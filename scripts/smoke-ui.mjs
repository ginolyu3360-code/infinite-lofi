import { spawn } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const enforceReferencePerformance = !process.env.CI;
const connectArgumentIndex = process.argv.indexOf("--connect");
const connectOnly = connectArgumentIndex >= 0;
const requestedPort = connectOnly ? Number(process.argv[connectArgumentIndex + 1]) : NaN;
const packagedExecutable = connectOnly ? "" : (process.argv[2] || "");
const debugPort = Number.isInteger(requestedPort) ? requestedPort : 10_000 + (process.pid % 20_000);
const developmentExecutable = process.platform === "win32"
  ? require("electron")
  : path.join(projectDirectory, "node_modules", ".bin", "electron");
const executable = packagedExecutable || developmentExecutable;
const smokeUserDataDirectory = connectOnly
  ? ""
  : mkdtempSync(path.join(tmpdir(), "infinite-lofi-smoke-profile-"));
const smokeMediaDirectoryCandidate = connectOnly ? "" : path.join(smokeUserDataDirectory, "local-media");
if (!connectOnly) {
  mkdirSync(smokeMediaDirectoryCandidate, { recursive: true });
}
const smokeMediaDirectory = connectOnly ? "" : realpathSync(smokeMediaDirectoryCandidate);
if (!connectOnly) {
  copyFileSync(
    path.join(projectDirectory, "test", "fixtures", "local-video.webm"),
    path.join(smokeMediaDirectory, "local-video.webm")
  );
  writeFileSync(
    path.join(smokeUserDataDirectory, "music-folder-grants.json"),
    JSON.stringify([smokeMediaDirectory], null, 2),
    { encoding: "utf8", mode: 0o600 }
  );
}
const launchArguments = packagedExecutable
  ? ["--enable-logging=stderr", "--allow-devtools-for-testing", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${smokeUserDataDirectory}`]
  : [`--remote-debugging-port=${debugPort}`, `--user-data-dir=${smokeUserDataDirectory}`, "."];
const appProcess = connectOnly ? null : spawn(executable, launchArguments, {
  cwd: projectDirectory,
  env: { ...process.env, INFINITE_LOFI_SMOKE_PROFILE: smokeUserDataDirectory },
  stdio: ["ignore", "pipe", "pipe"]
});

let appLog = "";
let socket;
let profileRemoved = false;
appProcess?.stdout.on("data", (chunk) => { appLog += chunk.toString(); });
appProcess?.stderr.on("data", (chunk) => { appLog += chunk.toString(); });

async function stopApp() {
  if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
  if (!appProcess || appProcess.exitCode !== null) return;

  const exitPromise = new Promise((resolve) => appProcess.once("exit", resolve));
  appProcess.kill("SIGINT");
  await Promise.race([
    exitPromise,
    new Promise((resolve) => setTimeout(resolve, 5_000))
  ]);
}

function removeSmokeProfile() {
  if (profileRemoved || !smokeUserDataDirectory) return;
  rmSync(smokeUserDataDirectory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  profileRemoved = true;
}

process.on("exit", () => {
  void stopApp();
  removeSmokeProfile();
});
process.on("SIGINT", async () => {
  await stopApp();
  removeSmokeProfile();
  process.exit(130);
});

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForTarget() {
  let lastError;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        const target = targets.find((item) => item.type === "page" && item.title === "Infinite Lo-Fi");
        if (target) return target;
      }
    } catch (error) {
      lastError = error;
    }

    if (appProcess && appProcess.exitCode !== null) {
      throw new Error(`Electron exited early with code ${appProcess.exitCode}: ${appLog}`);
    }
    await delay(250);
  }
  const details = appLog.trim() ? `\nElectron output:\n${appLog.trim()}` : "";
  throw new Error(`Timed out waiting for Electron debug target: ${lastError?.message || "unknown error"}${details}`);
}

function parseTimer(value) {
  const [minutes, seconds] = String(value).split(":").map(Number);
  return minutes * 60 + seconds;
}

try {
  const target = await waitForTarget();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  const exceptions = [];
  const dialogs = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") {
      exceptions.push(message.params.exceptionDetails.text);
    }
    if (message.method === "Page.javascriptDialogOpening") {
      dialogs.push(message.params.message);
      send("Page.handleJavaScriptDialog", { accept: true }).catch(() => {});
    }
    if (!message.id || !pending.has(message.id)) return;

    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });

  function send(method, params = {}) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evaluate(expression) {
    const result = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    }
    return result.result.value;
  }

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.enable");
  async function setWindowSize(width, height) {
    await evaluate(`(() => {
      const frameWidth = Math.max(0, window.outerWidth - window.innerWidth);
      const frameHeight = Math.max(0, window.outerHeight - window.innerHeight);
      window.moveTo(0, 0);
      window.resizeTo(${width} + frameWidth, ${height} + frameHeight);
      return true;
    })()`);
    await delay(350);
  }

  async function readLayoutState() {
    return evaluate(`(() => {
      const timerContent = document.querySelector('#timerContent');
      const timerCard = document.querySelector('#timerCard');
      const player = document.querySelector('#playerPanel');
      const timerButton = document.querySelector('#timerToggle');
      const headerActions = document.querySelector('.header-actions');
      const cardRect = timerCard.getBoundingClientRect();
      const playerRect = player.getBoundingClientRect();
      const headerActionsRect = headerActions.getBoundingClientRect();
      const timerContentRect = timerContent.getBoundingClientRect();
      const viewportTolerance = 4;
      const timerChildOverflow = [...timerContent.children]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return getComputedStyle(element).display !== 'none' && rect.width > 0 && rect.height > 0;
        })
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.left < timerContentRect.left - viewportTolerance ||
            rect.right > timerContentRect.right + viewportTolerance ||
            rect.top < timerContentRect.top - viewportTolerance ||
            rect.bottom > timerContentRect.bottom + viewportTolerance;
        })
        .map((element) => element.id || element.className || element.tagName);
      return {
        width: innerWidth,
        height: innerHeight,
        timerOverflow: timerContent.scrollHeight - timerContent.clientHeight,
        timerChildOverflow,
        cardInsideViewport: cardRect.left >= -viewportTolerance && cardRect.right <= innerWidth + viewportTolerance && cardRect.top >= -viewportTolerance,
        playerInsideViewport: playerRect.left >= -viewportTolerance && playerRect.right <= innerWidth + viewportTolerance && playerRect.bottom <= innerHeight + viewportTolerance,
        headerActionsInsideViewport: headerActionsRect.left >= -viewportTolerance && headerActionsRect.right <= innerWidth + viewportTolerance,
        timerButtonHeight: timerButton.getBoundingClientRect().height
      };
    })()`);
  }

  async function waitForLayoutState() {
    let state;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      state = await readLayoutState();
      if (
        state.timerChildOverflow.length === 0 &&
        state.cardInsideViewport &&
        state.playerInsideViewport &&
        state.headerActionsInsideViewport &&
        state.timerButtonHeight >= 42
      ) return state;
      await delay(150);
    }
    return state;
  }
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await evaluate("document.readyState") === "complete") break;
    if (attempt === 39) throw new Error("Timed out waiting for the renderer document to finish loading");
    await delay(100);
  }
  await evaluate(`(() => {
    const key = 'infiniteLofiState';
    const raw = localStorage.getItem(key);
    if (!raw) return true;
    try {
      const state = JSON.parse(raw);
      const files = Array.isArray(state?.notes?.files) ? state.notes.files : [];
      const cleaned = files.filter((note) => note?.content !== '__INFINITE_LOFI_SMOKE_TEST__');
      if (cleaned.length !== files.length) {
        state.notes.files = cleaned;
        state.notes.activeId = cleaned.some((note) => note.id === state.notes.activeId)
          ? state.notes.activeId
          : cleaned[0]?.id || '';
        localStorage.setItem(key, JSON.stringify(state));
        window.__infiniteLofiSkipBeforeUnloadPersistence = true;
        location.reload();
      }
    } catch {}
    return true;
  })()`);
  await delay(500);
  const initialStorageEntries = await evaluate("Object.entries(localStorage)");

  const baseline = await evaluate(`(async () => {
    await document.fonts.ready;
    return {
      readyState: document.readyState,
      title: document.title,
      timer: document.querySelector('#timerDisplay')?.textContent.trim(),
      timerButton: document.querySelector('#timerToggle')?.textContent.trim(),
      noteTabs: document.querySelectorAll('#noteTabs > *').length,
      track: document.querySelector('#trackLabel')?.textContent.trim(),
      weatherMode: document.querySelector('#weatherModeSelect')?.value,
      localFontsReady:
        document.fonts.check('400 12px "Space Grotesk"') &&
        document.fonts.check('400 12px "IBM Plex Mono"'),
      remoteStylesheetCount: [...document.querySelectorAll('link[rel="stylesheet"]')]
        .filter((link) => /^https?:/i.test(link.href)).length,
      requiredElementsPresent: [
        'timerDisplay', 'timerToggle', 'notesInput', 'playPauseBtn',
        'statsDrawer', 'backgroundDrawer', 'lofiPlayer', 'restoreBackupBtn',
        'storageRecoveryNotice', 'weatherModeSelect', 'weatherCityInput',
        'weatherApplyBtn', 'weatherPrivacyHint', 'bgCoverBtn',
        'bgBlackBtn', 'bgMidnightBtn', 'bgMossBtn', 'bgWhiteBtn', 'bgPresetLabel',
        'miniModeToggleBtn', 'notesToggleBtn', 'notesCloseBtn', 'shortcutHelpBtn',
        'focusPlanToggleBtn', 'focusPlanDrawer', 'focusPlanApplyBtn',
        'shortBreakMinutesInput', 'longBreakMinutesInput', 'focusSessionsInput',
        'autoStartBreaksInput', 'autoStartFocusInput', 'dailyGoalMinutesInput',
        'timerPlanStatus', 'todayGoalProgress', 'todayGoalBar',
        'tasksToggleBtn', 'timerIntentSummary', 'timerIntentValue',
        'tasksDrawer', 'tasksCloseBtn', 'taskAddForm', 'taskTitleInput',
        'openTasksList', 'completedTasksToggle', 'completedTasksList',
        'statsActiveDaysValue', 'statsStreakValue', 'statsComparisonValue',
        'focusReviewRange', 'focusReviewSummary', 'focusReviewList',
        'focusReviewPagination', 'focusReviewLimits',
        'sessionHistoryDateInput', 'sessionHistoryMinutesInput',
        'sessionHistoryAddBtn', 'sessionHistoryList', 'sessionHistoryCount',
        'playlistStatus', 'rescanMusicFolderBtn', 'removeMissingTracksBtn',
        'useDefaultTracksBtn', 'showAllQueueBtn',
        'shuffleModeBtn', 'repeatModeBtn', 'a11yStatus', 'displayLanguageSelect',
        'lyricsToggleBtn', 'lyricsPanel', 'lyricsViewport', 'lyricsLines',
        'ambiencePlayer', 'ambienceSoundSelect', 'ambienceToggleBtn',
        'ambienceVolumeSlider', 'ambienceStatus', 'audioTransitionsEnabled',
        'audioTransitionDuration'
      ].every((id) => Boolean(document.getElementById(id))),
      dragRegion: (() => {
        const status = document.querySelector('#statusWidget');
        const bounds = status.getBoundingClientRect();
        return {
          appRegion: getComputedStyle(status).webkitAppRegion,
          width: bounds.width,
          height: bounds.height
        };
      })()
    };
  })()`);

  const windowFocusResult = await evaluate(`(() => {
    remainingSeconds = 120;
    timerDeadlineMs = Date.now() + remainingSeconds * 1000;
    timerId = setInterval(() => {}, 60_000);
    const before = { phase: timerPhase, remainingSeconds, isRunning: timerId !== null };
    window.dispatchEvent(new FocusEvent('focus'));
    const after = { phase: timerPhase, remainingSeconds, isRunning: timerId !== null };
    clearInterval(timerId);
    timerId = null;
    timerDeadlineMs = null;
    remainingSeconds = getPhaseDuration(timerPhase, timerSettings);
    renderTimer();
    return { before, after };
  })()`);

  const shortcutHelpResult = await evaluate(`(async () => {
    const trigger = document.querySelector('#shortcutHelpBtn');
    trigger.focus();
    trigger.click();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const openedFromButton = !document.querySelector('#shortcutHelpOverlay').classList.contains('hidden');
    const focusedOnOpen = document.activeElement?.id;
    const overlay = document.querySelector('#shortcutHelpOverlay');
    const focusable = [...overlay.querySelectorAll('button:not([disabled]), input:not([disabled])')];
    focusable.at(-1)?.focus();
    const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    overlay.dispatchEvent(tabEvent);
    const tabWrappedToFirst = document.activeElement === focusable[0] && tabEvent.defaultPrevented;
    document.querySelector('#shortcutHelpCloseBtn').click();
    return {
      openedFromButton,
      focusedOnOpen,
      tabWrappedToFirst,
      closedFromButton: overlay.classList.contains('hidden'),
      hiddenFromAccessibilityTree: overlay.getAttribute('aria-hidden') === 'true' && overlay.inert,
      focusRestored: document.activeElement === trigger
    };
  })()`);

  const languageSwitchResult = await evaluate(`(() => {
    const expected = {
      'zh-CN': '显示语言',
      'zh-TW': '顯示語言',
      en: 'Display language',
      ja: '表示言語',
      fr: 'Langue d’affichage',
      ko: '표시 언어',
      es: 'Idioma de la interfaz'
    };
    document.querySelector('#shortcutHelpBtn').click();
    const select = document.querySelector('#displayLanguageSelect');
    select.focus();
    const results = [];
    for (const [code, label] of Object.entries(expected)) {
      select.value = code;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      const state = JSON.parse(localStorage.getItem('infiniteLofiState'));
      results.push({
        code,
        htmlLanguage: document.documentElement.lang,
        savedLanguage: state.settings.ui.language,
        languageLabel: document.querySelector('[data-i18n="keys.language"]').textContent.trim(),
        expectedLabel: label,
        optionCount: select.options.length,
        selectorFocused: document.activeElement === select,
        panelOpen: !document.querySelector('#shortcutHelpOverlay').classList.contains('hidden')
      });
    }
    window.__infiniteLofiSkipBeforeUnloadPersistence = true;
    location.reload();
    return results;
  })()`);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const rendererReady = await evaluate(`(
        document.readyState === 'complete' &&
        Boolean(window.InfiniteLofiAccessibility) &&
        Boolean(window.InfiniteLofiBindings) &&
        Boolean(document.querySelector('#displayLanguageSelect'))
      )`);
      if (rendererReady) break;
    } catch {}
    if (attempt === 59) throw new Error("Timed out waiting for the renderer to finish reloading");
    await delay(100);
  }
  const languagePersistenceResult = await evaluate(`(() => {
    const select = document.querySelector('#displayLanguageSelect');
    const before = {
      selected: select.value,
      htmlLanguage: document.documentElement.lang,
      headerTasks: document.querySelector('#tasksToggleBtn').textContent.trim(),
      saved: JSON.parse(localStorage.getItem('infiniteLofiState')).settings.ui.language
    };
    select.value = 'en';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return {
      before,
      restored: select.value,
      restoredLabel: document.querySelector('[data-i18n="keys.language"]').textContent.trim()
    };
  })()`);

  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }]
  });
  const reducedMotionResult = await evaluate(`(() => {
    const background = getComputedStyle(document.querySelector('#bgImage'));
    const drawer = getComputedStyle(document.querySelector('#statsDrawer'));
    return {
      matches: matchMedia('(prefers-reduced-motion: reduce)').matches,
      backgroundTransitionMs: Math.max(...background.transitionDuration.split(',').map((value) => Number.parseFloat(value) * (value.includes('ms') ? 1 : 1000))),
      drawerTransitionMs: Math.max(...drawer.transitionDuration.split(',').map((value) => Number.parseFloat(value) * (value.includes('ms') ? 1 : 1000)))
    };
  })()`);
  await send("Emulation.setEmulatedMedia", { features: [] });

  const contrastResult = await evaluate(`(() => {
    const a11y = window.InfiniteLofiAccessibility;
    const composite = (foreground, background) => a11y.compositeColor(foreground, background);
    const pairs = {
      darkText: ['#f4f0e8', '#11110f'],
      darkMuted: [composite('rgba(244, 240, 232, 0.62)', '#11110f'), '#11110f'],
      lightText: ['#272520', '#f3efe7'],
      lightMuted: [composite('rgba(39, 37, 32, 0.68)', '#f3efe7'), '#f3efe7'],
      lightPrimary: ['#fffaf1', '#9f6325'],
      midnightText: ['#edf6fb', '#07111d'],
      midnightMuted: [composite('rgba(237, 246, 251, 0.66)', '#07111d'), '#07111d'],
      mossText: ['#f0f6ed', '#0b1510'],
      mossMuted: [composite('rgba(240, 246, 237, 0.66)', '#0b1510'), '#0b1510']
    };
    return Object.fromEntries(Object.entries(pairs).map(([name, pair]) => [name, a11y.contrastRatio(pair[0], pair[1])]));
  })()`);

  await evaluate(`(() => {
    const trigger = document.querySelector('#focusPlanToggleBtn');
    trigger.focus();
    trigger.click();
    return true;
  })()`);
  await delay(50);
  await send("Accessibility.enable");
  const accessibilityTree = await send("Accessibility.getFullAXTree");
  const accessibilityTreeResult = {
    namedFocusPlanDialog: accessibilityTree.nodes.some((node) =>
      node.role?.value === "dialog" && node.name?.value === "Focus Plan"
    ),
    liveStatusPresent: accessibilityTree.nodes.some((node) => node.role?.value === "status")
  };
  await evaluate("document.querySelector('#focusPlanCloseBtn').click(); true");
  await evaluate("document.querySelector('#tasksToggleBtn').click(); true");
  const tasksAccessibilityTree = await send("Accessibility.getFullAXTree");
  accessibilityTreeResult.namedTasksDialog = tasksAccessibilityTree.nodes.some((node) =>
    node.role?.value === "dialog" && node.name?.value === "Tasks"
  );
  await evaluate("document.querySelector('#tasksCloseBtn').click(); true");
  await evaluate("document.querySelector('#statsToggleBtn').click(); true");
  const statsAccessibilityTree = await send("Accessibility.getFullAXTree");
  accessibilityTreeResult.namedStatsDialog = statsAccessibilityTree.nodes.some((node) =>
    node.role?.value === "dialog" && node.name?.value === "Focus Review (Last 7 Days)"
  );
  await evaluate("document.querySelector('#statsCloseBtn').click(); true");

  const responsiveLayouts = [];
  for (const [width, height] of [[720, 520], [800, 600], [899, 700], [901, 700], [1024, 677], [1440, 900], [1100, 760]]) {
    await setWindowSize(width, height);
    responsiveLayouts.push(await waitForLayoutState());
  }

  await setWindowSize(899, 700);
  const notesBelowBreakpoint = await evaluate(`(() => ({
    width: innerWidth,
    toggleVisible: getComputedStyle(document.querySelector('#notesToggleBtn')).display !== 'none',
    panelPosition: getComputedStyle(document.querySelector('#notesPanel')).position
  }))()`);
  await setWindowSize(901, 700);
  const notesAboveBreakpoint = await evaluate(`(() => ({
    width: innerWidth,
    toggleVisible: getComputedStyle(document.querySelector('#notesToggleBtn')).display !== 'none',
    panelPosition: getComputedStyle(document.querySelector('#notesPanel')).position
  }))()`);

  await setWindowSize(720, 520);
  const queueOpenResult = await evaluate(`(async () => {
    const queueTrigger = document.querySelector('#playlistToggleBtn');
    queueTrigger.focus();
    queueTrigger.click();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const queueFocused = document.activeElement?.classList.contains('playlist-item');
    const queueStyle = getComputedStyle(document.querySelector('#playlistItems'));
    const queueUsesVerticalScroll = queueStyle.overflowY === 'auto' && queueStyle.maxHeight !== 'none';
    const timerIsSimplified =
      getComputedStyle(document.querySelector('#timerDisplay')).display !== 'none' &&
      getComputedStyle(document.querySelector('#timerActions')).display !== 'none' &&
      getComputedStyle(document.querySelector('#timerPhaseLabel')).display === 'none' &&
      getComputedStyle(document.querySelector('#timerIntentSummary')).display === 'none' &&
      getComputedStyle(document.querySelector('#timerConfigPanel')).display === 'none';
    return { queueFocused, queueUsesVerticalScroll, timerIsSimplified };
  })()`);
  await delay(350);
  await setWindowSize(720, 520);
  const queueResizeConstraintResult = await evaluate(`(() => {
    const panelBounds = document.querySelector('#playlistPanel').getBoundingClientRect();
    const tolerance = 4;
    return {
      width: innerWidth,
      height: innerHeight,
      expectedMinimumWidth: Math.min(900, screen.availWidth - Math.max(0, outerWidth - innerWidth)),
      expectedMinimumHeight: Math.min(780, screen.availHeight - Math.max(0, outerHeight - innerHeight)),
      queueVisible: getComputedStyle(document.querySelector('#playlistPanel')).display !== 'none',
      queueInsideViewport:
        panelBounds.left >= -tolerance && panelBounds.top >= -tolerance &&
        panelBounds.right <= innerWidth + tolerance && panelBounds.bottom <= innerHeight + tolerance
    };
  })()`);
  const expandableRegionResult = await evaluate(`(async () => {
    const queueTrigger = document.querySelector('#playlistToggleBtn');
    const showAll = document.querySelector('#showAllQueueBtn');
    showAll.hidden = false;
    showAll.click();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const expandedBounds = document.querySelector('#playlistPanel').getBoundingClientRect();
    const showAllExpanded = document.querySelector('#playlistPanel').classList.contains('is-expanded');
    const showAllViewportLayer = document.querySelector('#playlistPanel').parentNode === document.body;
    const showAllInside = expandedBounds.left >= -4 && expandedBounds.top >= -4 && expandedBounds.right <= innerWidth + 4 && expandedBounds.bottom <= innerHeight + 4;
    const showAllLarge = expandedBounds.width >= Math.min(640, innerWidth - 40) && expandedBounds.height >= Math.min(360, innerHeight - 80);
    showAll.click();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const showAllRestored = document.querySelector('#playlistPanel').parentNode?.id === 'playerPanel' && !document.querySelector('#playlistPanel').classList.contains('is-expanded');
    document.querySelector('#playlistItems .playlist-item')?.focus();
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    const queueClosed = document.querySelector('#playlistPanel').classList.contains('hidden');
    const queueFocusRestored = document.activeElement === queueTrigger;
    return {
      showAllExpanded,
      showAllViewportLayer,
      showAllInside,
      showAllLarge,
      showAllRestored,
      queueClosed,
      queueFocusRestored
    };
  })()`);
  Object.assign(expandableRegionResult, queueOpenResult);

  await setWindowSize(800, 600);
  const responsiveNotesResult = await evaluate(`(async () => {
    const trigger = document.querySelector('#notesToggleBtn');
    trigger.focus();
    trigger.click();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const panel = document.querySelector('#notesPanel');
    const focusedOnOpen = document.activeElement?.id === 'notesInput';
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    return {
      focusedOnOpen,
      hiddenAfterEscape: panel.getAttribute('aria-hidden') === 'true' && panel.inert,
      focusRestored: document.activeElement === trigger
    };
  })()`);
  await setWindowSize(1100, 760);

  const taskSetupResult = await evaluate(`(async () => {
    const drawer = document.querySelector('#tasksDrawer');
    const trigger = document.querySelector('#tasksToggleBtn');
    trigger.focus();
    trigger.click();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const focusedOnOpen = document.activeElement?.id === 'tasksCloseBtn';
    const input = document.querySelector('#taskTitleInput');
    const form = document.querySelector('#taskAddForm');
    const beforeComposition = document.querySelectorAll('#openTasksList .task-row').length;
    input.value = '输入中的任务';
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '输入' }));
    form.requestSubmit();
    const compositionDidNotSubmit = document.querySelectorAll('#openTasksList .task-row').length === beforeComposition;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true, cancelable: true }));
    const typingQuestionMarkStayedLocal = document.querySelector('#shortcutHelpOverlay').classList.contains('hidden');
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '输入' }));
    for (const title of ['Alpha intention', 'Beta intention']) {
      input.value = title;
      form.requestSubmit();
    }
    const rows = [...document.querySelectorAll('#openTasksList .task-row')];
    rows[0].querySelector('[data-task-action="select"]').click();
    document.querySelector('#openTasksList [data-task-action="select"][aria-pressed="true"]').click();
    const unselectWorked = JSON.parse(localStorage.getItem('infiniteLofiState')).tasks.selectedTaskId === null;
    document.querySelector('#openTasksList [data-task-action="select"]').click();
    const focusable = [...drawer.querySelectorAll('button:not([disabled]), input:not([disabled])')]
      .filter((element) => element.getClientRects().length > 0);
    focusable.at(-1)?.focus();
    const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    drawer.dispatchEvent(tabEvent);
    const tabWrappedToFirst = document.activeElement?.id === 'tasksCloseBtn' && tabEvent.defaultPrevented;
    document.querySelector('#tasksCloseBtn').click();
    const headerFocusRestored = document.activeElement === trigger;
    const intentTrigger = document.querySelector('#timerIntentSummary');
    intentTrigger.focus();
    intentTrigger.click();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    const intentFocusRestored = document.activeElement === intentTrigger && !drawer.classList.contains('is-open');
    const state = JSON.parse(localStorage.getItem('infiniteLofiState'));
    return {
      focusedOnOpen,
      compositionDidNotSubmit,
      typingQuestionMarkStayedLocal,
      unselectWorked,
      tabWrappedToFirst,
      headerFocusRestored,
      intentFocusRestored,
      itemCount: state.tasks.items.length,
      selectedTitle: state.tasks.items.find((task) => task.id === state.tasks.selectedTaskId)?.title,
      schemaVersion: state.schemaVersion
    };
  })()`);

  await evaluate("document.querySelector('#timerToggle').click(); true");
  await delay(250);
  const taskPauseResumeResult = await evaluate(`(() => {
    const before = JSON.parse(localStorage.getItem('infiniteLofiState')).timerRuntime.focusSession;
    document.querySelector('#timerToggle').click();
    const paused = JSON.parse(localStorage.getItem('infiniteLofiState')).timerRuntime;
    document.querySelector('#timerToggle').click();
    const resumed = JSON.parse(localStorage.getItem('infiniteLofiState')).timerRuntime;
    return {
      before,
      pausedRunning: paused.isRunning,
      resumedRunning: resumed.isRunning,
      stableWhilePaused: paused.focusSession?.id === before?.id && paused.focusSession?.taskTitle === before?.taskTitle,
      stableWhenResumed: resumed.focusSession?.id === before?.id && resumed.focusSession?.taskTitle === before?.taskTitle
    };
  })()`);

  const taskMutationResult = await evaluate(`(async () => {
    document.querySelector('#tasksToggleBtn').click();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const rows = [...document.querySelectorAll('#openTasksList .task-row')];
    const alphaRow = rows.find((row) => row.textContent.includes('Alpha intention'));
    const betaRow = rows.find((row) => row.textContent.includes('Beta intention'));
    betaRow.querySelector('[data-task-action="select"]').click();
    alphaRow.querySelector('[data-task-action="rename"]').click();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    let renameInput = document.querySelector('[data-task-rename-input]');
    renameInput.value = 'Alpha renamed';
    renameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }));
    const imeEnterDidNotCommit = Boolean(document.querySelector('[data-task-rename-input]'));
    renameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    const escapeCanceledBeforeDrawer = document.querySelector('#tasksDrawer').classList.contains('is-open') && !document.querySelector('[data-task-rename-input]');
    document.querySelector('#openTasksList .task-row [data-task-action="rename"]').click();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    renameInput = document.querySelector('[data-task-rename-input]');
    renameInput.value = 'Alpha renamed';
    renameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    const betaAfterRename = [...document.querySelectorAll('#openTasksList .task-row')]
      .find((row) => row.textContent.includes('Beta intention'));
    betaAfterRename.querySelector('[data-task-action="complete"]').click();
    document.querySelector('#completedTasksToggle').click();
    document.querySelector('#completedTasksList [data-task-action="reopen"]').click();
    const betaReopened = [...document.querySelectorAll('#openTasksList .task-row')]
      .find((row) => row.textContent.includes('Beta intention'));
    betaReopened.querySelector('[data-task-action="select"]').click();
    const alphaAfterRename = [...document.querySelectorAll('#openTasksList .task-row')]
      .find((row) => row.textContent.includes('Alpha renamed'));
    alphaAfterRename.querySelector('[data-task-action="delete"]').click();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const state = JSON.parse(localStorage.getItem('infiniteLofiState'));
    const beta = state.tasks.items.find((task) => task.title === 'Beta intention');
    const result = {
      imeEnterDidNotCommit,
      escapeCanceledBeforeDrawer,
      alphaDeleted: !state.tasks.items.some((task) => task.title.startsWith('Alpha')),
      betaReopened: beta?.status === 'open',
      nextIsBeta: state.tasks.selectedTaskId === beta?.id,
      frozenTitle: state.timerRuntime.focusSession?.taskTitle,
      timerStillRunning: state.timerRuntime.isRunning,
      removalFocusPredictable: document.activeElement?.id === 'taskTitleInput' || Boolean(document.activeElement?.dataset?.taskAction),
      removalFocusId: document.activeElement?.id || '',
      removalFocusAction: document.activeElement?.dataset?.taskAction || '',
      currentCopy: document.querySelector('#tasksCurrentValue').textContent.trim(),
      nextCopy: document.querySelector('#tasksNextValue').textContent.trim()
    };
    document.querySelector('#tasksCloseBtn').click();
    return result;
  })()`);

  await evaluate("remainingSeconds = 1; timerDeadlineMs = Date.now() + 850; saveTimerRuntime(); true");
  await delay(1_400);
  const liveFocusCompletionResult = await evaluate(`(() => {
    const state = JSON.parse(localStorage.getItem('infiniteLofiState'));
    return {
      phase: state.timerRuntime.phase,
      isRunning: state.timerRuntime.isRunning,
      focusSession: state.timerRuntime.focusSession,
      matchingSnapshots: state.stats.focusSessions.filter((session) => session.taskTitle === 'Alpha intention'),
      selectedTitle: state.tasks.items.find((task) => task.id === state.tasks.selectedTaskId)?.title || ''
    };
  })()`);
  await evaluate("remainingSeconds = 1; timerDeadlineMs = Date.now() + 850; saveTimerRuntime(); true");
  await delay(1_400);
  const autoStartedFocusResult = await evaluate(`(() => {
    const state = JSON.parse(localStorage.getItem('infiniteLofiState'));
    return {
      phase: state.timerRuntime.phase,
      isRunning: state.timerRuntime.isRunning,
      taskTitle: state.timerRuntime.focusSession?.taskTitle,
      sessionId: state.timerRuntime.focusSession?.id
    };
  })()`);
  const completionDoesNotStopResult = await evaluate(`(async () => {
    document.querySelector('#tasksToggleBtn').click();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const betaRow = [...document.querySelectorAll('#openTasksList .task-row')]
      .find((row) => row.textContent.includes('Beta intention'));
    betaRow.querySelector('[data-task-action="complete"]').click();
    const state = JSON.parse(localStorage.getItem('infiniteLofiState'));
    const result = {
      timerRunning: state.timerRuntime.isRunning,
      currentTitle: state.timerRuntime.focusSession?.taskTitle,
      nextSelection: state.tasks.selectedTaskId,
      taskStatus: state.tasks.items.find((task) => task.title === 'Beta intention')?.status
    };
    document.querySelector('#completedTasksToggle').click();
    document.querySelector('#completedTasksList [data-task-action="reopen"]').click();
    const reopenedBeta = [...document.querySelectorAll('#openTasksList .task-row')]
      .find((row) => row.textContent.includes('Beta intention'));
    reopenedBeta.querySelector('[data-task-action="select"]').click();
    document.querySelector('#tasksCloseBtn').click();
    document.querySelector('#timerToggle').click();
    document.querySelector('#timerReset').click();
    const resetState = JSON.parse(localStorage.getItem('infiniteLofiState'));
    result.resetContext = resetState.timerRuntime.focusSession;
    result.resetSelection = resetState.tasks.selectedTaskId;
    result.resetSelectedTitle = resetState.tasks.items.find((task) => task.id === resetState.tasks.selectedTaskId)?.title || '';
    return result;
  })()`);

  await evaluate("document.querySelector('#miniModeToggleBtn').click(); true");
  await delay(800);
  const miniMode420 = await evaluate(`(() => {
    const timerContent = document.querySelector('#timerContent');
    const timerContentRect = timerContent.getBoundingClientRect();
    const tolerance = 4;
    const timerChildOverflow = [...timerContent.children]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return getComputedStyle(element).display !== 'none' && rect.width > 0 && rect.height > 0;
      })
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left < timerContentRect.left - tolerance || rect.right > timerContentRect.right + tolerance ||
          rect.top < timerContentRect.top - tolerance || rect.bottom > timerContentRect.bottom + tolerance;
      })
      .map((element) => element.id || element.className || element.tagName);
    return {
      enabled: document.body.classList.contains('is-mini-mode'),
      width: innerWidth,
      height: innerHeight,
      timerOverflow: timerContent.scrollHeight - timerContent.clientHeight,
      timerChildOverflow,
      fullLabel: document.querySelector('#miniModeToggleBtn').textContent.trim(),
      notesHidden: getComputedStyle(document.querySelector('#notesPanel')).display === 'none',
      editorHidden: getComputedStyle(document.querySelector('#tasksDrawer')).display === 'none'
    };
  })()`);
  await evaluate(`(() => {
    window.__miniTimerText = document.querySelector('#timerDisplay').textContent;
    const intention = document.querySelector('#timerIntentValue');
    window.__miniIntentText = intention.textContent;
    window.__miniIntentTitle = intention.title;
    window.__miniIntentLabel = intention.getAttribute('aria-label');
    document.querySelector('#timerDisplay').textContent = '360:00';
    intention.textContent = '界'.repeat(120);
    intention.title = '界'.repeat(120);
    intention.setAttribute('aria-label', 'Current intention: ' + '界'.repeat(120));
    return true;
  })()`);
  await setWindowSize(360, 200);
  const miniMode360 = await evaluate(`(() => {
    const timerContent = document.querySelector('#timerContent');
    const timerContentRect = timerContent.getBoundingClientRect();
    const ids = [
      'timerDisplay', 'timerToggle', 'timerReset', 'playPauseBtn',
      'prevTrackBtn', 'nextTrackBtn', 'progressSlider', 'miniModeToggleBtn',
      'timerIntentSummary'
    ];
    const tolerance = 4;
    const controls = Object.fromEntries(ids.map((id) => {
      const rect = document.getElementById(id).getBoundingClientRect();
      return [id, {
        visible: rect.width > 0 && rect.height > 0,
        inside: rect.left >= -tolerance && rect.right <= innerWidth + tolerance && rect.top >= -tolerance && rect.bottom <= innerHeight + tolerance
      }];
    }));
    const timerChildOverflow = [...timerContent.children]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return getComputedStyle(element).display !== 'none' && rect.width > 0 && rect.height > 0;
      })
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left < timerContentRect.left - tolerance || rect.right > timerContentRect.right + tolerance ||
          rect.top < timerContentRect.top - tolerance || rect.bottom > timerContentRect.bottom + tolerance;
      })
      .map((element) => element.id || element.className || element.tagName);
    const intention = document.querySelector('#timerIntentValue');
    return {
      width: innerWidth,
      height: innerHeight,
      timerOverflow: timerContent.scrollHeight - timerContent.clientHeight,
      timerChildOverflow,
      timer: document.querySelector('#timerDisplay').textContent.trim(),
      titleAvailable: intention.getAttribute('aria-label')?.includes('界') && intention.title.includes('界'),
      editorHidden: getComputedStyle(document.querySelector('#tasksDrawer')).display === 'none',
      controls
    };
  })()`);
  await evaluate(`(() => {
    document.querySelector('#timerDisplay').textContent = window.__miniTimerText;
    const intention = document.querySelector('#timerIntentValue');
    intention.textContent = window.__miniIntentText;
    intention.title = window.__miniIntentTitle;
    intention.setAttribute('aria-label', window.__miniIntentLabel);
    return true;
  })()`);
  await evaluate("document.querySelector('#miniModeToggleBtn').click(); true");
  await delay(800);
  const restoredFullMode = await evaluate(`(() => ({
    enabled: document.body.classList.contains('is-mini-mode'),
    width: innerWidth,
    height: innerHeight,
    miniLabel: document.querySelector('#miniModeToggleBtn').textContent.trim()
  }))()`);

  await evaluate("document.querySelector('#timerToggle').click(); true");
  await delay(1_300);
  const runningTimer = await evaluate(`(() => ({
    timer: document.querySelector('#timerDisplay').textContent.trim(),
    button: document.querySelector('#timerToggle').textContent.trim(),
    announcement: document.querySelector('#a11yStatus').textContent.trim()
  }))()`);
  const lockedPlan = await evaluate(`(async () => {
    const trigger = document.querySelector('#focusPlanToggleBtn');
    trigger.focus();
    trigger.click();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const drawer = document.querySelector('#focusPlanDrawer');
    const result = {
      opened: drawer.classList.contains('is-open'),
      inputDisabled: document.querySelector('#focusMinutesInput').disabled,
      hint: document.querySelector('#focusPlanLockHint').textContent.trim(),
      focusedOnOpen: document.activeElement?.id,
      exposedToAccessibilityTree: drawer.getAttribute('aria-hidden') === 'false' && !drawer.inert
    };
    document.querySelector('#focusPlanCloseBtn').click();
    result.focusRestored = document.activeElement === trigger;
    result.hiddenAfterClose = drawer.getAttribute('aria-hidden') === 'true' && drawer.inert;
    return result;
  })()`);
  await evaluate("document.querySelector('#timerToggle').click(); document.querySelector('#timerReset').click(); true");

  const focusPlanResult = await evaluate(`(async () => {
    document.querySelector('#focusPlanToggleBtn').click();
    const drawer = document.querySelector('#focusPlanDrawer');
    let drawerRect;
    let drawerInsideViewport = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      drawerRect = drawer.getBoundingClientRect();
      const tolerance = 4;
      drawerInsideViewport =
        drawer.classList.contains('is-open') &&
        drawerRect.left >= -tolerance &&
        drawerRect.right <= innerWidth + tolerance &&
        drawerRect.top >= -tolerance &&
        drawerRect.bottom <= innerHeight + tolerance;
      if (drawerInsideViewport) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const values = {
      focusMinutesInput: '30',
      shortBreakMinutesInput: '7',
      longBreakMinutesInput: '20',
      focusSessionsInput: '3',
      dailyGoalMinutesInput: '90'
    };
    for (const [id, value] of Object.entries(values)) document.getElementById(id).value = value;
    document.querySelector('#autoStartBreaksInput').checked = false;
    document.querySelector('#autoStartFocusInput').checked = true;
    document.querySelector('#focusPlanApplyBtn').click();
    const state = JSON.parse(localStorage.getItem('infiniteLofiState'));
    return {
      drawerClosed: !document.querySelector('#focusPlanDrawer').classList.contains('is-open'),
      drawerInsideViewport,
      drawerBounds: drawerRect ? {
        left: drawerRect.left,
        right: drawerRect.right,
        top: drawerRect.top,
        bottom: drawerRect.bottom,
        viewportWidth: innerWidth,
        viewportHeight: innerHeight
      } : null,
      timer: document.querySelector('#timerDisplay').textContent.trim(),
      summary: document.querySelector('#timerPlanSummary').textContent.trim(),
      status: document.querySelector('#timerPlanStatus').textContent.trim(),
      schemaVersion: state.schemaVersion,
      timerSettings: state.settings.timer,
      dailyGoalSeconds: state.settings.goals.dailyFocusSeconds,
      selectedTitle: state.tasks.items.find((task) => task.id === state.tasks.selectedTaskId)?.title || '',
      goalProgressMax: document.querySelector('#todayGoalProgress').getAttribute('aria-valuemax'),
      runtime: state.timerRuntime
    };
  })()`);

  const sessionHistoryResult = await evaluate(`(async () => {
    document.querySelector('#statsToggleBtn').click();
    const date = new Date();
    const day = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-');
    document.querySelector('#sessionHistoryDateInput').value = day;
    document.querySelector('#sessionHistoryMinutesInput').value = '35';
    document.querySelector('#sessionHistoryAddBtn').click();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const manualRow = [...document.querySelectorAll('#sessionHistoryList .session-history-row')]
      .find((row) => row.textContent.includes('Manual'));
    const minutesInput = manualRow?.querySelector('input[type="number"]');
    if (minutesInput) minutesInput.value = '40';
    manualRow?.querySelector('.stats-export-btn')?.click();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const state = JSON.parse(localStorage.getItem('infiniteLofiState'));
    const manual = state.stats.focusSessions.find((session) => session.source === 'manual');
    const result = {
      schemaVersion: state.schemaVersion,
      sessionCount: state.stats.focusSessions.length,
      manualMinutes: manual ? Math.round(manual.focusSeconds / 60) : 0,
      derivedTodayMinutes: Math.round((state.stats.focusRows.find((row) => row.day === day)?.focusSeconds || 0) / 60),
      renderedRows: document.querySelectorAll('#sessionHistoryList .session-history-row').length,
      taskSnapshotVisible: [...document.querySelectorAll('#sessionHistoryList .session-history-row')]
        .some((row) => row.textContent.includes('Alpha intention')),
      countLabel: document.querySelector('#sessionHistoryCount').textContent.trim(),
      activeDays: document.querySelector('#statsActiveDaysValue').textContent.trim(),
      comparison: document.querySelector('#statsComparisonValue').textContent.trim(),
      comparisonTitle: document.querySelector('#statsComparisonValue').title,
      heading: document.querySelector('#statsHeadingLabel').textContent.trim(),
      weekLabel: document.querySelector('#statsRangeWeekBtn').textContent.trim(),
      reviewRows: document.querySelectorAll('#focusReviewList .focus-review-row').length,
      reviewSummary: document.querySelector('#focusReviewSummary').textContent.trim(),
      deletedTaskVisible: document.querySelector('#focusReviewList').textContent.includes('Deleted'),
      unassignedVisible: document.querySelector('#focusReviewList').textContent.includes('Unassigned'),
      reconciliationNoteHidden: document.querySelector('#focusReviewRounding').classList.contains('hidden'),
      retentionCopy: document.querySelector('#focusReviewLimits').textContent.trim()
    };
    document.querySelector('#statsCloseBtn').click();
    return result;
  })()`);
  await evaluate("document.querySelector('#statsToggleBtn').click(); true");
  const populatedStatsAccessibilityTree = await send("Accessibility.getFullAXTree");
  accessibilityTreeResult.namedReviewList = populatedStatsAccessibilityTree.nodes.some((node) =>
    node.role?.value === "list" && node.name?.value === "Recorded time by intention"
  );
  accessibilityTreeResult.reviewItems = populatedStatsAccessibilityTree.nodes.filter((node) =>
    node.role?.value === "listitem"
  ).length;
  await evaluate("document.querySelector('#statsCloseBtn').click(); true");

  const statsResponsiveLayouts = [];
  for (const [width, height] of [[720, 520], [800, 600], [899, 700], [901, 700], [1100, 760], [1440, 900]]) {
    await setWindowSize(width, height);
    statsResponsiveLayouts.push(await evaluate(`(async () => {
      document.querySelector('#statsToggleBtn').click();
      await new Promise((resolve) => setTimeout(resolve, 260));
      const drawer = document.querySelector('#statsDrawer');
      const panel = document.querySelector('#statsPanel');
      const close = document.querySelector('#statsCloseBtn');
      const bounds = panel.getBoundingClientRect();
      const result = {
        width: innerWidth,
        height: innerHeight,
        open: drawer.classList.contains('is-open'),
        inside: bounds.left >= -4 && bounds.top >= -4 && bounds.right <= innerWidth + 4 && bounds.bottom <= innerHeight + 4,
        scrollable: panel.scrollHeight >= panel.clientHeight,
        rangeButtonHeight: document.querySelector('#statsRangeWeekBtn').getBoundingClientRect().height,
        reviewVisible: document.querySelector('#focusReviewTitle').getBoundingClientRect().height > 0,
        closeVisible: close.getBoundingClientRect().height > 0
      };
      close.click();
      return result;
    })()`));
  }
  await setWindowSize(1100, 760);

  const notesResult = await evaluate(`(() => {
    const before = document.querySelectorAll('#noteTabs > *').length;
    document.querySelector('#noteNewBtn').click();
    const input = document.querySelector('#notesInput');
    input.value = '__INFINITE_LOFI_SMOKE_TEST__';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return {
      before,
      after: document.querySelectorAll('#noteTabs > *').length,
      accepted: input.value === '__INFINITE_LOFI_SMOKE_TEST__'
    };
  })()`);
  await delay(500);

  const drawersResult = await evaluate(`(async () => {
    const visible = (selector) => getComputedStyle(document.querySelector(selector)).display !== 'none';
    const statsTrigger = document.querySelector('#statsToggleBtn');
    statsTrigger.focus();
    statsTrigger.click();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const statsVisible = visible('#statsDrawer');
    const statsFocused = document.activeElement?.id === 'statsCloseBtn';
    const backdrop = document.querySelector('#drawerBackdrop');
    const backdropVisible = visible('#drawerBackdrop') && backdrop.classList.contains('visible');
    backdrop.click();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const statsClosedByBackdrop = !document.querySelector('#statsDrawer').classList.contains('is-open');
    const statsFocusRestored = document.activeElement === statsTrigger;
    const sceneTrigger = document.querySelector('#bgToggleBtn');
    sceneTrigger.focus();
    sceneTrigger.click();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const backgroundVisible = visible('#backgroundDrawer');
    const backgroundFocused = document.activeElement?.id === 'backgroundCloseBtn';
    document.querySelector('#backgroundCloseBtn').click();
    const backgroundFocusRestored = document.activeElement === sceneTrigger;
    return {
      statsVisible,
      statsFocused,
      backdropVisible,
      statsClosedByBackdrop,
      statsFocusRestored,
      backgroundVisible,
      backgroundFocused,
      backgroundFocusRestored
    };
  })()`);

  const showcaseResult = await evaluate(`(async () => {
    const card = document.querySelector('#timerCard');
    document.querySelector('#showcaseToggleBtn').click();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const style = getComputedStyle(card);
    const result = {
      enabled: document.body.classList.contains('is-showcase-mode'),
      playerHidden: getComputedStyle(document.querySelector('#playerPanel')).display === 'none',
      transparentCard: style.backgroundImage.includes('0.34') && style.backgroundImage.includes('0.2'),
      timerVisible: card.getBoundingClientRect().width > 0 && document.querySelector('#timerDisplay').getBoundingClientRect().height > 0
    };
    card.click();
    result.exited = !document.body.classList.contains('is-showcase-mode');
    return result;
  })()`);

  const curatedScenesResult = await evaluate(`(async () => {
    const readSavedPreset = () => JSON.parse(localStorage.getItem('infiniteLofiState')).settings.ui.background.presetId;

    document.querySelector('#bgMidnightBtn').click();
    let midnight;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      midnight = {
        enabled: document.body.classList.contains('theme-midnight'),
        pressed: document.querySelector('#bgMidnightBtn').getAttribute('aria-pressed'),
        label: document.querySelector('#bgPresetLabel').textContent.trim(),
        saved: readSavedPreset(),
        paletteInk: getComputedStyle(document.body).getPropertyValue('--ink').trim(),
        timerColor: getComputedStyle(document.querySelector('#timerDisplay')).color,
        intentionColor: getComputedStyle(document.querySelector('#timerIntentValue')).color
      };
      if (midnight.enabled && midnight.paletteInk === '#edf6fb' && midnight.timerColor === 'rgb(237, 246, 251)') break;
    }

    document.querySelector('#bgMossBtn').click();
    let moss;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      moss = {
        enabled: document.body.classList.contains('theme-moss'),
        midnightRemoved: !document.body.classList.contains('theme-midnight'),
        pressed: document.querySelector('#bgMossBtn').getAttribute('aria-pressed'),
        saved: readSavedPreset(),
        intentionColor: getComputedStyle(document.querySelector('#timerIntentValue')).color
      };
      if (moss.enabled && moss.intentionColor === 'rgb(240, 246, 237)') break;
    }

    document.querySelector('#bgWhiteBtn').click();
    let paper;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      paper = {
        enabled: document.body.classList.contains('bg-white-background'),
        mossRemoved: !document.body.classList.contains('theme-moss'),
        pressed: document.querySelector('#bgWhiteBtn').getAttribute('aria-pressed'),
        saved: readSavedPreset(),
        timerColor: getComputedStyle(document.querySelector('#timerDisplay')).color,
        intentionColor: getComputedStyle(document.querySelector('#timerIntentValue')).color,
        panelBackground: getComputedStyle(document.querySelector('#timerCard')).backgroundImage
      };
      if (paper.enabled && paper.timerColor === 'rgb(39, 37, 32)' && paper.panelBackground !== 'none') break;
    }

    document.querySelector('#bgBlackBtn').click();
    let studio;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      studio = {
        cleanTheme: !document.body.classList.contains('theme-midnight') && !document.body.classList.contains('theme-moss') && !document.body.classList.contains('bg-white-background'),
        pressed: document.querySelector('#bgBlackBtn').getAttribute('aria-pressed'),
        saved: readSavedPreset(),
        intentionColor: getComputedStyle(document.querySelector('#timerIntentValue')).color
      };
      if (studio.cleanTheme && studio.intentionColor === 'rgb(244, 240, 232)') break;
    }
    return { midnight, moss, paper, studio };
  })()`);

  const playerResult = await evaluate(`(async () => {
    const player = document.querySelector('#lofiPlayer');
    document.querySelector('#playPauseBtn').click();
    await new Promise((resolve) => setTimeout(resolve, 250));
    document.querySelector('#repeatModeBtn').click();
    const repeatState = JSON.parse(localStorage.getItem('infiniteLofiState')).player.playbackMode;
    const repeatLoop = player.loop;
    document.querySelector('#shuffleModeBtn').click();
    const shuffleState = JSON.parse(localStorage.getItem('infiniteLofiState')).player.playbackMode;
    const shufflePressed = document.querySelector('#shuffleModeBtn').getAttribute('aria-pressed');
    const repeatPressed = document.querySelector('#repeatModeBtn').getAttribute('aria-pressed');
    const state = JSON.parse(localStorage.getItem('infiniteLofiState'));
    const nativeMediaAvailable = await window.desktopApp?.getNativeMediaSessionAvailability?.();
    const result = {
      source: player.currentSrc || player.src,
      pausedAfterClick: player.paused,
      queueLength: state.player.queue.length,
      activeTrackKey: state.player.activeTrackKey,
      repeatState,
      repeatLoop,
      shuffleState,
      shufflePressed,
      repeatPressed,
      nativeMediaAvailable: nativeMediaAvailable === true,
      mediaSessionSupported: Boolean(navigator.mediaSession),
      mediaSessionTitle: navigator.mediaSession?.metadata?.title || '',
      mediaPlaybackState: navigator.mediaSession?.playbackState || 'none'
    };
    document.querySelector('#playPauseBtn').click();
    return result;
  })()`);

  const playbackSourceResult = await evaluate(`(async () => {
    const player = document.querySelector('#lofiPlayer');
    const localButton = document.querySelector('#localPlaybackSourceBtn');
    const externalButton = document.querySelector('#externalPlaybackSourceBtn');
    externalButton.click();
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const state = JSON.parse(localStorage.getItem('infiniteLofiState'));
      if (state.player.sourceMode === 'external' && !externalButton.disabled) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const externalState = JSON.parse(localStorage.getItem('infiniteLofiState'));
    const external = {
      saved: externalState.player.sourceMode,
      playerPaused: player.paused,
      panelMode: document.querySelector('#playerPanel').dataset.playbackSource,
      externalPressed: externalButton.getAttribute('aria-pressed'),
      localPressed: localButton.getAttribute('aria-pressed'),
      localControlsDisabled: [
        '#playPauseBtn', '#prevTrackBtn', '#nextTrackBtn', '#repeatModeBtn',
        '#shuffleModeBtn', '#progressSlider', '#volumeSlider', '#playlistToggleBtn',
        '#lyricsToggleBtn'
      ].every((selector) => document.querySelector(selector).disabled),
      nativeOwned: await window.desktopApp?.getNativeMediaSessionAvailability?.(),
      browserTitle: navigator.mediaSession?.metadata?.title || '',
      browserState: navigator.mediaSession?.playbackState || 'none'
    };

    localButton.click();
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const state = JSON.parse(localStorage.getItem('infiniteLofiState'));
      if (state.player.sourceMode === 'local' && !localButton.disabled) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const localState = JSON.parse(localStorage.getItem('infiniteLofiState'));
    const local = {
      saved: localState.player.sourceMode,
      playerPaused: player.paused,
      panelMode: document.querySelector('#playerPanel').dataset.playbackSource,
      localPressed: localButton.getAttribute('aria-pressed'),
      externalPressed: externalButton.getAttribute('aria-pressed'),
      controlsEnabled: ['#playPauseBtn', '#prevTrackBtn', '#nextTrackBtn'].every(
        (selector) => !document.querySelector(selector).disabled
      ),
      sourceButtonHeight: Math.min(
        localButton.getBoundingClientRect().height,
        externalButton.getBoundingClientRect().height
      ),
      nativeOwned: await window.desktopApp?.getNativeMediaSessionAvailability?.()
    };
    return { external, local };
  })()`);

  await setWindowSize(720, 520);
  const lyricsResult = await evaluate(`(async () => {
    const toggle = document.querySelector('#lyricsToggleBtn');
    const panel = document.querySelector('#lyricsPanel');
    const status = document.querySelector('#lyricsStatus');
    const initial = {
      hidden: panel.hidden,
      pressed: toggle.getAttribute('aria-pressed'),
      expanded: toggle.getAttribute('aria-expanded')
    };
    toggle.click();
    for (let attempt = 0; attempt < 40 && status.textContent.includes('Finding'); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const panelRect = panel.getBoundingClientRect();
    const enabledState = JSON.parse(localStorage.getItem('infiniteLofiState'));
    const enabled = {
      hidden: panel.hidden,
      pressed: toggle.getAttribute('aria-pressed'),
      expanded: toggle.getAttribute('aria-expanded'),
      bodyClass: document.body.classList.contains('lyrics-enabled'),
      saved: enabledState.settings.ui.lyricsEnabled,
      status: status.textContent.trim(),
      panelInsideViewport: panelRect.left >= -4 && panelRect.right <= innerWidth + 4 && panelRect.bottom <= innerHeight + 4,
      regionLabel: document.querySelector('#lyricsViewport').getAttribute('aria-label')
    };
    toggle.click();
    const disabledState = JSON.parse(localStorage.getItem('infiniteLofiState'));
    const disabled = {
      hidden: panel.hidden,
      pressed: toggle.getAttribute('aria-pressed'),
      expanded: toggle.getAttribute('aria-expanded'),
      bodyClass: document.body.classList.contains('lyrics-enabled'),
      saved: disabledState.settings.ui.lyricsEnabled
    };
    return { initial, enabled, disabled };
  })()`);

  const audioTransitionResult = await evaluate(`(async () => {
    const music = document.querySelector('#lofiPlayer');
    const userVolume = document.querySelector('#volumeSlider');
    const enabled = document.querySelector('#audioTransitionsEnabled');
    const duration = document.querySelector('#audioTransitionDuration');
    const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
    const waitFor = async (predicate) => {
      for (let attempt = 0; attempt < 60; attempt += 1) {
        if (predicate()) return true;
        await wait(50);
      }
      return false;
    };
    const before = {
      saved: JSON.parse(localStorage.getItem('infiniteLofiState')).player.audioTransitions,
      checked: enabled.checked,
      duration: duration.value,
      durationDisabled: duration.disabled
    };
    if (!music.paused) {
      document.querySelector('#playPauseBtn').click();
      await wait(20);
    }
    music.currentTime = 0;
    enabled.checked = true;
    enabled.dispatchEvent(new Event('change', { bubbles: true }));
    duration.value = '200';
    duration.dispatchEvent(new Event('change', { bubbles: true }));
    userVolume.value = '60';
    userVolume.dispatchEvent(new Event('input', { bubbles: true }));

    document.querySelector('#playPauseBtn').click();
    await waitFor(() => music.volume > 0.02 && music.volume < 0.58);
    const playMidVolume = music.volume;
    await waitFor(() => !music.paused && Math.abs(music.volume - 0.6) < 0.000001);
    const playFinal = { paused: music.paused, volume: music.volume };

    document.querySelector('#playPauseBtn').click();
    await waitFor(() => music.volume > 0.02 && music.volume < 0.58);
    const pauseMidVolume = music.volume;
    document.querySelector('#playPauseBtn').click();
    await waitFor(() => !music.paused && Math.abs(music.volume - 0.6) < 0.000001);
    const rapidFinal = { paused: music.paused, volume: music.volume };

    document.querySelector('#playPauseBtn').click();
    userVolume.value = '0';
    userVolume.dispatchEvent(new Event('input', { bubbles: true }));
    const muteDuringFade = {
      effective: music.volume,
      saved: JSON.parse(localStorage.getItem('infiniteLofiState')).settings.ui.volume
    };
    document.querySelector('#playPauseBtn').click();
    await waitFor(() => !music.paused);
    const mutedReplay = { paused: music.paused, volume: music.volume };
    userVolume.value = '60';
    userVolume.dispatchEvent(new Event('input', { bubbles: true }));
    await waitFor(() => Math.abs(music.volume - 0.6) < 0.000001);

    const sourceBeforeSwitch = music.currentSrc || music.src;
    document.querySelector('#nextTrackBtn').click();
    const sourceDuringFadeOut = music.currentSrc || music.src;
    await waitFor(() =>
      (music.currentSrc || music.src) !== sourceBeforeSwitch && Math.abs(music.volume - 0.6) < 0.000001
    );
    const sourceAfterSwitch = music.currentSrc || music.src;
    const saved = JSON.parse(localStorage.getItem('infiniteLofiState')).player.audioTransitions;
    return {
      before,
      saved,
      playMidVolume,
      playFinal,
      pauseMidVolume,
      rapidFinal,
      muteDuringFade,
      mutedReplay,
      sourceBeforeSwitch,
      sourceDuringFadeOut,
      sourceAfterSwitch,
      finalPaused: music.paused,
      finalVolume: music.volume,
      checkboxLabelHeight: enabled.closest('label').getBoundingClientRect().height,
      durationHeight: duration.getBoundingClientRect().height,
      durationMax: duration.max,
      durationStep: duration.step
    };
  })()`);

  const ambienceResult = await evaluate(`(async () => {
    const ambient = document.querySelector('#ambiencePlayer');
    const music = document.querySelector('#lofiPlayer');
    const select = document.querySelector('#ambienceSoundSelect');
    const toggle = document.querySelector('#ambienceToggleBtn');
    const volume = document.querySelector('#ambienceVolumeSlider');
    const waitFor = async (predicate) => {
      for (let attempt = 0; attempt < 60; attempt += 1) {
        if (predicate()) return true;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return false;
    };

    select.value = 'soft-rain';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    volume.value = '0';
    volume.dispatchEvent(new Event('input', { bubbles: true }));
    const savedZero = JSON.parse(localStorage.getItem('infiniteLofiState')).player.ambience.volume;
    volume.value = '35';
    volume.dispatchEvent(new Event('input', { bubbles: true }));
    toggle.click();
    const firstPlayed = await waitFor(() => !ambient.paused && Number.isFinite(ambient.duration));
    const firstSource = ambient.currentSrc || ambient.src;
    if (music.paused) document.querySelector('#playPauseBtn').click();
    await waitFor(() => !music.paused);
    document.querySelector('#playPauseBtn').click();
    await waitFor(() => music.paused);
    const independentAfterMusicPause = !ambient.paused;

    select.value = 'quiet-cafe';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    const switchedWhilePlaying = await waitFor(() =>
      !ambient.paused && (ambient.currentSrc || ambient.src).endsWith('/quiet-cafe.wav')
    );
    const saved = JSON.parse(localStorage.getItem('infiniteLofiState')).player.ambience;
    const result = {
      firstPlayed,
      firstSource,
      switchedWhilePlaying,
      secondSource: ambient.currentSrc || ambient.src,
      independentAfterMusicPause,
      musicPaused: music.paused,
      loop: ambient.loop,
      savedZero,
      saved,
      selectHeight: select.getBoundingClientRect().height,
      toggleHeight: toggle.getBoundingClientRect().height,
      status: document.querySelector('#ambienceStatus').textContent.trim()
    };
    window.__infiniteLofiSkipBeforeUnloadPersistence = true;
    location.reload();
    return result;
  })()`);
  await delay(1_000);
  const ambienceRestartResult = await evaluate(`(() => {
    const ambient = document.querySelector('#ambiencePlayer');
    const state = JSON.parse(localStorage.getItem('infiniteLofiState'));
    return {
      selected: document.querySelector('#ambienceSoundSelect').value,
      saved: state.player.ambience,
      transitionSettings: state.player.audioTransitions,
      paused: ambient.paused,
      sourcePresent: ambient.hasAttribute('src'),
      status: document.querySelector('#ambienceStatus').textContent.trim()
    };
  })()`);

  const expiredSeedResult = await evaluate(`(() => {
    const state = JSON.parse(localStorage.getItem('infiniteLofiState'));
    const deadlineMs = Date.now() - 1_000;
    state.timerRuntime = {
      phase: 'focus',
      completedFocusesInCycle: 0,
      remainingSeconds: 1,
      deadlineMs,
      isRunning: true,
      focusSession: {
        id: 'focus-smoke-expired',
        taskId: 'task-deleted-smoke',
        taskTitle: 'Deleted task snapshot'
      }
    };
    state.stats.focusSessions = state.stats.focusSessions.filter((session) => session.id !== 'focus-smoke-expired');
    localStorage.setItem('infiniteLofiState', JSON.stringify(state));
    window.__infiniteLofiSkipBeforeUnloadPersistence = true;
    location.reload();
    return { deadlineMs };
  })()`);
  await delay(1_400);
  const expiredRestoreOnce = await evaluate(`(() => {
    const state = JSON.parse(localStorage.getItem('infiniteLofiState'));
    const entries = state.stats.focusSessions.filter((session) => session.id === 'focus-smoke-expired');
    return {
      count: entries.length,
      taskId: entries[0]?.taskId,
      taskTitle: entries[0]?.taskTitle,
      completedAt: entries[0]?.completedAt,
      phase: state.timerRuntime.phase,
      isRunning: state.timerRuntime.isRunning,
      focusSession: state.timerRuntime.focusSession
    };
  })()`);
  await evaluate("window.__infiniteLofiSkipBeforeUnloadPersistence = true; location.reload(); true");
  await delay(1_400);
  const expiredRestoreTwice = await evaluate(`(() => {
    const state = JSON.parse(localStorage.getItem('infiniteLofiState'));
    return {
      count: state.stats.focusSessions.filter((session) => session.id === 'focus-smoke-expired').length,
      phase: state.timerRuntime.phase,
      isRunning: state.timerRuntime.isRunning
    };
  })()`);

  await evaluate(`(() => {
    const state = JSON.parse(localStorage.getItem('infiniteLofiState'));
    const title = '界'.repeat(120);
    const current = new Date();
    const day = [current.getFullYear(), String(current.getMonth() + 1).padStart(2, '0'), String(current.getDate()).padStart(2, '0')].join('-');
    state.tasks = {
      items: Array.from({ length: 100 }, (_, index) => ({
        id: 'perf-task-' + index,
        title,
        status: 'open',
        createdAt: 1_800_000_000_000 + index,
        completedAt: null
      })),
      selectedTaskId: null
    };
    state.stats.focusSessions = Array.from({ length: 5000 }, (_, index) => ({
      id: 'perf-session-' + index,
      day,
      focusSeconds: 60,
      completedAt: new Date(1_800_000_000_000 + index).toISOString(),
      source: 'timer',
      taskId: 'missing-task-' + index,
      taskTitle: title
    }));
    state.stats.focusRows = [{ day, focusSeconds: 300000 }];
    state.timerRuntime = {
      phase: 'focus',
      completedFocusesInCycle: 0,
      remainingSeconds: state.settings.timer.focusSeconds,
      deadlineMs: null,
      isRunning: false,
      focusSession: null
    };
    localStorage.setItem('infiniteLofiState', JSON.stringify(state));
    window.__infiniteLofiSkipBeforeUnloadPersistence = true;
    location.reload();
    return true;
  })()`);
  await delay(2_000);
  const performanceResult = await evaluate(`(async () => {
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const percentile95 = (values) => [...values].sort((left, right) => left - right)[Math.ceil(values.length * 0.95) - 1];
    const openDurations = [];
    const actionDurations = [];
    const rangeDurations = [];
    const trigger = document.querySelector('#tasksToggleBtn');
    for (let index = 0; index < 30; index += 1) {
      const startedAt = performance.now();
      trigger.click();
      await nextFrame();
      openDurations.push(performance.now() - startedAt);
      document.querySelector('#tasksCloseBtn').click();
      await nextFrame();
    }
    trigger.click();
    await nextFrame();
    for (let index = 0; index < 30; index += 1) {
      const button = document.querySelector('#openTasksList [data-task-action="select"]');
      const startedAt = performance.now();
      button.click();
      await nextFrame();
      actionDurations.push(performance.now() - startedAt);
    }
    document.querySelector('#tasksCloseBtn').click();
    document.querySelector('#statsToggleBtn').click();
    await nextFrame();
    for (let index = 0; index < 30; index += 1) {
      const button = document.querySelector(index % 2 === 0 ? '#statsRangeMonthBtn' : '#statsRangeWeekBtn');
      const startedAt = performance.now();
      button.click();
      await nextFrame();
      rangeDurations.push(performance.now() - startedAt);
    }
    const state = JSON.parse(localStorage.getItem('infiniteLofiState'));
    const result = {
      fixtureTasks: state.tasks.items.length,
      fixtureSessions: state.stats.focusSessions.length,
      repetitions: 30,
      renderedOpenRows: document.querySelectorAll('#openTasksList .task-row').length,
      renderedReviewRows: document.querySelectorAll('#focusReviewList .focus-review-row').length,
      reviewPaginationButtons: document.querySelectorAll('#focusReviewPagination button').length,
      retentionBoundaryVisible: document.querySelector('#focusReviewLimits').textContent.includes('boundary'),
      openP95Ms: percentile95(openDurations),
      actionP95Ms: percentile95(actionDurations),
      rangeP95Ms: percentile95(rangeDurations),
      openMaxMs: Math.max(...openDurations),
      actionMaxMs: Math.max(...actionDurations),
      rangeMaxMs: Math.max(...rangeDurations)
    };
    document.querySelector('#statsCloseBtn').click();
    return result;
  })()`);

  let localVideoResult = { skipped: connectOnly };
  if (!connectOnly) {
    await setWindowSize(720, 520);
    await evaluate(`(() => {
    const state = JSON.parse(localStorage.getItem('infiniteLofiState'));
    state.player = {
      ...state.player,
      folderPath: ${JSON.stringify(smokeMediaDirectory)},
      queue: [{
        key: 'local:local-video.webm',
        label: 'local-video',
        relativePath: 'local-video.webm',
        isLocal: true,
        mediaKind: 'video'
      }],
      activeTrackKey: 'local:local-video.webm',
      sourceMode: 'local',
      videoDisplayMode: 'audio-only',
      playbackMode: 'sequential',
      audioTransitions: { enabled: false, durationMs: 200 }
    };
    localStorage.setItem('infiniteLofiState', JSON.stringify(state));
    window.__infiniteLofiSkipBeforeUnloadPersistence = true;
    location.reload();
    return true;
  })()`);
  await delay(1_200);
    localVideoResult = await evaluate(`(async () => {
    const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
    const player = document.querySelector('#lofiPlayer');
    const toggle = document.querySelector('#videoBackgroundToggle');
    const control = document.querySelector('#videoDisplayControl');
    const externalButton = document.querySelector('#externalPlaybackSourceBtn');
    const localButton = document.querySelector('#localPlaybackSourceBtn');
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (!control.hidden && (player.currentSrc || player.src).endsWith('/local-video.webm')) break;
      await wait(25);
    }
    const initial = {
      controlVisible: !control.hidden,
      checked: toggle.checked,
      videoBadge: document.querySelector('#playlistItems .playlist-item-kind')?.textContent.trim(),
      mediaKind: JSON.parse(localStorage.getItem('infiniteLofiState')).player.queue[0]?.mediaKind,
      controlHeight: control.querySelector('label').getBoundingClientRect().height,
      playerInsideViewport: document.querySelector('#playerPanel').getBoundingClientRect().bottom <= innerHeight + 4
    };
    document.querySelector('#playPauseBtn').click();
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (!player.paused && player.currentTime > 0.05 && player.videoWidth > 0) break;
      await wait(25);
    }
    const audioOnlyTime = player.currentTime;
    toggle.click();
    await wait(250);
    const background = {
      active: document.body.classList.contains('local-video-background'),
      opacity: Number(getComputedStyle(player).opacity),
      currentTime: player.currentTime,
      paused: player.paused,
      muted: player.muted,
      scenePaused: document.querySelector('#bgVideo').paused,
      saved: JSON.parse(localStorage.getItem('infiniteLofiState')).player.videoDisplayMode
    };
    toggle.click();
    await wait(250);
    const audioOnly = {
      active: document.body.classList.contains('local-video-background'),
      opacity: Number(getComputedStyle(player).opacity),
      currentTime: player.currentTime,
      paused: player.paused,
      saved: JSON.parse(localStorage.getItem('infiniteLofiState')).player.videoDisplayMode
    };
    externalButton.click();
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const state = JSON.parse(localStorage.getItem('infiniteLofiState'));
      if (state.player.sourceMode === 'external' && !externalButton.disabled) break;
      await wait(25);
    }
    const external = {
      paused: player.paused,
      active: document.body.classList.contains('local-video-background'),
      controlHidden: control.hidden
    };
    localButton.click();
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const state = JSON.parse(localStorage.getItem('infiniteLofiState'));
      if (state.player.sourceMode === 'local' && !localButton.disabled) break;
      await wait(25);
    }
    const restoredLocal = {
      paused: player.paused,
      controlVisible: !control.hidden,
      errorHidden: document.querySelector('#mediaPlaybackStatus').hidden,
      videoWidth: player.videoWidth,
      videoHeight: player.videoHeight
    };
    return { initial, audioOnlyTime, background, audioOnly, external, restoredLocal };
    })()`);
  }

  await evaluate(`(() => {
    const backup = ${JSON.stringify(initialStorageEntries)};
    localStorage.clear();
    for (const [key, value] of backup) localStorage.setItem(key, value);
    window.__infiniteLofiSkipBeforeUnloadPersistence = true;
    location.reload();
    return true;
  })()`);
  await delay(1_000);

  const finalState = await evaluate(`(() => ({
    readyState: document.readyState,
    temporaryNoteRemoved: document.querySelector('#notesInput')?.value !== '__INFINITE_LOFI_SMOKE_TEST__'
  }))()`);

  const failures = [];
  const nativeResizeTolerance = 4;
  if (baseline.readyState !== "complete" || !baseline.requiredElementsPresent) failures.push("required UI did not initialize");
  if (
    windowFocusResult.after.phase !== windowFocusResult.before.phase ||
    !windowFocusResult.after.isRunning ||
    windowFocusResult.after.remainingSeconds !== windowFocusResult.before.remainingSeconds
  ) failures.push("window focus ended the active timer phase");
  if (!baseline.localFontsReady || baseline.remoteStylesheetCount !== 0) failures.push("local fonts did not initialize offline");
  if (
    !shortcutHelpResult.openedFromButton ||
    shortcutHelpResult.focusedOnOpen !== "shortcutHelpCloseBtn" ||
    !shortcutHelpResult.tabWrappedToFirst ||
    !shortcutHelpResult.closedFromButton ||
    !shortcutHelpResult.hiddenFromAccessibilityTree ||
    !shortcutHelpResult.focusRestored
  ) failures.push("shortcut help focus management failed");
  if (
    languageSwitchResult.length !== 7 ||
    languageSwitchResult.some((item) =>
      item.htmlLanguage !== item.code || item.savedLanguage !== item.code ||
      item.languageLabel !== item.expectedLabel || item.optionCount !== 7 ||
      !item.selectorFocused || !item.panelOpen
    ) ||
    languagePersistenceResult.before.selected !== "es" ||
    languagePersistenceResult.before.htmlLanguage !== "es" ||
    languagePersistenceResult.before.saved !== "es" ||
    languagePersistenceResult.before.headerTasks !== "Tareas" ||
    languagePersistenceResult.restored !== "en" ||
    languagePersistenceResult.restoredLabel !== "Display language"
  ) failures.push("display language switching or persistence failed");
  if (!reducedMotionResult.matches || reducedMotionResult.backgroundTransitionMs > 0.1 || reducedMotionResult.drawerTransitionMs > 0.1) {
    failures.push("reduced-motion preference did not suppress transitions");
  }
  if (Object.values(contrastResult).some((ratio) => !Number.isFinite(ratio) || ratio < 4.5)) {
    failures.push("core dark or light theme text contrast fell below WCAG AA");
  }
  if (!accessibilityTreeResult.namedFocusPlanDialog || !accessibilityTreeResult.namedTasksDialog || !accessibilityTreeResult.namedStatsDialog || !accessibilityTreeResult.namedReviewList || accessibilityTreeResult.reviewItems < 2 || !accessibilityTreeResult.liveStatusPresent) {
    failures.push("dialog or live status was missing from the accessibility tree");
  }
  if (baseline.dragRegion.appRegion !== 'drag' || baseline.dragRegion.width < 160 || baseline.dragRegion.height < 40) {
    failures.push("top window drag region was not large enough");
  }
  if (
    !expandableRegionResult.queueFocused || !expandableRegionResult.queueUsesVerticalScroll ||
    !expandableRegionResult.timerIsSimplified || !expandableRegionResult.showAllExpanded ||
    !expandableRegionResult.showAllViewportLayer || !expandableRegionResult.showAllInside ||
    !expandableRegionResult.showAllLarge || !expandableRegionResult.showAllRestored ||
    !expandableRegionResult.queueClosed ||
    !expandableRegionResult.queueFocusRestored
  ) {
    failures.push("playlist disclosure focus management failed");
  }
  if (
    queueResizeConstraintResult.width < queueResizeConstraintResult.expectedMinimumWidth - nativeResizeTolerance ||
    queueResizeConstraintResult.height < queueResizeConstraintResult.expectedMinimumHeight - nativeResizeTolerance ||
    !queueResizeConstraintResult.queueVisible ||
    !queueResizeConstraintResult.queueInsideViewport
  ) failures.push("expanded Queue did not enforce a fully visible window size");
  if (!responsiveNotesResult.focusedOnOpen || !responsiveNotesResult.hiddenAfterEscape || !responsiveNotesResult.focusRestored) {
    failures.push("responsive notes focus management failed");
  }
  if (responsiveLayouts.some((layout) => layout.timerChildOverflow.length > 0 || !layout.cardInsideViewport || !layout.playerInsideViewport || !layout.headerActionsInsideViewport || layout.timerButtonHeight < 42)) {
    failures.push("responsive full-window layout overflowed or exposed undersized controls");
  }
  if (
    notesBelowBreakpoint.width > 900 || !notesBelowBreakpoint.toggleVisible || notesBelowBreakpoint.panelPosition !== "fixed" ||
    notesAboveBreakpoint.width <= 900 || notesAboveBreakpoint.toggleVisible || notesAboveBreakpoint.panelPosition === "fixed"
  ) failures.push("900px Notes breakpoint did not switch on both sides");
  if (
    !taskSetupResult.focusedOnOpen || !taskSetupResult.compositionDidNotSubmit || !taskSetupResult.typingQuestionMarkStayedLocal ||
    !taskSetupResult.unselectWorked || !taskSetupResult.tabWrappedToFirst || !taskSetupResult.headerFocusRestored || !taskSetupResult.intentFocusRestored ||
    taskSetupResult.itemCount !== 2 || taskSetupResult.selectedTitle !== "Alpha intention" || taskSetupResult.schemaVersion !== 5
  ) failures.push("task creation, IME boundary, selection, or drawer focus management failed");
  if (
    taskPauseResumeResult.before?.taskTitle !== "Alpha intention" || taskPauseResumeResult.pausedRunning ||
    !taskPauseResumeResult.resumedRunning || !taskPauseResumeResult.stableWhilePaused || !taskPauseResumeResult.stableWhenResumed
  ) failures.push("focus snapshot changed across pause and resume");
  if (
    !taskMutationResult.imeEnterDidNotCommit || !taskMutationResult.escapeCanceledBeforeDrawer || !taskMutationResult.alphaDeleted ||
    !taskMutationResult.betaReopened || !taskMutationResult.nextIsBeta || taskMutationResult.frozenTitle !== "Alpha intention" ||
    !taskMutationResult.timerStillRunning || !taskMutationResult.removalFocusPredictable || taskMutationResult.currentCopy !== "Alpha intention" || taskMutationResult.nextCopy !== "Beta intention" ||
    !dialogs.some((message) => message.includes("Recorded names remain"))
  ) failures.push("task rename, complete, reopen, delete, or frozen/current-next behavior failed");
  if (
    liveFocusCompletionResult.phase !== "shortBreak" || !liveFocusCompletionResult.isRunning || liveFocusCompletionResult.focusSession !== null ||
    liveFocusCompletionResult.matchingSnapshots.length !== 1 ||
    liveFocusCompletionResult.matchingSnapshots[0]?.id !== taskPauseResumeResult.before?.id ||
    liveFocusCompletionResult.selectedTitle !== "Beta intention"
  ) failures.push("live focus completion was not atomic, attributed, or auto-started once");
  if (
    autoStartedFocusResult.phase !== "focus" || !autoStartedFocusResult.isRunning ||
    autoStartedFocusResult.taskTitle !== "Beta intention" || !autoStartedFocusResult.sessionId ||
    autoStartedFocusResult.sessionId === taskPauseResumeResult.before?.id
  ) failures.push("automatic next focus did not capture the then-current task selection");
  if (
    !completionDoesNotStopResult.timerRunning || completionDoesNotStopResult.currentTitle !== "Beta intention" ||
    completionDoesNotStopResult.nextSelection !== null || completionDoesNotStopResult.taskStatus !== "completed" ||
    completionDoesNotStopResult.resetContext !== null || !completionDoesNotStopResult.resetSelection ||
    completionDoesNotStopResult.resetSelectedTitle !== "Beta intention"
  ) failures.push("task completion changed the active timer or reset semantics");
  if (!miniMode420.enabled || miniMode420.width > 480 || miniMode420.height > 280 || miniMode420.timerChildOverflow.length > 0 || miniMode420.fullLabel !== "Full" || !miniMode420.notesHidden || !miniMode420.editorHidden) {
    failures.push("Mini Mode layout or window sizing failed");
  }
  if (
    miniMode360.width > 360 + nativeResizeTolerance || miniMode360.height > 200 + nativeResizeTolerance ||
    miniMode360.timerChildOverflow.length > 0 || miniMode360.timer !== "360:00" ||
    !miniMode360.titleAvailable || !miniMode360.editorHidden ||
    Object.values(miniMode360.controls).some((control) => !control.visible || !control.inside)
  ) failures.push("360x200 Mini Mode clipped maximum timer, intention, or primary controls");
  if (restoredFullMode.enabled || restoredFullMode.width < 700 || restoredFullMode.height < 500 || restoredFullMode.miniLabel !== "Mini") {
    failures.push("full-window bounds were not restored after Mini Mode");
  }
  if (runningTimer.button !== "Pause" || parseTimer(runningTimer.timer) >= parseTimer(baseline.timer) || !runningTimer.announcement.includes("timer started")) failures.push("timer did not count down or announce its state");
  if (!lockedPlan.opened || !lockedPlan.inputDisabled || !lockedPlan.hint.includes("Pause") || lockedPlan.focusedOnOpen !== "focusPlanCloseBtn" || !lockedPlan.exposedToAccessibilityTree || !lockedPlan.focusRestored || !lockedPlan.hiddenAfterClose) failures.push("running timer did not lock Focus Plan settings or manage drawer focus");
  if (
    !focusPlanResult.drawerClosed ||
    !focusPlanResult.drawerInsideViewport ||
    focusPlanResult.timer !== "30:00" ||
    !focusPlanResult.summary.includes("30 / 7 / 20") ||
    !focusPlanResult.status.includes("Today 25 / 90m") ||
    focusPlanResult.schemaVersion !== 5 ||
    focusPlanResult.timerSettings.shortBreakSeconds !== 420 ||
    focusPlanResult.timerSettings.longBreakSeconds !== 1200 ||
    focusPlanResult.timerSettings.focusSessionsPerLongBreak !== 3 ||
    focusPlanResult.timerSettings.autoStartBreaks !== false ||
    focusPlanResult.dailyGoalSeconds !== 5400 ||
    focusPlanResult.selectedTitle !== "Beta intention" ||
    focusPlanResult.goalProgressMax !== "90" ||
    focusPlanResult.runtime.completedFocusesInCycle !== 0
  ) failures.push("Focus Plan settings did not apply and persist");
  if (
    sessionHistoryResult.schemaVersion !== 5 ||
    sessionHistoryResult.sessionCount !== 2 ||
    sessionHistoryResult.manualMinutes !== 40 ||
    sessionHistoryResult.derivedTodayMinutes !== 65 ||
    sessionHistoryResult.renderedRows !== 2 ||
    !sessionHistoryResult.taskSnapshotVisible ||
    !sessionHistoryResult.countLabel.startsWith("2 ") ||
    !sessionHistoryResult.activeDays.startsWith("1 ") ||
    sessionHistoryResult.comparison !== "No baseline" ||
    !sessionHistoryResult.comparisonTitle.includes("no recorded time") ||
    sessionHistoryResult.heading !== "Focus Review (Last 7 Days)" ||
    sessionHistoryResult.weekLabel !== "Last 7 Days" ||
    sessionHistoryResult.reviewRows !== 2 ||
    sessionHistoryResult.reviewSummary !== "1h 5m recorded across 1 active day." ||
    !sessionHistoryResult.deletedTaskVisible ||
    !sessionHistoryResult.unassignedVisible ||
    !sessionHistoryResult.reconciliationNoteHidden ||
    !sessionHistoryResult.retentionCopy.includes("5000")
  ) failures.push("session history editing or trend summaries failed");
  if (statsResponsiveLayouts.some((layout) =>
    !layout.open || !layout.inside || !layout.scrollable ||
    layout.rangeButtonHeight < 42 || !layout.reviewVisible || !layout.closeVisible
  )) failures.push("responsive Focus Review layout failed");
  if (notesResult.after !== notesResult.before + 1 || !notesResult.accepted) failures.push("notes interaction failed");
  if (
    !drawersResult.statsVisible || !drawersResult.statsFocused || !drawersResult.backdropVisible ||
    !drawersResult.statsClosedByBackdrop || !drawersResult.statsFocusRestored ||
    !drawersResult.backgroundVisible || !drawersResult.backgroundFocused || !drawersResult.backgroundFocusRestored
  ) failures.push("drawer backdrop interaction or focus restoration failed");
  if (
    !showcaseResult.enabled || !showcaseResult.playerHidden || !showcaseResult.transparentCard ||
    !showcaseResult.timerVisible || !showcaseResult.exited
  ) failures.push("Show mode transparency or exit behavior failed");
  if (
    !curatedScenesResult.midnight.enabled ||
    curatedScenesResult.midnight.pressed !== "true" ||
    curatedScenesResult.midnight.label !== "Midnight" ||
    curatedScenesResult.midnight.saved !== "midnight" ||
    curatedScenesResult.midnight.paletteInk !== "#edf6fb" ||
    curatedScenesResult.midnight.timerColor !== "rgb(237, 246, 251)" ||
    curatedScenesResult.midnight.intentionColor !== "rgb(237, 246, 251)" ||
    !curatedScenesResult.moss.enabled ||
    !curatedScenesResult.moss.midnightRemoved ||
    curatedScenesResult.moss.pressed !== "true" ||
    curatedScenesResult.moss.saved !== "moss" ||
    curatedScenesResult.moss.intentionColor !== "rgb(240, 246, 237)" ||
    !curatedScenesResult.paper.enabled ||
    !curatedScenesResult.paper.mossRemoved ||
    curatedScenesResult.paper.pressed !== "true" ||
    curatedScenesResult.paper.saved !== "paper" ||
    curatedScenesResult.paper.timerColor !== "rgb(39, 37, 32)" ||
    curatedScenesResult.paper.intentionColor !== "rgb(39, 37, 32)" ||
    curatedScenesResult.paper.panelBackground === "none" ||
    !curatedScenesResult.studio.cleanTheme ||
    curatedScenesResult.studio.pressed !== "true" ||
    curatedScenesResult.studio.saved !== "quiet-studio" ||
    curatedScenesResult.studio.intentionColor !== "rgb(244, 240, 232)"
  ) {
    failures.push("curated Scene preset adaptation or persistence failed");
  }
  const expectsNativeMedia = process.platform === "darwin";
  if (
    playerResult.pausedAfterClick ||
    !playerResult.source ||
    playerResult.queueLength !== 3 ||
    !playerResult.activeTrackKey.startsWith('builtin:') ||
    playerResult.repeatState !== 'repeat-one' || !playerResult.repeatLoop ||
    playerResult.shuffleState !== 'shuffle' || playerResult.shufflePressed !== 'true' || playerResult.repeatPressed !== 'false' ||
    !playerResult.mediaSessionSupported ||
    playerResult.nativeMediaAvailable !== expectsNativeMedia ||
    (!expectsNativeMedia && (!playerResult.mediaSessionTitle || playerResult.mediaPlaybackState !== 'playing')) ||
    (expectsNativeMedia && (playerResult.mediaSessionTitle || playerResult.mediaPlaybackState !== 'none'))
  ) failures.push("playlist persistence or native media session failed");
  if (
    playbackSourceResult.external.saved !== 'external' ||
    !playbackSourceResult.external.playerPaused ||
    playbackSourceResult.external.panelMode !== 'external' ||
    playbackSourceResult.external.externalPressed !== 'true' ||
    playbackSourceResult.external.localPressed !== 'false' ||
    !playbackSourceResult.external.localControlsDisabled ||
    playbackSourceResult.external.nativeOwned === true ||
    playbackSourceResult.external.browserTitle ||
    playbackSourceResult.external.browserState !== 'none' ||
    playbackSourceResult.local.saved !== 'local' ||
    !playbackSourceResult.local.playerPaused ||
    playbackSourceResult.local.panelMode !== 'local' ||
    playbackSourceResult.local.localPressed !== 'true' ||
    playbackSourceResult.local.externalPressed !== 'false' ||
    !playbackSourceResult.local.controlsEnabled ||
    playbackSourceResult.local.sourceButtonHeight < 42 ||
    playbackSourceResult.local.nativeOwned !== expectsNativeMedia
  ) failures.push("Local/External playback ownership switching failed");
  if (
    !lyricsResult.initial.hidden || lyricsResult.initial.pressed !== 'false' || lyricsResult.initial.expanded !== 'false' ||
    lyricsResult.enabled.hidden || lyricsResult.enabled.pressed !== 'true' || lyricsResult.enabled.expanded !== 'true' ||
    !lyricsResult.enabled.bodyClass || lyricsResult.enabled.saved !== true ||
    !lyricsResult.enabled.status.includes('Track information is incomplete') ||
    !lyricsResult.enabled.panelInsideViewport || lyricsResult.enabled.regionLabel !== 'Song lyrics' ||
    !lyricsResult.disabled.hidden || lyricsResult.disabled.pressed !== 'false' || lyricsResult.disabled.expanded !== 'false' ||
    lyricsResult.disabled.bodyClass || lyricsResult.disabled.saved !== false
  ) failures.push("lyrics opt-in, persistence, status, accessibility, or responsive layout failed");
  if (
    audioTransitionResult.before.saved.enabled || audioTransitionResult.before.checked ||
    audioTransitionResult.before.duration !== '200' || !audioTransitionResult.before.durationDisabled ||
    !audioTransitionResult.saved.enabled || audioTransitionResult.saved.durationMs !== 200 ||
    !(audioTransitionResult.playMidVolume > 0 && audioTransitionResult.playMidVolume < 0.6) ||
    audioTransitionResult.playFinal.paused || Math.abs(audioTransitionResult.playFinal.volume - 0.6) > 0.02 ||
    !(audioTransitionResult.pauseMidVolume > 0 && audioTransitionResult.pauseMidVolume < 0.6) ||
    audioTransitionResult.rapidFinal.paused || Math.abs(audioTransitionResult.rapidFinal.volume - 0.6) > 0.02 ||
    audioTransitionResult.muteDuringFade.effective !== 0 || audioTransitionResult.muteDuringFade.saved !== 0 ||
    audioTransitionResult.mutedReplay.paused || audioTransitionResult.mutedReplay.volume !== 0 ||
    audioTransitionResult.sourceDuringFadeOut !== audioTransitionResult.sourceBeforeSwitch ||
    audioTransitionResult.sourceAfterSwitch === audioTransitionResult.sourceBeforeSwitch ||
    audioTransitionResult.finalPaused || Math.abs(audioTransitionResult.finalVolume - 0.6) > 0.02 ||
    audioTransitionResult.checkboxLabelHeight < 42 || audioTransitionResult.durationHeight < 42 ||
    audioTransitionResult.durationMax !== '3000' || audioTransitionResult.durationStep !== '50'
  ) failures.push("audio transition preference, gain separation, cancellation, or sequential switch failed");
  if (
    !ambienceResult.firstPlayed || !ambienceResult.firstSource.endsWith('/soft-rain.wav') ||
    !ambienceResult.switchedWhilePlaying || !ambienceResult.secondSource.endsWith('/quiet-cafe.wav') ||
    !ambienceResult.independentAfterMusicPause || !ambienceResult.musicPaused || !ambienceResult.loop ||
    ambienceResult.savedZero !== 0 || ambienceResult.saved.soundId !== 'quiet-cafe' || ambienceResult.saved.volume !== 0.35 ||
    ambienceResult.selectHeight < 42 || ambienceResult.toggleHeight < 42 || !ambienceResult.status.includes('Quiet Cafe') ||
    ambienceRestartResult.selected !== 'quiet-cafe' || ambienceRestartResult.saved.soundId !== 'quiet-cafe' ||
    ambienceRestartResult.saved.volume !== 0.35 || !ambienceRestartResult.transitionSettings.enabled ||
    ambienceRestartResult.transitionSettings.durationMs !== 200 || !ambienceRestartResult.paused || ambienceRestartResult.sourcePresent
  ) failures.push("ambient selection, isolation, persistence, or paused startup failed");
  if (
    expiredRestoreOnce.count !== 1 || expiredRestoreOnce.taskId !== "task-deleted-smoke" ||
    expiredRestoreOnce.taskTitle !== "Deleted task snapshot" ||
    expiredRestoreOnce.completedAt !== new Date(expiredSeedResult.deadlineMs).toISOString() ||
    expiredRestoreOnce.phase !== "shortBreak" || expiredRestoreOnce.isRunning || expiredRestoreOnce.focusSession !== null ||
    expiredRestoreTwice.count !== 1 || expiredRestoreTwice.phase !== "shortBreak" || expiredRestoreTwice.isRunning
  ) failures.push("expired focus recovery did not attribute and record exactly once");
  if (
    performanceResult.fixtureTasks !== 100 || performanceResult.fixtureSessions !== 5000 || performanceResult.repetitions !== 30 ||
    performanceResult.renderedOpenRows !== 20 || performanceResult.renderedReviewRows !== 8 ||
    performanceResult.reviewPaginationButtons !== 2 || !performanceResult.retentionBoundaryVisible ||
    (enforceReferencePerformance && (performanceResult.openP95Ms >= 100 || performanceResult.actionP95Ms >= 100 || performanceResult.rangeP95Ms >= 100))
  ) failures.push("reference fixture pagination or p95 performance target failed");
  if (!localVideoResult.skipped && (
    !localVideoResult.initial.controlVisible || localVideoResult.initial.checked ||
    localVideoResult.initial.videoBadge !== 'Video' || localVideoResult.initial.mediaKind !== 'video' ||
    localVideoResult.initial.controlHeight < 42 || !localVideoResult.initial.playerInsideViewport ||
    !(localVideoResult.audioOnlyTime > 0) || !localVideoResult.background.active ||
    localVideoResult.background.opacity <= 0 || localVideoResult.background.paused ||
    localVideoResult.background.muted || !localVideoResult.background.scenePaused ||
    localVideoResult.background.saved !== 'background' ||
    localVideoResult.background.currentTime < localVideoResult.audioOnlyTime ||
    localVideoResult.audioOnly.active || localVideoResult.audioOnly.opacity !== 0 ||
    localVideoResult.audioOnly.paused || localVideoResult.audioOnly.saved !== 'audio-only' ||
    localVideoResult.audioOnly.currentTime < localVideoResult.background.currentTime ||
    !localVideoResult.external.paused || localVideoResult.external.active ||
    !localVideoResult.external.controlHidden || !localVideoResult.restoredLocal.paused ||
    !localVideoResult.restoredLocal.controlVisible || !localVideoResult.restoredLocal.errorHidden ||
    localVideoResult.restoredLocal.videoWidth !== 160 || localVideoResult.restoredLocal.videoHeight !== 90
  )) failures.push("local video playback or background/audio-only switching failed");
  if (!finalState.temporaryNoteRemoved) failures.push("temporary smoke-test data was not restored");
  if (exceptions.length > 0) failures.push(`renderer exceptions: ${exceptions.join(", ")}`);

  const report = { baseline, windowFocusResult, shortcutHelpResult, languageSwitchResult, languagePersistenceResult, reducedMotionResult, contrastResult, accessibilityTreeResult, responsiveLayouts, statsResponsiveLayouts, notesBelowBreakpoint, notesAboveBreakpoint, expandableRegionResult, queueResizeConstraintResult, responsiveNotesResult, taskSetupResult, taskPauseResumeResult, taskMutationResult, liveFocusCompletionResult, autoStartedFocusResult, completionDoesNotStopResult, miniMode420, miniMode360, restoredFullMode, runningTimer, lockedPlan, focusPlanResult, sessionHistoryResult, notesResult, drawersResult, showcaseResult, curatedScenesResult, playerResult, playbackSourceResult, lyricsResult, audioTransitionResult, ambienceResult, ambienceRestartResult, expiredRestoreOnce, expiredRestoreTwice, performanceResult: { ...performanceResult, targetEnforced: enforceReferencePerformance }, localVideoResult, finalState, dialogs, exceptions };
  console.log(JSON.stringify(report, null, 2));
  if (failures.length > 0) throw new Error(failures.join("; "));
  console.log("Infinite Lo-Fi UI smoke test passed.");
} finally {
  await stopApp();
  removeSmokeProfile();
}
