const test = require("node:test");
const assert = require("node:assert/strict");

const storageModel = require("../src/storage");
const statsModel = require("../src/stats");
const core = require("../src/core");
const i18n = require("../src/i18n");
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

class FakeElement {
  constructor(document) {
    this.ownerDocument = document;
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.textContent = "";
    this.value = "";
    this.title = "";
    this._classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => this._classes.add(name)),
      remove: (...names) => names.forEach((name) => this._classes.delete(name)),
      contains: (name) => this._classes.has(name),
      toggle: (name, force) => {
        const enabled = typeof force === "boolean" ? force : !this._classes.has(name);
        if (enabled) this._classes.add(name);
        else this._classes.delete(name);
        return enabled;
      }
    };
  }

  set className(value) {
    this._classes = new Set(String(value || "").split(/\s+/).filter(Boolean));
  }

  get className() {
    return [...this._classes].join(" ");
  }

  set innerHTML(_value) {
    this.children = [];
  }

  get innerHTML() {
    return "";
  }

  append(...children) {
    this.children.push(...children);
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  remove() {}

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(name, listener) {
    this.listeners.set(name, listener);
  }

  focus() {
    if (this.ownerDocument) this.ownerDocument.activeElement = this;
  }
}

function createRenderElements() {
  const document = {
    activeElement: null,
    createElement() {
      return new FakeElement(document);
    }
  };
  document.body = new FakeElement(document);
  const names = [
    "statsDrawer", "statsToggleBtn", "statsCloseBtn", "todayFocusStat",
    "todayGoalProgress", "todayGoalBar", "statsHeadingLabel", "statsTotalValue",
    "statsAverageValue", "statsPeakValue", "statsActiveDaysValue",
    "statsStreakValue", "statsComparisonValue", "focusReviewRange",
    "focusReviewSummary", "focusReviewEmpty", "focusReviewList",
    "focusReviewPagination", "focusReviewRounding", "focusReviewLimits",
    "sessionHistoryCount", "sessionHistoryDateInput", "sessionHistoryMinutesInput",
    "sessionHistoryEmpty", "sessionHistoryList", "statsBars",
    "statsRangeTodayBtn", "statsRangeWeekBtn", "statsRangeMonthBtn",
    "statsTooltip", "drawerBackdrop", "storageRecoveryNotice",
    "storageRecoveryMessage"
  ];
  return Object.fromEntries([
    ["document", document],
    ...names.map((name) => [name, new FakeElement(document)])
  ]);
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
    state.stats.focusSessions = [{
      id: "restored-session",
      day: "2026-09-07",
      focusSeconds: 1800,
      completedAt: "",
      source: "manual"
    }];
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
  assert.equal(targetRepository.getState().stats.focusSessions[0].id, "restored-session");
  assert.equal(reloadCount, 1);
  assert.match(alerts[0], /restored successfully/i);
});

test("renders a bounded, identity-safe focus review from the canonical ledger", () => {
  const now = new Date();
  const day = core.getLocalDayKey(now);
  const state = storageModel.createDefaultState(now.getTime());
  state.settings.statsRange = "week";
  state.stats.focusSessions = core.normalizeFocusSessions([
    { id: "live", day, focusSeconds: 120, source: "timer", taskId: "task-1", taskTitle: "Old title" },
    { id: "deleted", day, focusSeconds: 90, source: "timer", taskId: "task-gone", taskTitle: "Deleted title" },
    { id: "snapshot", day, focusSeconds: 31, source: "timer", taskId: null, taskTitle: "Snapshot title" },
    { id: "manual", day, focusSeconds: 29, source: "manual", taskId: null, taskTitle: "" }
  ], []);
  state.stats.focusRows = core.aggregateFocusRows(state.stats.focusSessions);
  state.tasks.items = [{
    id: "task-1",
    title: "Current title",
    status: "open",
    createdAt: now.getTime(),
    completedAt: null
  }];
  const elements = createRenderElements();
  const english = i18n.createI18n("en");
  const controller = createStatsController({
    appStorage: {
      getState: () => state,
      update: (mutator) => {
        mutator(state);
        return state;
      }
    },
    statsModel,
    core,
    elements,
    t: english.t,
    getLocale: english.getLocale,
    confirm: () => true,
    alert: () => {}
  });

  controller.loadStatsRange();
  controller.renderStats();

  assert.equal(elements.statsHeadingLabel.textContent, "Focus Review (Last 7 Days)");
  assert.equal(elements.statsTotalValue.textContent, "5m");
  assert.equal(elements.statsActiveDaysValue.textContent, "1 / 7");
  assert.equal(elements.statsComparisonValue.textContent, "No baseline");
  assert.match(elements.statsComparisonValue.title, /no recorded time/i);
  assert.equal(elements.focusReviewList.children.length, 4);
  assert.equal(elements.focusReviewPagination.children.length, 0);
  assert.equal(elements.focusReviewSummary.textContent, "5m recorded across 1 active day.");
  assert.match(elements.focusReviewLimits.textContent, /Absence|no recorded time/i);
  assert.ok(elements.focusReviewList.children.some((row) =>
    row.children[0].children[0].textContent === "Current title" &&
    row.children[0].children[1].textContent.includes("task-1")
  ));
  assert.ok(elements.focusReviewList.children.some((row) =>
    row.children[0].children[0].textContent === "Deleted title" &&
    row.children[0].children[1].textContent.includes("Deleted")
  ));
  assert.ok(elements.focusReviewList.children.some((row) =>
    row.children[0].children[1].textContent.includes("Snapshot only")
  ));
});

test("keeps the previous stats range when persistence fails", () => {
  const state = storageModel.createDefaultState(Date.now());
  state.settings.statsRange = "week";
  const elements = createRenderElements();
  const alerts = [];
  const english = i18n.createI18n("en");
  const controller = createStatsController({
    appStorage: {
      getState: () => state,
      update: () => {
        throw new Error("quota denied");
      }
    },
    statsModel,
    core,
    elements,
    t: english.t,
    getLocale: english.getLocale,
    confirm: () => true,
    alert: (message) => alerts.push(message)
  });
  controller.loadStatsRange();
  controller.setStatsRange("month");
  assert.equal(elements.statsHeadingLabel.textContent, "Focus Review (Last 7 Days)");
  assert.deepEqual(alerts, ["quota denied"]);
});
