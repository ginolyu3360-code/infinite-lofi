const test = require("node:test");
const assert = require("node:assert/strict");

const noteModel = require("../src/notes");
const { createNotesController } = require("../src/notes-controller");
const { createRepository } = require("../src/storage");

function createMemoryStorage() {
  const entries = new Map();
  let failure = null;
  return {
    getItem(key) { return entries.get(key) ?? null; },
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
    this.style = {};
    this.value = "";
    this.textContent = "";
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
  addEventListener() {}
  appendChild(child) { this.children.push(child); return child; }
  querySelectorAll() { return []; }
  set innerHTML(_value) { this.children = []; }
}

test("notes report quota failure and restore the last committed content", () => {
  const storage = createMemoryStorage();
  const repository = createRepository(storage, () => 100);
  const notesInput = new FakeElement("textarea");
  const errors = [];
  const controller = createNotesController({
    appStorage: repository,
    noteModel,
    sanitizeNoteFiles: (files) => Array.isArray(files) ? files.map((file) => ({ ...file })) : [],
    elements: {
      document: {
        createElement: (tagName) => new FakeElement(tagName),
        getElementById: () => null
      },
      notesInput,
      noteTabs: new FakeElement(),
      notePinBtn: new FakeElement("button")
    },
    onError: (error) => errors.push(error.message),
    confirm: () => true,
    now: () => 200,
    random: () => 0.5,
    requestAnimationFrame: (callback) => callback()
  });

  controller.loadNotes();
  notesInput.value = "Committed note";
  controller.saveNotesNow();
  assert.equal(repository.getState().notes.files[0].content, "Committed note");

  storage.failWith(new Error("quota exceeded"));
  notesInput.value = "Unsaved note";
  controller.saveNotesNow();
  assert.equal(repository.getState().notes.files[0].content, "Committed note");
  assert.equal(notesInput.value, "Committed note");
  assert.deepEqual(errors, ["quota exceeded"]);
});
