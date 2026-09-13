const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ambience = require("../src/ambience");
const { createAmbienceController } = require("../src/ambience-controller");
const { createGainEnvelope } = require("../src/audio-transition");

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

test("ambient fades obey the latest play, pause, switch, and stop intent", async () => {
  let now = 0;
  let nextHandle = 1;
  const scheduled = new Map();
  const advance = async (milliseconds) => {
    now += milliseconds;
    const callbacks = [...scheduled.values()];
    scheduled.clear();
    callbacks.forEach((callback) => callback(now));
    await Promise.resolve();
  };
  const gainEnvelopeFactory = (options) => createGainEnvelope({
    ...options,
    now: () => now,
    schedule(callback) {
      const handle = nextHandle++;
      scheduled.set(handle, callback);
      return handle;
    },
    cancelScheduled(handle) { scheduled.delete(handle); }
  });
  const { controller, elements, getState } = createHarness(
    { soundId: "soft-rain", volume: 0.4 },
    {
      gainEnvelopeFactory,
      getAudioTransitionSettings: () => ({ enabled: true, durationMs: 200 })
    }
  );
  controller.restore();

  const firstPlay = controller.play();
  await Promise.resolve();
  await advance(200);
  assert.equal(await firstPlay, true);
  assert.equal(elements.audio.volume, 0.4);

  const stalePause = controller.pause();
  await Promise.resolve();
  await advance(100);
  assert.equal(elements.audio.volume, 0.2);
  const replay = controller.play();
  await Promise.resolve();
  assert.equal(await stalePause, false);
  await advance(200);
  assert.equal(await replay, true);
  assert.equal(elements.audio.paused, false);
  assert.equal(elements.audio.volume, 0.4);

  const switched = controller.setSound("quiet-cafe");
  await Promise.resolve();
  await advance(200);
  await advance(200);
  assert.equal(await switched, true);
  assert.equal(getState().player.ambience.soundId, "quiet-cafe");
  assert.match(elements.audio.src, /quiet-cafe\.wav$/);
  assert.equal(elements.audio.paused, false);

  const suspendedPause = controller.pause();
  await Promise.resolve();
  await advance(50);
  controller.settleTransition();
  assert.equal(await suspendedPause, false);
  assert.equal(elements.audio.paused, true);
  assert.equal(elements.audio.volume, 0.4);
  const resumedPlay = controller.play();
  await Promise.resolve();
  await advance(200);
  assert.equal(await resumedPlay, true);

  const interruptedPause = controller.pause();
  await Promise.resolve();
  await advance(50);
  controller.stop();
  await advance(500);
  assert.equal(await interruptedPause, false);
  assert.equal(elements.audio.paused, true);
  assert.equal(elements.audio.currentTime, 0);
  assert.equal(elements.audio.volume, 0.4);
  assert.equal(scheduled.size, 0);
});

test("bundled ambient WAV files are valid, deterministic-size PCM and remain within the asset budget", () => {
  const expectedHashes = {
    "brown-noise.wav": "e524ba2882283c3b669e57083f65a3ecb0d234c071c42d6009244c88d10cacdd",
    "quiet-cafe.wav": "9bcd8ed65fb2f4cd098617f5cbb58d8baa4330206c98589f28455f048055858a",
    "soft-rain.wav": "6f40f4f0700d75053acb5abf3260ebac9c6fb937c5670332494fc511158f3fae"
  };
  let totalBytes = 0;
  for (const sound of ambience.AMBIENCE_SOUNDS) {
    const fileName = path.basename(sound.src);
    const filePath = path.join(__dirname, "..", "assets", "ambience", fileName);
    const buffer = fs.readFileSync(filePath);
    totalBytes += buffer.length;
    assert.equal(buffer.toString("ascii", 0, 4), "RIFF");
    assert.equal(buffer.toString("ascii", 8, 12), "WAVE");
    assert.equal(buffer.readUInt16LE(20), 1);
    assert.equal(buffer.readUInt16LE(22), 1);
    assert.equal(buffer.readUInt32LE(24), 44100);
    assert.equal(buffer.readUInt16LE(34), 16);
    assert.equal(buffer.readUInt32LE(40), 44100 * 12 * 2);
    assert.equal(crypto.createHash("sha256").update(buffer).digest("hex"), expectedHashes[fileName]);

    let adjacentSquareSum = 0;
    let previous = buffer.readInt16LE(44);
    for (let offset = 46; offset < buffer.length; offset += 2) {
      const current = buffer.readInt16LE(offset);
      const delta = current - previous;
      adjacentSquareSum += delta * delta;
      previous = current;
    }
    const adjacentRms = Math.sqrt(adjacentSquareSum / (buffer.readUInt32LE(40) / 2 - 1));
    const loopBoundaryDelta = Math.abs(buffer.readInt16LE(44) - previous);
    assert.ok(loopBoundaryDelta <= adjacentRms, `${fileName} loop boundary exceeds its adjacent-sample RMS`);
  }
  assert.ok(totalBytes < 15 * 1024 * 1024);
  assert.match(fs.readFileSync(path.join(__dirname, "..", "assets", "ambience", "ATTRIBUTION.txt"), "utf8"), /generated by/);
  assert.match(fs.readFileSync(path.join(__dirname, "..", "assets", "ambience", "LICENSE.txt"), "utf8"), /MIT License/);
});
