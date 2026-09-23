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
      toggle(name, force) {
        const enabled = force === undefined ? !classes.has(name) : Boolean(force);
        if (enabled) classes.add(name);
        else classes.delete(name);
        return enabled;
      },
      contains(name) { return classes.has(name) || element.className.split(/\s+/).includes(name); }
    },
    appendChild(child) {
      if (child.parentNode) child.parentNode.children = child.parentNode.children.filter((entry) => entry !== child);
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    insertBefore(child, reference) {
      if (child.parentNode) child.parentNode.children = child.parentNode.children.filter((entry) => entry !== child);
      child.parentNode = this;
      const index = this.children.indexOf(reference);
      if (index < 0) this.children.push(child);
      else this.children.splice(index, 0, child);
      return child;
    },
    addEventListener(name, handler) { listeners.set(name, handler); },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name] ?? null; },
    removeAttribute(name) { delete this.attributes[name]; },
    matches(selector) {
      return selector === ".playlist-item" && this.classList.contains("playlist-item");
    },
    closest(selector) {
      let current = this;
      while (current) {
        if (current.matches?.(selector)) return current;
        current = current.parentNode;
      }
      return null;
    },
    contains() { return false; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    listenerCount(name) { return listeners.has(name) ? 1 : 0; },
    async dispatch(name, event = {}) {
      if (!event.target) event.target = this;
      if (!event.preventDefault) event.preventDefault = () => { event.defaultPrevented = true; };
      event.currentTarget = this;
      const result = await listeners.get(name)?.(event);
      if (!event.cancelBubble && this.parentNode?.dispatch) return this.parentNode.dispatch(name, event);
      return result;
    },
    async click(event = { detail: 0 }) { return this.dispatch("click", event); },
    async dblclick() { return this.dispatch("dblclick", { detail: 2 }); },
    async keydown(event) { return this.dispatch("keydown", event); }
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
  let playCount = 0;
  audio.pause = () => { audio.paused = true; };
  audio.play = () => { playCount += 1; audio.paused = false; audio.ended = false; return Promise.resolve(); };
  audio.load = () => {};
  const elements = {
    document: { createElement, body: createElement("body"), activeElement: null },
    lofiPlayer: audio,
    playPauseBtn: createElement("button"),
    playlistToggleBtn: createElement("button"),
    playlistPanel: createElement(),
    playlistItems: createElement(),
    playlistStatus: createElement(),
    trackLabel: createElement(),
    volumeSlider: { value: "68" },
    musicFolderDisplay: createElement(),
    loadMusicFolderBtn: createElement("button"),
    rescanMusicFolderBtn: createElement("button"),
    removeMissingTracksBtn: createElement("button"),
    useDefaultTracksBtn: createElement("button"),
    showAllQueueBtn: createElement("button"),
    repeatModeBtn: createElement("button"),
    shuffleModeBtn: createElement("button"),
    drawerBackdrop: createElement()
  };
  elements.playlistPanel.appendChild(elements.playlistItems);
  const playerPanel = createElement("footer");
  playerPanel.appendChild(elements.playlistPanel);
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
  return { controller, elements, getState: () => state, getPlayCount: () => playCount };
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

test("marks video queue entries and reports browser playback failures", async () => {
  const playbackErrors = [];
  const videoTrack = {
    key: "local:focus.webm",
    label: "Focus video",
    relativePath: "focus.webm",
    src: "file:///Focus/focus.webm",
    isLocal: true,
    mediaKind: "video"
  };
  const { controller, elements } = createHarness({
    folderPath: "",
    queue: [],
    activeTrackKey: ""
  }, undefined, {
    defaultTracks: [videoTrack],
    onPlaybackError: (track, error) => playbackErrors.push({ track, error })
  });

  await controller.restorePersistedPlayer();
  assert.equal(elements.playlistItems.children[0].children[1].textContent, "Video");

  const decodeError = new Error("Unsupported codec");
  elements.lofiPlayer.play = () => Promise.reject(decodeError);
  assert.equal(await controller.play(), false);
  assert.equal(playbackErrors.length, 1);
  assert.equal(playbackErrors[0].track.key, videoTrack.key);
  assert.equal(playbackErrors[0].error, decodeError);
});

test("prepares proxy-first video only on play and continues from the cached WebM", async () => {
  const preparations = [];
  const progress = [];
  const videoTrack = {
    key: "local:focus.mkv",
    label: "Focus video",
    relativePath: "focus.mkv",
    src: "/Focus/focus.mkv",
    srcUrl: "file:///Focus/focus.mkv",
    isLocal: true,
    mediaKind: "video"
  };
  const desktopApp = {
    cancelVideoProxy: async () => true,
    onVideoProxyProgress: () => () => {},
    prepareVideoProxy: async (filePath, jobId) => {
      preparations.push({ filePath, jobId });
      return { fileUrl: "file:///cache/focus.webm", cacheHit: true };
    }
  };
  const { controller, elements, getPlayCount } = createHarness({ folderPath: "", queue: [], activeTrackKey: "" }, desktopApp, {
    defaultTracks: [videoTrack],
    onVideoPreparation: (event) => progress.push(event)
  });
  await controller.restorePersistedPlayer();
  assert.equal(preparations.length, 0);
  assert.equal(await controller.play(), true);
  assert.equal(preparations.length, 1);
  assert.equal(preparations[0].filePath, "/Focus/focus.mkv");
  assert.equal(elements.lofiPlayer.src, "file:///cache/focus.webm");
  assert.equal(getPlayCount(), 1);
  assert.ok(progress.some((event) => event.status === "complete" && event.cacheHit === true));
});

test("falls back from a native-first decode failure to a compatible proxy", async () => {
  const errors = [];
  const videoTrack = {
    key: "local:focus.mov", label: "Focus", relativePath: "focus.mov",
    src: "/Focus/focus.mov", srcUrl: "file:///Focus/focus.mov", isLocal: true, mediaKind: "video"
  };
  const desktopApp = {
    cancelVideoProxy: async () => true,
    onVideoProxyProgress: () => () => {},
    prepareVideoProxy: async () => ({ fileUrl: "file:///cache/focus.webm", cacheHit: false })
  };
  const { controller, elements } = createHarness({ folderPath: "", queue: [], activeTrackKey: "" }, desktopApp, {
    defaultTracks: [videoTrack],
    onPlaybackError: (_track, error) => errors.push(error)
  });
  await controller.restorePersistedPlayer();
  elements.lofiPlayer.play = () => {
    if (elements.lofiPlayer.src.endsWith("focus.mov")) return Promise.reject(new Error("decode failed"));
    elements.lofiPlayer.paused = false;
    return Promise.resolve();
  };
  assert.equal(await controller.play(), true);
  assert.equal(elements.lofiPlayer.src, "file:///cache/focus.webm");
  assert.equal(errors.length, 0);
});

test("switching tracks cancels conversion and ignores stale playback intent", async () => {
  let resolvePreparation;
  let cancellations = 0;
  const desktopApp = {
    cancelVideoProxy: async () => { cancellations += 1; return true; },
    onVideoProxyProgress: () => () => {},
    prepareVideoProxy: () => new Promise((resolve) => { resolvePreparation = resolve; })
  };
  const { controller, elements, getPlayCount } = createHarness({ folderPath: "", queue: [], activeTrackKey: "" }, desktopApp, {
    defaultTracks: [
      { key: "local:a.avi", label: "A", relativePath: "a.avi", src: "/Focus/a.avi", srcUrl: "file:///Focus/a.avi", isLocal: true, mediaKind: "video" },
      { key: "local:b.mp3", label: "B", relativePath: "b.mp3", src: "/Focus/b.mp3", srcUrl: "file:///Focus/b.mp3", isLocal: true, mediaKind: "audio" }
    ]
  });
  await controller.restorePersistedPlayer();
  const originalPlay = controller.play();
  await Promise.resolve();
  await controller.switchTrack();
  resolvePreparation({ fileUrl: "file:///cache/a.webm", cacheHit: false });
  assert.equal(await originalPlay, false);
  assert.equal(elements.lofiPlayer.src, "file:///Focus/b.mp3");
  assert.equal(getPlayCount(), 1);
  assert.ok(cancellations >= 1);
});

test("cancelling video preparation stops the play intent without showing a playback error", async () => {
  let rejectPreparation;
  const playbackErrors = [];
  const desktopApp = {
    cancelVideoProxy: async () => {
      rejectPreparation?.(Object.assign(new Error("cancelled"), { code: "cancelled" }));
      return true;
    },
    onVideoProxyProgress: () => () => {},
    prepareVideoProxy: () => new Promise((_resolve, reject) => { rejectPreparation = reject; })
  };
  const { controller, elements } = createHarness({ folderPath: "", queue: [], activeTrackKey: "" }, desktopApp, {
    defaultTracks: [
      { key: "local:a.avi", label: "A", relativePath: "a.avi", src: "/Focus/a.avi", srcUrl: "file:///Focus/a.avi", isLocal: true, mediaKind: "video" }
    ],
    onPlaybackError: (_track, error) => playbackErrors.push(error)
  });
  await controller.restorePersistedPlayer();
  const playResult = controller.play();
  await Promise.resolve();
  controller.cancelVideoPreparation("user-cancelled");
  assert.equal(await playResult, false);
  assert.equal(elements.playPauseBtn.textContent, "Play");
  assert.equal(playbackErrors.length, 0);
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

test("single-click swaps queue positions while double-click plays the chosen track", async () => {
  const { controller, elements, getState } = createHarness({
    folderPath: "",
    queue: [],
    activeTrackKey: ""
  }, undefined, {
    defaultTracks: [
      { key: "builtin:one", label: "One", src: "one.wav" },
      { key: "builtin:two", label: "Two", src: "two.wav" },
      { key: "builtin:three", label: "Three", src: "three.wav" }
    ]
  });
  await controller.restorePersistedPlayer();

  assert.equal(elements.playlistItems.listenerCount("click"), 1);
  assert.equal(elements.playlistItems.children[0].listenerCount("click"), 0);
  await elements.playlistItems.children[0].children[0].click();
  assert.equal(elements.playlistItems.children[0].attributes["aria-pressed"], "true");
  await elements.playlistItems.children[2].click();
  assert.deepEqual(getState().player.queue.map((track) => track.key), [
    "builtin:three", "builtin:two", "builtin:one"
  ]);

  const rowsBeforePlayback = [...elements.playlistItems.children];
  await elements.playlistItems.children[1].dblclick();
  await Promise.resolve();
  assert.equal(getState().player.activeTrackKey, "builtin:two");
  assert.equal(elements.lofiPlayer.paused, false);
  assert.equal(elements.playlistItems.children[0], rowsBeforePlayback[0]);
});

test("delegated Queue events preserve keyboard playback, cancellation, and drag reorder", async () => {
  const { controller, elements, getState } = createHarness({
    folderPath: "",
    queue: [],
    activeTrackKey: ""
  }, undefined, {
    defaultTracks: [
      { key: "builtin:one", label: "One", src: "one.wav" },
      { key: "builtin:two", label: "Two", src: "two.wav" },
      { key: "builtin:three", label: "Three", src: "three.wav" }
    ]
  });
  await controller.restorePersistedPlayer();

  await elements.playlistItems.children[0].click();
  const cancelEvent = { key: "Escape" };
  await elements.playlistItems.children[0].children[0].keydown(cancelEvent);
  assert.equal(cancelEvent.defaultPrevented, true);
  assert.equal(elements.playlistItems.children[0].attributes["aria-pressed"], "false");

  const keyboardPlayEvent = { key: "Enter", shiftKey: true };
  await elements.playlistItems.children[2].keydown(keyboardPlayEvent);
  await Promise.resolve();
  assert.equal(keyboardPlayEvent.defaultPrevented, true);
  assert.equal(getState().player.activeTrackKey, "builtin:three");

  const firstRow = elements.playlistItems.children[0];
  const thirdRow = elements.playlistItems.children[2];
  const dataTransfer = {};
  await firstRow.dispatch("dragstart", { dataTransfer });
  assert.equal(dataTransfer.effectAllowed, "move");
  await thirdRow.dispatch("dragover", { dataTransfer });
  assert.equal(dataTransfer.dropEffect, "move");
  assert.equal(thirdRow.classList.contains("is-drag-over"), true);
  await thirdRow.dispatch("drop", { dataTransfer });
  assert.deepEqual(getState().player.queue.map((track) => track.key), [
    "builtin:two", "builtin:three", "builtin:one"
  ]);
});

test("a maximum-size Queue keeps constant listeners and stable rows while switching tracks", async () => {
  const defaultTracks = Array.from({ length: 1000 }, (_, index) => ({
    key: `builtin:${index}`,
    label: `Track ${index}`,
    src: `${index}.wav`
  }));
  const { controller, elements, getState } = createHarness(
    { folderPath: "", queue: [], activeTrackKey: "" },
    undefined,
    { defaultTracks }
  );
  await controller.restorePersistedPlayer();

  const eventNames = ["click", "dblclick", "keydown", "dragstart", "dragend", "dragover", "dragleave", "drop"];
  assert.equal(elements.playlistItems.children.length, 1000);
  assert.equal(eventNames.reduce((total, name) => total + elements.playlistItems.listenerCount(name), 0), 8);
  assert.equal(
    elements.playlistItems.children.reduce(
      (total, row) => total + eventNames.reduce((rowTotal, name) => rowTotal + row.listenerCount(name), 0),
      0
    ),
    0
  );

  const firstRow = elements.playlistItems.children[0];
  const secondRow = elements.playlistItems.children[1];
  await controller.switchTrack();
  assert.equal(getState().player.activeTrackKey, "builtin:1");
  assert.equal(elements.playlistItems.children[0], firstRow);
  assert.equal(elements.playlistItems.children[1], secondRow);
  assert.equal(firstRow.attributes["aria-current"], undefined);
  assert.equal(secondRow.attributes["aria-current"], "true");
});

test("supports repeat-one, non-repeating shuffle, and no-op play for music already playing", async () => {
  const { controller, elements, getState, getPlayCount } = createHarness({
    folderPath: "",
    queue: [],
    activeTrackKey: ""
  }, undefined, {
    random: () => 0,
    defaultTracks: [
      { key: "builtin:one", label: "One", src: "one.wav" },
      { key: "builtin:two", label: "Two", src: "two.wav" },
      { key: "builtin:three", label: "Three", src: "three.wav" }
    ]
  });
  await controller.restorePersistedPlayer();
  await controller.play();
  const firstPlayCount = getPlayCount();
  await controller.play();
  assert.equal(getPlayCount(), firstPlayCount);

  controller.toggleShuffleMode();
  const firstKey = getState().player.activeTrackKey;
  await controller.switchTrack();
  const secondKey = getState().player.activeTrackKey;
  await controller.switchTrack();
  const thirdKey = getState().player.activeTrackKey;
  assert.equal(new Set([firstKey, secondKey, thirdKey]).size, 3);
  assert.equal(getState().player.playbackMode, "shuffle");

  controller.toggleRepeatMode();
  assert.equal(getState().player.playbackMode, "repeat-one");
  elements.lofiPlayer.currentTime = 120;
  elements.lofiPlayer.ended = true;
  await controller.handleTrackEnded();
  assert.equal(elements.lofiPlayer.currentTime, 0);
  assert.equal(elements.lofiPlayer.paused, false);
});

test("expands and closes the full queue manager without losing the compact queue", async () => {
  const defaultTracks = Array.from({ length: 7 }, (_, index) => ({
    key: `builtin:${index + 1}`,
    label: `Track ${index + 1}`,
    src: `${index + 1}.wav`
  }));
  const layoutChanges = [];
  const { controller, elements } = createHarness(
    { folderPath: "", queue: [], activeTrackKey: "" },
    undefined,
    { defaultTracks, onLayoutChange: (state) => layoutChanges.push(state) }
  );
  await controller.restorePersistedPlayer();
  assert.equal(elements.showAllQueueBtn.hidden, false);
  controller.togglePlaylistPanel(true);
  assert.equal(elements.playlistToggleBtn.attributes["aria-expanded"], "true");
  controller.toggleExpandedQueue(true);
  assert.equal(elements.playlistPanel.classList.contains("is-expanded"), true);
  assert.equal(elements.drawerBackdrop.classList.contains("visible"), true);
  assert.equal(elements.playlistPanel.parentNode, elements.document.body);
  controller.toggleExpandedQueue(false);
  assert.equal(elements.playlistPanel.classList.contains("hidden"), false);
  assert.equal(elements.playlistPanel.classList.contains("is-expanded"), false);
  assert.equal(elements.playlistPanel.parentNode.tagName, "FOOTER");
  controller.togglePlaylistPanel(false);
  assert.equal(elements.playlistToggleBtn.attributes["aria-expanded"], "false");
  assert.deepEqual(layoutChanges, [
    { queueOpen: true, queueExpanded: false },
    { queueOpen: true, queueExpanded: true },
    { queueOpen: true, queueExpanded: false },
    { queueOpen: false, queueExpanded: false }
  ]);
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

test("a late folder scan cannot replace a newer folder selection", async () => {
  let finishOldScan;
  const oldTrack = {
    key: "local:old.mp3",
    label: "Old",
    relativePath: "old.mp3",
    src: "/Old/old.mp3",
    isLocal: true
  };
  const newTrack = {
    key: "local:new.mp3",
    label: "New",
    relativePath: "new.mp3",
    src: "/New/new.mp3",
    isLocal: true
  };
  const desktopApp = {
    scanMusicFolder: () => new Promise((resolve) => { finishOldScan = resolve; }),
    selectMusicFolder: async () => ({ folderPath: "/New", tracks: [newTrack] })
  };
  const { controller, elements, getState } = createHarness({
    folderPath: "/Old",
    queue: [oldTrack],
    activeTrackKey: oldTrack.key
  }, desktopApp);

  const restore = controller.restorePersistedPlayer();
  await Promise.resolve();
  assert.equal(elements.rescanMusicFolderBtn.disabled, true);
  assert.equal(elements.playlistPanel.attributes["aria-busy"], "true");

  await controller.loadMusicFolder();
  assert.equal(getState().player.folderPath, "/New");
  assert.equal(elements.trackLabel.textContent, "New");
  assert.equal(elements.rescanMusicFolderBtn.disabled, false);

  finishOldScan({ folderPath: "/Old", tracks: [oldTrack] });
  await restore;
  assert.equal(getState().player.folderPath, "/New");
  assert.equal(elements.trackLabel.textContent, "New");
  assert.equal(elements.playlistPanel.attributes["aria-busy"], "false");
});

test("reports duplicate files skipped while loading a folder", async () => {
  const desktopApp = {
    selectMusicFolder: async () => ({
      duplicateCount: 2,
      folderPath: "/Focus",
      tracks: [{ key: "local:one.mp3", label: "One", relativePath: "one.mp3", src: "/Focus/one.mp3", isLocal: true }]
    })
  };
  const { controller, elements } = createHarness({
    folderPath: "",
    queue: [],
    activeTrackKey: ""
  }, desktopApp);

  await controller.loadMusicFolder();

  assert.match(elements.playlistStatus.textContent, /2 duplicate files were skipped/);
  assert.equal(elements.trackLabel.textContent, "One");
});

test("removes previously saved duplicates instead of restoring them as missing", async () => {
  const original = { key: "local:focus.mp3", label: "Focus", relativePath: "focus.mp3", src: "/Focus/focus.mp3", isLocal: true };
  const duplicate = { key: "local:focus (1).mp3", label: "Focus (1)", relativePath: "focus (1).mp3", src: "/Focus/focus (1).mp3", isLocal: true };
  const desktopApp = {
    scanMusicFolder: async () => ({
      duplicateCount: 1,
      duplicateKeys: [duplicate.key],
      folderPath: "/Focus",
      tracks: [original]
    })
  };
  const { controller, elements, getState } = createHarness({
    folderPath: "/Focus",
    queue: [original, duplicate],
    activeTrackKey: original.key
  }, desktopApp);

  await controller.restorePersistedPlayer();

  assert.deepEqual(getState().player.queue.map((track) => track.key), [original.key]);
  assert.doesNotMatch(elements.playlistStatus.textContent, /unavailable/);
  assert.match(elements.playlistStatus.textContent, /1 duplicate file was skipped/);
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
