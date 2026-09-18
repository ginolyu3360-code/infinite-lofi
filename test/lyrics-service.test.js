const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  createLyricsService,
  decodeXmlEntities,
  normalizeQuery,
  relaxedTrackName,
  selectBestLyricsResult,
  selectSearchRecord
} = require("../src/lyrics-service");

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

test("falls back to title and duration search for covers without trusting their timestamps", async () => {
  const requests = [];
  const service = createLyricsService({
    getLocalLyrics: async () => null,
    fetchImpl: async (url) => {
      requests.push(url);
      if (url.pathname === "/api/get") return { ok: false, status: 404 };
      if (url.hostname === "c.y.qq.com") {
        return { ok: true, status: 200, async json() { return { data: { song: { list: [] } } }; } };
      }
      assert.equal(url.pathname, "/api/search");
      assert.equal(url.searchParams.get("track_name"), "小幸运");
      assert.equal(url.searchParams.has("artist_name"), false);
      return {
        ok: true,
        status: 200,
        async json() {
          return [{
            trackName: "小幸运",
            artistName: "田馥甄",
            duration: 242,
            plainLyrics: "我听见雨滴落在青青草地",
            syncedLyrics: "[00:01.00]我听见雨滴落在青青草地"
          }];
        }
      };
    }
  });

  const result = await service.lookup({
    title: "小幸运",
    artist: "Small Cover Artist",
    duration: 245
  }, { allowOnline: true });

  assert.equal(requests.length, 3);
  assert.equal(result.status, "ok");
  assert.equal(result.lyrics.source, "lrclib");
  assert.equal(result.lyrics.synced, false);
  assert.equal(result.lyrics.lines[0].text, "我听见雨滴落在青青草地");
});

test("prefers a stronger QQ Music metadata match over a weak LRCLIB cover match", async () => {
  const requests = [];
  const service = createLyricsService({
    getLocalLyrics: async () => null,
    fetchImpl: async (url, options) => {
      requests.push(url);
      if (url.hostname === "lrclib.net" && url.pathname === "/api/get") {
        return { ok: false, status: 404 };
      }
      if (url.hostname === "lrclib.net") {
        return {
          ok: true,
          status: 200,
          async json() {
            return [{
              trackName: "后来",
              artistName: "Unrelated Artist",
              duration: 246,
              plainLyrics: "Weak match"
            }];
          }
        };
      }
      assert.equal(options.headers.Referer, "https://y.qq.com/");
      if (url.pathname === "/soso/fcgi-bin/client_search_cp") {
        return {
          ok: true,
          status: 200,
          async json() {
            return { data: { song: { list: [{
              songmid: "qq-mid-123",
              songname: "后来",
              singer: [{ name: "刘若英" }],
              albumname: "我等你",
              interval: 250
            }] } } };
          }
        };
      }
      assert.equal(url.pathname, "/lyric/fcgi-bin/fcg_query_lyric_new.fcg");
      return {
        ok: true,
        status: 200,
        async json() { return { lyric: "[00:01.00]后来 我总算学会了如何去爱" }; }
      };
    }
  });

  const result = await service.lookup({
    title: "后来",
    artist: "刘若英",
    album: "我等你",
    duration: 250
  }, { allowOnline: true });

  assert.equal(requests.length, 4);
  assert.equal(result.status, "ok");
  assert.equal(result.lyrics.source, "qqmusic");
  assert.equal(result.lyrics.synced, true);
});

test("uses lyrics.ovh only as a plain-lyrics last resort", async () => {
  const service = createLyricsService({
    getLocalLyrics: async () => null,
    fetchImpl: async (url) => {
      if (url.hostname === "lrclib.net" && url.pathname === "/api/get") return { ok: false, status: 404 };
      if (url.hostname === "lrclib.net") {
        return { ok: true, status: 200, async json() { return []; } };
      }
      if (url.hostname === "c.y.qq.com") {
        return { ok: true, status: 200, async json() { return { data: { song: { list: [] } } }; } };
      }
      assert.equal(url.hostname, "api.lyrics.ovh");
      return {
        ok: true,
        status: 200,
        async json() { return { lyrics: "Fallback line one\nFallback line two" }; }
      };
    }
  });

  const result = await service.lookup({
    title: "Rare Song",
    artist: "Small Artist",
    duration: 180
  }, { allowOnline: true });

  assert.equal(result.status, "ok");
  assert.equal(result.lyrics.source, "lyricsovh");
  assert.equal(result.lyrics.synced, false);
});

test("remembers an instrumental result locally without another request", async () => {
  let fetchCount = 0;
  const service = createLyricsService({
    getLocalLyrics: async () => null,
    fetchImpl: async () => {
      fetchCount += 1;
      return {
        ok: true,
        status: 200,
        async json() { return { instrumental: true }; }
      };
    }
  });
  const track = { title: "Quiet", artist: "Composer", duration: 180 };

  const first = await service.lookup(track, { allowOnline: true });
  const second = await service.lookup(track, { allowOnline: true });

  assert.equal(first.lyrics.instrumental, true);
  assert.equal(second.lyrics.instrumental, true);
  assert.equal(second.lyrics.source, "cache");
  assert.equal(fetchCount, 1);
});

test("rejects ambiguous title and duration matches with different lyrics", () => {
  const selection = selectSearchRecord([
    { trackName: "后来", artistName: "Artist A", duration: 250, plainLyrics: "Lyrics A" },
    { trackName: "后来", artistName: "Artist B", duration: 250, plainLyrics: "Lyrics B" }
  ], {
    trackName: "后来",
    artistName: "Unknown Cover",
    albumName: "",
    duration: 250
  });
  assert.equal(selection, null);
});

test("does not mark a cover instrumental from another artist's search result", () => {
  const selection = selectSearchRecord([
    { trackName: "Intro", artistName: "Original Artist", duration: 120, instrumental: true }
  ], {
    trackName: "Intro",
    artistName: "Cover Artist",
    albumName: "",
    duration: 120
  });
  assert.equal(selection, null);
});

test("uses provider priority only when match confidence is tied", () => {
  const lyrics = { instrumental: false, synced: false, lines: [{ text: "Same confidence" }] };
  const result = selectBestLyricsResult([
    { status: "ok", confidence: 80, lyrics, provider: "qqmusic" },
    { status: "ok", confidence: 80, lyrics: { ...lyrics, lines: [{ text: "Different" }] }, provider: "lrclib" }
  ]);
  assert.equal(result.provider, "lrclib");
});

test("relaxes common version suffixes for a guarded fallback search", () => {
  assert.equal(relaxedTrackName("后来（Live 版）"), "后来");
  assert.equal(relaxedTrackName("Song - Acoustic"), "Song");
});

test("decodes QQ Music lyric entities without interpreting markup", () => {
  assert.equal(decodeXmlEntities("A &amp; B &#58; &#x4E2D;"), "A & B : 中");
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
