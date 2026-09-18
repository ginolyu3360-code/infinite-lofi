const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { lyricsFromRemoteRecord, normalizeLyrics } = require("./lyrics");

const LRCLIB_ENDPOINT = "https://lrclib.net/api/get";
const LRCLIB_SEARCH_ENDPOINT = "https://lrclib.net/api/search";
const CACHE_VERSION = 2;
const MISS_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CACHE_BYTES = 600000;

function cleanQueryValue(value, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeQuery(track) {
  const duration = Number(track?.duration);
  return {
    trackName: cleanQueryValue(track?.title || track?.label),
    artistName: cleanQueryValue(track?.artist),
    albumName: cleanQueryValue(track?.album),
    duration: Number.isFinite(duration) && duration >= 1 && duration <= 3600 ? Math.round(duration) : 0
  };
}

function normalizeMatchText(value) {
  return cleanQueryValue(value)
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[\p{P}\p{S}\s]+/gu, "")
    .trim();
}

function relaxedTrackName(value) {
  let result = cleanQueryValue(value);
  let previous = "";
  while (result && result !== previous) {
    previous = result;
    result = result.replace(/\s*[（(\[【][^）)\]】]{1,120}[）)\]】]\s*$/u, "").trim();
  }
  return result
    .replace(/\s*[-–—]\s*(?:live|remaster(?:ed)?|acoustic|instrumental|inst\.?|karaoke|伴奏|纯音乐|現場|现场|翻唱|cover|version|版)\s*$/iu, "")
    .trim();
}

function searchTrackNames(trackName) {
  return [...new Set([cleanQueryValue(trackName), relaxedTrackName(trackName)].filter(Boolean))];
}

function artistTokens(value) {
  return cleanQueryValue(value)
    .split(/(?:\bfeat(?:uring)?\.?\b|\bft\.?\b|[,&/;，、；×]|\s+x\s+|\s+和\s+)/iu)
    .map(normalizeMatchText)
    .filter(Boolean);
}

function artistsMatch(left, right) {
  const leftNormalized = normalizeMatchText(left);
  const rightNormalized = normalizeMatchText(right);
  if (!leftNormalized || !rightNormalized) return false;
  if (leftNormalized === rightNormalized) return true;
  const rightTokens = new Set(artistTokens(right));
  return artistTokens(left).some((token) => rightTokens.has(token));
}

function durationTolerance(duration) {
  return Math.min(15, Math.max(5, Number(duration) * 0.05));
}

function lyricsFingerprint(record) {
  const text = typeof record?.plainLyrics === "string" && record.plainLyrics.trim()
    ? record.plainLyrics
    : record?.syncedLyrics;
  return normalizeMatchText(String(text || "").replace(/\[\d{1,3}:[^\]]+\]/g, ""));
}

