const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DASHBOARD_URL,
  OPEN_SPOTIFY_URL,
  PLAYBACK_POLL_MS,
  SPOTIFY_CONTROLLER_API_METHODS,
  createSpotifyController
} = require("../src/spotify-controller");

const CLIENT_ID = "a1b2c3d4e5f60718293a4b5c6d7e8f90";

const TRANSLATIONS = {
  "spotify.connected": "Connected",
  "spotify.disconnected": "Disconnected",
  "spotify.connecting": "Connecting",
  "spotify.connectCancelled": "Connection cancelled",
  "spotify.play": "Play",
  "spotify.pause": "Pause",
  "spotify.selectPlaylist": "Select playlist",
  "spotify.activeDevice": "Active device",
  "spotify.error.generic": "Something went wrong",
  "spotify.error.rate-limited": "Rate limited, retry after {retryAfter}s",
  "spotify.error.not-authenticated": "Not signed in",
  "spotify.error.provider-unavailable": "Spotify is unavailable"
};

function t(key, params = {}) {
  const template = TRANSLATIONS[key];
  if (template === undefined) return key;
  return template.replace(/\{(\w+)\}/g, (match, name) => (
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  ));
}

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.listeners = new Map();
    this.parentNode = null;
    this.hidden = false;
    this.disabled = false;
    this.className = "";
    this._value = "";
    this._textContent = "";
    this.classList = {
      values: new Set(),
      add: (...names) => names.forEach((name) => this.classList.values.add(name)),
      remove: (...names) => names.forEach((name) => this.classList.values.delete(name)),
      toggle: (name, force) => {
        const enabled = force === undefined ? !this.classList.values.has(name) : Boolean(force);
        if (enabled) this.classList.values.add(name);
        else this.classList.values.delete(name);
      }
    };
  }
  get value() {
    return this._value;
  }
  set value(next) {
    this._value = String(next ?? "");
  }
  get textContent() {
    return this._textContent;
  }
  set textContent(next) {
    this._textContent = String(next ?? "");
    this.children = [];
  }
  get innerHTML() {
    return "";
  }
  set innerHTML(_value) {
    throw new Error("innerHTML must not be used");
  }
  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  replaceChildren(...nodes) {
    this.children = [];
    for (const node of nodes) {
      node.parentNode = this;
      this.children.push(node);
    }
    if (this.tagName === "SELECT") this._value = nodes.length ? String(nodes[0].value ?? "") : "";
  }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }
  removeEventListener(type, handler) {
    this.listeners.get(type)?.delete(handler);
  }
  dispatch(type, event = {}) {
    for (const handler of [...(this.listeners.get(type) || [])]) {
      handler({ target: this, ...event });
    }
  }
  click() {
    this.dispatch("click", {});
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  removeAttribute(name) {
    delete this.attributes[name];
  }
}

function createElements() {
  return {
    document: { createElement: (tagName) => new FakeElement(tagName) },
    disconnectedView: new FakeElement(),
    connectedView: new FakeElement(),
    clientIdInput: new FakeElement("input"),
    connectButton: new FakeElement("button"),
    cancelConnectButton: new FakeElement("button"),
    dashboardButton: new FakeElement("button"),
    profileText: new FakeElement("p"),
    statusText: new FakeElement("p"),
    playlistSelect: new FakeElement("select"),
    deviceSelect: new FakeElement("select"),
    refreshButton: new FakeElement("button"),
    disconnectButton: new FakeElement("button"),
    openSpotifyButton: new FakeElement("button"),
    previousButton: new FakeElement("button"),
    playPauseButton: new FakeElement("button"),
    nextButton: new FakeElement("button"),
    seekRange: new FakeElement("input"),
    volumeRange: new FakeElement("input")
  };
}

