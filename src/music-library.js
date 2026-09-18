const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { lyricsFromEmbeddedTags, parseLrc } = require("./lyrics");

const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".flac", ".aac", ".m4a", ".ogg"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"]);
const CACHE_EXTENSIONS = [".jpg", ".png", ".webp", ".gif", ".bmp"];
const MAX_EMBEDDED_ARTWORK_BYTES = 5 * 1024 * 1024;
const MAX_SIDECAR_LYRICS_BYTES = 500000;
const DUPLICATE_DURATION_TOLERANCE_SECONDS = 2;

function stripCopySuffix(value) {
  return String(value || "")
    .replace(/\s*[（(\[]\s*(?:\d+|copy|副本)\s*[）)\]]\s*$/iu, "")
    .replace(/\s+(?:copy|副本)(?:\s+\d+)?\s*$/iu, "")
    .trim();
}

function normalizeIdentityText(value, { removeCopySuffix = false } = {}) {
  const source = removeCopySuffix ? stripCopySuffix(value) : String(value || "");
  return source
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[\p{P}\p{S}\s]+/gu, "")
    .trim();
}

function durationsMatch(left, right) {
  const leftDuration = Number(left);
  const rightDuration = Number(right);
  return Number.isFinite(leftDuration) && leftDuration > 0 &&
    Number.isFinite(rightDuration) && rightDuration > 0 &&
    Math.abs(leftDuration - rightDuration) <= DUPLICATE_DURATION_TOLERANCE_SECONDS;
}

function areDuplicateTracks(left, right) {
  const leftTitle = normalizeIdentityText(left?.title, { removeCopySuffix: left?._dedupe?.taggedTitle !== true });
  const rightTitle = normalizeIdentityText(right?.title, { removeCopySuffix: right?._dedupe?.taggedTitle !== true });
  const leftArtist = normalizeIdentityText(left?.artist);
  const rightArtist = normalizeIdentityText(right?.artist);
  const sameMetadata = leftTitle && rightTitle && leftArtist && rightArtist &&
    leftTitle === rightTitle && leftArtist === rightArtist;
  const leftLabel = normalizeIdentityText(left?.label, { removeCopySuffix: true });
  const rightLabel = normalizeIdentityText(right?.label, { removeCopySuffix: true });
  const sameCopyName = leftLabel && rightLabel && leftLabel === rightLabel;
  if (!sameMetadata && !sameCopyName) return false;
  if (durationsMatch(left?.duration, right?.duration)) return true;
  const leftSize = Number(left?._dedupe?.fileSize);
  const rightSize = Number(right?._dedupe?.fileSize);
  return sameCopyName && leftSize > 0 && leftSize === rightSize;
}

function trackQuality(track) {
  const details = track?._dedupe || {};
  return [
    details.lossless === true ? 1 : 0,
    Number.isFinite(Number(details.bitrate)) ? Number(details.bitrate) : 0,
    Number(details.taggedTitle === true) + Number(details.taggedArtist === true) + Number(details.taggedAlbum === true),
    track?.artworkUrl ? 1 : 0,
    stripCopySuffix(track?.label) === String(track?.label || "").trim() ? 1 : 0,
    Number.isFinite(Number(details.fileSize)) ? Number(details.fileSize) : 0
  ];
}

function isHigherQualityTrack(candidate, current) {
  const candidateQuality = trackQuality(candidate);
  const currentQuality = trackQuality(current);
  for (let index = 0; index < candidateQuality.length; index += 1) {
    if (candidateQuality[index] !== currentQuality[index]) {
      return candidateQuality[index] > currentQuality[index];
    }
  }
  return String(candidate?.label || "").localeCompare(String(current?.label || ""), undefined, { numeric: true }) < 0;
}

