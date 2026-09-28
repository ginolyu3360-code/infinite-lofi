const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { createProviderCredentialStore, normalizeCredentialRecord } = require("../src/provider-credentials");

const CREDENTIAL_PATH = path.join(path.sep, "tmp", "infinite-lofi", "provider-credentials.bin");
const ACCESS_TOKEN = "BQD_secret_access_token_value";
const REFRESH_TOKEN = "AQD_secret_refresh_token_value";
const CLIENT_ID = "a1b2c3d4e5f60718293a4b5c6d7e8f90";

function createFakeSafeStorage({ available = true } = {}) {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (text) => Buffer.from(Buffer.from(String(text), "utf8").toString("base64"), "utf8"),
    decryptString: (buffer) => Buffer.from(Buffer.from(buffer).toString("utf8"), "base64").toString("utf8")
  };
}

function createFakeFileSystem() {
  const files = new Map();
  const modes = new Map();
  const missing = () => {
    const error = new Error("ENOENT: no such file");
    error.code = "ENOENT";
    return error;
  };
  return {
    files,
    modes,
    async mkdir() {},
    async writeFile(filePath, data, options) {
      files.set(filePath, Buffer.from(data));
      modes.set(filePath, options?.mode);
    },
    async readFile(filePath) {
      if (!files.has(filePath)) throw missing();
      return files.get(filePath);
    },
    async rename(from, to) {
      if (!files.has(from)) throw missing();
      files.set(to, files.get(from));
      modes.set(to, modes.get(from));
      files.delete(from);
      modes.delete(from);
    },
    async rm(filePath, options) {
      if (!files.has(filePath) && !options?.force) throw missing();
      files.delete(filePath);
    }
  };
}

function createRecord(overrides = {}) {
  return {
    providerId: "spotify",
    clientId: CLIENT_ID,
    accessToken: ACCESS_TOKEN,
    refreshToken: REFRESH_TOKEN,
    tokenType: "Bearer",
    scope: "user-read-private",
    accessExpiresAt: 1800000000000,
    refreshExpiresAt: 1810000000000,
    savedAt: 1790000000000,
    ...overrides
  };
}

test("requires a safeStorage-compatible encryptor, file system, and absolute path", () => {
  const safeStorage = createFakeSafeStorage();
  const fileSystem = createFakeFileSystem();
  assert.throws(() => createProviderCredentialStore({ fileSystem, filePath: CREDENTIAL_PATH }), /safeStorage/i);
  assert.throws(() => createProviderCredentialStore({ safeStorage, filePath: CREDENTIAL_PATH }), /fileSystem/i);
  assert.throws(() => createProviderCredentialStore({ safeStorage, fileSystem, filePath: "relative.bin" }), /absolute/i);
});

test("refuses to store or load credentials when encryption is unavailable", async () => {
  const fileSystem = createFakeFileSystem();
  const store = createProviderCredentialStore({
    safeStorage: createFakeSafeStorage({ available: false }),
    fileSystem,
    filePath: CREDENTIAL_PATH
  });
  assert.equal(store.isEncryptionAvailable(), false);
  await assert.rejects(store.save(createRecord()), (error) => error.code === "encryption-unavailable");
  await assert.rejects(store.load(), (error) => error.code === "encryption-unavailable");
});

test("stores encrypted credentials atomically with 0600 permissions and no plaintext", async () => {
  const fileSystem = createFakeFileSystem();
  const store = createProviderCredentialStore({ safeStorage: createFakeSafeStorage(), fileSystem, filePath: CREDENTIAL_PATH });

  const saved = await store.save(createRecord());
  assert.equal(saved.providerId, "spotify");
  assert.equal(saved.clientId, CLIENT_ID);
  assert.equal(fileSystem.files.has(`${CREDENTIAL_PATH}.tmp`), false);
  assert.equal(fileSystem.files.has(CREDENTIAL_PATH), true);
  assert.equal(fileSystem.modes.get(CREDENTIAL_PATH), 0o600);

  const stored = fileSystem.files.get(CREDENTIAL_PATH).toString("utf8");
  assert.equal(stored.includes(ACCESS_TOKEN), false);
  assert.equal(stored.includes(REFRESH_TOKEN), false);
});

