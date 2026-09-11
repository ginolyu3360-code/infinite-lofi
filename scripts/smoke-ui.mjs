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
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.enable");
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
  const miniMode420 = await evaluate(`(() => ({
    enabled: document.body.classList.contains('is-mini-mode'),
    width: innerWidth,
    height: innerHeight,
    timerOverflow: document.querySelector('#timerContent').scrollHeight - document.querySelector('#timerContent').clientHeight,
    fullLabel: document.querySelector('#miniModeToggleBtn').textContent.trim(),
    notesHidden: getComputedStyle(document.querySelector('#notesPanel')).display === 'none',
    editorHidden: getComputedStyle(document.querySelector('#tasksDrawer')).display === 'none'
  }))()`);
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
    const ids = ['timerDisplay', 'timerToggle', 'timerReset', 'playPauseBtn', 'miniModeToggleBtn', 'timerIntentSummary'];
    const tolerance = 4;
    const controls = Object.fromEntries(ids.map((id) => {
      const rect = document.getElementById(id).getBoundingClientRect();
      return [id, {
        visible: rect.width > 0 && rect.height > 0,
        inside: rect.left >= -tolerance && rect.right <= innerWidth + tolerance && rect.top >= -tolerance && rect.bottom <= innerHeight + tolerance
      }];
    }));
    const intention = document.querySelector('#timerIntentValue');
    return {
      width: innerWidth,
      height: innerHeight,
      timerOverflow: document.querySelector('#timerContent').scrollHeight - document.querySelector('#timerContent').clientHeight,
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
    await new Promise((resolve) => setTimeout(resolve, 100));
    const moss = {
      enabled: document.body.classList.contains('theme-moss'),
      midnightRemoved: !document.body.classList.contains('theme-midnight'),
      pressed: document.querySelector('#bgMossBtn').getAttribute('aria-pressed'),
      saved: readSavedPreset(),
      intentionColor: getComputedStyle(document.querySelector('#timerIntentValue')).color
    };

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
    await new Promise((resolve) => setTimeout(resolve, 100));
    const studio = {
      cleanTheme: !document.body.classList.contains('theme-midnight') && !document.body.classList.contains('theme-moss') && !document.body.classList.contains('bg-white-background'),
      pressed: document.querySelector('#bgBlackBtn').getAttribute('aria-pressed'),
      saved: readSavedPreset(),
      intentionColor: getComputedStyle(document.querySelector('#timerIntentValue')).color
    };
    return { midnight, moss, paper, studio };
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
    const state = JSON.parse(localStorage.getItem('infiniteLofiState'));
    const result = {
      fixtureTasks: state.tasks.items.length,
      fixtureSessions: state.stats.focusSessions.length,
      repetitions: 30,
      renderedOpenRows: document.querySelectorAll('#openTasksList .task-row').length,
      openP95Ms: percentile95(openDurations),
      actionP95Ms: percentile95(actionDurations),
      openMaxMs: Math.max(...openDurations),
      actionMaxMs: Math.max(...actionDurations)
    };
    document.querySelector('#tasksCloseBtn').click();
    return result;
  })()`);

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
  if (!accessibilityTreeResult.namedFocusPlanDialog || !accessibilityTreeResult.namedTasksDialog || !accessibilityTreeResult.liveStatusPresent) {
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
  if (!miniMode420.enabled || miniMode420.width > 480 || miniMode420.height > 280 || miniMode420.timerOverflow > 4 || miniMode420.fullLabel !== "Full" || !miniMode420.notesHidden || !miniMode420.editorHidden) {
    failures.push("Mini Mode layout or window sizing failed");
  }
  if (
    miniMode360.width > 360 || miniMode360.height > 200 || miniMode360.timerOverflow > 4 || miniMode360.timer !== "360:00" ||
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
    sessionHistoryResult.comparison !== "New"
  ) failures.push("session history editing or trend summaries failed");
  if (notesResult.after !== notesResult.before + 1 || !notesResult.accepted) failures.push("notes interaction failed");
  if (!drawersResult.statsVisible || !drawersResult.statsFocused || !drawersResult.statsFocusRestored || !drawersResult.backgroundVisible || !drawersResult.backgroundFocused || !drawersResult.backgroundFocusRestored) failures.push("drawer interaction or focus restoration failed");
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
  if (
    playerResult.pausedAfterClick ||
    !playerResult.source ||
    playerResult.queueLength !== 3 ||
    !playerResult.activeTrackKey.startsWith('builtin:') ||
    !playerResult.mediaSessionSupported ||
    !playerResult.mediaSessionTitle ||
    playerResult.mediaPlaybackState !== 'playing'
  ) failures.push("playlist persistence or native media session failed");
  if (
    expiredRestoreOnce.count !== 1 || expiredRestoreOnce.taskId !== "task-deleted-smoke" ||
    expiredRestoreOnce.taskTitle !== "Deleted task snapshot" ||
    expiredRestoreOnce.completedAt !== new Date(expiredSeedResult.deadlineMs).toISOString() ||
    expiredRestoreOnce.phase !== "shortBreak" || expiredRestoreOnce.isRunning || expiredRestoreOnce.focusSession !== null ||
    expiredRestoreTwice.count !== 1 || expiredRestoreTwice.phase !== "shortBreak" || expiredRestoreTwice.isRunning
  ) failures.push("expired focus recovery did not attribute and record exactly once");
  if (
    performanceResult.fixtureTasks !== 100 || performanceResult.fixtureSessions !== 5000 || performanceResult.repetitions !== 30 ||
    performanceResult.renderedOpenRows !== 20 || performanceResult.openP95Ms >= 100 || performanceResult.actionP95Ms >= 100
  ) failures.push("reference fixture pagination or p95 performance target failed");
  if (!finalState.temporaryNoteRemoved) failures.push("temporary smoke-test data was not restored");
  if (exceptions.length > 0) failures.push(`renderer exceptions: ${exceptions.join(", ")}`);

  const report = { baseline, shortcutHelpResult, reducedMotionResult, contrastResult, accessibilityTreeResult, responsiveLayouts, notesBelowBreakpoint, notesAboveBreakpoint, expandableRegionResult, responsiveNotesResult, taskSetupResult, taskPauseResumeResult, taskMutationResult, liveFocusCompletionResult, autoStartedFocusResult, completionDoesNotStopResult, miniMode420, miniMode360, restoredFullMode, runningTimer, lockedPlan, focusPlanResult, sessionHistoryResult, notesResult, drawersResult, curatedScenesResult, playerResult, expiredRestoreOnce, expiredRestoreTwice, performanceResult, finalState, dialogs, exceptions };
  console.log(JSON.stringify(report, null, 2));
  if (failures.length > 0) throw new Error(failures.join("; "));
  console.log("Infinite Lo-Fi UI smoke test passed.");
} finally {
  stopApp();
}
