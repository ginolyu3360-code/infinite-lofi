import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const connectArgumentIndex = process.argv.indexOf("--connect");
const connectOnly = connectArgumentIndex >= 0;
const requestedPort = connectOnly ? Number(process.argv[connectArgumentIndex + 1]) : NaN;
const packagedExecutable = connectOnly ? "" : (process.argv[2] || "");
const debugPort = Number.isInteger(requestedPort) ? requestedPort : 10_000 + (process.pid % 20_000);
const executable = packagedExecutable || path.join(projectDirectory, "node_modules", ".bin", "electron");
const smokeUserDataDirectory = connectOnly
  ? ""
  : mkdtempSync(path.join(tmpdir(), "infinite-lofi-smoke-profile-"));
const launchArguments = packagedExecutable
  ? ["--enable-logging=stderr", "--allow-devtools-for-testing", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${smokeUserDataDirectory}`]
  : [`--remote-debugging-port=${debugPort}`, `--user-data-dir=${smokeUserDataDirectory}`, "."];
const appProcess = connectOnly ? null : spawn(executable, launchArguments, {
    cwd: projectDirectory,
    stdio: ["ignore", "pipe", "pipe"]
  });

let appLog = "";
let socket;
let profileRemoved = false;
appProcess?.stdout.on("data", (chunk) => { appLog += chunk.toString(); });
appProcess?.stderr.on("data", (chunk) => { appLog += chunk.toString(); });

function stopApp() {
  if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
  if (appProcess && appProcess.exitCode === null) appProcess.kill("SIGINT");
}

function removeSmokeProfile() {
  if (profileRemoved || !smokeUserDataDirectory) return;
  profileRemoved = true;
  rmSync(smokeUserDataDirectory, { recursive: true, force: true });
}

appProcess?.once("exit", removeSmokeProfile);
process.on("exit", () => {
  stopApp();
  removeSmokeProfile();
});
process.on("SIGINT", () => {
  stopApp();
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
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") {
      exceptions.push(message.params.exceptionDetails.text);
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
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }

  await send("Runtime.enable");
  async function setWindowSize(width, height) {
    await evaluate("window.moveTo(0, 0); true");
    await evaluate(`window.resizeTo(${width}, ${height}); true`);
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
      const viewportTolerance = 4;
      return {
        width: innerWidth,
        height: innerHeight,
        timerOverflow: timerContent.scrollHeight - timerContent.clientHeight,
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
        state.timerOverflow <= 4 &&
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
  await evaluate("window.__smokeStorageBackup = JSON.stringify(Object.entries(localStorage)); true");

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
        'miniModeToggleBtn', 'notesToggleBtn', 'notesCloseBtn', 'shortcutHelpBtn',
        'focusPlanToggleBtn', 'focusPlanDrawer', 'focusPlanApplyBtn',
        'shortBreakMinutesInput', 'longBreakMinutesInput', 'focusSessionsInput',
        'autoStartBreaksInput', 'autoStartFocusInput', 'dailyGoalMinutesInput',
        'timerPlanStatus', 'todayGoalProgress', 'todayGoalBar',
        'statsActiveDaysValue', 'statsStreakValue', 'statsComparisonValue',
        'sessionHistoryDateInput', 'sessionHistoryMinutesInput',
        'sessionHistoryAddBtn', 'sessionHistoryList', 'sessionHistoryCount',
        'playlistStatus', 'rescanMusicFolderBtn', 'removeMissingTracksBtn',
        'useDefaultTracksBtn', 'a11yStatus'
      ].every((id) => Boolean(document.getElementById(id)))
    };
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
      lightPrimary: ['#fffaf1', '#9f6325']
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

  const responsiveLayouts = [];
  for (const [width, height] of [[720, 520], [800, 600], [1024, 677], [1440, 900], [1100, 760]]) {
    await setWindowSize(width, height);
    responsiveLayouts.push(await waitForLayoutState());
  }

  const expandableRegionResult = await evaluate(`(async () => {
    const queueTrigger = document.querySelector('#playlistToggleBtn');
    queueTrigger.focus();
    queueTrigger.click();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const queueFocused = document.activeElement?.classList.contains('playlist-item');
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    const queueClosed = document.querySelector('#playlistPanel').classList.contains('hidden');
    const queueFocusRestored = document.activeElement === queueTrigger;
    return { queueFocused, queueClosed, queueFocusRestored };
  })()`);

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

  await evaluate("document.querySelector('#miniModeToggleBtn').click(); true");
  await delay(800);
  const miniMode = await evaluate(`(() => ({
    enabled: document.body.classList.contains('is-mini-mode'),
    width: innerWidth,
    height: innerHeight,
    timerOverflow: document.querySelector('#timerContent').scrollHeight - document.querySelector('#timerContent').clientHeight,
    fullLabel: document.querySelector('#miniModeToggleBtn').textContent.trim(),
    notesHidden: getComputedStyle(document.querySelector('#notesPanel')).display === 'none'
  }))()`);
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
    const firstRow = document.querySelector('#sessionHistoryList .session-history-row');
    const minutesInput = firstRow?.querySelector('input[type="number"]');
    if (minutesInput) minutesInput.value = '40';
    firstRow?.querySelector('.stats-export-btn')?.click();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const state = JSON.parse(localStorage.getItem('infiniteLofiState'));
    const manual = state.stats.focusSessions.find((session) => session.source === 'manual');
    const result = {
      schemaVersion: state.schemaVersion,
      sessionCount: state.stats.focusSessions.length,
      manualMinutes: manual ? Math.round(manual.focusSeconds / 60) : 0,
      derivedTodayMinutes: Math.round((state.stats.focusRows.find((row) => row.day === day)?.focusSeconds || 0) / 60),
      renderedRows: document.querySelectorAll('#sessionHistoryList .session-history-row').length,
      countLabel: document.querySelector('#sessionHistoryCount').textContent.trim(),
      activeDays: document.querySelector('#statsActiveDaysValue').textContent.trim(),
      comparison: document.querySelector('#statsComparisonValue').textContent.trim()
    };
    document.querySelector('#statsCloseBtn').click();
    return result;
  })()`);

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
    document.querySelector('#statsCloseBtn').click();
    const statsFocusRestored = document.activeElement === statsTrigger;
    const sceneTrigger = document.querySelector('#bgToggleBtn');
    sceneTrigger.focus();
    sceneTrigger.click();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const backgroundVisible = visible('#backgroundDrawer');
    const backgroundFocused = document.activeElement?.id === 'backgroundCloseBtn';
    document.querySelector('#backgroundCloseBtn').click();
    const backgroundFocusRestored = document.activeElement === sceneTrigger;
    return { statsVisible, statsFocused, statsFocusRestored, backgroundVisible, backgroundFocused, backgroundFocusRestored };
  })()`);

  const whiteSceneResult = await evaluate(`(async () => {
    document.querySelector('#bgWhiteBtn').click();
    let result;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      result = {
        enabled: document.body.classList.contains('bg-white-background'),
        timerColor: getComputedStyle(document.querySelector('#timerDisplay')).color,
        panelBackground: getComputedStyle(document.querySelector('#timerCard')).backgroundImage
      };
      if (result.enabled && result.timerColor === 'rgb(39, 37, 32)' && result.panelBackground !== 'none') break;
    }
    document.querySelector('#bgBlackBtn').click();
    await new Promise((resolve) => setTimeout(resolve, 100));
    return result;
  })()`);

  const playerResult = await evaluate(`(async () => {
    const player = document.querySelector('#lofiPlayer');
    document.querySelector('#playPauseBtn').click();
    await new Promise((resolve) => setTimeout(resolve, 250));
    const state = JSON.parse(localStorage.getItem('infiniteLofiState'));
    const result = {
      source: player.currentSrc || player.src,
      pausedAfterClick: player.paused,
      queueLength: state.player.queue.length,
      activeTrackKey: state.player.activeTrackKey,
      mediaSessionSupported: Boolean(navigator.mediaSession),
      mediaSessionTitle: navigator.mediaSession?.metadata?.title || '',
      mediaPlaybackState: navigator.mediaSession?.playbackState || 'none'
    };
    player.pause();
    return result;
  })()`);

  await evaluate(`(() => {
    const backup = JSON.parse(window.__smokeStorageBackup || '[]');
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
  if (baseline.readyState !== "complete" || !baseline.requiredElementsPresent) failures.push("required UI did not initialize");
  if (!baseline.localFontsReady || baseline.remoteStylesheetCount !== 0) failures.push("local fonts did not initialize offline");
  if (
    !shortcutHelpResult.openedFromButton ||
    shortcutHelpResult.focusedOnOpen !== "shortcutHelpCloseBtn" ||
    !shortcutHelpResult.tabWrappedToFirst ||
    !shortcutHelpResult.closedFromButton ||
    !shortcutHelpResult.hiddenFromAccessibilityTree ||
    !shortcutHelpResult.focusRestored
  ) failures.push("shortcut help focus management failed");
  if (!reducedMotionResult.matches || reducedMotionResult.backgroundTransitionMs > 0.1 || reducedMotionResult.drawerTransitionMs > 0.1) {
    failures.push("reduced-motion preference did not suppress transitions");
  }
  if (Object.values(contrastResult).some((ratio) => !Number.isFinite(ratio) || ratio < 4.5)) {
    failures.push("core dark or light theme text contrast fell below WCAG AA");
  }
  if (!accessibilityTreeResult.namedFocusPlanDialog || !accessibilityTreeResult.liveStatusPresent) {
    failures.push("dialog or live status was missing from the accessibility tree");
  }
  if (!expandableRegionResult.queueFocused || !expandableRegionResult.queueClosed || !expandableRegionResult.queueFocusRestored) {
    failures.push("playlist disclosure focus management failed");
  }
  if (!responsiveNotesResult.focusedOnOpen || !responsiveNotesResult.hiddenAfterEscape || !responsiveNotesResult.focusRestored) {
    failures.push("responsive notes focus management failed");
  }
  if (responsiveLayouts.some((layout) => layout.timerOverflow > 4 || !layout.cardInsideViewport || !layout.playerInsideViewport || !layout.headerActionsInsideViewport || layout.timerButtonHeight < 42)) {
    failures.push("responsive full-window layout overflowed or exposed undersized controls");
  }
  if (!miniMode.enabled || miniMode.width > 480 || miniMode.height > 280 || miniMode.timerOverflow > 4 || miniMode.fullLabel !== "Full" || !miniMode.notesHidden) {
    failures.push("Mini Mode layout or window sizing failed");
  }
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
    !focusPlanResult.status.includes("Today 0 / 90m") ||
    focusPlanResult.schemaVersion !== 4 ||
    focusPlanResult.timerSettings.shortBreakSeconds !== 420 ||
    focusPlanResult.timerSettings.longBreakSeconds !== 1200 ||
    focusPlanResult.timerSettings.focusSessionsPerLongBreak !== 3 ||
    focusPlanResult.timerSettings.autoStartBreaks !== false ||
    focusPlanResult.dailyGoalSeconds !== 5400 ||
    focusPlanResult.goalProgressMax !== "90" ||
    focusPlanResult.runtime.completedFocusesInCycle !== 0
  ) failures.push("Focus Plan settings did not apply and persist");
  if (
    sessionHistoryResult.schemaVersion !== 4 ||
    sessionHistoryResult.sessionCount !== 1 ||
    sessionHistoryResult.manualMinutes !== 40 ||
    sessionHistoryResult.derivedTodayMinutes !== 40 ||
    sessionHistoryResult.renderedRows !== 1 ||
    !sessionHistoryResult.countLabel.startsWith("1 ") ||
    !sessionHistoryResult.activeDays.startsWith("1 ") ||
    sessionHistoryResult.comparison !== "New"
  ) failures.push("session history editing or trend summaries failed");
  if (notesResult.after !== notesResult.before + 1 || !notesResult.accepted) failures.push("notes interaction failed");
  if (!drawersResult.statsVisible || !drawersResult.statsFocused || !drawersResult.statsFocusRestored || !drawersResult.backgroundVisible || !drawersResult.backgroundFocused || !drawersResult.backgroundFocusRestored) failures.push("drawer interaction or focus restoration failed");
  if (!whiteSceneResult.enabled || whiteSceneResult.timerColor !== "rgb(39, 37, 32)" || whiteSceneResult.panelBackground === "none") {
    failures.push("White Scene theme adaptation failed");
  }
  if (
    playerResult.pausedAfterClick ||
    !playerResult.source ||
    playerResult.queueLength !== 3 ||
    !playerResult.activeTrackKey.startsWith('builtin:') ||
    !playerResult.mediaSessionSupported ||
    !playerResult.mediaSessionTitle ||
    playerResult.mediaPlaybackState !== 'playing'
  ) failures.push("playlist persistence or native media session failed");
  if (!finalState.temporaryNoteRemoved) failures.push("temporary smoke-test data was not restored");
  if (exceptions.length > 0) failures.push(`renderer exceptions: ${exceptions.join(", ")}`);

  const report = { baseline, shortcutHelpResult, reducedMotionResult, contrastResult, accessibilityTreeResult, responsiveLayouts, expandableRegionResult, responsiveNotesResult, miniMode, restoredFullMode, runningTimer, lockedPlan, focusPlanResult, sessionHistoryResult, notesResult, drawersResult, whiteSceneResult, playerResult, finalState, exceptions };
  console.log(JSON.stringify(report, null, 2));
  if (failures.length > 0) throw new Error(failures.join("; "));
  console.log("Infinite Lo-Fi UI smoke test passed.");
} finally {
  stopApp();
}
