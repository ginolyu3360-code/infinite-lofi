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
  const library = createMusicLibrary({
    artworkCacheDirectory: cacheDirectory,
    concurrency: 2,
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
});

test("uses a sidecar cover without parsing embedded metadata", async (t) => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "infinite-lofi-sidecar-"));
  await fs.promises.writeFile(path.join(root, "focus.mp3"), "audio");
  await fs.promises.writeFile(path.join(root, "focus.jpg"), "cover");
  t.after(() => fs.promises.rm(root, { recursive: true, force: true }));

  let parseCount = 0;
  const library = createMusicLibrary({
    artworkCacheDirectory: path.join(root, "cache"),
    parseFile: async () => {
      parseCount += 1;
      return {};
    }
  });
  const tracks = await library.scanFolder(root);

  assert.equal(parseCount, 0);
  assert.equal(tracks[0].artworkName, "focus.jpg");
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
