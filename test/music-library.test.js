const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createMusicLibrary } = require("../src/music-library");

test("scans asynchronously with bounded metadata concurrency and cached file artwork", async (t) => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "infinite-lofi-library-"));
  const musicDirectory = path.join(root, "music");
  const cacheDirectory = path.join(root, "cache");
  await fs.promises.mkdir(musicDirectory);
  await Promise.all(
    ["03.mp3", "01.mp3", "02.mp3", "04.mp3"].map((name) =>
      fs.promises.writeFile(path.join(musicDirectory, name), "audio")
    )
  );
  t.after(() => fs.promises.rm(root, { recursive: true, force: true }));

  let activeParsers = 0;
  let maximumActiveParsers = 0;
  let parseCount = 0;
  let cacheDirectoryReads = 0;
  let perArtworkAccessChecks = 0;
  const fileSystem = {
    ...fs.promises,
    async readdir(targetPath, options) {
      if (targetPath === cacheDirectory) cacheDirectoryReads += 1;
      return fs.promises.readdir(targetPath, options);
    },
    async access(...args) {
      perArtworkAccessChecks += 1;
      return fs.promises.access(...args);
    }
  };
  const library = createMusicLibrary({
    artworkCacheDirectory: cacheDirectory,
    concurrency: 2,
    fileSystem,
    parseFile: async () => {
      parseCount += 1;
      activeParsers += 1;
      maximumActiveParsers = Math.max(maximumActiveParsers, activeParsers);
      await new Promise((resolve) => setTimeout(resolve, 10));
      activeParsers -= 1;
      return { common: { picture: [{ format: "image/png", data: Buffer.from("cover") }] } };
    }
  });

  const firstScan = await library.scanFolder(musicDirectory);
  assert.deepEqual(firstScan.map((track) => track.label), ["01", "02", "03", "04"]);
  assert.ok(maximumActiveParsers <= 2);
  assert.equal(parseCount, 4);
  assert.ok(firstScan.every((track) => track.artworkUrl.startsWith("file:")));
  assert.ok(firstScan.every((track) => !track.artworkUrl.startsWith("data:")));

  await library.scanFolder(musicDirectory);
  assert.equal(parseCount, 4);
  assert.equal(cacheDirectoryReads, 2);
  assert.equal(perArtworkAccessChecks, 0);
});

test("uses a sidecar cover while still reading track metadata", async (t) => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "infinite-lofi-sidecar-"));
  await fs.promises.writeFile(path.join(root, "focus.mp3"), "audio");
  await fs.promises.writeFile(path.join(root, "focus.jpg"), "cover");
  t.after(() => fs.promises.rm(root, { recursive: true, force: true }));

  let parseCount = 0;
  const library = createMusicLibrary({
    artworkCacheDirectory: path.join(root, "cache"),
    parseFile: async () => {
      parseCount += 1;
      return { common: { title: "Focus", artist: "Artist" }, format: { duration: 90 } };
    }
  });
  const tracks = await library.scanFolder(root);

  assert.equal(parseCount, 1);
  assert.equal(tracks[0].artworkName, "focus.jpg");
  assert.equal(tracks[0].title, "Focus");
  assert.equal(tracks[0].artist, "Artist");
  assert.equal(tracks[0].duration, 90);
});

test("reads synchronized sidecar lyrics before embedded lyrics", async (t) => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "infinite-lofi-lyrics-"));
  const audioPath = path.join(root, "Artist - Focus.mp3");
  await fs.promises.writeFile(audioPath, "audio");
  await fs.promises.writeFile(path.join(root, "Artist - Focus.lrc"), "[00:01.00]First line\n[00:02.50]Second line");
  t.after(() => fs.promises.rm(root, { recursive: true, force: true }));

  const library = createMusicLibrary({
    artworkCacheDirectory: path.join(root, "cache"),
    parseFile: async () => ({
      common: { lyrics: [{ text: "Embedded fallback" }] },
      format: { duration: 60 }
    })
  });
  const [track] = await library.scanFolder(root);
  const lyrics = await library.getLocalLyrics(track);

  assert.equal(track.title, "Focus");
  assert.equal(track.artist, "Artist");
  assert.equal(lyrics.source, "sidecar");
  assert.equal(lyrics.synced, true);
  assert.deepEqual(lyrics.lines, [
    { time: 1, text: "First line" },
    { time: 2.5, text: "Second line" }
  ]);
});

