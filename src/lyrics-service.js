const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { lyricsFromRemoteRecord, normalizeLyrics } = require("./lyrics");

const LRCLIB_ENDPOINT = "https://lrclib.net/api/get";
const CACHE_VERSION = 1;
const MISS_CACHE_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_BYTES = 600000;

function normalizeQuery(track) {
  const clean = (value, maxLength = 500) => typeof value === "string" ? value.trim().slice(0, maxLength) : "";
  const duration = Number(track?.duration);
  return {
    trackName: clean(track?.title || track?.label),
    artistName: clean(track?.artist),
    albumName: clean(track?.album),
    duration: Number.isFinite(duration) && duration >= 1 && duration <= 3600 ? Math.round(duration) : 0
  };
}

function createCacheKey(query) {
  return crypto.createHash("sha256").update(JSON.stringify(query)).digest("hex");
}

function createLyricsService(options = {}) {
  const {
    cacheDirectory,
    getLocalLyrics = async () => null,
    fetchImpl = globalThis.fetch,
    fileSystem = fs.promises,
    now = Date.now,
    userAgent = "Infinite Lo-Fi/1.5.0 (https://github.com/ginolyu3360-code/infinite-lofi)"
  } = options;

  async function readCache(query) {
    if (!cacheDirectory) return null;
    try {
      const filePath = path.join(cacheDirectory, `${createCacheKey(query)}.json`);
      const stat = await fileSystem.stat(filePath);
      if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_CACHE_BYTES) return null;
      const parsed = JSON.parse(await fileSystem.readFile(filePath, "utf8"));
      if (parsed?.version !== CACHE_VERSION || JSON.stringify(parsed.query) !== JSON.stringify(query)) return null;
      if (parsed.status === "not-found" && now() - Number(parsed.savedAt) > MISS_CACHE_MS) return null;
      if (parsed.status === "ok") {
        const lyrics = normalizeLyrics({ ...parsed.lyrics, source: "cache" });
        return lyrics ? { status: "ok", lyrics } : null;
      }
      return parsed.status === "not-found" ? { status: "not-found" } : null;
    } catch {
      return null;
    }
  }

  async function writeCache(query, result) {
    if (!cacheDirectory) return;
    try {
      await fileSystem.mkdir(cacheDirectory, { recursive: true });
      const payload = {
        version: CACHE_VERSION,
        savedAt: now(),
        query,
        status: result.status,
        ...(result.lyrics ? { lyrics: result.lyrics } : {})
      };
      await fileSystem.writeFile(
        path.join(cacheDirectory, `${createCacheKey(query)}.json`),
        JSON.stringify(payload),
        { encoding: "utf8", mode: 0o600 }
      );
    } catch {}
  }

  async function fetchRemoteLyrics(query) {
    if (typeof fetchImpl !== "function") return { status: "unavailable" };
    const url = new URL(LRCLIB_ENDPOINT);
    url.searchParams.set("track_name", query.trackName);
    url.searchParams.set("artist_name", query.artistName);
    if (query.albumName) url.searchParams.set("album_name", query.albumName);
    if (query.duration) url.searchParams.set("duration", String(query.duration));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetchImpl(url, {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "User-Agent": userAgent
        },
        signal: controller.signal
      });
      if (response.status === 404) return { status: "not-found" };
      if (response.status === 429) return { status: "rate-limited" };
      if (!response.ok) return { status: "unavailable" };
      const record = await response.json();
      const lyrics = lyricsFromRemoteRecord(record);
      return lyrics ? { status: "ok", lyrics } : { status: "not-found" };
    } catch {
      return { status: "unavailable" };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function lookup(track, { allowOnline = false } = {}) {
    try {
      const localLyrics = normalizeLyrics(await getLocalLyrics(track));
      if (localLyrics) return { status: "ok", lyrics: localLyrics };
    } catch {}
    if (!allowOnline) return { status: "online-disabled" };

    const query = normalizeQuery(track);
    if (!query.trackName || !query.artistName) return { status: "metadata-missing" };
    const cached = await readCache(query);
    if (cached) return cached;
    const result = await fetchRemoteLyrics(query);
    if (["ok", "not-found"].includes(result.status)) await writeCache(query, result);
    return result;
  }

  return { lookup };
}

module.exports = {
  LRCLIB_ENDPOINT,
  createCacheKey,
  createLyricsService,
  normalizeQuery
};
