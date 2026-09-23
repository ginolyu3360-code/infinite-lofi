const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { lyricsFromRemoteRecord, normalizeLyrics } = require("./lyrics");

const LRCLIB_ENDPOINT = "https://lrclib.net/api/get";
const LRCLIB_SEARCH_ENDPOINT = "https://lrclib.net/api/search";
const QQ_SEARCH_ENDPOINT = "https://c.y.qq.com/soso/fcgi-bin/client_search_cp";
const QQ_LYRICS_ENDPOINT = "https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg";
const LYRICS_OVH_ENDPOINT = "https://api.lyrics.ovh/v1";
const CACHE_VERSION = 4;
const MISS_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CACHE_BYTES = 600000;
const HIGH_CONFIDENCE = 95;
const PROVIDER_PRIORITY = Object.freeze({ lrclib: 3, qqmusic: 2, lyricsovh: 1 });
const CHINESE_PROVIDER_PRIORITY = Object.freeze({ qqmusic: 3, lrclib: 2, lyricsovh: 1 });

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

function isChineseLyricsQuery(query) {
  const metadata = [query?.trackName, query?.artistName, query?.albumName]
    .map((value) => cleanQueryValue(value))
    .filter(Boolean)
    .join(" ");
  return /\p{Script=Han}/u.test(metadata) &&
    !/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(metadata);
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

function decodeXmlEntities(value) {
  return String(value || "").replace(/&(amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/giu, (entity, token) => {
    const named = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };
    const normalized = token.toLowerCase();
    if (named[normalized]) return named[normalized];
    const codePoint = normalized.startsWith("#x")
      ? Number.parseInt(normalized.slice(2), 16)
      : Number.parseInt(normalized.slice(1), 10);
    try {
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
    } catch {
      return entity;
    }
  });
}

function lyricsResultFingerprint(result) {
  if (result?.lyrics?.instrumental === true) return "instrumental";
  return normalizeMatchText((result?.lyrics?.lines || []).map((line) => line?.text || "").join("\n"));
}

function matchConfidence({ exactTitleMatch, relaxedTitleMatch, artistMatch, albumMatch, durationDifference, hasComparableDuration }) {
  const titleScore = exactTitleMatch ? 45 : relaxedTitleMatch ? 35 : 0;
  const durationScore = hasComparableDuration
    ? durationDifference <= 2 ? 30 : Math.max(12, 30 - durationDifference * 2)
    : 0;
  return Math.min(100, Math.round(
    titleScore + durationScore + (artistMatch ? 20 : 0) + (albumMatch ? 5 : 0)
  ));
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

    const albumMatch = Boolean(normalizeMatchText(query.albumName)) &&
      normalizeMatchText(query.albumName) === normalizeMatchText(record.albumName);
    const confidence = matchConfidence({
      exactTitleMatch,
      relaxedTitleMatch,
      artistMatch,
      albumMatch,
      durationDifference,
      hasComparableDuration
    });
    candidates.push({ artistMatch, confidence, durationDifference, record });
  }

  candidates.sort((left, right) => right.confidence - left.confidence || left.durationDifference - right.durationDifference);
  const best = candidates[0];
  if (!best) return null;
  const runnerUp = candidates[1];
  if (runnerUp && !best.artistMatch && !runnerUp.artistMatch &&
      Math.abs(best.confidence - runnerUp.confidence) <= 2 &&
      lyricsFingerprint(best.record) !== lyricsFingerprint(runnerUp.record)) {
    return null;
  }
  return {
    artistMatch: best.artistMatch,
    confidence: best.confidence,
    durationDifference: best.durationDifference,
    record: best.record,
    preferPlain: !best.artistMatch || best.durationDifference > 2
  };
}

