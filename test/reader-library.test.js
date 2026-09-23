const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createReaderLibrary, decodeTextBuffer, isPathInside } = require("../src/reader-library");

test("decodes BOM Unicode, strict UTF-8 and common legacy text", () => {
  assert.deepEqual(decodeTextBuffer(Buffer.from("hello", "utf8")), { encoding: "utf-8", text: "hello" });
  assert.equal(decodeTextBuffer(Buffer.from([0xff, 0xfe, 0x60, 0x4f, 0x7d, 0x59])).text, "你好");
  assert.equal(decodeTextBuffer(Buffer.from([0x63, 0x61, 0x66, 0xe9])).text, "café");
  assert.deepEqual(decodeTextBuffer(Buffer.from([0xc4, 0xe3, 0xba, 0xc3])), { encoding: "gb18030", text: "你好" });
});

test("path containment does not accept sibling-prefix escapes", () => {
  assert.equal(isPathInside("/tmp/reader", "/tmp/reader/a.txt"), true);
  assert.equal(isPathInside("/tmp/reader", "/tmp/reader-escape/a.txt"), false);
});

test("scans recursively, ignores hidden/vendor folders, blocks symlink escape and reads by opaque key", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "reader-test-"));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "reader-outside-"));
  context.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  });
  await fs.mkdir(path.join(root, "chapter"));
  await fs.mkdir(path.join(root, ".hidden"));
  await fs.mkdir(path.join(root, "node_modules"));
  await fs.writeFile(path.join(root, "chapter", "one.md"), "# One\n\nHello");
  await fs.writeFile(path.join(root, ".hidden", "secret.txt"), "hidden");
  await fs.writeFile(path.join(root, "node_modules", "vendor.txt"), "vendor");
  await fs.writeFile(path.join(root, "too-large.txt"), Buffer.alloc(8 * 1024 * 1024 + 1));
  let deepFolder = root;
  for (let index = 0; index < 9; index += 1) {
    deepFolder = path.join(deepFolder, `depth-${index}`);
    await fs.mkdir(deepFolder);
  }
  await fs.writeFile(path.join(deepFolder, "too-deep.txt"), "deep");
  await fs.writeFile(path.join(outside, "escape.txt"), "outside");
  await fs.symlink(path.join(outside, "escape.txt"), path.join(root, "escape.txt"));

  const library = createReaderLibrary();
  const scan = await library.scan(root, { source: "reader", authorize: true });
  assert.deepEqual(scan.documents.map((entry) => entry.relativePath), [path.join("chapter", "one.md")]);
  assert.equal(scan.truncated, true);
  const content = await library.read("reader", scan.documents[0].key);
  assert.equal(content.text, "# One\n\nHello");
  await assert.rejects(() => library.read("reader", "reader:invented"), { code: "document-unavailable" });
});
