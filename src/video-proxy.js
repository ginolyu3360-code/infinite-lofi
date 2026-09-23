const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { spawn } = require("node:child_process");

const TRANSCODE_CONFIGURATION = Object.freeze({
  container: "webm",
  videoCodec: "libvpx",
  videoBitrate: "2200k",
  audioCodec: "libopus",
  audioBitrate: "128k",
  maximumWidth: 1920,
  maximumHeight: 1080,
  maximumFps: 30,
  version: 1
});
const MAX_CACHE_FILES = 20;
const MAX_CACHE_BYTES = 5 * 1024 * 1024 * 1024;

function createCacheKey(realPath, stat, configuration = TRANSCODE_CONFIGURATION) {
  return crypto.createHash("sha256").update(JSON.stringify({
    path: realPath,
    size: Number(stat?.size) || 0,
    mtimeMs: Number(stat?.mtimeMs) || 0,
    configuration
  })).digest("hex");
}

function createFfmpegArguments(inputPath, outputPath) {
  return [
    "-hide_banner", "-nostdin", "-y", "-i", inputPath,
    "-map", "0:v:0", "-map", "0:a:0?", "-sn", "-dn",
    "-vf", "scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease,fps=fps=30",
    "-c:v", "libvpx", "-deadline", "good", "-cpu-used", "2", "-b:v", "2200k",
    "-c:a", "libopus", "-b:a", "128k",
    "-map_metadata", "0", "-progress", "pipe:1", "-stats_period", "0.25", "-f", "webm",
    outputPath
  ];
}

