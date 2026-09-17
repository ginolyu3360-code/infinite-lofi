const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createLyricsService, normalizeQuery } = require("../src/lyrics-service");

test("prefers local lyrics without contacting the online service", async () => {
  let fetched = false;
  const service = createLyricsService({
    getLocalLyrics: async () => ({ source: "sidecar", synced: false, lines: [{ text: "Local" }] }),
    fetchImpl: async () => {
      fetched = true;
      throw new Error("should not fetch");
    }
  });

  const result = await service.lookup({ title: "Song", artist: "Artist" }, { allowOnline: true });
  assert.equal(result.status, "ok");
  assert.equal(result.lyrics.source, "sidecar");
  assert.equal(fetched, false);
});

test("requires opt-in and complete metadata before online lookup", async () => {
  const service = createLyricsService({ getLocalLyrics: async () => null });
  assert.equal((await service.lookup({ title: "Song", artist: "Artist" })).status, "online-disabled");
  assert.equal((await service.lookup({ title: "Song" }, { allowOnline: true })).status, "metadata-missing");
});

test("fetches synchronized lyrics once and then uses the local cache", async (t) => {
  const cacheDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "infinite-lofi-lyrics-cache-"));
  t.after(() => fs.promises.rm(cacheDirectory, { recursive: true, force: true }));
  let fetchCount = 0;
  const fetchImpl = async (url, options) => {
    fetchCount += 1;
    assert.equal(url.hostname, "lrclib.net");
    assert.equal(url.searchParams.get("track_name"), "Song");
    assert.equal(url.searchParams.get("artist_name"), "Artist");
    assert.match(options.headers["User-Agent"], /Infinite Lo-Fi/);
    return {
      ok: true,
      status: 200,
      async json() {
        return { syncedLyrics: "[00:01.00]One\n[00:02.00]Two" };
      }
    };
  };
  const options = { cacheDirectory, fetchImpl, getLocalLyrics: async () => null };
  const track = { title: "Song", artist: "Artist", album: "Album", duration: 123.4 };

  const first = await createLyricsService(options).lookup(track, { allowOnline: true });
  const second = await createLyricsService(options).lookup(track, { allowOnline: true });

  assert.equal(first.lyrics.source, "lrclib");
  assert.equal(second.lyrics.source, "cache");
  assert.equal(fetchCount, 1);
});

test("bounds and normalizes remote lookup metadata", () => {
  assert.deepEqual(normalizeQuery({
    title: " Song ",
    artist: " Artist ",
    album: " Album ",
    duration: 194.6
  }), {
    trackName: "Song",
    artistName: "Artist",
    albumName: "Album",
    duration: 195
  });
});
