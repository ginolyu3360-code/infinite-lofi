const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ambience = require("../src/ambience");
const { createAmbienceController } = require("../src/ambience-controller");

function createElement(tagName = "div") {
  const listeners = new Map();
  const element = {
    tagName: tagName.toUpperCase(),
    children: [],
    attributes: {},
    value: "",
    textContent: "",
    disabled: false,
    appendChild(child) { this.children.push(child); },
    addEventListener(name, handler) {
      const handlers = listeners.get(name) || [];
      handlers.push(handler);
      listeners.set(name, handlers);
    },
    dispatch(name) { (listeners.get(name) || []).forEach((handler) => handler()); },
    hasAttribute(name) { return Object.hasOwn(this.attributes, name); },
    setAttribute(name, value) { this.attributes[name] = String(value); }
  };
  Object.defineProperty(element, "innerHTML", {
    get() { return ""; },
    set() { element.children = []; }
  });
  return element;
}

function createAudio() {
  const audio = createElement("audio");
  let source = "";
  audio.paused = true;
  audio.currentTime = 0;
  audio.volume = 1;
  audio.loop = false;
  audio.playCalls = [];
  Object.defineProperty(audio, "src", {
    get() { return source; },
    set(value) {
      source = value ? new URL(value, "file:///app/src/index.html").href : "";
      if (value) audio.attributes.src = String(value);
      else delete audio.attributes.src;
    }
  });
  audio.removeAttribute = (name) => {
    delete audio.attributes[name];
    if (name === "src") source = "";
  };
  audio.load = () => {};
  audio.pause = () => { audio.paused = true; audio.dispatch("pause"); };
  audio.play = () => {
    audio.paused = false;
    audio.playCalls.push(source);
    audio.dispatch("play");
    return Promise.resolve();
  };
  return audio;
}

function createHarness(initialAmbience = {}, options = {}) {
  let state = { player: { ambience: structuredClone(initialAmbience) } };
  let storageFailure = null;
  const errors = [];
  const elements = {
    document: { baseURI: "file:///app/src/index.html", createElement },
    audio: createAudio(),
    soundSelect: createElement("select"),
    toggleButton: createElement("button"),
    volumeSlider: createElement("input"),
    status: createElement("p")
  };
  const controller = createAmbienceController({
    appStorage: {
      getState: () => structuredClone(state),
      update(mutator) {
        if (storageFailure) throw storageFailure;
        const draft = structuredClone(state);
        mutator(draft);
        state = draft;
        return structuredClone(state);
      }
    },
    elements,
    onError: (error) => errors.push(error),
    t: (key, params = {}) => params.sound ? `${key}:${params.sound}` : key,
    ...options
  });
  return {
    controller,
    elements,
    errors,
    getState: () => structuredClone(state),
    failStorage(error) { storageFailure = error; }
  };
}

test("normalizes the curated ambient preference without losing an explicit zero volume", () => {
  assert.deepEqual(ambience.normalizeAmbienceSettings({ soundId: "soft-rain", volume: 0 }), {
    soundId: "soft-rain",
    volume: 0
  });
  assert.deepEqual(ambience.normalizeAmbienceSettings({ soundId: "network", volume: "bad" }), {
    soundId: null,
    volume: 0.35
  });
  assert.equal(ambience.AMBIENCE_SOUNDS.every((sound) => sound.src.startsWith("../assets/ambience/")), true);
});

test("restores the saved selection and volume while remaining paused and unloaded", () => {
  const { controller, elements } = createHarness({ soundId: "soft-rain", volume: 0 });
  controller.restore();
  assert.equal(elements.audio.paused, true);
  assert.equal(elements.audio.src, "");
  assert.equal(elements.audio.volume, 0);
  assert.equal(elements.soundSelect.value, "soft-rain");
  assert.equal(elements.toggleButton.disabled, false);
});

test("keeps one ambient element active, stops the old source before switching, and stays paused when selected while paused", async () => {
  const { controller, elements, getState } = createHarness({ soundId: "soft-rain", volume: 0.35 });
  controller.bindEvents();
  controller.restore();
  await controller.play();
  assert.equal(controller.isPlaying(), true);
  assert.match(elements.audio.src, /soft-rain\.wav$/);

  await controller.setSound("quiet-cafe");
  assert.equal(controller.isPlaying(), true);
  assert.match(elements.audio.src, /quiet-cafe\.wav$/);
  assert.deepEqual(elements.audio.playCalls.map((source) => path.basename(new URL(source).pathname)), [
    "soft-rain.wav",
    "quiet-cafe.wav"
  ]);

  controller.pause();
  await controller.setSound("brown-noise");
  assert.equal(controller.isPlaying(), false);
  assert.equal(elements.audio.src, "");
  assert.equal(getState().player.ambience.soundId, "brown-noise");
});

test("does not let a stale play callback stop the latest rapidly selected sound", async () => {
  const pending = [];
  const { controller, elements } = createHarness({ soundId: "soft-rain", volume: 0.35 });
  elements.audio.play = () => {
    elements.audio.paused = false;
    elements.audio.playCalls.push(elements.audio.src);
    return new Promise((resolve) => pending.push(resolve));
  };
  controller.restore();
  const firstPlay = controller.play();
  const switchSound = controller.setSound("quiet-cafe");
  pending[0]();
  await firstPlay;
  assert.match(elements.audio.src, /quiet-cafe\.wav$/);
  assert.equal(elements.audio.paused, false);
  pending[1]();
  await switchSound;
  assert.equal(controller.isPlaying(), true);
});

test("surfaces decode and storage failures while preserving the last saved preference", async () => {
  const harness = createHarness({ soundId: "soft-rain", volume: 0.35 });
  harness.controller.bindEvents();
  harness.controller.restore();
  await harness.controller.play();
  harness.elements.audio.dispatch("error");
  assert.equal(harness.controller.isPlaying(), false);
  assert.match(harness.elements.status.textContent, /ambience\.unavailable/);

  harness.failStorage(new Error("quota"));
  assert.equal(await harness.controller.setSound("quiet-cafe"), false);
  assert.equal(harness.getState().player.ambience.soundId, "soft-rain");
  assert.equal(harness.errors.length, 2);
});

test("destroys ambient playback and releases its decoded source", async () => {
  const { controller, elements } = createHarness({ soundId: "brown-noise", volume: 0.2 });
  controller.restore();
  await controller.play();
  controller.destroy();
  assert.equal(elements.audio.paused, true);
  assert.equal(elements.audio.src, "");
  assert.equal(elements.audio.currentTime, 0);
  assert.equal(await controller.play(), false);
});

test("bundled ambient WAV files are valid, deterministic-size PCM and remain within the asset budget", () => {
  let totalBytes = 0;
  for (const sound of ambience.AMBIENCE_SOUNDS) {
    const filePath = path.join(__dirname, "..", "assets", "ambience", path.basename(sound.src));
    const buffer = fs.readFileSync(filePath);
    totalBytes += buffer.length;
    assert.equal(buffer.toString("ascii", 0, 4), "RIFF");
    assert.equal(buffer.toString("ascii", 8, 12), "WAVE");
    assert.equal(buffer.readUInt16LE(20), 1);
    assert.equal(buffer.readUInt16LE(22), 1);
    assert.equal(buffer.readUInt32LE(24), 44100);
    assert.equal(buffer.readUInt16LE(34), 16);
    assert.equal(buffer.readUInt32LE(40), 44100 * 12 * 2);
  }
  assert.ok(totalBytes < 15 * 1024 * 1024);
});