test("keeps damaged audio entries usable when metadata parsing fails", async (t) => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "infinite-lofi-damaged-audio-"));
  await fs.promises.writeFile(path.join(root, "damaged.mp3"), "not valid audio");
  t.after(() => fs.promises.rm(root, { recursive: true, force: true }));

  const library = createMusicLibrary({
    artworkCacheDirectory: path.join(root, "cache"),
    parseFile: async () => {
      throw new Error("invalid metadata");
    }
  });
  const tracks = await library.scanFolder(root);

  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].label, "damaged");
  assert.equal(tracks[0].artworkUrl, undefined);
});

test("keeps scanning when the optional artwork cache cannot be read", async (t) => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "infinite-lofi-cache-failure-"));
  const musicDirectory = path.join(root, "music");
  const cacheDirectory = path.join(root, "cache");
  await fs.promises.mkdir(musicDirectory);
  await fs.promises.writeFile(path.join(musicDirectory, "focus.mp3"), "audio");
  t.after(() => fs.promises.rm(root, { recursive: true, force: true }));

  const fileSystem = {
    ...fs.promises,
    async readdir(targetPath, options) {
      if (targetPath === cacheDirectory) {
        const error = new Error("cache unavailable");
        error.code = "EACCES";
        throw error;
      }
      return fs.promises.readdir(targetPath, options);
    }
  };
  const library = createMusicLibrary({
    artworkCacheDirectory: cacheDirectory,
    fileSystem,
    parseFile: async () => ({ common: {} })
  });

  const tracks = await library.scanFolder(musicDirectory);
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].label, "focus");
});

test("skips copy-name and metadata duplicates while keeping the highest-quality source", async (t) => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "infinite-lofi-deduplicate-"));
  const files = [
    "Focus.mp3",
    "Focus (1).mp3",
    "studio-low.mp3",
    "studio-high.m4a",
    "studio-live.mp3",
    "other-artist.mp3"
  ];
  await Promise.all(files.map((name) => fs.promises.writeFile(path.join(root, name), "audio")));
  t.after(() => fs.promises.rm(root, { recursive: true, force: true }));

  const library = createMusicLibrary({
    artworkCacheDirectory: path.join(root, "cache"),
    parseFile: async (filePath) => {
      const name = path.basename(filePath);
      if (name.startsWith("Focus")) return { common: {}, format: { duration: 60 } };
      if (name === "other-artist.mp3") {
        return { common: { title: "Studio", artist: "Another Artist" }, format: { bitrate: 256000, duration: 180 } };
      }
      if (name === "studio-live.mp3") {
        return { common: { title: "Studio", artist: "Example Artist" }, format: { bitrate: 320000, duration: 220 } };
      }
      return {
        common: { title: "Studio", artist: "Example Artist" },
        format: {
          bitrate: name === "studio-high.m4a" ? 320000 : 128000,
          duration: name === "studio-high.m4a" ? 181.5 : 180
        }
      };
    }
  });

  const tracks = await library.scanFolder(root);

  assert.equal(tracks.duplicateCount, 2);
  assert.deepEqual(tracks.duplicateKeys.sort(), ["local:Focus (1).mp3", "local:studio-low.mp3"].sort());
  assert.equal(tracks.length, 4);
  assert.ok(tracks.some((track) => track.label === "Focus"));
  assert.ok(!tracks.some((track) => track.label === "Focus (1)"));
  assert.ok(tracks.some((track) => track.label === "studio-high"));
  assert.ok(!tracks.some((track) => track.label === "studio-low"));
  assert.ok(tracks.some((track) => track.label === "studio-live"));
  assert.ok(tracks.some((track) => track.label === "other-artist"));
  assert.ok(tracks.every((track) => !("_dedupe" in track)));
});

test("scans supported video files without deduplicating them against audio", async (t) => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "infinite-lofi-video-library-"));
  await Promise.all([
    fs.promises.writeFile(path.join(root, "Focus.mp3"), "audio"),
    fs.promises.writeFile(path.join(root, "Focus.webm"), "video"),
    fs.promises.writeFile(path.join(root, "Ignored.mkv"), "unsupported")
  ]);
  t.after(() => fs.promises.rm(root, { recursive: true, force: true }));

  const library = createMusicLibrary({
    artworkCacheDirectory: path.join(root, "cache"),
    parseFile: async (filePath) => ({
      common: { title: path.basename(filePath, path.extname(filePath)), artist: "Example Artist" },
      format: { duration: 60 }
    })
  });
  const tracks = await library.scanFolder(root);

  assert.equal(tracks.length, 3);
  assert.equal(tracks.duplicateCount, 0);
  assert.deepEqual(tracks.map((track) => track.mediaKind).sort(), ["audio", "video", "video"]);
  assert.ok(tracks.some((track) => track.relativePath === "Focus.webm"));
  assert.ok(tracks.some((track) => track.relativePath === "Ignored.mkv"));
});