function deduplicateTracks(tracks) {
  const uniqueTracks = [];
  const duplicates = [];
  for (const track of Array.isArray(tracks) ? tracks : []) {
    const duplicateIndex = uniqueTracks.findIndex((candidate) => areDuplicateTracks(candidate, track));
    if (duplicateIndex < 0) {
      uniqueTracks.push(track);
      continue;
    }
    if (isHigherQualityTrack(track, uniqueTracks[duplicateIndex])) {
      duplicates.push(uniqueTracks[duplicateIndex]);
      uniqueTracks[duplicateIndex] = track;
    } else {
      duplicates.push(track);
    }
  }
  return { duplicates, tracks: uniqueTracks };
}

function withoutDedupeDetails(track) {
  if (!track || typeof track !== "object") return track;
  const { _dedupe, ...publicTrack } = track;
  return publicTrack;
}

function metadataFromFileName(fileName) {
  const label = path.basename(fileName, path.extname(fileName));
  const separatorIndex = label.indexOf(" - ");
  return separatorIndex > 0
    ? {
        artist: label.slice(0, separatorIndex).trim(),
        title: label.slice(separatorIndex + 3).trim()
      }
    : { artist: "", title: label };
}

function artworkCandidates(fileName) {
  const baseName = path.basename(fileName, path.extname(fileName));
  return [
    `${baseName}.jpg`, `${baseName}.jpeg`, `${baseName}.png`, `${baseName}.webp`,
    `${baseName}.gif`, `${baseName}.bmp`, "cover.jpg", "cover.jpeg", "cover.png",
    "cover.webp", "folder.jpg", "folder.jpeg", "folder.png", "folder.webp",
    "front.jpg", "front.jpeg", "front.png", "album.jpg", "album.jpeg", "album.png"
  ];
}

