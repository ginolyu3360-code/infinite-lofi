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
      return {
        width: innerWidth,
        height: innerHeight,
        timerOverflow: timerContent.scrollHeight - timerContent.clientHeight,
        cardInsideViewport: cardRect.left >= 0 && cardRect.right <= innerWidth + 1 && cardRect.top >= 0,
        playerInsideViewport: playerRect.left >= 0 && playerRect.right <= innerWidth + 1 && playerRect.bottom <= innerHeight + 1,
        headerActionsInsideViewport: headerActionsRect.left >= 0 && headerActionsRect.right <= innerWidth + 1,
        timerButtonHeight: timerButton.getBoundingClientRect().height
      };
    })()`);
  }

  async function waitForLayoutState() {
    let state;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      state = await readLayoutState();
      if (
        state.timerOverflow <= 1 &&
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
        'timerPlanStatus', 'todayGoalProgress', 'todayGoalBar'
      ].every((id) => Boolean(document.getElementById(id)))
    };
  })()`);

  const shortcutHelpResult = await evaluate(`(() => {
    document.querySelector('#shortcutHelpBtn').click();
    const openedFromButton = !document.querySelector('#shortcutHelpOverlay').classList.contains('hidden');
    document.querySelector('#shortcutHelpCloseBtn').click();
    return {
      openedFromButton,
      closedFromButton: document.querySelector('#shortcutHelpOverlay').classList.contains('hidden')
    };
  })()`);

  const responsiveLayouts = [];
  for (const [width, height] of [[720, 520], [800, 600], [1440, 900], [1100, 760]]) {
    await setWindowSize(width, height);
    responsiveLayouts.push(await waitForLayoutState());
  }

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
    button: document.querySelector('#timerToggle').textContent.trim()
  }))()`);
  const lockedPlan = await evaluate(`(() => {
    document.querySelector('#focusPlanToggleBtn').click();
    const result = {
      opened: document.querySelector('#focusPlanDrawer').classList.contains('is-open'),
      inputDisabled: document.querySelector('#focusMinutesInput').disabled,
      hint: document.querySelector('#focusPlanLockHint').textContent.trim()
    };
    document.querySelector('#focusPlanCloseBtn').click();
    return result;
  })()`);
  await evaluate("document.querySelector('#timerToggle').click(); document.querySelector('#timerReset').click(); true");

  const focusPlanResult = await evaluate(`(async () => {
    document.querySelector('#focusPlanToggleBtn').click();
    await new Promise((resolve) => setTimeout(resolve, 260));
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
    const drawerRect = document.querySelector('#focusPlanDrawer').getBoundingClientRect();
    document.querySelector('#focusPlanApplyBtn').click();
    const state = JSON.parse(localStorage.getItem('infiniteLofiState'));
    return {
      drawerClosed: !document.querySelector('#focusPlanDrawer').classList.contains('is-open'),
      drawerInsideViewport: drawerRect.left >= 0 && drawerRect.right <= innerWidth + 1 && drawerRect.top >= 0 && drawerRect.bottom <= innerHeight + 1,
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

  const drawersResult = await evaluate(`(() => {
    const visible = (selector) => getComputedStyle(document.querySelector(selector)).display !== 'none';
    document.querySelector('#statsToggleBtn').click();
    const statsVisible = visible('#statsDrawer');
    document.querySelector('#statsCloseBtn').click();
    document.querySelector('#bgToggleBtn').click();
    const backgroundVisible = visible('#backgroundDrawer');
    document.querySelector('#backgroundCloseBtn').click();
    return { statsVisible, backgroundVisible };
  })()`);

  const whiteSceneResult = await evaluate(`(async () => {
    document.querySelector('#bgWhiteBtn').click();
    await new Promise((resolve) => setTimeout(resolve, 320));
    const result = {
      enabled: document.body.classList.contains('bg-white-background'),
      timerColor: getComputedStyle(document.querySelector('#timerDisplay')).color,
      panelBackground: getComputedStyle(document.querySelector('#timerCard')).backgroundImage
    };
    document.querySelector('#bgBlackBtn').click();
    await new Promise((resolve) => setTimeout(resolve, 320));
    return result;
  })()`);

  const playerResult = await evaluate(`(async () => {
    const player = document.querySelector('#lofiPlayer');
    document.querySelector('#playPauseBtn').click();
    await new Promise((resolve) => setTimeout(resolve, 250));
    const result = { source: player.currentSrc || player.src, pausedAfterClick: player.paused };
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
  if (!shortcutHelpResult.openedFromButton || !shortcutHelpResult.closedFromButton) failures.push("shortcut help entry point failed");
  if (responsiveLayouts.some((layout) => layout.timerOverflow > 1 || !layout.cardInsideViewport || !layout.playerInsideViewport || !layout.headerActionsInsideViewport || layout.timerButtonHeight < 42)) {
    failures.push("responsive full-window layout overflowed or exposed undersized controls");
  }
  if (!miniMode.enabled || miniMode.width > 480 || miniMode.height > 280 || miniMode.timerOverflow > 1 || miniMode.fullLabel !== "Full" || !miniMode.notesHidden) {
    failures.push("Mini Mode layout or window sizing failed");
  }
  if (restoredFullMode.enabled || restoredFullMode.width < 700 || restoredFullMode.height < 500 || restoredFullMode.miniLabel !== "Mini") {
    failures.push("full-window bounds were not restored after Mini Mode");
  }
  if (runningTimer.button !== "Pause" || parseTimer(runningTimer.timer) >= parseTimer(baseline.timer)) failures.push("timer did not count down");
  if (!lockedPlan.opened || !lockedPlan.inputDisabled || !lockedPlan.hint.includes("Pause")) failures.push("running timer did not lock Focus Plan settings");
  if (
    !focusPlanResult.drawerClosed ||
    !focusPlanResult.drawerInsideViewport ||
    focusPlanResult.timer !== "30:00" ||
    !focusPlanResult.summary.includes("30 / 7 / 20") ||
    !focusPlanResult.status.includes("Today 0 / 90m") ||
    focusPlanResult.schemaVersion !== 2 ||
    focusPlanResult.timerSettings.shortBreakSeconds !== 420 ||
    focusPlanResult.timerSettings.longBreakSeconds !== 1200 ||
    focusPlanResult.timerSettings.focusSessionsPerLongBreak !== 3 ||
    focusPlanResult.timerSettings.autoStartBreaks !== false ||
    focusPlanResult.dailyGoalSeconds !== 5400 ||
    focusPlanResult.goalProgressMax !== "90" ||
    focusPlanResult.runtime.completedFocusesInCycle !== 0
  ) failures.push("Focus Plan settings did not apply and persist");
  if (notesResult.after !== notesResult.before + 1 || !notesResult.accepted) failures.push("notes interaction failed");
  if (!drawersResult.statsVisible || !drawersResult.backgroundVisible) failures.push("drawer interaction failed");
  if (!whiteSceneResult.enabled || whiteSceneResult.timerColor !== "rgb(39, 37, 32)" || whiteSceneResult.panelBackground === "none") {
    failures.push("White Scene theme adaptation failed");
  }
  if (playerResult.pausedAfterClick || !playerResult.source) failures.push("audio playback failed");
  if (!finalState.temporaryNoteRemoved) failures.push("temporary smoke-test data was not restored");
  if (exceptions.length > 0) failures.push(`renderer exceptions: ${exceptions.join(", ")}`);

  const report = { baseline, shortcutHelpResult, responsiveLayouts, miniMode, restoredFullMode, runningTimer, lockedPlan, focusPlanResult, notesResult, drawersResult, whiteSceneResult, playerResult, finalState, exceptions };
  console.log(JSON.stringify(report, null, 2));
  if (failures.length > 0) throw new Error(failures.join("; "));
  console.log("Infinite Lo-Fi UI smoke test passed.");
} finally {
  stopApp();
}
