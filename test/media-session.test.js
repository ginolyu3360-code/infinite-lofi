const test = require("node:test");
const assert = require("node:assert/strict");

const { createMediaSessionController, inferArtworkType } = require("../src/media-session");

function createFakeAudio() {
  const listeners = new Map();
  return {
    __listeners: listeners,
    src: "file:///music/focus.mp3",
    paused: true,
    duration: 120,
    currentTime: 20,
    playbackRate: 1,
    addEventListener(name, handler) {
      const handlers = listeners.get(name) || [];
      handlers.push(handler);
      listeners.set(name, handlers);
    },
    dispatch(name) {
      (listeners.get(name) || []).forEach((handler) => handler());
    },
    play() {
      this.paused = false;
      this.dispatch("play");
      return Promise.resolve();
    },
    pause() {
      this.paused = true;
      this.dispatch("pause");
    },
    fastSeek(value) {
      this.currentTime = value;
    }
  };
}

test("connects metadata, transport actions, and position to native media controls", async () => {
  const actionHandlers = new Map();
  const positions = [];
  const mediaSession = {
    metadata: null,
    playbackState: "none",
    setActionHandler(name, handler) {
      actionHandlers.set(name, handler);
    },
    setPositionState(value) {
      positions.push(value);
    }
  };
  class FakeMediaMetadata {
    constructor(value) {
      Object.assign(this, value);
    }
  }
  const audio = createFakeAudio();
  let previousCount = 0;
  let nextCount = 0;
  let playCount = 0;
  let pauseCount = 0;
  let stopCount = 0;
  const controller = createMediaSessionController({
    mediaSession,
    MediaMetadata: FakeMediaMetadata,
    audio,
    logger: { warn() {} }
  });

  assert.equal(controller.installActionHandlers({
    play: () => { playCount += 1; return audio.play(); },
    pause: () => { pauseCount += 1; audio.pause(); },
    stop: () => { stopCount += 1; audio.pause(); audio.currentTime = 0; },
    previousTrack: () => { previousCount += 1; },
    nextTrack: () => { nextCount += 1; }
  }), true);
  controller.updateMetadata({
    label: "Focus Mix",
    isLocal: true,
    artworkUrl: "file:///music/cover.png"
  });

  assert.equal(mediaSession.metadata.title, "Focus Mix");
  assert.equal(mediaSession.metadata.artist, "Local Music");
  assert.equal(mediaSession.metadata.artwork[0].type, "image/png");
  assert.deepEqual(positions.at(-1), { duration: 120, playbackRate: 1, position: 20 });

  await actionHandlers.get("play")();
  assert.equal(playCount, 1);
  assert.equal(mediaSession.playbackState, "playing");
  actionHandlers.get("seekforward")({ seekOffset: 15 });
  assert.equal(audio.currentTime, 35);
  actionHandlers.get("seekbackward")({ seekOffset: 5 });
  assert.equal(audio.currentTime, 30);
  actionHandlers.get("seekto")({ seekTime: 90, fastSeek: true });
  assert.equal(audio.currentTime, 90);
  actionHandlers.get("previoustrack")();
  actionHandlers.get("nexttrack")();
  assert.equal(previousCount, 1);
  assert.equal(nextCount, 1);
  actionHandlers.get("stop")();
  assert.equal(stopCount, 1);
  assert.equal(audio.currentTime, 0);
  assert.equal(mediaSession.playbackState, "paused");
  actionHandlers.get("pause")();
  assert.equal(pauseCount, 1);
});

test("degrades safely when Media Session is unavailable", () => {
  const controller = createMediaSessionController({ audio: createFakeAudio() });
  assert.equal(controller.isSupported(), false);
  assert.equal(controller.installActionHandlers(), false);
  assert.doesNotThrow(() => controller.updateMetadata({ label: "Focus" }));
  assert.equal(inferArtworkType("file:///cover.JPG?cache=1"), "image/jpeg");
});

test("can start without claiming media ownership until the selected backend activates", () => {
  const handlers = new Map();
  const mediaSession = {
    metadata: null,
    playbackState: "none",
    setActionHandler(name, handler) {
      handlers.set(name, handler);
    },
    setPositionState() {}
  };
  class FakeMediaMetadata {
    constructor(value) {
      Object.assign(this, value);
    }
  }
  const controller = createMediaSessionController({
    audio: createFakeAudio(),
    mediaSession,
    MediaMetadata: FakeMediaMetadata,
    initialOwnershipEnabled: false
  });

  controller.installActionHandlers({ play() {} });
  controller.updateMetadata({ label: "Deferred Focus" });
  assert.equal(controller.hasOwnership(), false);
  assert.equal(handlers.size, 0);
  assert.equal(mediaSession.metadata, null);

  controller.acquireOwnership();
  assert.equal(controller.hasOwnership(), true);
  assert.equal(mediaSession.metadata.title, "Deferred Focus");
  assert.equal(typeof handlers.get("play"), "function");
});

test("claims a paused media session before an asynchronous fade completes", async () => {
  const actionHandlers = new Map();
  const mediaSession = {
    metadata: null,
    playbackState: "none",
    setActionHandler(name, handler) {
      actionHandlers.set(name, handler);
    },
    setPositionState() {}
  };
  class FakeMediaMetadata {
    constructor(value) {
      Object.assign(this, value);
    }
  }
  const audio = createFakeAudio();
  audio.paused = false;
  let finishPause;
  const controller = createMediaSessionController({
    mediaSession,
    MediaMetadata: FakeMediaMetadata,
    audio,
    logger: { warn() {} }
  });

  controller.installActionHandlers({
    pause: () => new Promise((resolve) => {
      finishPause = () => {
        audio.pause();
        resolve();
      };
    })
  });
  controller.updateMetadata({ label: "Focus Mix" });
  assert.equal(mediaSession.playbackState, "playing");

  const pendingPause = actionHandlers.get("pause")();
  assert.equal(mediaSession.playbackState, "paused");
  assert.equal(mediaSession.metadata.title, "Focus Mix");

  finishPause();
  assert.equal(await pendingPause, true);
  assert.equal(mediaSession.playbackState, "paused");
  assert.equal(mediaSession.metadata.title, "Focus Mix");
});