function findSidecarArtwork(folderPath, fileName, fileNameLookup) {
  for (const candidate of artworkCandidates(fileName)) {
    const actualName = fileNameLookup.get(candidate.toLowerCase());
    if (!actualName || !IMAGE_EXTENSIONS.has(path.extname(actualName).toLowerCase())) continue;
    const artworkPath = path.join(folderPath, actualName);
    return {
      artworkName: actualName,
      artworkPath,
      artworkUrl: pathToFileURL(artworkPath).href
    };
  }
  return null;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  const workerCount = Math.min(items.length, Math.max(1, Math.floor(concurrency) || 1));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function extensionForMimeType(mimeType) {
  return {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/bmp": ".bmp"
  }[String(mimeType || "").toLowerCase()] || ".jpg";
}

function createMusicLibrary({
  parseFile,
  artworkCacheDirectory,
  concurrency = 4,
  fileSystem = fs.promises
}) {
  if (typeof parseFile !== "function") throw new TypeError("parseFile is required");
  const metadataCache = new Map();

  function getArtworkCacheKey(audioPath, stat) {
    return crypto
      .createHash("sha256")
      .update(`${audioPath}\0${stat.size}\0${stat.mtimeMs}`)
      .digest("hex");
  }

  function compactMetadata(metadata) {
    const common = metadata?.common || {};
    return {
      common: {
        title: common.title,
        artist: common.artist,
        album: common.album,
        lyrics: common.lyrics
      },
      format: {
        bitrate: metadata?.format?.bitrate,
        duration: metadata?.format?.duration,
        lossless: metadata?.format?.lossless
      }
    };
  }

  async function readMetadata(audioPath, stat, { skipCovers = false } = {}) {
    const fingerprint = `${stat.size}:${stat.mtimeMs}`;
    const cached = metadataCache.get(audioPath);
    if (cached?.fingerprint === fingerprint) return cached.metadata;
    try {
      const metadata = await parseFile(audioPath, { duration: true, skipCovers });
      metadataCache.set(audioPath, { fingerprint, metadata: compactMetadata(metadata) });
      return metadata;
    } catch {
      const metadata = { common: {}, format: {} };
      metadataCache.set(audioPath, { fingerprint, metadata });
      return metadata;
    }
  }

  async function readArtworkCacheIndex() {
    const index = new Map();
    if (!artworkCacheDirectory) return index;
    try {
      const entries = await fileSystem.readdir(artworkCacheDirectory, { withFileTypes: true });
      const fileNames = new Set(
        entries
          .filter((entry) => typeof entry === "string" || entry.isFile())
          .map((entry) => typeof entry === "string" ? entry : entry.name)
      );
      for (const fileName of fileNames) {
        const extension = path.extname(fileName).toLowerCase();
        if (!CACHE_EXTENSIONS.includes(extension)) continue;
        const cacheKey = fileName.slice(0, -extension.length);
        const existing = index.get(cacheKey);
        if (existing && CACHE_EXTENSIONS.indexOf(path.extname(existing).toLowerCase()) <= CACHE_EXTENSIONS.indexOf(extension)) {
          continue;
        }
        index.set(cacheKey, path.join(artworkCacheDirectory, fileName));
      }
    } catch {}
    return index;
  }

  function findCachedArtwork(cacheKey, cacheIndex) {
    const cachedPath = cacheIndex.get(cacheKey);
    if (!cachedPath) return null;
    return {
      artworkName: "Embedded Cover",
      artworkPath: cachedPath,
      artworkUrl: pathToFileURL(cachedPath).href
    };
  }

  async function getEmbeddedArtwork(metadata, cacheKey, cacheIndex) {
    try {
      const cached = cacheKey ? findCachedArtwork(cacheKey, cacheIndex) : null;
      if (cached) return cached;
      const picture = Array.isArray(metadata?.common?.picture) ? metadata.common.picture[0] : null;
      if (!picture?.data) return null;
      const artworkData = Buffer.isBuffer(picture.data) ? picture.data : Buffer.from(picture.data);
      if (artworkData.length === 0 || artworkData.length > MAX_EMBEDDED_ARTWORK_BYTES) return null;
      if (!artworkCacheDirectory) return null;

      const mimeType = typeof picture.format === "string" && picture.format.trim()
        ? picture.format.trim().toLowerCase()
        : "image/jpeg";
      const cachedPath = path.join(artworkCacheDirectory, `${cacheKey}${extensionForMimeType(mimeType)}`);
      await fileSystem.mkdir(artworkCacheDirectory, { recursive: true });
      await fileSystem.writeFile(cachedPath, artworkData);
      cacheIndex.set(cacheKey, cachedPath);
      return {
        artworkName: "Embedded Cover",
        artworkMimeType: mimeType,
        artworkPath: cachedPath,
        artworkUrl: pathToFileURL(cachedPath).href
      };
    } catch {
      return null;
    }
  }

  async function getLocalLyrics(track) {
    const audioPath = typeof track?.src === "string" ? track.src : "";
    if (!audioPath || !path.isAbsolute(audioPath)) return null;
    try {
      const folderPath = path.dirname(audioPath);
      const baseName = path.basename(audioPath, path.extname(audioPath));
      const entries = await fileSystem.readdir(folderPath, { withFileTypes: true });
      const sidecar = entries.find((entry) => (
        (typeof entry === "string" || entry.isFile()) &&
        (typeof entry === "string" ? entry : entry.name).toLowerCase() === `${baseName}.lrc`.toLowerCase()
      ));
      if (sidecar) {
        const sidecarName = typeof sidecar === "string" ? sidecar : sidecar.name;
        const sidecarPath = path.join(folderPath, sidecarName);
        const stat = await fileSystem.stat(sidecarPath);
        if (stat.isFile() && stat.size > 0 && stat.size <= MAX_SIDECAR_LYRICS_BYTES) {
          return { source: "sidecar", ...parseLrc(await fileSystem.readFile(sidecarPath, "utf8")) };
        }
      }
      const audioStat = await fileSystem.stat(audioPath);
      const metadata = await readMetadata(audioPath, audioStat, { skipCovers: true });
      return lyricsFromEmbeddedTags(metadata?.common?.lyrics);
    } catch {
      return null;
    }
  }

  async function scanFolder(folderPath) {
    const [entries, artworkCacheIndex] = await Promise.all([
      fileSystem.readdir(folderPath, { withFileTypes: true }),
      readArtworkCacheIndex()
    ]);
    const files = entries.filter((entry) => entry.isFile());
    const fileNameLookup = new Map(files.map((entry) => [entry.name.toLowerCase(), entry.name]));
    const audioFiles = files
      .filter((entry) => AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));

    const scannedTracks = await mapWithConcurrency(audioFiles, concurrency, async (entry) => {
      const audioPath = path.join(folderPath, entry.name);
      const stat = await fileSystem.stat(audioPath);
      const cacheKey = artworkCacheDirectory ? getArtworkCacheKey(audioPath, stat) : "";
      const sidecarArtwork = findSidecarArtwork(folderPath, entry.name, fileNameLookup);
      const cachedArtwork = sidecarArtwork || findCachedArtwork(cacheKey, artworkCacheIndex);
      const metadata = await readMetadata(audioPath, stat, { skipCovers: Boolean(cachedArtwork) });
      const artwork = cachedArtwork || await getEmbeddedArtwork(metadata, cacheKey, artworkCacheIndex);
      const fallback = metadataFromFileName(entry.name);
      const title = typeof metadata?.common?.title === "string" && metadata.common.title.trim()
        ? metadata.common.title.trim().slice(0, 500)
        : fallback.title.slice(0, 500);
      const artist = typeof metadata?.common?.artist === "string" && metadata.common.artist.trim()
        ? metadata.common.artist.trim().slice(0, 500)
        : fallback.artist.slice(0, 500);
      const album = typeof metadata?.common?.album === "string"
        ? metadata.common.album.trim().slice(0, 500)
        : "";
      const duration = Number(metadata?.format?.duration);
      const bitrate = Number(metadata?.format?.bitrate);
      return {
        id: `local:${entry.name}`,
        key: `local:${entry.name}`,
        label: path.basename(entry.name, path.extname(entry.name)),
        relativePath: entry.name,
        src: audioPath,
        srcUrl: pathToFileURL(audioPath).href,
        isLocal: true,
        title,
        artist,
        album,
        duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
        _dedupe: {
          bitrate: Number.isFinite(bitrate) && bitrate > 0 ? bitrate : 0,
          fileSize: stat.size,
          lossless: metadata?.format?.lossless === true,
          taggedAlbum: typeof metadata?.common?.album === "string" && Boolean(metadata.common.album.trim()),
          taggedArtist: typeof metadata?.common?.artist === "string" && Boolean(metadata.common.artist.trim()),
          taggedTitle: typeof metadata?.common?.title === "string" && Boolean(metadata.common.title.trim())
        },
        ...artwork
      };
    });
    const deduplicated = deduplicateTracks(scannedTracks);
    const tracks = deduplicated.tracks.map(withoutDedupeDetails);
    Object.defineProperty(tracks, "duplicateCount", {
      configurable: false,
      enumerable: false,
      value: deduplicated.duplicates.length,
      writable: false
    });
    Object.defineProperty(tracks, "duplicateKeys", {
      configurable: false,
      enumerable: false,
      value: deduplicated.duplicates.map((track) => track.key).filter(Boolean),
      writable: false
    });
    return tracks;
  }

  return { getLocalLyrics, scanFolder };
}

module.exports = {
  MAX_EMBEDDED_ARTWORK_BYTES,
  MAX_SIDECAR_LYRICS_BYTES,
  DUPLICATE_DURATION_TOLERANCE_SECONDS,
  areDuplicateTracks,
  createMusicLibrary,
  deduplicateTracks,
  findSidecarArtwork,
  mapWithConcurrency,
  metadataFromFileName,
  normalizeIdentityText,
  stripCopySuffix
};
