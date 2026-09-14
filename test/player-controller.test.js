const test = require("node:test");
const assert = require("node:assert/strict");

const playerModel = require("../src/player");
const { createPlayerController } = require("../src/player-controller");
const { createGainEnvelope } = require("../src/audio-transition");

function createElement(tagName = "div") {
  const listeners = new Map();
  const classes = new Set();
  const element = {
    tagName: tagName.toUpperCase(),
    children: [],
    dataset: {},
    attributes: {},
    textContent: "",
    title: "",
    hidden: false,
    draggable: false,
    className: "",
    classList: {
      add(...names) { names.forEach((name) => classes.add(name)); },
      remove(...names) { names.forEach((name) => classes.delete(name)); },
      toggle(name) {
        if (classes.has(name)) classes.delete(name);
        else classes.add(name);
      },
      contains(name) { return classes.has(name) || element.className.split(/\s+/).includes(name); }
    },
    appendChild(child) { this.children.push(child); },
    addEventListener(name, handler) { listeners.set(name, handler); },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    removeAttribute(name) { delete this.attributes[name]; },
    async click() { return listeners.get("click")?.({}); }
  };
  Object.defineProperty(element, "innerHTML", {
    get() { return ""; },
    set() { element.children = []; }
  });
  return element;
}

function createHarness(playerState, desktopApp, controllerOptions = {}) {
  let state = { player: structuredClone(playerState) };
  const audio = createElement("audio");
  audio.src = "";
  audio.srcUrl = "";
  audio.paused = true;
  audio.ended = false;
  audio.duration = 120;
  audio.currentTime = 0;
  audio.volume = 1;
  audio.pause = () => { audio.paused = true; };
  audio.play = () => { audio.paused = false; return Promise.resolve(); };
  audio.load = () => {};
  const elements = {
    document: { createElement },
    lofiPlayer: audio,
    playPauseBtn: createElement("button"),
    playlistPanel: createElement(),
    playlistItems: createElement(),
    playlistStatus: createElement(),
    trackLabel: createElement(),
    volumeSlider: { value: "68" },
    musicFolderDisplay: createElement(),
    loadMusicFolderBtn: createElement("button"),
    rescanMusicFolderBtn: createElement("button"),
    removeMissingTracksBtn: createElement("button"),
    useDefaultTracksBtn: createElement("button")
  };
  const controller = createPlayerController({
    appStorage: {
      getState: () => structuredClone(state),
      update(mutator) {
        const draft = structuredClone(state);
        mutator(draft);
        state = draft;
        return structuredClone(state);
      }
    },
    desktopApp,
    elements,
    playerModel,
    defaultTracks: controllerOptions.defaultTracks || [{ key: "builtin:one", label: "One", src: "one.wav" }],
    alert() {},
    logger: { error() {} },
    ...controllerOptions
  });
  return { controller, elements, getState: () => state };
}

test("keeps an unavailable folder queue visible and reconnects it by relative track keys", async () => {
  const saved = {
    folderPath: "/Old/Focus",
    queue: [
      { key: "local:two.mp3", label: "Two", relativePath: "two.mp3", isLocal: true },
      { key: "local:one.mp3", label: "One", relativePath: "one.mp3", isLocal: true }
    ],
    activeTrackKey: "local:two.mp3"
  };
  const desktopApp = {
    scanMusicFolder: async () => ({ folderPath: "/Old/Focus", tracks: [], error: "folder-unreadable" }),
    selectMusicFolder: async () => ({
      folderPath: "/Moved/Focus",
      tracks: [{
        key: "local:two.mp3",
        label: "Two",
        relativePath: "two.mp3",
        src: "/Moved/Focus/two.mp3",
        isLocal: true
      }]
    })
  };
  const { controller, elements, getState } = createHarness(saved, desktopApp);

  await controller.restorePersistedPlayer();
  assert.match(elements.musicFolderDisplay.textContent, /Reconnect needed/);
  assert.match(elements.playlistStatus.textContent, /cannot be read/);
  assert.equal(elements.playlistItems.children.length, 2);
  assert.ok(elements.playlistItems.children.every((item) => item.className.includes("is-missing")));

  await controller.loadMusicFolder();
  assert.equal(getState().player.folderPath, "/Moved/Focus");
  assert.deepEqual(getState().player.queue.map((track) => track.key), ["local:two.mp3", "local:one.mp3"]);
  assert.equal(elements.trackLabel.textContent, "Two");
  assert.match(elements.playlistStatus.textContent, /1 saved track is unavailable/);

  controller.removeMissingTracks();
  assert.deepEqual(getState().player.queue.map((track) => track.key), ["local:two.mp3"]);
  assert.equal(elements.removeMissingTracksBtn.hidden, true);
});

