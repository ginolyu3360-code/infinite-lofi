const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const {
  createCacheKey,
  createFfmpegArguments,
  createVideoProxyService,
  pruneProxyCache,
  selectRuntimeEntry
} = require("../src/video-proxy");

test("video cache keys include path, size, mtime and transcode configuration", () => {
  const base = createCacheKey("/movie.mkv", { size: 10, mtimeMs: 20 });
  assert.notEqual(base, createCacheKey("/movie.mkv", { size: 11, mtimeMs: 20 }));
  assert.notEqual(base, createCacheKey("/movie.mkv", { size: 10, mtimeMs: 21 }));
  assert.notEqual(base, createCacheKey("/movie.mkv", { size: 10, mtimeMs: 20 }, { version: 2 }));
});

test("FFmpeg uses argument arrays, first streams, no subtitles and bounded VP8/Opus output", () => {
  const args = createFfmpegArguments("a weird;name.mkv", "out.partial");
  assert.equal(args.includes("a weird;name.mkv"), true);
  assert.deepEqual(args.slice(args.indexOf("-map"), args.indexOf("-sn")), ["-map", "0:v:0", "-map", "0:a:0?"]);
  assert.equal(args.includes("-sn"), true);
  assert.equal(args[args.indexOf("-c:v") + 1], "libvpx");
  assert.equal(args[args.indexOf("-c:a") + 1], "libopus");
  assert.match(args[args.indexOf("-vf") + 1], /1920.*1080.*fps=30/);
});

test("runtime selection is exact by platform and architecture", () => {
  const manifest = { runtimes: [{ platform: "darwin", arch: "arm64", file: "ffmpeg" }] };
  assert.equal(selectRuntimeEntry(manifest, "darwin", "arm64").file, "ffmpeg");
  assert.throws(() => selectRuntimeEntry(manifest, "win32", "x64"), /No bundled/);
});

test("proxy cache prunes least-recently-used files by count", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "proxy-cache-"));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  for (let index = 0; index < 3; index += 1) {
    const filePath = path.join(directory, `${index}.webm`);
    await fs.writeFile(filePath, Buffer.alloc(10));
    const date = new Date(1000 + index * 1000);
    await fs.utimes(filePath, date, date);
  }
  const removed = await pruneProxyCache(directory, { maximumFiles: 2, maximumBytes: 100 });
  assert.deepEqual(removed.map((entry) => path.basename(entry)), ["0.webm"]);
});

test("cancelling a transcode terminates the process and removes partial output", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "proxy-cancel-"));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const inputPath = path.join(directory, "input.avi");
  await fs.writeFile(inputPath, "fixture");
  let child;
  const progress = [];
  const service = createVideoProxyService({
    cacheDirectory: path.join(directory, "cache"),
    ffmpegPath: "/bundled/ffmpeg",
    onProgress: (event) => progress.push(event),
    spawnProcess: (_command, args) => {
      child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = () => { setImmediate(() => child.emit("close", null)); return true; };
      fsSync.writeFileSync(args.at(-1), "partial");
      return child;
    }
  });
  const preparation = service.prepare(inputPath, { jobId: "job-1" });
  const rejection = assert.rejects(preparation, { code: "cancelled" });
  while (!child) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(await service.cancel("test"), true);
  await rejection;
  assert.equal(progress.some((event) => event.status === "cancelled"), true);
  const cacheEntries = await fs.readdir(path.join(directory, "cache"));
  assert.deepEqual(cacheEntries, []);
});
