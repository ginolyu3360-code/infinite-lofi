const test = require("node:test");
const assert = require("node:assert/strict");

const { bindKeyboardShortcuts } = require("../src/bindings");

class FakeHTMLElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.isContentEditable = false;
  }
}

function createHarness() {
  let keydown;
  const calls = [];
  const input = new FakeHTMLElement("input");
  const outsideInput = new FakeHTMLElement("input");
  const classList = (values = []) => ({ contains: (name) => values.includes(name) });
  const elements = {
    tasksDrawer: { classList: classList(["is-open"]), contains: (target) => target === input },
    shortcutHelpOverlay: { classList: classList(["hidden"]) },
    playlistPanel: { classList: classList(["hidden"]) },
    statsDrawer: { classList: classList([]) },
    backgroundDrawer: { classList: classList([]) },
    focusPlanDrawer: { classList: classList([]) },
    notesPanel: { getAttribute: () => "true" }
  };
  const actions = new Proxy({}, {
    get(_target, name) {
      return (...args) => calls.push([String(name), ...args]);
    }
  });
  bindKeyboardShortcuts({
    window: {
      addEventListener(name, handler) { if (name === "keydown") keydown = handler; },
      matchMedia: () => ({ matches: false })
    },
    HTMLElement: FakeHTMLElement,
    elements,
    actions,
    isShortcutEnabled: () => true,
    isShowcaseModeEnabled: () => false,
    clamp: (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value))
  });
  function dispatch(overrides = {}) {
    let prevented = false;
    keydown({
      key: "?",
      keyCode: 0,
      target: new FakeHTMLElement("div"),
      defaultPrevented: false,
      isComposing: false,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      preventDefault() { prevented = true; },
      ...overrides
    });
    return prevented;
  }
  return { calls, dispatch, elements, input, outsideInput };
}

test("IME and already-handled key events never trigger global shortcuts", () => {
  const { calls, dispatch } = createHarness();
  dispatch({ isComposing: true });
  dispatch({ keyCode: 229 });
  dispatch({ defaultPrevented: true });
  assert.deepEqual(calls, []);
});

test("typing task titles and renames does not leak global shortcuts", () => {
  const { calls, dispatch, input } = createHarness();
  dispatch({ target: input, key: "?" });
  dispatch({ target: input, key: "s", metaKey: true });
  dispatch({ target: input, key: "Enter", metaKey: true });
  assert.deepEqual(calls, []);
});

test("shortcuts still work outside task editing and Escape closes the task drawer", () => {
  const { calls, dispatch, outsideInput } = createHarness();
  assert.equal(dispatch({ target: outsideInput, key: "s", metaKey: true }), true);
  assert.equal(dispatch({ key: "Escape" }), true);
  assert.deepEqual(calls, [["saveNotesNow"], ["toggleTasksDrawer", false]]);
});
