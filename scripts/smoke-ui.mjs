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
        'weatherApplyBtn', 'weatherPrivacyHint', 'bgCoverBtn'
      ].every((id) => Boolean(document.getElementById(id)))
    };
  })()`);

  await evaluate("document.querySelector('#timerToggle').click(); true");
  await delay(1_300);
  const runningTimer = await evaluate(`(() => ({
    timer: document.querySelector('#timerDisplay').textContent.trim(),
    button: document.querySelector('#timerToggle').textContent.trim()
  }))()`);
  await evaluate("document.querySelector('#timerToggle').click(); document.querySelector('#timerReset').click(); true");

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
  if (runningTimer.button !== "Pause" || parseTimer(runningTimer.timer) >= parseTimer(baseline.timer)) failures.push("timer did not count down");
  if (notesResult.after !== notesResult.before + 1 || !notesResult.accepted) failures.push("notes interaction failed");
  if (!drawersResult.statsVisible || !drawersResult.backgroundVisible) failures.push("drawer interaction failed");
  if (playerResult.pausedAfterClick || !playerResult.source) failures.push("audio playback failed");
  if (!finalState.temporaryNoteRemoved) failures.push("temporary smoke-test data was not restored");
  if (exceptions.length > 0) failures.push(`renderer exceptions: ${exceptions.join(", ")}`);

  const report = { baseline, runningTimer, notesResult, drawersResult, playerResult, finalState, exceptions };
  console.log(JSON.stringify(report, null, 2));
  if (failures.length > 0) throw new Error(failures.join("; "));
  if (appProcess) {
    const exitResult = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Quit App did not exit Electron")), 5_000);
      appProcess.once("exit", (code, signal) => {
        clearTimeout(timeout);
        if (code === 0) resolve();
        else reject(new Error(`Quit App exited unexpectedly (code ${code}, signal ${signal || "none"})`));
      });
    });
    await evaluate("document.querySelector('#windowCloseBtn').click(); true");
    await exitResult;
  }
  console.log("Infinite Lo-Fi UI smoke test passed.");
} finally {
  stopApp();
}