test("playlist persistence preserves ambient player preferences", () => {
  const { controller, getState } = createHarness({
    folderPath: "",
    queue: [],
    activeTrackKey: "",
    ambience: { soundId: "brown-noise", volume: 0 }
  });
  controller.persistState();
  assert.deepEqual(getState().player.ambience, { soundId: "brown-noise", volume: 0 });
});

test("a late folder rescan cannot override a newer pause intent", async () => {
  let scanCount = 0;
  let finishRescan;
  const scannedTrack = {
    key: "local:one.mp3",
    label: "One",
    relativePath: "one.mp3",
    src: "/Focus/one.mp3",
    isLocal: true
  };
  const desktopApp = {
    scanMusicFolder() {
      scanCount += 1;
      if (scanCount === 1) return Promise.resolve({ folderPath: "/Focus", tracks: [scannedTrack] });
      return new Promise((resolve) => { finishRescan = resolve; });
    }
  };
  const { controller, elements } = createHarness({
    folderPath: "/Focus",
    queue: [{ key: "local:one.mp3", label: "One", relativePath: "one.mp3", isLocal: true }],
    activeTrackKey: "local:one.mp3"
  }, desktopApp);

  await controller.restorePersistedPlayer();
  await controller.play();
  const rescan = controller.rescanMusicFolder();
  await controller.pause();
  finishRescan({ folderPath: "/Focus", tracks: [scannedTrack] });
  await rescan;

  assert.equal(elements.lofiPlayer.paused, true);
});

test("audio transitions keep mute separate, cancel stale pauses, switch sequentially, and stop immediately", async () => {
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
  const { controller, elements, getState } = createHarness({
    folderPath: "",
    queue: [],
    activeTrackKey: ""
  }, undefined, {
    gainEnvelopeFactory,
    getAudioTransitionSettings: () => ({ enabled: true, durationMs: 200 }),
    defaultTracks: [
      { key: "builtin:one", label: "One", src: "one.wav" },
      { key: "builtin:two", label: "Two", src: "two.wav" }
    ]
  });
  await controller.restorePersistedPlayer();

  const firstPlay = controller.play();
  await Promise.resolve();
  await advance(200);
  assert.equal(await firstPlay, true);
  assert.equal(elements.lofiPlayer.paused, false);
  assert.equal(elements.lofiPlayer.volume, 0.68);

  const stalePause = controller.pause();
  await Promise.resolve();
  await advance(100);
  assert.equal(elements.lofiPlayer.volume, 0.34);
  elements.volumeSlider.value = "0";
  controller.updateVolume();
  assert.equal(elements.lofiPlayer.volume, 0);
  const replay = controller.play();
  await Promise.resolve();
  assert.equal(await stalePause, false);
  await advance(200);
  assert.equal(await replay, true);
  assert.equal(controller.getUserVolume(), 0);
  assert.equal(elements.lofiPlayer.volume, 0);

  elements.volumeSlider.value = "50";
  controller.updateVolume();
  const switched = controller.switchTrack();
  await Promise.resolve();
  await advance(200);
  await advance(200);
  assert.equal(await switched, true);
  assert.equal(getState().player.activeTrackKey, "builtin:two");
  assert.equal(elements.lofiPlayer.paused, false);
  assert.equal(elements.lofiPlayer.volume, 0.5);

  const suspendedPause = controller.pause();
  await Promise.resolve();
  await advance(50);
  controller.settleTransition();
  assert.equal(await suspendedPause, false);
  assert.equal(elements.lofiPlayer.paused, true);
  assert.equal(elements.lofiPlayer.volume, 0.5);
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
  assert.equal(elements.lofiPlayer.paused, true);
  assert.equal(elements.lofiPlayer.currentTime, 0);
  assert.equal(elements.lofiPlayer.volume, 0.5);
  assert.equal(scheduled.size, 0);
});
