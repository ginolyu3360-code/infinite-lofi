(function exposeInfiniteLofiTasks(globalScope) {
  const MAX_TASKS = 100;
  const MAX_TASK_ID_LENGTH = 128;
  const MAX_TASK_TITLE_CODE_POINTS = 120;
  const TASK_PAGE_SIZE = 20;

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function codePointLength(value) {
    return Array.from(String(value || "")).length;
  }

  function truncateCodePoints(value, maximum = MAX_TASK_TITLE_CODE_POINTS) {
    return Array.from(String(value || "")).slice(0, maximum).join("");
  }

  function normalizeTaskTitle(value) {
    return truncateCodePoints(
      String(value ?? "")
        .replace(/[\r\n\u2028\u2029]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    );
  }

  function requireTaskTitle(value) {
    const title = normalizeTaskTitle(value);
    if (!title) throw new Error("Enter a task title.");
    return title;
  }

  function normalizeTaskId(value) {
    if (typeof value !== "string") return null;
    const id = value.trim();
    return id && id.length <= MAX_TASK_ID_LENGTH ? id : null;
  }

  function normalizeTaskSnapshot(value, options = {}) {
    if (value === null || value === undefined) return null;
    if (!isObject(value)) {
      if (options.strict) throw new Error("Timer task context is malformed.");
      return null;
    }
    const id = normalizeTaskId(value.id);
    if (!id) {
      if (options.strict) throw new Error("Timer session ID is invalid.");
      return null;
    }
    const rawTaskId = value.taskId;
    const taskId = rawTaskId === null || rawTaskId === undefined || rawTaskId === ""
      ? null
      : normalizeTaskId(rawTaskId);
    if (rawTaskId !== null && rawTaskId !== undefined && rawTaskId !== "" && !taskId) {
      if (options.strict) throw new Error("Timer task ID is invalid.");
    }
    const taskTitle = normalizeTaskTitle(value.taskTitle);
    if (options.strict && typeof value.taskTitle !== "string") {
      throw new Error("Timer task title snapshot is invalid.");
    }
    if (options.strict && codePointLength(normalizeTaskTitle(value.taskTitle)) !== codePointLength(String(value.taskTitle || "").trim().replace(/[\r\n\u2028\u2029]+/g, " ").replace(/\s+/g, " "))) {
      throw new Error("Timer task title snapshot is too long.");
    }
    return { id, taskId, taskTitle };
  }

  function validateTaskItem(item, index) {
    if (!isObject(item)) throw new Error(`Task ${index + 1} is malformed.`);
    const id = normalizeTaskId(item.id);
    if (!id) throw new Error(`Task ${index + 1} has an invalid ID.`);
    if (typeof item.title !== "string") throw new Error(`Task ${index + 1} has an invalid title.`);
    const title = normalizeTaskTitle(item.title);
    if (!title) throw new Error(`Task ${index + 1} has an empty title.`);
    if (codePointLength(String(item.title).trim().replace(/[\r\n\u2028\u2029]+/g, " ").replace(/\s+/g, " ")) > MAX_TASK_TITLE_CODE_POINTS) {
      throw new Error(`Task ${index + 1} title is too long.`);
    }
    if (!['open', 'completed'].includes(item.status)) {
      throw new Error(`Task ${index + 1} has an invalid status.`);
    }
    const createdAt = Number(item.createdAt);
    if (!Number.isFinite(createdAt)) throw new Error(`Task ${index + 1} has an invalid creation time.`);
    const completedAt = item.completedAt === null ? null : Number(item.completedAt);
    if (item.status === "open" && item.completedAt !== null) {
      throw new Error(`Open task ${index + 1} cannot have a completion time.`);
    }
    if (item.status === "completed" && !Number.isFinite(completedAt)) {
      throw new Error(`Completed task ${index + 1} needs a valid completion time.`);
    }
    return { id, title, status: item.status, createdAt, completedAt };
  }

  function normalizeTasksState(value, options = {}) {
    const strict = options.strict === true;
    if (!isObject(value)) {
      if (strict) throw new Error("Task data is malformed.");
      return { items: [], selectedTaskId: null };
    }
    if (!Array.isArray(value.items)) {
      if (strict) throw new Error("Task list is malformed.");
      return { items: [], selectedTaskId: null };
    }
    if (value.items.length > MAX_TASKS) {
      throw new Error(`Task list exceeds the ${MAX_TASKS}-task limit.`);
    }
    const items = [];
    const seenIds = new Set();
    for (let index = 0; index < value.items.length; index += 1) {
      let task;
      try {
        task = validateTaskItem(value.items[index], index);
      } catch (error) {
        if (strict) throw error;
        continue;
      }
      if (seenIds.has(task.id)) {
        if (strict) throw new Error(`Task ID "${task.id}" is duplicated.`);
        continue;
      }
      seenIds.add(task.id);
      items.push(task);
    }
    const requestedSelection = value.selectedTaskId === null || value.selectedTaskId === undefined || value.selectedTaskId === ""
      ? null
      : normalizeTaskId(value.selectedTaskId);
    if (strict && value.selectedTaskId !== null && value.selectedTaskId !== undefined && value.selectedTaskId !== "" && !requestedSelection) {
      throw new Error("Selected task ID is invalid.");
    }
    const selectedTaskId = items.some((task) => task.id === requestedSelection && task.status === "open")
      ? requestedSelection
      : null;
    return { items, selectedTaskId };
  }

  function requireUniqueId(state, id) {
    const normalizedId = normalizeTaskId(id);
    if (!normalizedId) throw new Error("Could not create a stable task ID.");
    if (state.items.some((task) => task.id === normalizedId)) {
      throw new Error("Could not create a unique task ID. Try again.");
    }
    return normalizedId;
  }

  function addTask(value, title, options = {}) {
    const state = normalizeTasksState(value, { strict: true });
    if (state.items.length >= MAX_TASKS) {
      throw new Error(`You can keep up to ${MAX_TASKS} tasks. Delete one before adding another.`);
    }
    const createdAt = Number(options.now);
    if (!Number.isFinite(createdAt)) throw new Error("Task creation time is invalid.");
    return {
      ...state,
      items: [...state.items, {
        id: requireUniqueId(state, options.id),
        title: requireTaskTitle(title),
        status: "open",
        createdAt,
        completedAt: null
      }]
    };
  }

  function renameTask(value, id, title) {
    const state = normalizeTasksState(value, { strict: true });
    const taskId = normalizeTaskId(id);
    if (!taskId || !state.items.some((task) => task.id === taskId)) throw new Error("Task no longer exists.");
    const nextTitle = requireTaskTitle(title);
    return { ...state, items: state.items.map((task) => task.id === taskId ? { ...task, title: nextTitle } : task) };
  }

  function selectTask(value, id) {
    const state = normalizeTasksState(value, { strict: true });
    if (id === null || id === "") return { ...state, selectedTaskId: null };
    const taskId = normalizeTaskId(id);
    const task = state.items.find((item) => item.id === taskId);
    if (!task || task.status !== "open") throw new Error("Only an open task can be selected.");
    return { ...state, selectedTaskId: state.selectedTaskId === taskId ? null : taskId };
  }

  function setTaskStatus(value, id, status, now) {
    const state = normalizeTasksState(value, { strict: true });
    const taskId = normalizeTaskId(id);
    const task = state.items.find((item) => item.id === taskId);
    if (!task) throw new Error("Task no longer exists.");
    if (!['open', 'completed'].includes(status)) throw new Error("Task status is invalid.");
    const completedAt = status === "completed" ? Number(now) : null;
    if (status === "completed" && !Number.isFinite(completedAt)) throw new Error("Task completion time is invalid.");
    return {
      items: state.items.map((item) => item.id === taskId ? { ...item, status, completedAt } : item),
      selectedTaskId: status === "completed" && state.selectedTaskId === taskId ? null : state.selectedTaskId
    };
  }

  function deleteTask(value, id) {
    const state = normalizeTasksState(value, { strict: true });
    const taskId = normalizeTaskId(id);
    if (!taskId || !state.items.some((task) => task.id === taskId)) throw new Error("Task no longer exists.");
    return {
      items: state.items.filter((task) => task.id !== taskId),
      selectedTaskId: state.selectedTaskId === taskId ? null : state.selectedTaskId
    };
  }

  function getTaskLists(value) {
    const state = normalizeTasksState(value);
    return {
      open: state.items.filter((task) => task.status === "open"),
      completed: state.items
        .filter((task) => task.status === "completed")
        .sort((left, right) => right.completedAt - left.completedAt || left.id.localeCompare(right.id))
    };
  }

  function paginateTasks(items, page, pageSize = TASK_PAGE_SIZE) {
    const source = Array.isArray(items) ? items : [];
    const safePageSize = Math.max(1, Math.min(TASK_PAGE_SIZE, Math.round(Number(pageSize) || TASK_PAGE_SIZE)));
    const pageCount = Math.max(1, Math.ceil(source.length / safePageSize));
    const currentPage = Math.max(1, Math.min(pageCount, Math.round(Number(page) || 1)));
    return {
      items: source.slice((currentPage - 1) * safePageSize, currentPage * safePageSize),
      page: currentPage,
      pageCount,
      total: source.length
    };
  }

  function snapshotSelectedTask(value, sessionId) {
    const state = normalizeTasksState(value, { strict: true });
    const id = normalizeTaskId(sessionId);
    if (!id) throw new Error("Could not create a stable focus session ID.");
    const selected = state.items.find((task) => task.id === state.selectedTaskId && task.status === "open");
    return { id, taskId: selected?.id || null, taskTitle: selected?.title || "" };
  }

  const api = {
    MAX_TASKS,
    MAX_TASK_ID_LENGTH,
    MAX_TASK_TITLE_CODE_POINTS,
    TASK_PAGE_SIZE,
    addTask,
    codePointLength,
    deleteTask,
    getTaskLists,
    normalizeTaskId,
    normalizeTaskSnapshot,
    normalizeTaskTitle,
    normalizeTasksState,
    paginateTasks,
    renameTask,
    selectTask,
    setTaskStatus,
    snapshotSelectedTask,
    truncateCodePoints
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalScope) globalScope.InfiniteLofiTasks = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