function selectSearchRecord(records, query) {
  if (!Array.isArray(records) || !query?.trackName) return null;
  const exactTitle = normalizeMatchText(query.trackName);
  const relaxedTitle = normalizeMatchText(relaxedTrackName(query.trackName));
  const candidates = [];

  for (const record of records) {
    if (!record || typeof record !== "object") continue;
    const recordTitle = normalizeMatchText(record.trackName || record.name);
    const recordRelaxedTitle = normalizeMatchText(relaxedTrackName(record.trackName || record.name));
    const exactTitleMatch = Boolean(exactTitle && recordTitle === exactTitle);
    const relaxedTitleMatch = Boolean(relaxedTitle && (recordTitle === relaxedTitle || recordRelaxedTitle === relaxedTitle));
    if (!exactTitleMatch && !relaxedTitleMatch) continue;

    const recordDuration = Number(record.duration);
    const hasComparableDuration = query.duration > 0 && Number.isFinite(recordDuration) && recordDuration > 0;
    const durationDifference = hasComparableDuration ? Math.abs(recordDuration - query.duration) : Number.POSITIVE_INFINITY;
    const artistMatch = artistsMatch(query.artistName, record.artistName);
    if (query.duration > 0 && (!hasComparableDuration || durationDifference > durationTolerance(query.duration))) continue;
    if (query.duration <= 0 && !artistMatch) continue;
    if (record.instrumental === true && !artistMatch) continue;

    const albumMatch = normalizeMatchText(query.albumName) &&
      normalizeMatchText(query.albumName) === normalizeMatchText(record.albumName);
    const score = (exactTitleMatch ? 100 : 75) +
      (hasComparableDuration ? Math.max(0, 45 - durationDifference * 3) : 0) +
      (artistMatch ? 25 : 0) +
      (albumMatch ? 5 : 0);
    candidates.push({ artistMatch, durationDifference, record, score });
  }

  candidates.sort((left, right) => right.score - left.score || left.durationDifference - right.durationDifference);
  const best = candidates[0];
  if (!best) return null;
  const runnerUp = candidates[1];
  if (runnerUp && !best.artistMatch && !runnerUp.artistMatch &&
      Math.abs(best.score - runnerUp.score) <= 2 &&
      lyricsFingerprint(best.record) !== lyricsFingerprint(runnerUp.record)) {
    return null;
  }
  return {
    record: best.record,
    preferPlain: !best.artistMatch || best.durationDifference > 2
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
  const memoryCache = new Map();

  function resultFromCachePayload(payload, query) {
    if (payload?.version !== CACHE_VERSION || JSON.stringify(payload.query) !== JSON.stringify(query)) return null;
    if (payload.status === "not-found" && now() - Number(payload.savedAt) > MISS_CACHE_MS) return null;
    if (payload.status === "ok") {
      const lyrics = normalizeLyrics({ ...payload.lyrics, source: "cache" });
      return lyrics ? { status: "ok", lyrics } : null;
    }
    return payload.status === "not-found" ? { status: "not-found" } : null;
  }

  async function readCache(query) {
    const cacheKey = createCacheKey(query);
    const memoryPayload = memoryCache.get(cacheKey);
    if (memoryPayload) {
      const result = resultFromCachePayload(memoryPayload, query);
      if (result) return result;
      memoryCache.delete(cacheKey);
    }
    if (!cacheDirectory) return null;
    try {
      const filePath = path.join(cacheDirectory, `${cacheKey}.json`);
      const stat = await fileSystem.stat(filePath);
      if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_CACHE_BYTES) return null;
      const payload = JSON.parse(await fileSystem.readFile(filePath, "utf8"));
      const result = resultFromCachePayload(payload, query);
      if (result) memoryCache.set(cacheKey, payload);
      return result;
    } catch {
      return null;
    }
  }

  async function writeCache(query, result) {
    const payload = {
      version: CACHE_VERSION,
      savedAt: now(),
      query,
      status: result.status,
      ...(result.lyrics ? { lyrics: result.lyrics } : {})
    };
    const cacheKey = createCacheKey(query);
    memoryCache.set(cacheKey, payload);
    if (!cacheDirectory) return;
    try {
      await fileSystem.mkdir(cacheDirectory, { recursive: true });
      await fileSystem.writeFile(
        path.join(cacheDirectory, `${cacheKey}.json`),
        JSON.stringify(payload),
        { encoding: "utf8", mode: 0o600 }
      );
    } catch {}
  }

  async function requestJson(url) {
    if (typeof fetchImpl !== "function") return { status: "unavailable" };
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
      return { status: "ok", payload: await response.json() };
    } catch {
      return { status: "unavailable" };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function fetchExactRecord(query) {
    if (!query.artistName) return { status: "not-found" };
    const url = new URL(LRCLIB_ENDPOINT);
    url.searchParams.set("track_name", query.trackName);
    url.searchParams.set("artist_name", query.artistName);
    if (query.albumName) url.searchParams.set("album_name", query.albumName);
    if (query.duration) url.searchParams.set("duration", String(query.duration));
    const response = await requestJson(url);
    if (response.status !== "ok") return response;
    const lyrics = lyricsFromRemoteRecord(response.payload);
    return lyrics ? { status: "ok", lyrics } : { status: "not-found" };
  }

  async function fetchSearchRecord(query) {
    for (const trackName of searchTrackNames(query.trackName)) {
      const url = new URL(LRCLIB_SEARCH_ENDPOINT);
      url.searchParams.set("track_name", trackName);
      const response = await requestJson(url);
      if (["rate-limited", "unavailable"].includes(response.status)) return response;
      const selection = selectSearchRecord(response.payload, query);
      if (!selection) continue;
      const lyrics = lyricsFromRemoteRecord(selection.record, { preferPlain: selection.preferPlain });
      if (lyrics) return { status: "ok", lyrics };
    }
    return { status: "not-found" };
  }

  async function fetchRemoteLyrics(query) {
    const exact = await fetchExactRecord(query);
    if (exact.status === "ok" || ["rate-limited", "unavailable"].includes(exact.status)) return exact;
    return fetchSearchRecord(query);
  }

  async function lookup(track, { allowOnline = false } = {}) {
    try {
      const localLyrics = normalizeLyrics(await getLocalLyrics(track));
      if (localLyrics) return { status: "ok", lyrics: localLyrics };
    } catch {}
    if (!allowOnline) return { status: "online-disabled" };

    const query = normalizeQuery(track);
    if (!query.trackName || (!query.artistName && !query.duration)) return { status: "metadata-missing" };
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
  LRCLIB_SEARCH_ENDPOINT,
  artistsMatch,
  createCacheKey,
  createLyricsService,
  normalizeMatchText,
  normalizeQuery,
  relaxedTrackName,
  searchTrackNames,
  selectSearchRecord
};
