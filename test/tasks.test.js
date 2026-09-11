const test = require("node:test");
const assert = require("node:assert/strict");

const {
  MAX_TASKS,
  TASK_PAGE_SIZE,
  addTask,
  getTaskLists,
  normalizeTaskTitle,
  normalizeTasksState,
  paginateTasks,
  renameTask,
  selectTask,
  setTaskStatus,
  snapshotSelectedTask
} = require("../src/tasks");

function emptyTasks() {
  return { items: [], selectedTaskId: null };
}

test("normalizes short single-line Unicode titles without splitting emoji", () => {
  assert.equal(normalizeTaskTitle("  Read\nchapter   3  "), "Read chapter 3");
  const longEmoji = "😀".repeat(121);
  assert.equal(Array.from(normalizeTaskTitle(longEmoji)).length, 120);
  assert.equal(normalizeTaskTitle(" \n\t "), "");
});

test("adds duplicate titles with unique IDs and retains creation order", () => {
  let state = addTask(emptyTasks(), "Read", { id: "task-one", now: 10 });
  state = addTask(state, "Read", { id: "task-two", now: 20 });
  assert.deepEqual(state.items.map((task) => task.id), ["task-one", "task-two"]);
  assert.throws(() => addTask(state, "Duplicate ID", { id: "task-one", now: 30 }), /unique task ID/);
  assert.throws(() => addTask(state, "   ", { id: "task-three", now: 30 }), /task title/);
});

test("enforces the 100-task retained limit without evicting completed tasks", () => {
  let state = emptyTasks();
  for (let index = 0; index < MAX_TASKS; index += 1) {
    state = addTask(state, `Task ${index}`, { id: `task-${index}`, now: index });
  }
  state = setTaskStatus(state, "task-0", "completed", 500);
  assert.equal(state.items.length, 100);
  assert.throws(
    () => addTask(state, "Task 101", { id: "task-100", now: 100 }),
    /100 tasks/
  );
});

test("keeps next selection separate from a frozen session snapshot", () => {
  assert.deepEqual(snapshotSelectedTask(emptyTasks(), "focus-unassigned"), {
    id: "focus-unassigned",
    taskId: null,
    taskTitle: ""
  });
  let state = addTask(emptyTasks(), "Original", { id: "task-one", now: 10 });
  state = addTask(state, "Other", { id: "task-two", now: 20 });
  state = selectTask(state, "task-one");
  const snapshot = snapshotSelectedTask(state, "focus-one");
  state = selectTask(state, "task-two");
  state = renameTask(state, "task-one", "Renamed");
  state = setTaskStatus(state, "task-one", "completed", 30);
  assert.deepEqual(snapshot, { id: "focus-one", taskId: "task-one", taskTitle: "Original" });
  assert.equal(state.selectedTaskId, "task-two");
  assert.equal(state.items[0].title, "Renamed");
});

test("clears invalid or completed selections and rejects malformed duplicate IDs", () => {
  const completed = {
    items: [{ id: "done", title: "Done", status: "completed", createdAt: 1, completedAt: 2 }],
    selectedTaskId: "done"
  };
  assert.equal(normalizeTasksState(completed, { strict: true }).selectedTaskId, null);
  assert.throws(() => selectTask(completed, "done"), /open task/);
  assert.throws(
    () => normalizeTasksState({ items: [
      { id: "same", title: "One", status: "open", createdAt: 1, completedAt: null },
      { id: "same", title: "Two", status: "open", createdAt: 2, completedAt: null }
    ], selectedTaskId: null }, { strict: true }),
    /duplicated/
  );
  assert.throws(
    () => normalizeTasksState({ items: [
      { id: "x".repeat(129), title: "Invalid", status: "open", createdAt: 1, completedAt: null }
    ], selectedTaskId: null }, { strict: true }),
    /invalid ID/
  );
});

test("preserves underlying order while completed display is newest first", () => {
  let state = addTask(emptyTasks(), "One", { id: "one", now: 1 });
  state = addTask(state, "Two", { id: "two", now: 2 });
  state = setTaskStatus(state, "one", "completed", 20);
  state = setTaskStatus(state, "two", "completed", 10);
  state = setTaskStatus(state, "one", "open", 30);
  assert.deepEqual(state.items.map((task) => task.id), ["one", "two"]);
  state = setTaskStatus(state, "one", "completed", 40);
  assert.deepEqual(getTaskLists(state).completed.map((task) => task.id), ["one", "two"]);
});

test("paginates open and completed tasks at 20 rows", () => {
  const items = Array.from({ length: 45 }, (_, index) => ({ id: `task-${index}` }));
  const first = paginateTasks(items, 1);
  const last = paginateTasks(items, 99);
  assert.equal(TASK_PAGE_SIZE, 20);
  assert.equal(first.items.length, 20);
  assert.equal(last.page, 3);
  assert.equal(last.items.length, 5);
});
