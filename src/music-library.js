const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".flac", ".aac", ".m4a", ".ogg"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"]);
const CACHE_EXTENSIONS = [".jpg", ".png", ".webp", ".gif", ".bmp"];
const MAX_EMBEDDED_ARTWORK_BYTES = 5 * 1024 * 1024;

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

  async function getArtworkCacheKey(audioPath) {
    const stat = await fileSystem.stat(audioPath);
    return crypto
      .createHash("sha256")
      .update(`${audioPath}\0${stat.size}\0${stat.mtimeMs}`)
      .digest("hex");
  }

  async function findCachedArtwork(cacheKey) {
    if (!artworkCacheDirectory) return null;
    for (const extension of CACHE_EXTENSIONS) {
      const cachedPath = path.join(artworkCacheDirectory, `${cacheKey}${extension}`);
      try {
        await fileSystem.access(cachedPath);
        return {
          artworkName: "Embedded Cover",
          artworkPath: cachedPath,
          artworkUrl: pathToFileURL(cachedPath).href
        };
      } catch {}
    }
    return null;
  }

  async function getEmbeddedArtwork(audioPath) {
    try {
      const cacheKey = artworkCacheDirectory ? await getArtworkCacheKey(audioPath) : "";
      const cached = cacheKey ? await findCachedArtwork(cacheKey) : null;
      if (cached) return cached;

      const metadata = await parseFile(audioPath, { duration: false });
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

  async function scanFolder(folderPath) {
    const entries = await fileSystem.readdir(folderPath, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile());
    const fileNameLookup = new Map(files.map((entry) => [entry.name.toLowerCase(), entry.name]));
    const audioFiles = files
      .filter((entry) => AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));

    return mapWithConcurrency(audioFiles, concurrency, async (entry, index) => {
      const audioPath = path.join(folderPath, entry.name);
      const sidecarArtwork = findSidecarArtwork(folderPath, entry.name, fileNameLookup);
      const artwork = sidecarArtwork || await getEmbeddedArtwork(audioPath);
      return {
        id: `local-${index}`,
        label: path.basename(entry.name, path.extname(entry.name)),
        src: audioPath,
        srcUrl: pathToFileURL(audioPath).href,
        isLocal: true,
        ...artwork
      };
    });
  }

  return { scanFolder };
}

module.exports = {
  MAX_EMBEDDED_ARTWORK_BYTES,
  createMusicLibrary,
  findSidecarArtwork,
  mapWithConcurrency
};
