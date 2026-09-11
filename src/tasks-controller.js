(function exposeInfiniteLofiTasksController(globalScope) {
  function createTasksController(options) {
    const {
      appStorage,
      taskModel,
      elements,
      focusManager = null,
      setDisclosureState = (trigger, expanded) => trigger?.setAttribute?.("aria-expanded", String(expanded)),
      closeConflicts = () => {},
      announce = () => {},
      onChange = () => {},
      confirm: confirmAction = globalScope.confirm.bind(globalScope),
      alert: showAlert = globalScope.alert.bind(globalScope),
      now = () => Date.now(),
      createId = (prefix) => `${prefix}-${globalScope.crypto.randomUUID()}`,
      requestAnimationFrame: requestFrame = globalScope.requestAnimationFrame.bind(globalScope)
    } = options;

    let openPage = 1;
    let completedPage = 1;
    let completedExpanded = false;
    let editingTaskId = null;
    let titleIsComposing = false;

    function reportError(error, fallback) {
      const message = error instanceof Error ? error.message : fallback;
      showAlert(message || fallback);
      announce(message || fallback);
    }

    function commit(mutator, successMessage) {
      try {
        const committed = appStorage.update((state) => {
          state.tasks = mutator(state.tasks);
        });
        render(committed);
        onChange(committed);
        if (successMessage) announce(successMessage);
        return committed;
      } catch (error) {
        reportError(error, "Could not save this task change.");
        render();
        return null;
      }
    }

    function getIntentState(state = appStorage.getState()) {
      const current = state.timerRuntime?.phase === "focus" ? state.timerRuntime.focusSession : null;
      const selected = state.tasks.items.find((task) =>
        task.id === state.tasks.selectedTaskId && task.status === "open"
      ) || null;
      return { current, selected };
    }

    function setIntentCopy(labelElement, valueElement, label, title) {
      if (labelElement) labelElement.textContent = label;
      if (!valueElement) return;
      const visibleTitle = title || "Unassigned";
      valueElement.textContent = visibleTitle;
      valueElement.title = visibleTitle;
      valueElement.setAttribute("aria-label", `${label}: ${visibleTitle}`);
    }

    function renderIntent(state) {
      const { current, selected } = getIntentState(state);
      if (current) {
        setIntentCopy(elements.timerIntentLabel, elements.timerIntentValue, "Current intention", current.taskTitle);
      } else {
        setIntentCopy(elements.timerIntentLabel, elements.timerIntentValue, "Next intention", selected?.title);
      }
      setIntentCopy(elements.tasksCurrentLabel, elements.tasksCurrentValue, "Current session", current?.taskTitle);
      setIntentCopy(elements.tasksNextLabel, elements.tasksNextValue, "Next session", selected?.title);
    }

    function focusAfterRender(selector) {
      if (!selector) return;
      requestFrame(() => {
        const target = elements.tasksDrawer.querySelector(selector)
          || elements.taskTitleInput
          || elements.tasksCloseBtn;
        target?.focus?.({ preventScroll: true });
      });
    }

    function createPagination(section, pageData) {
      const container = section === "open" ? elements.openTasksPagination : elements.completedTasksPagination;
      if (!container) return;
      container.innerHTML = "";
      if (pageData.total === 0) return;
      const previous = elements.document.createElement("button");
      previous.type = "button";
      previous.className = "task-page-btn";
      previous.textContent = "Previous";
      previous.disabled = pageData.page <= 1;
      previous.setAttribute("aria-label", `Previous ${section} tasks page`);
      previous.addEventListener("click", () => {
        if (section === "open") openPage -= 1;
        else completedPage -= 1;
        render();
        focusAfterRender(`[data-task-page-section="${section}"][data-task-page-direction="next"]`);
      });
      const count = elements.document.createElement("span");
      count.className = "task-page-count";
      count.textContent = `Page ${pageData.page} of ${pageData.pageCount}`;
      count.setAttribute("aria-live", "polite");
      const next = elements.document.createElement("button");
      next.type = "button";
      next.className = "task-page-btn";
      next.textContent = "Next";
      next.disabled = pageData.page >= pageData.pageCount;
      next.dataset.taskPageSection = section;
      next.dataset.taskPageDirection = "next";
      next.setAttribute("aria-label", `Next ${section} tasks page`);
      next.addEventListener("click", () => {
        if (section === "open") openPage += 1;
        else completedPage += 1;
        render();
        focusAfterRender(`[data-task-page-section="${section}"][data-task-page-direction="next"]`);
      });
      previous.dataset.taskPageSection = section;
      previous.dataset.taskPageDirection = "previous";
      container.append(previous, count, next);
    }

    function finishRename(taskId, rawTitle) {
      const committed = commit(
        (tasks) => taskModel.renameTask(tasks, taskId, rawTitle),
        "Task renamed. The current and recorded session names were not changed."
      );
      if (!committed) return false;
      editingTaskId = null;
      render(committed);
      focusAfterRender(`[data-task-action="rename"][data-task-id="${CSS.escape(taskId)}"]`);
      return true;
    }

    function beginRename(taskId) {
      editingTaskId = taskId;
      render();
      focusAfterRender(`[data-task-rename-input="${CSS.escape(taskId)}"]`);
    }

    function makeActionButton(task, action, label, className = "task-action-btn") {
      const button = elements.document.createElement("button");
      button.type = "button";
      button.className = className;
      button.textContent = label;
      button.dataset.taskAction = action;
      button.dataset.taskId = task.id;
      button.setAttribute("aria-label", `${label} task ${task.title}`);
      return button;
    }

    function renderTaskRow(task, state) {
      const row = elements.document.createElement("li");
      row.className = "task-row";
      row.dataset.taskId = task.id;

      const titleArea = elements.document.createElement("div");
      titleArea.className = "task-row-title";
      if (editingTaskId === task.id) {
        const input = elements.document.createElement("input");
        input.type = "text";
        input.className = "task-rename-input";
        input.value = task.title;
        input.dataset.taskRenameInput = task.id;
        input.setAttribute("aria-label", `Rename task ${task.title}`);
        input.addEventListener("input", () => {
          input.value = taskModel.truncateCodePoints(input.value);
        });
        input.addEventListener("keydown", (event) => {
          if (event.isComposing || event.keyCode === 229) return;
          if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            finishRename(task.id, input.value);
          } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            editingTaskId = null;
            render();
            focusAfterRender(`[data-task-action="rename"][data-task-id="${CSS.escape(task.id)}"]`);
          }
        });
        titleArea.appendChild(input);
        requestFrame(() => {
          if (input.isConnected) {
            input.focus({ preventScroll: true });
            input.select();
          }
        });
      } else {
        const title = elements.document.createElement("span");
        title.textContent = task.title;
        title.title = task.title;
        title.setAttribute("aria-label", task.title);
        titleArea.appendChild(title);
      }

      const actions = elements.document.createElement("div");
      actions.className = "task-row-actions";
      if (task.status === "open") {
        const isSelected = state.tasks.selectedTaskId === task.id;
        const select = makeActionButton(task, "select", isSelected ? "Selected" : "Select");
        select.setAttribute("aria-pressed", String(isSelected));
        select.addEventListener("click", () => {
          commit(
            (tasks) => taskModel.selectTask(tasks, task.id),
            isSelected ? "Next session is now unassigned." : `${task.title} selected for the next focus session.`
          );
          focusAfterRender(`[data-task-action="select"][data-task-id="${CSS.escape(task.id)}"]`);
        });
        const rename = makeActionButton(task, "rename", "Rename");
        rename.addEventListener("click", () => beginRename(task.id));
        const complete = makeActionButton(task, "complete", "Complete");
        complete.addEventListener("click", () => {
          const committed = commit(
            (tasks) => taskModel.setTaskStatus(tasks, task.id, "completed", now()),
            `${task.title} completed. The timer was not changed.`
          );
          if (committed) focusAfterRender('[data-task-action="select"], #taskTitleInput');
        });
        actions.append(select, rename, complete);
      } else {
        const reopen = makeActionButton(task, "reopen", "Reopen");
        reopen.addEventListener("click", () => {
          const committed = commit(
            (tasks) => taskModel.setTaskStatus(tasks, task.id, "open", now()),
            `${task.title} reopened.`
          );
          if (committed) focusAfterRender(`[data-task-action="select"][data-task-id="${CSS.escape(task.id)}"]`);
        });
        actions.appendChild(reopen);
      }
      const remove = makeActionButton(task, "delete", "Delete", "task-action-btn task-delete-btn");
      remove.addEventListener("click", () => {
        if (!confirmAction(`Delete "${task.title}"? Recorded names remain in session history, including an in-progress session. This cannot be undone.`)) return;
        const committed = commit(
          (tasks) => taskModel.deleteTask(tasks, task.id),
          `${task.title} deleted. Recorded session names were kept.`
        );
        if (committed) focusAfterRender('[data-task-action], #taskTitleInput');
      });
      actions.appendChild(remove);
      row.append(titleArea, actions);
      return row;
    }

    function renderTaskList(container, pageData, state, emptyElement) {
      if (!container) return;
      container.innerHTML = "";
      emptyElement?.classList.toggle("hidden", pageData.total > 0);
      for (const task of pageData.items) container.appendChild(renderTaskRow(task, state));
    }

    function render(providedState) {
      const state = providedState || appStorage.getState();
      renderIntent(state);
      const lists = taskModel.getTaskLists(state.tasks);
      const openData = taskModel.paginateTasks(lists.open, openPage);
      const completedData = taskModel.paginateTasks(lists.completed, completedPage);
      openPage = openData.page;
      completedPage = completedData.page;
      elements.taskCapacity.textContent = `${state.tasks.items.length} / ${taskModel.MAX_TASKS} tasks`;
      elements.openTasksCount.textContent = `${openData.total} open`;
      elements.completedTasksCount.textContent = `${completedData.total} completed`;
      elements.completedTasksToggle.setAttribute("aria-expanded", String(completedExpanded));
      elements.completedTasksBody.classList.toggle("hidden", !completedExpanded);
      renderTaskList(elements.openTasksList, openData, state, elements.openTasksEmpty);
      renderTaskList(elements.completedTasksList, completedData, state, elements.completedTasksEmpty);
      createPagination("open", openData);
      createPagination("completed", completedData);
    }

    function addTaskFromForm(event) {
      event?.preventDefault?.();
      if (titleIsComposing) return;
      const rawTitle = elements.taskTitleInput.value;
      const committed = commit(
        (tasks) => taskModel.addTask(tasks, rawTitle, { id: createId("task"), now: now() }),
        "Task added."
      );
      if (!committed) return;
      elements.taskTitleInput.value = "";
      openPage = Math.max(1, Math.ceil(taskModel.getTaskLists(committed.tasks).open.length / taskModel.TASK_PAGE_SIZE));
      render(committed);
      focusAfterRender("#taskTitleInput");
    }

    function toggleCompleted() {
      completedExpanded = !completedExpanded;
      render();
      focusAfterRender("#completedTasksToggle");
    }

    function toggleDrawer(forceOpen, trigger = null) {
      const nextOpen = typeof forceOpen === "boolean"
        ? forceOpen
        : !elements.tasksDrawer.classList.contains("is-open");
      if (nextOpen) closeConflicts();
      elements.tasksDrawer.classList.toggle("is-open", nextOpen);
      setDisclosureState(elements.tasksToggleBtn, nextOpen);
      setDisclosureState(elements.timerIntentSummary, nextOpen);
      elements.drawerBackdrop?.classList.toggle("visible", nextOpen);
      if (nextOpen) {
        render();
        focusManager?.open(elements.tasksDrawer, {
          trigger: trigger || elements.tasksToggleBtn,
          initialFocus: elements.tasksCloseBtn
        });
      } else {
        editingTaskId = null;
        focusManager?.close(elements.tasksDrawer);
      }
    }

    function cancelPendingEdits() {
      editingTaskId = null;
    }

    function bindEvents() {
      elements.tasksToggleBtn.addEventListener("click", () => toggleDrawer(undefined, elements.tasksToggleBtn));
      elements.timerIntentSummary.addEventListener("click", () => toggleDrawer(undefined, elements.timerIntentSummary));
      elements.tasksCloseBtn.addEventListener("click", () => toggleDrawer(false));
      elements.taskAddForm.addEventListener("submit", addTaskFromForm);
      elements.taskTitleInput.addEventListener("input", () => {
        elements.taskTitleInput.value = taskModel.truncateCodePoints(elements.taskTitleInput.value);
      });
      elements.taskTitleInput.addEventListener("compositionstart", () => { titleIsComposing = true; });
      elements.taskTitleInput.addEventListener("compositionend", () => { titleIsComposing = false; });
      elements.completedTasksToggle.addEventListener("click", toggleCompleted);
    }

    return {
      addTaskFromForm,
      bindEvents,
      cancelPendingEdits,
      getIntentState,
      render,
      renderIntent,
      toggleCompleted,
      toggleDrawer
    };
  }

  const api = { createTasksController };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalScope) globalScope.InfiniteLofiTasksController = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