function defaultResponders() {
  return {
    getAuthState: () => ({ ok: true, data: { connected: true, status: "connected", providerId: "spotify" } }),
    getProfile: () => ({ ok: true, data: { id: "user-1", displayName: "Listener" } }),
    listPlaylists: () => ({
      ok: true,
      data: { items: [{ id: "p1", uri: "spotify:playlist:p1", name: "Focus", trackCount: 3 }] }
    }),
    getDevices: () => ({ ok: true, data: { devices: [{ id: "d1", name: "Phone", isActive: true }] } }),
    getPlaybackState: () => ({
      ok: true,
      data: {
        isPlaying: true,
        progressMs: 1000,
        deviceId: "d1",
        deviceRestricted: false,
        supportsVolume: true,
        volumePercent: 40,
        track: { id: "t1", name: "Song", artists: ["A"], durationMs: 10000 }
      }
    }),
    connect: () => ({ ok: true, data: { connected: true, status: "connected" } }),
    cancelConnect: () => ({ ok: true, data: true }),
    disconnect: () => ({ ok: true, data: { connected: false, status: "disconnected" } }),
    playPlaylist: () => ({ ok: true, data: true }),
    resume: () => ({ ok: true, data: true }),
    pause: () => ({ ok: true, data: true }),
    next: () => ({ ok: true, data: true }),
    previous: () => ({ ok: true, data: true }),
    seek: () => ({ ok: true, data: true }),
    setVolume: () => ({ ok: true, data: true })
  };
}

function createApi(responders) {
  const calls = [];
  const api = { calls, responders: { ...responders } };
  for (const name of SPOTIFY_CONTROLLER_API_METHODS) {
    api[name] = async (...args) => {
      calls.push({ name, args, payload: args[0] });
      const responder = api.responders[name];
      return typeof responder === "function" ? responder(...args) : { ok: true, data: null };
    };
  }
  return api;
}

