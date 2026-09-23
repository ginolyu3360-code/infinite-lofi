const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENTS,
  MAX_SCAN_DEPTH,
  documentFormat,
  isSupportedDocument
} = require("./reader");

const IGNORED_DIRECTORIES = new Set([".git", "node_modules"]);
const DECODING_CANDIDATES = ["gb18030", "shift_jis", "windows-1252"];

function isPathInside(rootPath, targetPath) {
  const relative = path.relative(rootPath, targetPath);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function scoreDecodedText(text) {
  if (!text) return 0;
  let suspicious = 0;
  let useful = 0;
  let scriptSignal = 0;
  for (const character of text.slice(0, 65536)) {
    const code = character.codePointAt(0);
    if (character === "\uFFFD" || (code < 32 && ![9, 10, 13].includes(code))) suspicious += 12;
    else if (/\p{L}|\p{N}|\s|[\p{P}\p{S}]/u.test(character)) {
      useful += 1;
      if (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(character)) scriptSignal += 2;
      else if (/[\u0080-\u00ff]/u.test(character)) scriptSignal -= 1;
    }
  }
  return useful + scriptSignal - suspicious * 20;
}

function decodeTextBuffer(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { encoding: "utf-8", text: bytes.subarray(3).toString("utf8") };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { encoding: "utf-16le", text: new TextDecoder("utf-16le", { fatal: true }).decode(bytes.subarray(2)) };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { encoding: "utf-16be", text: new TextDecoder("utf-16be", { fatal: true }).decode(bytes.subarray(2)) };
  }
  try {
    return { encoding: "utf-8", text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {}

  const decoded = [];
  for (const encoding of DECODING_CANDIDATES) {
    try {
      const text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
      decoded.push({ encoding, score: scoreDecodedText(text), text });
    } catch {}
  }
  decoded.sort((left, right) => right.score - left.score);
  const ambiguous = decoded[1] && decoded[0].text !== decoded[1].text && decoded[0].score === decoded[1].score;
  if (!decoded[0] || ambiguous || decoded[0].score < Math.max(2, bytes.length * 0.25)) {
    const error = new Error("Document encoding could not be identified reliably.");
    error.code = "encoding-unrecognized";
    throw error;
  }
  return { encoding: decoded[0].encoding, text: decoded[0].text };
}

function documentKey(source, relativePath) {
  return `${source}:${crypto.createHash("sha256").update(relativePath).digest("hex").slice(0, 24)}`;
}

function createReaderLibrary({ fileSystem = fs.promises } = {}) {
  const roots = new Map();

  async function authorizeRoot(rootPath, source) {
    if (typeof rootPath !== "string" || !path.isAbsolute(rootPath)) throw Object.assign(new Error("Invalid reader folder."), { code: "invalid-folder" });
    const canonicalRoot = await fileSystem.realpath(rootPath);
    const stat = await fileSystem.stat(canonicalRoot);
    if (!stat.isDirectory()) throw Object.assign(new Error("Reader folder is unavailable."), { code: "folder-unavailable" });
    roots.set(source, canonicalRoot);
    return canonicalRoot;
  }

  async function scan(rootPath, { source = "reader", authorize = false } = {}) {
    const canonicalRoot = authorize
      ? await authorizeRoot(rootPath, source)
      : await fileSystem.realpath(rootPath);
    if (roots.get(source) !== canonicalRoot) throw Object.assign(new Error("Reader folder is not approved."), { code: "folder-not-approved" });
    const documents = [];
    let truncated = false;

    async function visit(folderPath, depth) {
      if (depth > MAX_SCAN_DEPTH || documents.length >= MAX_DOCUMENTS) {
        truncated = true;
        return;
      }
      const entries = await fileSystem.readdir(folderPath, { withFileTypes: true });
      entries.sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));
      for (const entry of entries) {
        if (documents.length >= MAX_DOCUMENTS) {
          truncated = true;
          break;
        }
        if (entry.name.startsWith(".")) continue;
        const candidate = path.join(folderPath, entry.name);
        let canonicalCandidate;
        try {
          canonicalCandidate = await fileSystem.realpath(candidate);
        } catch {
          continue;
        }
        if (!isPathInside(canonicalRoot, canonicalCandidate)) continue;
        const stat = await fileSystem.stat(canonicalCandidate);
        if (stat.isDirectory()) {
          if (!IGNORED_DIRECTORIES.has(entry.name) && depth < MAX_SCAN_DEPTH) await visit(canonicalCandidate, depth + 1);
          else if (!IGNORED_DIRECTORIES.has(entry.name)) truncated = true;
          continue;
        }
        if (!stat.isFile() || !isSupportedDocument(entry.name) || stat.size > MAX_DOCUMENT_BYTES) continue;
        const relativePath = path.relative(canonicalRoot, canonicalCandidate);
        documents.push({
          key: documentKey(source, relativePath),
          name: path.basename(canonicalCandidate),
          relativePath,
          realPath: canonicalCandidate,
          source,
          format: documentFormat(canonicalCandidate),
          size: stat.size,
          modifiedAt: stat.mtimeMs
        });
      }
    }

    await visit(canonicalRoot, 0);
    return { folderPath: canonicalRoot, documents, truncated };
  }

  async function read(source, requestedKey) {
    const rootPath = roots.get(source);
    if (!rootPath) throw Object.assign(new Error("Reader folder is not approved."), { code: "folder-not-approved" });
    const listing = await scan(rootPath, { source });
    const document = listing.documents.find((entry) => entry.key === requestedKey);
    if (!document) throw Object.assign(new Error("Document is no longer available."), { code: "document-unavailable" });
    const canonicalPath = await fileSystem.realpath(document.realPath);
    if (!isPathInside(rootPath, canonicalPath)) throw Object.assign(new Error("Document is outside the approved folder."), { code: "path-outside-root" });
    const stat = await fileSystem.stat(canonicalPath);
    if (!stat.isFile() || stat.size > MAX_DOCUMENT_BYTES) throw Object.assign(new Error("Document is too large."), { code: "document-too-large" });
    const decoded = decodeTextBuffer(await fileSystem.readFile(canonicalPath));
    let text = decoded.text;
    let warning = null;
    if (document.format === "json") {
      try {
        text = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        warning = "invalid-json";
      }
    }
    return { ...document, encoding: decoded.encoding, text, warning };
  }

  function revoke(source) {
    roots.delete(source);
  }

  return { authorizeRoot, read, revoke, scan };
}

module.exports = {
  DECODING_CANDIDATES,
  createReaderLibrary,
  decodeTextBuffer,
  documentKey,
  isPathInside,
  scoreDecodedText
};
