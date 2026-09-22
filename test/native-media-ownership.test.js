const test = require("node:test");
const assert = require("node:assert/strict");

const { createNativeMediaOwnershipController } = require("../src/native-media-ownership");

test("destroys native command handlers while external playback owns media", () => {
  const bridges = [];
  const controller = createNativeMediaOwnershipController({
    createBridge() {
      const bridge = {
        updates: [],
        destroyed: 0,
        isAvailable: () => true,
        update(state) { this.updates.push(state); },
        destroy() { this.destroyed += 1; }
      };
      bridges.push(bridge);
      return bridge;
    }
  });

  assert.equal(controller.acquire(), true);
  assert.equal(controller.isOwned(), true);
  controller.update({ title: "Focus" });
  assert.deepEqual(bridges[0].updates, [{ title: "Focus" }]);

  assert.equal(controller.release(), true);
  assert.equal(controller.isOwned(), false);
  assert.equal(bridges[0].destroyed, 1);
  controller.update({ title: "Ignored" });
  assert.equal(bridges[0].updates.length, 1);

  assert.equal(controller.acquire(), true);
  assert.equal(controller.isOwned(), true);
  assert.equal(bridges.length, 2);
  controller.destroy();
  assert.equal(bridges[1].destroyed, 1);
});

test("does not claim ownership when the native bridge is unavailable", () => {
  const controller = createNativeMediaOwnershipController({
    createBridge: () => ({
      isAvailable: () => false,
      update() {},
      destroy() {}
    })
  });
  assert.equal(controller.acquire(), false);
  assert.equal(controller.isOwned(), false);
  assert.equal(controller.isAvailable(), false);
});
