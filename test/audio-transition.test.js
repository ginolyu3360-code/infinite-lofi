const test = require("node:test");
const assert = require("node:assert/strict");

const { createGainEnvelope, normalizeAudioTransitions } = require("../src/audio-transition");

function createClock() {
  let now = 0;
  let nextId = 1;
  const callbacks = new Map();
  return {
    now: () => now,
    schedule(callback) {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    },
    cancel(id) {
      callbacks.delete(id);
    },
    advance(milliseconds) {
      now += milliseconds;
      const pending = [...callbacks.values()];
      callbacks.clear();
      pending.forEach((callback) => callback(now));
    },
    pending: () => callbacks.size
  };
}

test("normalizes an opt-in bounded audio transition preference", () => {
  assert.deepEqual(normalizeAudioTransitions(), { enabled: false, durationMs: 200 });
  assert.deepEqual(normalizeAudioTransitions({ enabled: true, durationMs: 900 }), {
    enabled: true,
    durationMs: 500
  });
  assert.deepEqual(normalizeAudioTransitions({ enabled: 1, durationMs: -20 }), {
    enabled: false,
    durationMs: 0
  });
});

test("keeps user volume separate from transient gain and preserves exact mute", async () => {
  const clock = createClock();
  const audio = { volume: 0.8 };
  const envelope = createGainEnvelope({
    audio,
    userVolume: 0.8,
    now: clock.now,
    schedule: clock.schedule,
    cancelScheduled: clock.cancel
  });
  envelope.setGain(0);
  const fade = envelope.fadeTo(1, 200);
  clock.advance(100);
  assert.equal(audio.volume, 0.4);
  envelope.setUserVolume(0.5);
  assert.equal(audio.volume, 0.25);
  envelope.setUserVolume(0);
  assert.equal(audio.volume, 0);
  clock.advance(100);
  assert.equal(await fade, true);
  assert.deepEqual(envelope.getState(), {
    userVolume: 0,
    transientGain: 1,
    effectiveVolume: 0,
    isActive: false
  });
});

test("a newer envelope command cancels the old callback and leaves no idle polling", async () => {
  const clock = createClock();
  const audio = { volume: 1 };
  const envelope = createGainEnvelope({
    audio,
    now: clock.now,
    schedule: clock.schedule,
    cancelScheduled: clock.cancel
  });
  const first = envelope.fadeTo(0, 200);
  clock.advance(50);
  assert.equal(audio.volume, 0.75);
  const second = envelope.fadeTo(1, 100);
  assert.equal(await first, false);
  clock.advance(100);
  assert.equal(await second, true);
  assert.equal(audio.volume, 1);
  assert.equal(clock.pending(), 0);

  const late = envelope.fadeTo(0, 200);
  envelope.cancel({ gain: 1 });
  clock.advance(500);
  assert.equal(await late, false);
  assert.equal(audio.volume, 1);
  assert.equal(clock.pending(), 0);
});
