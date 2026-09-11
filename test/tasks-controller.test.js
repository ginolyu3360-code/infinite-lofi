const test = require("node:test");
const assert = require("node:assert/strict");

const { createRepository } = require("../src/storage");
const taskModel = require("../src/tasks");
const { createTasksController } = require("../src/tasks-controller");

function createMemoryStorage() {
  const entries = new Map();
  let failure = null;
  return {
    getItem(key) { return entries.has(key) ? entries.get(key) : null; },
    setItem(key, value) {
      if (failure) throw failure;
      entries.set(key, String(value));
    },
    removeItem(key) { entries.delete(key); },
    failWith(error) { failure = error; }
  };
}

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.value = "";
    this.textContent = "";
    this.title = "";
    this.disabled = false;
    this.inert = false;
    this.className = "";
    this.classList = {
      values: new Set(),
      add: (...names) => names.forEach((name) => this.classList.values.add(name)),
      remove: (...names) => names.forEach((name) => this.classList.values.delete(name)),
      contains: (name) => this.classList.values.has(name),
      toggle: (name, force) => {
        const enabled = force === undefined ? !this.classList.values.has(name) : Boolean(force);
        if (enabled) this.classList.values.add(name);
        else this.classList.values.delete(name);
        return enabled;
      }
    };
  }
  addEventListener(name, handler) { this.listeners.set(name, handler); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); return child; }
  focus() {}
  querySelector() { return null; }
  set innerHTML(_value) { this.children = []; }
  get innerHTML() { return ""; }
}

function createElements() {
  const document = { createElement: (tag) => new FakeElement(tag) };
  const names = [
    "drawerBackdrop", "timerIntentSummary", "timerIntentLabel", "timerIntentValue",
    "tasksToggleBtn", "tasksDrawer", "tasksCloseBtn", "tasksCurrentLabel", "tasksCurrentValue",
    "tasksNextLabel", "tasksNextValue", "taskAddForm", "taskTitleInput", "taskCapacity",
    "openTasksCount", "openTasksEmpty", "openTasksList", "openTasksPagination",
    "completedTasksToggle", "completedTasksCount", "completedTasksBody", "completedTasksEmpty",
    "completedTasksList", "completedTasksPagination"
  ];
  return Object.fromEntries([["document", document], ...names.map((name) => [name, new FakeElement()])]);
}

test("task controller reports storage failure and leaves committed state unchanged", () => {
  const storage = createMemoryStorage();
  const repository = createRepository(storage, () => 100);
  const elements = createElements();
  const alerts = [];
  let idCounter = 0;
  const controller = createTasksController({
    appStorage: repository,
    taskModel,
    elements,
    alert: (message) => alerts.push(message),
    confirm: () => true,
    now: () => 200,
    createId: () => `task-${++idCounter}`,
    requestAnimationFrame: (callback) => callback()
  });
  elements.taskTitleInput.value = "Saved task";
  controller.addTaskFromForm({ preventDefault() {} });
  assert.equal(repository.getState().tasks.items[0].title, "Saved task");

  storage.failWith(new Error("quota exceeded"));
  elements.taskTitleInput.value = "Unsaved task";
  controller.addTaskFromForm({ preventDefault() {} });
  assert.equal(repository.getState().tasks.items.length, 1);
  assert.match(alerts[0], /quota exceeded/);
});