test("round-trips a normalized credential record", async () => {
  const fileSystem = createFakeFileSystem();
  const store = createProviderCredentialStore({ safeStorage: createFakeSafeStorage(), fileSystem, filePath: CREDENTIAL_PATH });
  await store.save(createRecord({ extraField: "ignored" }));
  const loaded = await store.load();
  assert.equal(loaded.providerId, "spotify");
  assert.equal(loaded.clientId, CLIENT_ID);
  assert.equal(loaded.accessToken, ACCESS_TOKEN);
  assert.equal(loaded.refreshToken, REFRESH_TOKEN);
  assert.equal(loaded.accessExpiresAt, 1800000000000);
  assert.equal(Object.hasOwn(loaded, "extraField"), false);
  assert.equal(Object.isFrozen(loaded), true);
});

test("returns null when no credentials are stored", async () => {
  const store = createProviderCredentialStore({
    safeStorage: createFakeSafeStorage(),
    fileSystem: createFakeFileSystem(),
    filePath: CREDENTIAL_PATH
  });
  assert.equal(await store.load(), null);
});

test("reports decrypt and malformed failures without leaking stored values", async () => {
  const fileSystem = createFakeFileSystem();
  const store = createProviderCredentialStore({ safeStorage: createFakeSafeStorage(), fileSystem, filePath: CREDENTIAL_PATH });

  const throwingDecrypt = createProviderCredentialStore({
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: () => Buffer.from("ciphertext"),
      decryptString: () => { throw new Error(`cannot decrypt ${ACCESS_TOKEN}`); }
    },
    fileSystem,
    filePath: CREDENTIAL_PATH
  });
  fileSystem.files.set(CREDENTIAL_PATH, Buffer.from("ciphertext", "utf8"));
  await assert.rejects(throwingDecrypt.load(), (error) => {
    assert.equal(error.code, "decrypt-failed");
    assert.equal(error.message.includes(ACCESS_TOKEN), false);
    return true;
  });

  fileSystem.files.set(CREDENTIAL_PATH, Buffer.from(Buffer.from("{ not json", "utf8").toString("base64"), "utf8"));
  await assert.rejects(store.load(), (error) => error.code === "malformed-credentials");

  fileSystem.files.set(CREDENTIAL_PATH, Buffer.from(Buffer.from(JSON.stringify({ unexpected: ACCESS_TOKEN }), "utf8").toString("base64"), "utf8"));
  await assert.rejects(store.load(), (error) => {
    assert.equal(error.code, "malformed-credentials");
    assert.equal(error.message.includes(ACCESS_TOKEN), false);
    return true;
  });
});

test("rejects malformed records before writing anything", async () => {
  const fileSystem = createFakeFileSystem();
  const store = createProviderCredentialStore({ safeStorage: createFakeSafeStorage(), fileSystem, filePath: CREDENTIAL_PATH });
  await assert.rejects(store.save(createRecord({ accessToken: "" })), (error) => {
    assert.equal(error.code, "malformed-credentials");
    assert.equal(error.message.includes(ACCESS_TOKEN), false);
    return true;
  });
  await assert.rejects(store.save(createRecord({ providerId: "" })), (error) => error.code === "malformed-credentials");
  await assert.rejects(store.save(createRecord({ clientId: "" })), (error) => error.code === "malformed-credentials");
  assert.equal(fileSystem.files.size, 0);
  assert.throws(() => normalizeCredentialRecord(null), (error) => error.code === "malformed-credentials");
});

test("reports a write failure without leaking credential values", async () => {
  const fileSystem = createFakeFileSystem();
  fileSystem.rename = async () => { throw new Error(`rename failed for ${ACCESS_TOKEN}`); };
  const store = createProviderCredentialStore({ safeStorage: createFakeSafeStorage(), fileSystem, filePath: CREDENTIAL_PATH });
  await assert.rejects(store.save(createRecord()), (error) => {
    assert.equal(error.code, "write-failed");
    assert.equal(error.message.includes(ACCESS_TOKEN), false);
    return true;
  });
  assert.equal(fileSystem.files.has(`${CREDENTIAL_PATH}.tmp`), false);
});

test("clears stored credentials safely and is idempotent", async () => {
  const fileSystem = createFakeFileSystem();
  const store = createProviderCredentialStore({ safeStorage: createFakeSafeStorage(), fileSystem, filePath: CREDENTIAL_PATH });
  await store.save(createRecord());
  assert.equal(await store.clear(), true);
  assert.equal(fileSystem.files.has(CREDENTIAL_PATH), false);
  assert.equal(await store.clear(), true);
});