test("hands macOS media ownership to the native publisher without duplicate browser handlers", () => {
  const actionHandlers = new Map();
  const published = [];
  const mediaSession = {
    metadata: null,
    playbackState: "none",
    setActionHandler(name, handler) {
      actionHandlers.set(name, handler);
    },
    setPositionState() {}
  };
  class FakeMediaMetadata {
    constructor(value) {
      Object.assign(this, value);
    }
  }
  const audio = createFakeAudio();
  const controller = createMediaSessionController({
    mediaSession,
    MediaMetadata: FakeMediaMetadata,
    audio,
    publishNativeState: (state) => published.push(state),
    logger: { warn() {} }
  });

  controller.installActionHandlers({ play: () => audio.play() });
  controller.updateMetadata({ label: "Native Focus", isLocal: true });
  assert.equal(controller.enableNativeMode(), true);
  assert.equal(controller.isNativeMode(), true);
  assert.equal(mediaSession.metadata, null);
  assert.equal(mediaSession.playbackState, "none");
  assert.ok([...actionHandlers.values()].every((handler) => handler === null));
  assert.deepEqual(published.at(-1), {
    title: "Native Focus",
    artist: "Local Music",
    album: "Infinite Lo-Fi",
    duration: 120,
    position: 20,
    playbackRate: 1,
    state: "paused"
  });

  audio.play();
  assert.equal(published.at(-1).state, "playing");
  controller.syncPlaybackIntent("paused");
  assert.equal(published.at(-1).state, "paused");
  audio.currentTime = 45;
  audio.dispatch("timeupdate");
  assert.equal(published.at(-1).position, 45);
});

test("releases and reacquires browser media ownership without duplicate listeners", () => {
  const actionHandlers = new Map();
  const mediaSession = {
    metadata: null,
    playbackState: "none",
    setActionHandler(name, handler) {
      actionHandlers.set(name, handler);
    },
    setPositionState() {}
  };
  class FakeMediaMetadata {
    constructor(value) {
      Object.assign(this, value);
    }
  }
  const audio = createFakeAudio();
  let playCount = 0;
  const controller = createMediaSessionController({
    mediaSession,
    MediaMetadata: FakeMediaMetadata,
    audio,
    logger: { warn() {} }
  });

  controller.installActionHandlers({
    play: () => {
      playCount += 1;
      return audio.play();
    }
  });
  controller.updateMetadata({ label: "Local Focus" });
  assert.equal(controller.hasOwnership(), true);

  assert.equal(controller.releaseOwnership(), true);
  assert.equal(controller.hasOwnership(), false);
  assert.equal(mediaSession.metadata, null);
  assert.equal(mediaSession.playbackState, "none");
  assert.ok([...actionHandlers.values()].every((handler) => handler === null));

  controller.updateMetadata({ label: "Still Local" });
  assert.equal(mediaSession.metadata, null);
  assert.equal(controller.acquireOwnership(), true);
  assert.equal(controller.hasOwnership(), true);
  assert.equal(mediaSession.metadata.title, "Still Local");
  assert.equal(typeof actionHandlers.get("play"), "function");
  actionHandlers.get("play")();
  assert.equal(playCount, 1);

  const listenerCounts = Object.fromEntries(
    [...audio.__listeners.entries()].map(([name, handlers]) => [name, handlers.length])
  );
  assert.ok(Object.values(listenerCounts).every((count) => count === 1));
});

test("releases native media ownership by publishing an empty session", () => {
  const published = [];
  const controller = createMediaSessionController({
    audio: createFakeAudio(),
    publishNativeState: (state) => published.push(state)
  });
  controller.installActionHandlers();
  controller.updateMetadata({ label: "Native Focus" });
  controller.enableNativeMode();

  controller.releaseOwnership();
  assert.equal(controller.hasOwnership(), false);
  assert.equal(published.at(-1).state, "none");
  assert.equal(published.at(-1).title, "");

  controller.acquireOwnership();
  assert.equal(controller.hasOwnership(), true);
  assert.equal(published.at(-1).title, "Native Focus");
  assert.equal(published.at(-1).state, "paused");
});

test("falls back from native mode to browser media ownership", () => {
  const actionHandlers = new Map();
  const mediaSession = {
    metadata: null,
    playbackState: "none",
    setActionHandler(name, handler) {
      actionHandlers.set(name, handler);
    },
    setPositionState() {}
  };
  class FakeMediaMetadata {
    constructor(value) {
      Object.assign(this, value);
    }
  }
  const controller = createMediaSessionController({
    audio: createFakeAudio(),
    mediaSession,
    MediaMetadata: FakeMediaMetadata,
    publishNativeState() {}
  });
  controller.installActionHandlers({ play() {} });
  controller.updateMetadata({ label: "Fallback Song" });
  controller.enableNativeMode();
  controller.releaseOwnership();

  assert.equal(controller.disableNativeMode(), true);
  assert.equal(controller.acquireOwnership(), true);
  assert.equal(controller.isNativeMode(), false);
  assert.equal(mediaSession.metadata.title, "Fallback Song");
  assert.equal(typeof actionHandlers.get("play"), "function");
});
