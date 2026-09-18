(function exposeInfiniteLofiLyrics(globalScope) {
  const MAX_LYRICS_CHARACTERS = 500000;
  const MAX_LYRIC_LINES = 5000;

  function sanitizeText(value, maxLength = MAX_LYRICS_CHARACTERS) {
    return typeof value === "string"
      ? value.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").slice(0, maxLength)
      : "";
  }

  function normalizeLineText(value) {
    return sanitizeText(value, 2000).replace(/\s+/g, " ").trim();
  }

  function timestampToSeconds(minutes, seconds, fraction = "") {
    const minuteValue = Number(minutes);
    const secondValue = Number(seconds);
    if (!Number.isFinite(minuteValue) || !Number.isFinite(secondValue)) return null;
    const fractionValue = fraction
      ? Number(fraction) / (10 ** Math.min(3, fraction.length))
      : 0;
    const result = minuteValue * 60 + secondValue + fractionValue;
    return Number.isFinite(result) && result >= 0 ? result : null;
  }

  function parseLrc(value) {
    const source = sanitizeText(value);
    const offsetMatch = source.match(/^\s*\[offset:([+-]?\d+)\]\s*$/im);
    const offsetSeconds = offsetMatch ? Number(offsetMatch[1]) / 1000 : 0;
    const syncedLines = [];
    const plainLines = [];
    const timestampPattern = /\[(\d{1,3}):([0-5]\d)(?:[.:](\d{1,3}))?\]/g;
    const metadataPattern = /^\s*\[(?:ar|al|ti|au|by|re|ve|length|offset):/i;

    for (const rawLine of source.split("\n")) {
      if (syncedLines.length >= MAX_LYRIC_LINES || plainLines.length >= MAX_LYRIC_LINES) break;
      const timestamps = [];
      let match;
      timestampPattern.lastIndex = 0;
      while ((match = timestampPattern.exec(rawLine))) {
        const seconds = timestampToSeconds(match[1], match[2], match[3]);
        if (seconds !== null) timestamps.push(Math.max(0, seconds + offsetSeconds));
      }
      const text = normalizeLineText(rawLine.replace(timestampPattern, ""));
      if (timestamps.length > 0) {
        timestamps.forEach((time) => syncedLines.push({ time, text }));
      } else if (text && !metadataPattern.test(rawLine)) {
        plainLines.push(text);
      }
    }

    syncedLines.sort((left, right) => left.time - right.time);
    if (syncedLines.length > 0) {
      return {
        synced: true,
        lines: syncedLines.slice(0, MAX_LYRIC_LINES)
      };
    }
    return {
      synced: false,
      lines: plainLines.slice(0, MAX_LYRIC_LINES).map((text) => ({ text }))
    };
  }

  function normalizeLyrics(value) {
    if (!value || typeof value !== "object") return null;
    const source = ["sidecar", "embedded", "lrclib", "cache"].includes(value.source)
      ? value.source
      : "embedded";
    const rawLines = Array.isArray(value.lines) ? value.lines : [];
    const lines = rawLines.slice(0, MAX_LYRIC_LINES).map((line) => {
      const text = normalizeLineText(line?.text);
      const time = Number(line?.time);
      return Number.isFinite(time) && time >= 0 ? { time, text } : { text };
    }).filter((line) => line.text || Number.isFinite(line.time));
    return {
      source,
      synced: value.synced === true && lines.some((line) => Number.isFinite(line.time)),
      instrumental: value.instrumental === true,
      lines
    };
  }

  function lyricsFromEmbeddedTags(tags) {
    if (!Array.isArray(tags)) return null;
    const synced = tags.find((tag) => Array.isArray(tag?.syncText) && tag.syncText.length > 0);
    if (synced) {
      return normalizeLyrics({
        source: "embedded",
        synced: true,
        lines: synced.syncText.map((line) => ({
          time: Number(line?.timestamp) / 1000,
          text: line?.text
        }))
      });
    }
    const plain = tags.find((tag) => typeof tag?.text === "string" && tag.text.trim());
    if (!plain) return null;
    return normalizeLyrics({ source: "embedded", ...parseLrc(plain.text) });
  }

  function lyricsFromRemoteRecord(record, { preferPlain = false } = {}) {
    if (!record || typeof record !== "object") return null;
    if (record.instrumental === true) {
      return normalizeLyrics({ source: "lrclib", instrumental: true, synced: false, lines: [] });
    }
    const syncedLyrics = typeof record.syncedLyrics === "string" ? record.syncedLyrics.trim() : "";
    const plainLyrics = typeof record.plainLyrics === "string" ? record.plainLyrics.trim() : "";
    const text = preferPlain && plainLyrics ? plainLyrics : syncedLyrics || plainLyrics;
    if (typeof text !== "string" || !text.trim()) return null;
    const parsed = parseLrc(text);
    if (preferPlain && parsed.synced) {
      return normalizeLyrics({
        source: "lrclib",
        synced: false,
        lines: parsed.lines.map((line) => ({ text: line.text }))
      });
    }
    return normalizeLyrics({ source: "lrclib", ...parsed });
  }

  function findActiveLyricIndex(lines, currentTime) {
    if (!Array.isArray(lines) || lines.length === 0) return -1;
    const target = Math.max(0, Number(currentTime) || 0);
    let low = 0;
    let high = lines.length - 1;
    let result = -1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const time = Number(lines[middle]?.time);
      if (Number.isFinite(time) && time <= target) {
        result = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return result;
  }

  const api = {
    MAX_LYRIC_LINES,
    MAX_LYRICS_CHARACTERS,
    findActiveLyricIndex,
    lyricsFromEmbeddedTags,
    lyricsFromRemoteRecord,
    normalizeLyrics,
    parseLrc
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalScope) globalScope.InfiniteLofiLyrics = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
