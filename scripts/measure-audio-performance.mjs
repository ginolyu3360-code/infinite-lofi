import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const executable = process.argv[2]
  || path.join(projectDirectory, "dist/mac-universal/Infinite Lo-Fi.app/Contents/MacOS/Infinite Lo-Fi");
const sampleCount = Number(process.env.AUDIO_PERF_SAMPLES || 60);
const sampleIntervalMs = Number(process.env.AUDIO_PERF_INTERVAL_MS || 1000);
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function readProcessTree(rootPid) {
  const rows = execFileSync("/bin/ps", ["-axo", "pid=,ppid=,%cpu=,rss="], { encoding: "utf8" })
    .trim()
    .split("\n")
    .map((line) => line.trim().split(/\s+/).map(Number))
    .filter((row) => row.length === 4 && row.every(Number.isFinite));
  const included = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [pid, parentPid] of rows) {
      if (!included.has(pid) && included.has(parentPid)) {
        included.add(pid);
        changed = true;
      }
    }
  }
  const processes = rows.filter(([pid]) => included.has(pid));
  return {
    processCount: processes.length,
    cpuPercent: processes.reduce((sum, row) => sum + row[2], 0),
    rssMiB: processes.reduce((sum, row) => sum + row[3], 0) / 1024
  };
}

async function connect(debugPort, appProcess, readLog) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        const target = targets.find((item) => item.type === "page" && item.title === "Infinite Lo-Fi");
        if (target) {
          const socket = new WebSocket(target.webSocketDebuggerUrl);
          await new Promise((resolve, reject) => {
            socket.addEventListener("open", resolve, { once: true });
            socket.addEventListener("error", reject, { once: true });
          });
          return socket;
        }
      }
    } catch {}
    if (appProcess.exitCode !== null) {
      throw new Error(`Electron exited early with code ${appProcess.exitCode}: ${readLog()}`);
    }
    await delay(200);
  }
  throw new Error(`Timed out waiting for Electron debug target: ${readLog()}`);
}

function createProtocol(socket) {
  let nextId = 1;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  const send = (method, params = {}) => {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  };
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  return { evaluate, send };
}

async function stopApp(appProcess, socket) {
  if (socket.readyState < WebSocket.CLOSING) socket.close();
  if (appProcess.exitCode !== null) return;
  appProcess.kill("SIGINT");
  await Promise.race([
    new Promise((resolve) => appProcess.once("exit", resolve)),
    delay(2000)
  ]);
  if (appProcess.exitCode === null) appProcess.kill("SIGKILL");
}

async function measure(label, withAmbience, runIndex) {
  const profileDirectory = mkdtempSync(path.join(tmpdir(), `infinite-lofi-audio-perf-${runIndex}-`));
  const debugPort = 14_000 + ((process.pid + runIndex) % 10_000);
  const appProcess = spawn(executable, [
    "--enable-logging=stderr",
    "--allow-devtools-for-testing",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileDirectory}`
  ], {
    cwd: projectDirectory,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let appLog = "";
  appProcess.stdout.on("data", (chunk) => { appLog += chunk.toString(); });
  appProcess.stderr.on("data", (chunk) => { appLog += chunk.toString(); });
  let socket;
  try {
    socket = await connect(debugPort, appProcess, () => appLog);
    const protocol = createProtocol(socket);
    await protocol.send("Runtime.enable");
    const playback = await protocol.evaluate(`(async () => {
      document.querySelector("#playPauseBtn").click();
      if (${withAmbience}) {
        const select = document.querySelector("#ambienceSoundSelect");
        select.value = "soft-rain";
        select.dispatchEvent(new Event("change", { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 100));
        document.querySelector("#ambienceToggleBtn").click();
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return {
        musicPlaying: !document.querySelector("#lofiPlayer").paused,
        ambiencePlaying: !document.querySelector("#ambiencePlayer").paused
      };
    })()`);
    if (!playback.musicPlaying || (withAmbience && !playback.ambiencePlaying)) {
      throw new Error(`Playback did not start for ${label}: ${JSON.stringify(playback)}`);
    }
    await delay(5000);
    const samples = [];
    for (let index = 0; index < sampleCount; index += 1) {
      samples.push(readProcessTree(appProcess.pid));
      if (index + 1 < sampleCount) await delay(sampleIntervalMs);
    }
    const resources = await protocol.evaluate(`performance.getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((name) => /^https?:/i.test(name))`);
    const average = (field) => samples.reduce((sum, sample) => sum + sample[field], 0) / samples.length;
    return {
      label,
      sampleCount: samples.length,
      intervalMs: sampleIntervalMs,
      averageCpuPercent: Number(average("cpuPercent").toFixed(2)),
      averageRssMiB: Number(average("rssMiB").toFixed(2)),
      maximumRssMiB: Number(Math.max(...samples.map((sample) => sample.rssMiB)).toFixed(2)),
      maximumProcessCount: Math.max(...samples.map((sample) => sample.processCount)),
      externalResources: resources
    };
  } finally {
    if (socket) await stopApp(appProcess, socket);
    else if (appProcess.exitCode === null) appProcess.kill("SIGINT");
    rmSync(profileDirectory, { recursive: true, force: true });
  }
}

const musicOnly = await measure("music-only", false, 1);
const dualPlayback = await measure("music-plus-ambience", true, 2);
const result = {
  executable,
  measurement: "Summed app-process CPU and RSS sampled by macOS ps after a five-second warm-up.",
  musicOnly,
  dualPlayback,
  incrementalCpuPercentagePoints: Number((dualPlayback.averageCpuPercent - musicOnly.averageCpuPercent).toFixed(2)),
  incrementalAverageRssMiB: Number((dualPlayback.averageRssMiB - musicOnly.averageRssMiB).toFixed(2)),
  targets: {
    incrementalCpuPercentagePointsAtMost: 5,
    incrementalAverageRssMiBAtMost: 50
  }
};

console.log(JSON.stringify(result, null, 2));
if (result.incrementalCpuPercentagePoints > 5 || result.incrementalAverageRssMiB > 50) {
  process.exitCode = 1;
}