function createHarness(overrides = {}) {
  const elements = createElements();
  const api = createApi({ ...defaultResponders(), ...overrides.responders });
  const announcements = [];
  const playbackEvents = [];
  const opened = [];
  const intervals = [];
  const cleared = [];
  let intervalCallback = null;
  const setIntervalImpl = (callback, ms) => {
    intervalCallback = callback;
    const id = intervals.length + 1;
    intervals.push({ id, ms });
    return id;
  };
  const clearIntervalImpl = (id) => {
    cleared.push(id);
    intervalCallback = null;
  };
  const controller = createSpotifyController({
    api,
    elements,
    t,
    announce: (message) => announcements.push(message),
    onPlaybackState: (state) => playbackEvents.push(state),
    setIntervalImpl,
    clearIntervalImpl,
    openExternal: overrides.openExternal || (async (url) => {
      opened.push(url);
    })
  });
  return {
    controller,
    api,
    elements,
    announcements,
    playbackEvents,
    opened,
    intervals,
    cleared,
    triggerInterval: () => intervalCallback?.(),
    hasInterval: () => intervalCallback !== null
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flush(times = 4) {
  for (let index = 0; index < times; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function callsNamed(api, name) {
  return api.calls.filter((call) => call.name === name);
}

test("initializes a connected session, loads data only when connected, and renders defensively", async () => {
  const harness = createHarness();
  const { controller, elements, api } = harness;

  await controller.initialize();

  assert.equal(controller.isConnected(), true);
  assert.equal(elements.connectedView.hidden, false);
  assert.equal(elements.disconnectedView.hidden, true);
  assert.equal(elements.profileText.textContent, "Listener");
  assert.equal(elements.statusText.textContent, "");

  assert.equal(elements.playlistSelect.children.length, 2);
  assert.equal(elements.playlistSelect.children[0].value, "");
  assert.equal(elements.playlistSelect.children[1].value, "spotify:playlist:p1");
  assert.equal(elements.playlistSelect.children[1].textContent, "Focus");

  assert.equal(elements.deviceSelect.children.length, 2);
  assert.equal(elements.deviceSelect.children[1].value, "d1");

  assert.equal(controller.getPlaybackState().isPlaying, true);
  assert.equal(controller.isPlaying(), true);
  assert.equal(elements.playPauseButton.textContent, "Pause");
  assert.equal(elements.seekRange.value, "100");
  assert.equal(elements.volumeRange.value, "40");
  assert.equal(harness.playbackEvents.length >= 1, true);
  assert.equal(callsNamed(api, "getProfile").length, 1);
});

test("does not overwrite the seek slider while the user is adjusting it", async () => {
  const harness = createHarness();
  harness.elements.seekRange.value = "777";
  harness.elements.document.activeElement = harness.elements.seekRange;

  await harness.controller.initialize();
  assert.equal(harness.elements.seekRange.value, "777");

  harness.elements.document.activeElement = null;
  harness.controller.render();
  assert.equal(harness.elements.seekRange.value, "100");
});

test("does not load profile, playlists, devices, or playback while disconnected", async () => {
  const harness = createHarness({
    responders: { getAuthState: () => ({ ok: true, data: { connected: false, status: "disconnected" } }) }
  });
  await harness.controller.initialize();

  assert.equal(harness.controller.isConnected(), false);
  assert.equal(harness.elements.disconnectedView.hidden, false);
  assert.equal(callsNamed(harness.api, "getProfile").length, 0);
  assert.equal(callsNamed(harness.api, "listPlaylists").length, 0);
  assert.equal(callsNamed(harness.api, "getDevices").length, 0);
  assert.equal(callsNamed(harness.api, "getPlaybackState").length, 0);
});

test("filters malformed playlist and device records and disables restricted devices", async () => {
  const harness = createHarness({
    responders: {
      listPlaylists: () => ({
        ok: true,
        data: {
          items: [
            { id: "p1", uri: "spotify:playlist:p1", name: "Good" },
            { id: "", name: "No id" },
            { uri: "https://open.spotify.com/playlist/x", name: "Bad uri" },
            null,
            { id: "p2", name: "Derived" }
          ]
        }
      }),
      getDevices: () => ({
        ok: true,
        data: { devices: [{ id: "d1", name: "Phone" }, { name: "No id" }, { id: "d2", name: "TV", isRestricted: true }] }
      })
    }
  });
  await harness.controller.initialize();

  const playlistValues = harness.elements.playlistSelect.children.map((option) => option.value);
  assert.deepEqual(playlistValues, ["", "spotify:playlist:p1", "spotify:playlist:p2"]);

  const deviceOptions = harness.elements.deviceSelect.children;
  assert.deepEqual(deviceOptions.map((option) => option.value), ["", "d1", "d2"]);
  assert.equal(deviceOptions[2].disabled, true);
});

test("connects, never persists the client ID, and restores prior state when cancelled", async () => {
  const harness = createHarness({
    responders: { getAuthState: () => ({ ok: true, data: { connected: false, status: "disconnected" } }) }
  });
  const { controller, api, elements, announcements } = harness;
  await controller.initialize();

  const gate = deferred();
  api.responders.connect = () => gate.promise;
  const pending = controller.connect(CLIENT_ID);
  await flush();
  assert.equal(elements.cancelConnectButton.hidden, false);
  assert.equal(elements.connectButton.disabled, true);

  assert.equal(await controller.cancelConnect(), true);
  gate.resolve({ ok: true, data: { connected: true, status: "connected" } });
  await pending;
  assert.equal(controller.isConnected(), false);
  assert.equal(callsNamed(api, "cancelConnect").length, 1);
  assert.equal(announcements.includes("Connection cancelled"), true);

  api.responders.connect = () => ({ ok: true, data: { connected: true, status: "connected" } });
  const connected = await controller.connect(CLIENT_ID);
  assert.equal(connected, true);
  assert.equal(controller.isConnected(), true);
  assert.equal(elements.cancelConnectButton.hidden, true);
  assert.equal(elements.connectButton.disabled, false);
  assert.equal(elements.profileText.textContent, "Listener");

  const connectCall = callsNamed(api, "connect")[0];
  assert.deepEqual(connectCall.args, [CLIENT_ID]);
  const persisted = JSON.stringify(controller.getAuthState()) + announcements.join(" ") + elements.statusText.textContent;
  assert.equal(persisted.includes(CLIENT_ID), false);
});

test("does not announce a successful connection when the returned auth state is disconnected", async () => {
  const harness = createHarness({
    responders: {
      getAuthState: () => ({ ok: true, data: { connected: false, status: "disconnected" } }),
      connect: () => ({ ok: true, data: { connected: false, status: "disconnected" } })
    }
  });
  await harness.controller.initialize();

  assert.equal(await harness.controller.connect(CLIENT_ID), false);
  assert.equal(harness.announcements.includes("Connected"), false);
  assert.equal(harness.elements.statusText.textContent, "Not signed in");
});

test("restores a prior connected session when a reconnect is cancelled", async () => {
  const harness = createHarness();
  const { controller, elements } = harness;
  await controller.initialize();
  assert.equal(controller.isConnected(), true);

  const gate = deferred();
  harness.api.responders.connect = () => gate.promise;
  const pending = controller.connect(CLIENT_ID);
  await flush();
  assert.equal(await controller.cancelConnect(), true);
  gate.resolve({ ok: true, data: { connected: true, status: "connected" } });
  await pending;

  assert.equal(controller.isConnected(), true);
  assert.equal(elements.connectedView.hidden, false);
});

test("disconnect clears session state and stops polling", async () => {
  const harness = createHarness();
  const { controller, elements } = harness;
  await controller.initialize();
  controller.activate();

  const result = await controller.disconnect();
  assert.equal(result, true);
  assert.equal(controller.isConnected(), false);
  assert.equal(controller.getPlaybackState(), null);
  assert.equal(elements.profileText.textContent, "");
  assert.equal(elements.playlistSelect.children.length, 1);
  assert.equal(elements.deviceSelect.children.length, 1);
  assert.equal(harness.cleared.length, 1);
});

test("activate starts one 5-second poll, deduplicates polls, and deactivate clears it", async () => {
  const harness = createHarness();
  const { controller } = harness;
  await controller.initialize();

  const gate = deferred();
  harness.api.responders.getPlaybackState = () => gate.promise;

  controller.activate();
  await flush();
  assert.equal(harness.intervals.length, 1);
  assert.equal(harness.intervals[0].ms, PLAYBACK_POLL_MS);
  assert.equal(PLAYBACK_POLL_MS, 5000);

  const pollCalls = callsNamed(harness.api, "getPlaybackState").length;
  harness.triggerInterval();
  harness.triggerInterval();
  await flush();
  assert.equal(callsNamed(harness.api, "getPlaybackState").length, pollCalls);

  gate.resolve({ ok: true, data: { isPlaying: false } });
  await flush();

  controller.activate();
  assert.equal(harness.intervals.length, 1);

  controller.deactivate();
  assert.equal(harness.cleared.length, 1);
  assert.equal(harness.hasInterval(), false);
});

test("forwards commands, playlist context, resume fallback, and device IDs", async () => {
  const harness = createHarness();
  const { controller, api, elements } = harness;
  await controller.initialize();
  controller.bind();

  elements.playlistSelect.value = "spotify:playlist:p1";
  elements.playlistSelect.dispatch("change");
  elements.deviceSelect.value = "d1";
  elements.deviceSelect.dispatch("change");

  await controller.play();
  assert.deepEqual(callsNamed(api, "playPlaylist")[0].args, ["spotify:playlist:p1", "d1"]);

  elements.playlistSelect.value = "";
  elements.playlistSelect.dispatch("change");
  await controller.play();
  assert.deepEqual(callsNamed(api, "resume")[0].args, ["d1"]);

  await controller.pause();
  await controller.next();
  await controller.previous();
  assert.deepEqual(callsNamed(api, "pause")[0].args, ["d1"]);
  assert.deepEqual(callsNamed(api, "next")[0].args, ["d1"]);
  assert.deepEqual(callsNamed(api, "previous")[0].args, ["d1"]);

  await controller.seekFraction(0.5);
  assert.deepEqual(callsNamed(api, "seek")[0].args, [5000, "d1"]);

  await controller.setVolume(60);
  assert.deepEqual(callsNamed(api, "setVolume")[0].args, [60, "d1"]);
});

test("bind wires transport, dashboard, and Open Spotify buttons to exact URLs", async () => {
  const harness = createHarness();
  const { controller, api, elements, opened } = harness;
  await controller.initialize();
  controller.bind();

  elements.playPauseButton.click();
  await flush();
  assert.equal(callsNamed(api, "pause").length, 1);

  harness.api.responders.getPlaybackState = () => ({ ok: true, data: { isPlaying: false, volumePercent: 10 } });
  await controller.refresh();
  elements.playPauseButton.click();
  await flush();
  assert.equal(callsNamed(api, "resume").length, 1);

  elements.dashboardButton.click();
  elements.openSpotifyButton.click();
  await flush();
  assert.deepEqual(opened, [DASHBOARD_URL, OPEN_SPOTIFY_URL]);
  assert.equal(DASHBOARD_URL, "https://developer.spotify.com/dashboard");
  assert.equal(OPEN_SPOTIFY_URL, "https://open.spotify.com");
});

test("gates restricted devices and unsupported volume", async () => {
  const harness = createHarness({
    responders: {
      getDevices: () => ({
        ok: true,
        data: {
          devices: [
            { id: "d1", name: "Phone" },
            { id: "d2", name: "Restricted", isRestricted: true },
            { id: "d3", name: "NoVolume", supportsVolume: false }
          ]
        }
      })
    }
  });
  const { controller, api, elements } = harness;
  await controller.initialize();
  controller.bind();

  elements.deviceSelect.value = "d2";
  elements.deviceSelect.dispatch("change");
  assert.equal(elements.volumeRange.disabled, true);
  assert.equal(elements.seekRange.disabled, true);
  assert.equal(elements.playPauseButton.disabled, true);
  assert.equal(await controller.setVolume(50), false);
  assert.equal(callsNamed(api, "setVolume").length, 0);
  assert.equal(await controller.play(), false);
  assert.equal(callsNamed(api, "resume").length, 0);

  elements.deviceSelect.value = "d3";
  elements.deviceSelect.dispatch("change");
  assert.equal(elements.volumeRange.disabled, true);
  assert.equal(await controller.setVolume(50), false);
  assert.equal(callsNamed(api, "setVolume").length, 0);
  assert.equal(await controller.play(), true);
});

test("maps stable error codes to translations and never surfaces raw messages", async () => {
  const harness = createHarness({
    responders: {
      getProfile: () => ({
        ok: false,
        error: { code: "rate-limited", status: 429, retryAfter: 42, message: "secret-token-value" }
      })
    }
  });
  const { controller, announcements, elements } = harness;
  await controller.initialize();
  await controller.refresh();

  assert.equal(announcements.at(-1), "Rate limited, retry after 42s");
  assert.equal(elements.statusText.textContent, "Rate limited, retry after 42s");
  assert.equal(JSON.stringify(announcements).includes("secret-token-value"), false);
  assert.equal(elements.statusText.textContent.includes("secret-token-value"), false);
});

test("falls back to a generic message for unknown codes and handles a missing API", async () => {
  const harness = createHarness({
    responders: {
      getProfile: () => ({ ok: false, error: { code: "totally-unknown", message: "boom" } })
    }
  });
  await harness.controller.initialize();
  await harness.controller.refresh();
  assert.equal(harness.announcements.at(-1), "Something went wrong");

  const elements = createElements();
  const announcements = [];
  const controller = createSpotifyController({
    api: null,
    elements,
    t,
    announce: (message) => announcements.push(message)
  });
  await controller.initialize();
  assert.equal(controller.isConnected(), false);
  assert.equal(await controller.play(), false);
});

test("calls only the documented API methods and exposes the documented surface", async () => {
  const harness = createHarness();
  await harness.controller.initialize();
  await harness.controller.refresh();
  await harness.controller.play();
  await harness.controller.pause();

  for (const call of harness.api.calls) {
    assert.equal(SPOTIFY_CONTROLLER_API_METHODS.includes(call.name), true, `unexpected api call ${call.name}`);
  }
  for (const name of [
    "initialize", "bind", "activate", "deactivate", "connect", "cancelConnect", "disconnect",
    "refresh", "render", "getAuthState", "getPlaybackState", "isConnected", "isPlaying", "play", "pause",
    "previous", "next", "seekFraction", "setVolume", "destroy"
  ]) {
    assert.equal(typeof harness.controller[name], "function", `missing ${name}`);
  }
});

test("destroy clears polling and removes bound listeners", async () => {
  const harness = createHarness();
  const { controller, elements } = harness;
  await controller.initialize();
  controller.bind();
  controller.activate();

  assert.equal(elements.connectButton.listeners.get("click").size, 1);
  controller.destroy();
  assert.equal(harness.cleared.length, 1);
  assert.equal(elements.connectButton.listeners.get("click").size, 0);
  assert.equal(await controller.activate(), false);
});
