(function exposeInfiniteLofiTasksController(globalScope) {
  const i18n = typeof module !== "undefined" && module.exports ? require("./i18n") : globalScope.InfiniteLofiI18n;
  const defaultTranslate = i18n.createI18n("en").t;
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
      t = defaultTranslate,
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
        reportError(error, t("tasks.saveError"));
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
      const visibleTitle = title || t("common.unassigned");
      valueElement.textContent = visibleTitle;
      valueElement.title = visibleTitle;
      valueElement.setAttribute("aria-label", `${label}: ${visibleTitle}`);
    }

    function renderIntent(state) {
      const { current, selected } = getIntentState(state);
      if (current) {
        setIntentCopy(elements.timerIntentLabel, elements.timerIntentValue, t("timer.currentIntention"), current.taskTitle);
      } else {
        setIntentCopy(elements.timerIntentLabel, elements.timerIntentValue, t("timer.nextIntention"), selected?.title);
      }
      setIntentCopy(elements.tasksCurrentLabel, elements.tasksCurrentValue, t("tasks.currentSession"), current?.taskTitle);
      setIntentCopy(elements.tasksNextLabel, elements.tasksNextValue, t("tasks.nextSession"), selected?.title);
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
      previous.textContent = t("common.previous");
      previous.disabled = pageData.page <= 1;
      previous.setAttribute("aria-label", t("tasks.previousPage", { section: t(`tasks.section${section === "open" ? "Open" : "Completed"}`) }));
      previous.addEventListener("click", () => {
        if (section === "open") openPage -= 1;
        else completedPage -= 1;
        render();
        focusAfterRender(`[data-task-page-section="${section}"][data-task-page-direction="next"]`);
      });
      const count = elements.document.createElement("span");
      count.className = "task-page-count";
      count.textContent = t("tasks.page", { page: pageData.page, pages: pageData.pageCount });
      count.setAttribute("aria-live", "polite");
      const next = elements.document.createElement("button");
      next.type = "button";
      next.className = "task-page-btn";
      next.textContent = t("common.next");
      next.disabled = pageData.page >= pageData.pageCount;
      next.dataset.taskPageSection = section;
      next.dataset.taskPageDirection = "next";
      next.setAttribute("aria-label", t("tasks.nextPage", { section: t(`tasks.section${section === "open" ? "Open" : "Completed"}`) }));
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
        t("tasks.renamed")
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
      button.setAttribute("aria-label", t("tasks.actionLabel", { action: label, title: task.title }));
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
        input.setAttribute("aria-label", t("tasks.renameLabel", { title: task.title }));
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
        const select = makeActionButton(task, "select", t(isSelected ? "tasks.selected" : "tasks.select"));
        select.setAttribute("aria-pressed", String(isSelected));
        select.addEventListener("click", () => {
          commit(
            (tasks) => taskModel.selectTask(tasks, task.id),
            isSelected ? t("tasks.unselected") : t("tasks.selectedAnnouncement", { title: task.title })
          );
          focusAfterRender(`[data-task-action="select"][data-task-id="${CSS.escape(task.id)}"]`);
        });
        const rename = makeActionButton(task, "rename", t("tasks.rename"));
        rename.addEventListener("click", () => beginRename(task.id));
        const complete = makeActionButton(task, "complete", t("tasks.complete"));
        complete.addEventListener("click", () => {
          const committed = commit(
            (tasks) => taskModel.setTaskStatus(tasks, task.id, "completed", now()),
            t("tasks.completedAnnouncement", { title: task.title })
          );
          if (committed) focusAfterRender('[data-task-action="select"], #taskTitleInput');
        });
        actions.append(select, rename, complete);
      } else {
        const reopen = makeActionButton(task, "reopen", t("tasks.reopen"));
        reopen.addEventListener("click", () => {
          const committed = commit(
            (tasks) => taskModel.setTaskStatus(tasks, task.id, "open", now()),
            t("tasks.reopenedAnnouncement", { title: task.title })
          );
          if (committed) focusAfterRender(`[data-task-action="select"][data-task-id="${CSS.escape(task.id)}"]`);
        });
        actions.appendChild(reopen);
      }
      const remove = makeActionButton(task, "delete", t("common.delete"), "task-action-btn task-delete-btn");
      remove.addEventListener("click", () => {
        if (!confirmAction(t("tasks.deleteConfirm", { title: task.title }))) return;
        const committed = commit(
          (tasks) => taskModel.deleteTask(tasks, task.id),
          t("tasks.deletedAnnouncement", { title: task.title })
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
      elements.taskCapacity.textContent = t("tasks.capacity", { count: state.tasks.items.length, max: taskModel.MAX_TASKS });
      elements.openTasksCount.textContent = t("tasks.openCount", { count: openData.total });
      elements.completedTasksCount.textContent = t("tasks.completedCount", { count: completedData.total });
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
        t("tasks.added")
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
