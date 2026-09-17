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
      format: { duration: metadata?.format?.duration }
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

    return mapWithConcurrency(audioFiles, concurrency, async (entry) => {
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
        ...artwork
      };
    });
  }

  return { getLocalLyrics, scanFolder };
}

module.exports = {
  MAX_EMBEDDED_ARTWORK_BYTES,
  MAX_SIDECAR_LYRICS_BYTES,
  createMusicLibrary,
  findSidecarArtwork,
  mapWithConcurrency,
  metadataFromFileName
};