function selectBestLyricsResult(results, providerPriority = PROVIDER_PRIORITY) {
  const candidates = (Array.isArray(results) ? results : []).filter((result) => result?.status === "ok" && result.lyrics);
  if (candidates.length === 0) return null;
  const fingerprints = new Map();
  for (const candidate of candidates) {
    const fingerprint = lyricsResultFingerprint(candidate);
    if (!fingerprint) continue;
    fingerprints.set(fingerprint, (fingerprints.get(fingerprint) || 0) + 1);
  }
  const ranked = candidates.map((candidate) => {
    const fingerprint = lyricsResultFingerprint(candidate);
    const consensusBonus = fingerprint && fingerprints.get(fingerprint) > 1 ? 5 : 0;
    return {
      ...candidate,
      resolvedConfidence: Math.min(100, Number(candidate.confidence || 0) + consensusBonus)
    };
  }).sort((left, right) => (
    right.resolvedConfidence - left.resolvedConfidence ||
    (providerPriority[right.provider] || 0) - (providerPriority[left.provider] || 0)
  ));
  const best = ranked[0];
  if (best?.lyrics?.instrumental === true) {
    const lyricCandidate = ranked.find((candidate) => (
      candidate.lyrics?.instrumental !== true && candidate.resolvedConfidence >= best.resolvedConfidence - 5
    ));
    if (lyricCandidate) return lyricCandidate;
  }
  return best;
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

  async function requestJson(url, extraHeaders = {}) {
    if (typeof fetchImpl !== "function") return { status: "unavailable" };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetchImpl(url, {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "User-Agent": userAgent,
          ...extraHeaders
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

  async function fetchLrclibExact(query) {
    if (!query.artistName) return { status: "not-found" };
    const url = new URL(LRCLIB_ENDPOINT);
    url.searchParams.set("track_name", query.trackName);
    url.searchParams.set("artist_name", query.artistName);
    if (query.albumName) url.searchParams.set("album_name", query.albumName);
    if (query.duration) url.searchParams.set("duration", String(query.duration));
    const response = await requestJson(url);
    if (response.status !== "ok") return response;
    const lyrics = lyricsFromRemoteRecord(response.payload);
    return lyrics
      ? { status: "ok", confidence: 100, lyrics, provider: "lrclib" }
      : { status: "not-found" };
  }

  async function fetchLrclibSearch(query) {
    for (const trackName of searchTrackNames(query.trackName)) {
      const url = new URL(LRCLIB_SEARCH_ENDPOINT);
      url.searchParams.set("track_name", trackName);
      const response = await requestJson(url);
      if (["rate-limited", "unavailable"].includes(response.status)) return response;
      const selection = selectSearchRecord(response.payload, query);
      if (!selection) continue;
      const lyrics = lyricsFromRemoteRecord(selection.record, { preferPlain: selection.preferPlain });
      if (lyrics) {
        return {
          status: "ok",
          confidence: selection.confidence,
          lyrics,
          provider: "lrclib"
        };
      }
    }
    return { status: "not-found" };
  }

  async function fetchLrclib(query) {
    const exact = await fetchLrclibExact(query);
    if (exact.status === "ok") return exact;
    if (["rate-limited", "unavailable"].includes(exact.status)) return exact;
    const search = await fetchLrclibSearch(query);
    if (search.status === "ok") return search;
    return search;
  }

  function qqMusicRecords(payload) {
    const songs = Array.isArray(payload?.data?.song?.list) ? payload.data.song.list : [];
    return songs.map((song) => ({
      albumName: song?.albumname || "",
      artistName: (song?.singer || []).map((artist) => artist?.name).filter(Boolean).join(" / "),
      duration: Number(song?.interval),
      id: song?.songmid,
      trackName: song?.songname || ""
    })).filter((record) => record.id && record.trackName);
  }

  async function fetchQqMusic(query) {
    for (const trackName of searchTrackNames(query.trackName)) {
      const url = new URL(QQ_SEARCH_ENDPOINT);
      url.searchParams.set("format", "json");
      url.searchParams.set("p", "1");
      url.searchParams.set("n", "20");
      url.searchParams.set("w", [trackName, query.artistName].filter(Boolean).join(" "));
      url.searchParams.set("aggr", "1");
      url.searchParams.set("lossless", "1");
      url.searchParams.set("cr", "1");
      const response = await requestJson(url, { Referer: "https://y.qq.com/" });
      if (["rate-limited", "unavailable"].includes(response.status)) return response;
      const selection = selectSearchRecord(qqMusicRecords(response.payload), query);
      if (!selection) continue;

      const lyricsUrl = new URL(QQ_LYRICS_ENDPOINT);
      lyricsUrl.searchParams.set("songmid", String(selection.record.id));
      lyricsUrl.searchParams.set("format", "json");
      lyricsUrl.searchParams.set("nobase64", "1");
      lyricsUrl.searchParams.set("g_tk", "5381");
      const lyricsResponse = await requestJson(lyricsUrl, { Referer: "https://y.qq.com/" });
      if (lyricsResponse.status !== "ok") return lyricsResponse;
      const text = decodeXmlEntities(lyricsResponse.payload?.lyric);
      if (!text.trim()) continue;
      const parsed = lyricsFromRemoteRecord({ syncedLyrics: text }, { preferPlain: selection.preferPlain });
      const lyrics = normalizeLyrics({ ...parsed, source: "qqmusic" });
      if (lyrics) {
        return {
          status: "ok",
          confidence: selection.confidence,
          lyrics,
          provider: "qqmusic"
        };
      }
    }
    return { status: "not-found" };
  }

  async function fetchLyricsOvh(query) {
    if (!query.artistName || !query.trackName) return { status: "not-found" };
    const url = new URL(`${LYRICS_OVH_ENDPOINT}/${encodeURIComponent(query.artistName)}/${encodeURIComponent(query.trackName)}`);
    const response = await requestJson(url);
    if (response.status !== "ok") return response;
    const text = response.payload?.lyrics;
    if (typeof text !== "string" || !text.trim()) return { status: "not-found" };
    const parsed = lyricsFromRemoteRecord({ plainLyrics: text }, { preferPlain: true });
    const lyrics = normalizeLyrics({ ...parsed, source: "lyricsovh" });
    return lyrics
      ? { status: "ok", confidence: 65, lyrics, provider: "lyricsovh" }
      : { status: "not-found" };
  }

  function fallbackStatus(results) {
    if (results.some((result) => result?.status === "rate-limited")) return { status: "rate-limited" };
    if (results.length > 0 && results.every((result) => result?.status === "unavailable")) return { status: "unavailable" };
    return { status: "not-found" };
  }

  async function fetchRemoteLyrics(query) {
    const chineseFirst = isChineseLyricsQuery(query);
    const first = chineseFirst ? await fetchQqMusic(query) : await fetchLrclib(query);
    if (first.status === "ok" && first.confidence >= HIGH_CONFIDENCE) return first;

    const second = chineseFirst ? await fetchLrclib(query) : await fetchQqMusic(query);
    const lrclib = chineseFirst ? second : first;
    const qqMusic = chineseFirst ? first : second;
    const primaryBest = selectBestLyricsResult(
      [lrclib, qqMusic],
      chineseFirst ? CHINESE_PROVIDER_PRIORITY : PROVIDER_PRIORITY
    );
    if (primaryBest) return primaryBest;

    const lyricsOvh = await fetchLyricsOvh(query);
    return selectBestLyricsResult([lyricsOvh]) || fallbackStatus([lrclib, qqMusic, lyricsOvh]);
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
  LYRICS_OVH_ENDPOINT,
  QQ_LYRICS_ENDPOINT,
  QQ_SEARCH_ENDPOINT,
  artistsMatch,
  createCacheKey,
  createLyricsService,
  decodeXmlEntities,
  isChineseLyricsQuery,
  normalizeMatchText,
  normalizeQuery,
  relaxedTrackName,
  searchTrackNames,
  selectBestLyricsResult,
  selectSearchRecord
};
