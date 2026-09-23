const test = require("node:test");
const assert = require("node:assert/strict");
const {
  MAX_SCROLL_ENTRIES,
  documentFormat,
  isSupportedDocument,
  mergeDocumentSources,
  normalizeReaderState
} = require("../src/reader");
const { renderSafeMarkdown } = require("../src/reader-controller");

function createNode(tagName = "#text", text = "") {
  return {
    tagName: tagName.toUpperCase(),
    textContent: text,
    children: [],
    listeners: {},
    appendChild(child) { this.children.push(child); return child; },
    replaceChildren(...children) { this.children = children; },
    addEventListener(name, handler) { this.listeners[name] = handler; }
  };
}

test("Reader accepts the bounded mainstream text formats", () => {
  for (const name of ["a.txt", "a.text", "a.md", "a.markdown", "a.log", "a.csv", "a.json", "a.yaml", "a.yml"]) {
    assert.equal(isSupportedDocument(name), true, name);
  }
  for (const name of ["a.html", "a.pdf", "a.docx", "a.rtf", "a.epub", "a.srt"]) {
    assert.equal(isSupportedDocument(name), false, name);
  }
  assert.equal(documentFormat("a.md"), "markdown");
  assert.equal(documentFormat("a.json"), "json");
  assert.equal(documentFormat("a.yaml"), "monospace");
});

test("Reader state is bounded and keeps only recent scroll positions", () => {
  const positions = Object.fromEntries(Array.from({ length: 105 }, (_, index) => [`doc-${index}`, index / 100]));
  const state = normalizeReaderState({
    folderPath: "/Books",
    lastDocumentKey: "reader:last",
    fontScale: 999,
    lineWidth: "invalid",
    theme: "paper",
    sidebarOpen: false,
    scrollPositions: positions
  });
  assert.equal(state.fontScale, 160);
  assert.equal(state.lineWidth, "medium");
  assert.equal(state.theme, "paper");
  assert.equal(state.sidebarOpen, false);
  assert.equal(Object.keys(state.scrollPositions).length, MAX_SCROLL_ENTRIES);
  assert.equal(state.scrollPositions["doc-104"], 1);
});

test("Reader merges media and independent folders by canonical path", () => {
  const merged = mergeDocumentSources(
    [{ key: "m:a", realPath: "/Music/a.md" }],
    [{ key: "r:a", realPath: "/Music/a.md" }, { key: "r:b", realPath: "/Books/b.txt" }]
  );
  assert.equal(merged.media.length, 1);
  assert.deepEqual(merged.reader.map((entry) => entry.key), ["r:b"]);
});

test("safe Markdown creates text nodes, blocks HTML and images, and limits links to HTTP(S)", () => {
  const root = createNode("article");
  const document = {
    createElement: (name) => createNode(name),
    createTextNode: (text) => createNode("#text", text)
  };
  const opened = [];
  renderSafeMarkdown(
    document,
    root,
    "# Safe\n\n<script>alert(1)</script>\n\n![remote](https://example.com/x.png)\n\n[site](https://example.com) [file](file:///tmp/a)",
    (url) => opened.push(url)
  );
  const allNodes = [];
  const visit = (node) => { allNodes.push(node); node.children.forEach(visit); };
  visit(root);
  assert.equal(allNodes.some((node) => node.tagName === "SCRIPT" || node.tagName === "IMG"), false);
  const links = allNodes.filter((node) => node.tagName === "A");
  assert.equal(links.length, 1);
  links[0].listeners.click({ preventDefault() {} });
  assert.deepEqual(opened, ["https://example.com/"]);
  assert.match(allNodes.map((node) => node.textContent).join(" "), /<script>alert\(1\)<\/script>/);
});
