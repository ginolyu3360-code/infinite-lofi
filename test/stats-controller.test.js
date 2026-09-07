const test = require("node:test");
const assert = require("node:assert/strict");

const storageModel = require("../src/storage");
const { createStatsController } = require("../src/stats-controller");

function createMemoryStorage() {
  const entries = new Map();
  return {
    getItem(key) {
      return entries.has(key) ? entries.get(key) : null;
    },
    setItem(key, value) {
      entries.set(key, String(value));
    },
    removeItem(key) {
      entries.delete(key);
    }
  };
}

test("restores a validated backup through the controller and reloads", async (t) => {
  const previousLocation = globalThis.location;
  let reloadCount = 0;
  globalThis.location = { reload: () => { reloadCount += 1; } };
  t.after(() => {
    if (previousLocation === undefined) delete globalThis.location;
    else globalThis.location = previousLocation;
  });

  const targetRepository = storageModel.createRepository(createMemoryStorage(), () => 1000);
  const sourceRepository = storageModel.createRepository(createMemoryStorage(), () => 2000);
  sourceRepository.update((state) => {
    state.notes.files = [{ id: "restored", name: "Restored", content: "backup data", pinned: false, updatedAt: 2 }];
    state.notes.activeId = "restored";
    state.stats.focusRows = [{ day: "2026-09-07", focusSeconds: 1800 }];
  });
  const backup = JSON.stringify(sourceRepository.exportBackup("2026-09-07T00:00:00.000Z"));
  let beforeRestoreCount = 0;
  const alerts = [];
  const controller = createStatsController({
    appStorage: targetRepository,
    statsModel: {},
    core: {},
    elements: {},
    beforeRestore: () => { beforeRestoreCount += 1; },
    confirm: () => true,
    alert: (message) => alerts.push(message)
  });
  const input = {
    files: [{ text: async () => backup }],
    value: "backup.json"
  };

  await controller.restoreStatsBackup({ target: input });

  assert.equal(input.value, "");
  assert.equal(beforeRestoreCount, 1);
  assert.equal(targetRepository.getState().notes.files[0].content, "backup data");
  assert.deepEqual(targetRepository.getState().stats.focusRows, [
    { day: "2026-09-07", focusSeconds: 1800 }
  ]);
  assert.equal(reloadCount, 1);
  assert.match(alerts[0], /restored successfully/i);
});