function parseClockSeconds(value) {
  const match = String(value || "").match(/(\d+):(\d+):(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : 0;
}

function selectRuntimeEntry(manifest, platform = process.platform, arch = process.arch) {
  const entry = manifest?.runtimes?.find((candidate) => candidate.platform === platform && candidate.arch === arch);
  if (!entry) throw new Error(`No bundled FFmpeg runtime for ${platform}-${arch}.`);
  return entry;
}

async function pruneProxyCache(cacheDirectory, {
  fileSystem = fs.promises,
  maximumFiles = MAX_CACHE_FILES,
  maximumBytes = MAX_CACHE_BYTES,
  preserve = new Set()
} = {}) {
  let entries;
  try {
    entries = await fileSystem.readdir(cacheDirectory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    if (!(typeof entry === "string" || entry.isFile()) || !String(entry.name || entry).endsWith(".webm")) continue;
    const filePath = path.join(cacheDirectory, typeof entry === "string" ? entry : entry.name);
    const stat = await fileSystem.stat(filePath);
    files.push({ filePath, size: stat.size, lastUsed: Math.max(stat.atimeMs || 0, stat.mtimeMs || 0) });
  }
  files.sort((left, right) => right.lastUsed - left.lastUsed);
  let bytes = 0;
  const removed = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    bytes += file.size;
    if ((index >= maximumFiles || bytes > maximumBytes) && !preserve.has(file.filePath)) {
      await fileSystem.rm(file.filePath, { force: true });
      removed.push(file.filePath);
      bytes -= file.size;
    }
  }
  return removed;
}

function createVideoProxyService({
  cacheDirectory,
  ffmpegPath,
  fileSystem = fs.promises,
  spawnProcess = spawn,
  onProgress = () => {}
}) {
  if (!cacheDirectory || !ffmpegPath) throw new TypeError("cacheDirectory and ffmpegPath are required");
  let activeJob = null;

  async function cancel(reason = "cancelled") {
    if (!activeJob) return false;
    const job = activeJob;
    activeJob = null;
    job.cancelled = true;
    job.process.kill("SIGTERM");
    await fileSystem.rm(job.partialPath, { force: true }).catch(() => {});
    onProgress({ jobId: job.jobId, status: "cancelled", reason });
    return true;
  }

  async function prepare(inputPath, { jobId = crypto.randomUUID() } = {}) {
    await cancel("replaced");
    const realPath = await fileSystem.realpath(inputPath);
    const stat = await fileSystem.stat(realPath);
    if (!stat.isFile()) throw Object.assign(new Error("Video is unavailable."), { code: "video-unavailable" });
    await fileSystem.mkdir(cacheDirectory, { recursive: true });
    const cacheKey = createCacheKey(realPath, stat);
    const outputPath = path.join(cacheDirectory, `${cacheKey}.webm`);
    const partialPath = `${outputPath}.partial`;
    try {
      const cachedStat = await fileSystem.stat(outputPath);
      if (cachedStat.isFile() && cachedStat.size > 0) {
        const now = new Date();
        await fileSystem.utimes(outputPath, now, now).catch(() => {});
        onProgress({ jobId, status: "complete", percent: 100, cacheHit: true });
        return { jobId, cacheHit: true, filePath: outputPath, fileUrl: pathToFileURL(outputPath).href };
      }
    } catch {}
    await fileSystem.rm(partialPath, { force: true }).catch(() => {});

    return new Promise((resolve, reject) => {
      let durationSeconds = 0;
      let stdout = "";
      let stderr = "";
      const child = spawnProcess(ffmpegPath, createFfmpegArguments(realPath, partialPath), {
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      });
      const job = { cancelled: false, jobId, partialPath, process: child };
      activeJob = job;
      onProgress({ jobId, status: "preparing", percent: 0, cacheHit: false });

      child.stderr?.on("data", (chunk) => {
        stderr = `${stderr}${chunk}`.slice(-32768);
        const match = stderr.match(/Duration:\s*(\d+:\d+:\d+(?:\.\d+)?)/);
        if (match) durationSeconds = parseClockSeconds(match[1]);
      });
      child.stdout?.on("data", (chunk) => {
        stdout += chunk;
        const lines = stdout.split(/\r?\n/);
        stdout = lines.pop() || "";
        for (const line of lines) {
          const [name, rawValue] = line.split("=", 2);
          if (name !== "out_time_ms" || durationSeconds <= 0) continue;
          const seconds = Number(rawValue) / 1000000;
          const percent = Math.max(0, Math.min(99, Math.floor((seconds / durationSeconds) * 100)));
          onProgress({ jobId, status: "preparing", percent, cacheHit: false });
        }
      });
      child.on("error", async (error) => {
        if (activeJob === job) activeJob = null;
        await fileSystem.rm(partialPath, { force: true }).catch(() => {});
        reject(error);
      });
      child.on("close", async (code) => {
        if (activeJob === job) activeJob = null;
        if (job.cancelled) {
          await fileSystem.rm(partialPath, { force: true }).catch(() => {});
          return reject(Object.assign(new Error("Video preparation was cancelled."), { code: "cancelled" }));
        }
        if (code !== 0) {
          await fileSystem.rm(partialPath, { force: true }).catch(() => {});
          return reject(Object.assign(new Error(`FFmpeg failed with exit code ${code}.`), { code: "transcode-failed", detail: stderr.slice(-2000) }));
        }
        try {
          await fileSystem.rename(partialPath, outputPath);
          await pruneProxyCache(cacheDirectory, { fileSystem, preserve: new Set([outputPath]) });
          onProgress({ jobId, status: "complete", percent: 100, cacheHit: false });
          resolve({ jobId, cacheHit: false, filePath: outputPath, fileUrl: pathToFileURL(outputPath).href });
        } catch (error) {
          await fileSystem.rm(partialPath, { force: true }).catch(() => {});
          reject(error);
        }
      });
    });
  }

  async function clearCache() {
    await cancel("cache-cleared");
    await fileSystem.rm(cacheDirectory, { recursive: true, force: true });
    await fileSystem.mkdir(cacheDirectory, { recursive: true });
  }

  return { cancel, clearCache, prepare };
}

module.exports = {
  MAX_CACHE_BYTES,
  MAX_CACHE_FILES,
  TRANSCODE_CONFIGURATION,
  createCacheKey,
  createFfmpegArguments,
  createVideoProxyService,
  parseClockSeconds,
  pruneProxyCache,
  selectRuntimeEntry
};
