const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  announce,
  compositeColor,
  contrastRatio,
  createFocusManager,
  parseColor,
  setDisclosureState
} = require("../src/accessibility");

function createFocusable(document, name) {
  return {
    name,
    hidden: false,
    disabled: false,
    isConnected: true,
    attributes: new Map(),
    focus() { document.activeElement = this; },
    getAttribute(key) { return this.attributes.get(key) ?? null; },
    setAttribute(key, value) { this.attributes.set(key, String(value)); },
    getClientRects() { return [{}]; }
  };
}

test("moves focus into modal surfaces, traps Tab, and restores the trigger", () => {
  const document = { activeElement: null };
  const trigger = createFocusable(document, "trigger");
  const first = createFocusable(document, "first");
  const last = createFocusable(document, "last");
  const listeners = new Map();
  const surface = {
    inert: true,
    attributes: new Map(),
    querySelectorAll() { return [first, last]; },
    addEventListener(name, handler) { listeners.set(name, handler); },
    removeEventListener(name) { listeners.delete(name); },
    contains(element) { return element === first || element === last; },
    getAttribute(key) { return this.attributes.get(key) ?? null; },
    setAttribute(key, value) { this.attributes.set(key, String(value)); }
  };
  document.activeElement = trigger;
  const manager = createFocusManager({ document, requestAnimationFrame: (callback) => callback() });

  manager.open(surface, { trigger, initialFocus: first });
  assert.equal(surface.inert, false);
  assert.equal(surface.getAttribute("aria-hidden"), "false");
  assert.equal(document.activeElement, first);

  let prevented = false;
  listeners.get("keydown")({ key: "Tab", shiftKey: true, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(document.activeElement, last);

  prevented = false;
  listeners.get("keydown")({ key: "Tab", shiftKey: false, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(document.activeElement, first);

  manager.close(surface, { fallbackFocus: trigger });
  assert.equal(surface.inert, true);
  assert.equal(surface.getAttribute("aria-hidden"), "true");
  assert.equal(document.activeElement, trigger);
});

test("updates disclosure state and repeats identical live-region announcements", () => {
  const trigger = { setAttribute(name, value) { this[name] = value; } };
  setDisclosureState(trigger, true);
  assert.equal(trigger["aria-expanded"], "true");

  const region = { textContent: "" };
  const frames = [];
  announce(region, "Timer started");
  assert.equal(region.textContent, "Timer started");
  announce(region, "Timer started", { requestAnimationFrame: (callback) => frames.push(callback) });
  assert.equal(region.textContent, "");
  frames.shift()();
  assert.equal(region.textContent, "Timer started");
});

test("meets WCAG AA contrast for every curated interface theme", () => {
  const pairs = [
    ["#f4f0e8", "#11110f"],
    [compositeColor("rgba(244, 240, 232, 0.62)", "#11110f"), "#11110f"],
    ["#e8b66b", "#11110f"],
    ["#272520", "#f3efe7"],
    [compositeColor("rgba(39, 37, 32, 0.68)", "#f3efe7"), "#f3efe7"],
    ["#946126", "#f3efe7"],
    ["#fffaf1", "#9f6325"],
    ["#8d3434", "#f3efe7"],
    ["#edf6fb", "#07111d"],
    [compositeColor("rgba(237, 246, 251, 0.66)", "#07111d"), "#07111d"],
    ["#76badc", "#07111d"],
    ["#f0f6ed", "#0b1510"],
    [compositeColor("rgba(240, 246, 237, 0.66)", "#0b1510"), "#0b1510"],
    ["#9bc58e", "#0b1510"]
  ];
  for (const [foreground, background] of pairs) {
    assert.ok(contrastRatio(foreground, background) >= 4.5);
  }
  assert.deepEqual(parseColor("#abc"), { r: 170, g: 187, b: 204, a: 1 });
});

test("reduced-motion CSS removes meaningful transitions and repeated animation", () => {
  const stylesheet = fs.readFileSync(path.join(__dirname, "../src/styles/components.css"), "utf8");
  assert.match(stylesheet, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(stylesheet, /transition-duration:\s*0\.01ms !important/);
  assert.match(stylesheet, /animation-duration:\s*0\.01ms !important/);
  assert.match(stylesheet, /animation-iteration-count:\s*1 !important/);
});
