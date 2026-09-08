const test = require("node:test");
const assert = require("node:assert/strict");

const { createMediaSessionController, inferArtworkType } = require("../src/media-session");

function createFakeAudio() {
  const listeners = new Map();
  return {
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
  const controller = createMediaSessionController({
    mediaSession,
    MediaMetadata: FakeMediaMetadata,
    audio,
    logger: { warn() {} }
  });

  assert.equal(controller.installActionHandlers({
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
  assert.equal(audio.currentTime, 0);
  assert.equal(mediaSession.playbackState, "paused");
});

test("degrades safely when Media Session is unavailable", () => {
  const controller = createMediaSessionController({ audio: createFakeAudio() });
  assert.equal(controller.isSupported(), false);
  assert.equal(controller.installActionHandlers(), false);
  assert.doesNotThrow(() => controller.updateMetadata({ label: "Focus" }));
  assert.equal(inferArtworkType("file:///cover.JPG?cache=1"), "image/jpeg");
});
