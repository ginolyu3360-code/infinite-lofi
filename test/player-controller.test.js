const test = require("node:test");
const assert = require("node:assert/strict");

const playerModel = require("../src/player");
const { createPlayerController } = require("../src/player-controller");

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

function createHarness(playerState, desktopApp) {
  let state = { player: structuredClone(playerState) };
  const audio = createElement("audio");
  audio.src = "";
  audio.srcUrl = "";
  audio.paused = true;
  audio.ended = false;
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
    defaultTracks: [{ key: "builtin:one", label: "One", src: "one.wav" }],
    alert() {},
    logger: { error() {} }
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
