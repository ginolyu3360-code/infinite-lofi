const path = require("node:path");

const MAX_TOKEN_LENGTH = 4096;
const MAX_SCOPE_LENGTH = 1024;
const MAX_CLIENT_ID_LENGTH = 128;

function boundedString(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function boundedTimestamp(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

function createCredentialStoreError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function normalizeCredentialRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw createCredentialStoreError("malformed-credentials", "Stored provider credentials are not valid.");
  }
  const providerId = boundedString(record.providerId, 64);
  const clientId = boundedString(record.clientId, MAX_CLIENT_ID_LENGTH);
  const accessToken = boundedString(record.accessToken, MAX_TOKEN_LENGTH);
  if (!providerId || !clientId || !accessToken) {
    throw createCredentialStoreError("malformed-credentials", "Stored provider credentials are incomplete.");
  }
  return Object.freeze({
    providerId,
    clientId,
    accessToken,
    refreshToken: boundedString(record.refreshToken, MAX_TOKEN_LENGTH),
    tokenType: boundedString(record.tokenType, 32) || "Bearer",
    scope: boundedString(record.scope, MAX_SCOPE_LENGTH),
    accessExpiresAt: boundedTimestamp(record.accessExpiresAt),
    refreshExpiresAt: boundedTimestamp(record.refreshExpiresAt),
    savedAt: boundedTimestamp(record.savedAt)
  });
}

function createProviderCredentialStore(options = {}) {
  const { safeStorage, fileSystem, filePath } = options;
  if (!safeStorage ||
    typeof safeStorage.isEncryptionAvailable !== "function" ||
    typeof safeStorage.encryptString !== "function" ||
    typeof safeStorage.decryptString !== "function") {
    throw new TypeError("A safeStorage-compatible encryptor is required.");
  }
  if (!fileSystem ||
    typeof fileSystem.readFile !== "function" ||
    typeof fileSystem.writeFile !== "function" ||
    typeof fileSystem.rename !== "function" ||
    typeof fileSystem.mkdir !== "function" ||
    typeof fileSystem.rm !== "function") {
    throw new TypeError("A fileSystem-compatible object is required.");
  }
  if (typeof filePath !== "string" || !path.isAbsolute(filePath)) {
    throw new TypeError("An absolute credential file path is required.");
  }

  const directory = path.dirname(filePath);
  const temporaryPath = `${filePath}.tmp`;

  function isEncryptionAvailable() {
    try {
      return safeStorage.isEncryptionAvailable() === true;
    } catch {
      return false;
    }
  }

  function requireEncryption() {
    if (!isEncryptionAvailable()) {
      throw createCredentialStoreError("encryption-unavailable", "Operating-system credential encryption is unavailable.");
    }
  }

  async function save(record) {
    requireEncryption();
    const normalized = normalizeCredentialRecord(record);
    let encrypted;
    try {
      encrypted = safeStorage.encryptString(JSON.stringify(normalized));
    } catch {
      throw createCredentialStoreError("encrypt-failed", "Provider credentials could not be encrypted.");
    }
    if (!Buffer.isBuffer(encrypted) || encrypted.length === 0) {
      throw createCredentialStoreError("encrypt-failed", "Provider credentials could not be encrypted.");
    }
    try {
      await fileSystem.mkdir(directory, { recursive: true });
      await fileSystem.writeFile(temporaryPath, encrypted, { mode: 0o600 });
      await fileSystem.rename(temporaryPath, filePath);
    } catch {
      try {
        await fileSystem.rm(temporaryPath, { force: true });
      } catch {
        // Keep the original failure stable and free of credential details.
      }
      throw createCredentialStoreError("write-failed", "Provider credentials could not be stored.");
    }
    return normalized;
  }

  async function load() {
    requireEncryption();
    let raw;
    try {
      raw = await fileSystem.readFile(filePath);
    } catch (error) {
      if (error && error.code === "ENOENT") return null;
      throw createCredentialStoreError("read-failed", "Provider credentials could not be read.");
    }
    const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    let decrypted;
    try {
      decrypted = safeStorage.decryptString(buffer);
    } catch {
      throw createCredentialStoreError("decrypt-failed", "Stored provider credentials could not be decrypted.");
    }
    let parsed;
    try {
      parsed = JSON.parse(decrypted);
    } catch {
      throw createCredentialStoreError("malformed-credentials", "Stored provider credentials are not valid.");
    }
    return normalizeCredentialRecord(parsed);
  }

  async function clear() {
    try {
      await fileSystem.rm(filePath, { force: true });
    } catch (error) {
      if (error && error.code === "ENOENT") return true;
      throw createCredentialStoreError("clear-failed", "Provider credentials could not be cleared.");
    }
    return true;
  }

  return Object.freeze({
    clear,
    isEncryptionAvailable,
    load,
    save
  });
}

module.exports = {
  createProviderCredentialStore,
  normalizeCredentialRecord
};
