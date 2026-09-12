(function exposeInfiniteLofiStatsController(globalScope) {
  const i18n = typeof module !== "undefined" && module.exports ? require("./i18n") : globalScope.InfiniteLofiI18n;
  const defaultTranslate = i18n.createI18n("en").t;
  function createStatsController(options) {
    const {
      appStorage,
      statsModel,
      core,
      elements,
      beforeBackup = () => {},
      beforeRestore = () => {},
      announce = () => {},
      onStatsChange = () => {},
      focusManager = null,
      setDisclosureState = (trigger, expanded) => trigger?.setAttribute?.("aria-expanded", String(expanded)),
      confirm: confirmAction = globalScope.confirm.bind(globalScope),
      alert: showAlert = globalScope.alert.bind(globalScope),
      t = defaultTranslate,
      getLocale = () => "en"
    } = options;
    let rangeMode = "week";
    const visibleHistoryLimit = 12;

    function download(payload, filename, type) {
      const blob = new Blob([payload], { type });
      const url = URL.createObjectURL(blob);
      const anchor = elements.document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      elements.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    }

    function formatShortDuration(totalMinutes) {
      const safeMinutes = Math.max(0, Math.round(totalMinutes));
      const hours = Math.floor(safeMinutes / 60);
      const minutes = safeMinutes % 60;
      return hours > 0
        ? t("stats.hourMinute", { hours, minutes })
        : t("stats.minutesShort", { minutes });
    }

    function toggleStatsDrawer(forceOpen) {
      const nextOpen = typeof forceOpen === "boolean"
        ? forceOpen
        : !elements.statsDrawer.classList.contains("is-open");
      elements.statsDrawer.classList.toggle("is-open", nextOpen);
      elements.statsToggleBtn.textContent = t(nextOpen ? "player.hideStats" : "player.stats");
      setDisclosureState(elements.statsToggleBtn, nextOpen);
      if (nextOpen) {
        focusManager?.open(elements.statsDrawer, {
          trigger: elements.statsToggleBtn,
          initialFocus: elements.statsCloseBtn
        });
      } else {
        focusManager?.close(elements.statsDrawer, { fallbackFocus: elements.statsToggleBtn });
      }
      elements.drawerBackdrop?.classList.toggle("visible", nextOpen);
    }

    function loadStatsRange() {
      const stored = appStorage.getState().settings.statsRange;
      rangeMode = ["today", "week", "month"].includes(stored) ? stored : "week";
    }

    function showTooltip(event, barWrap) {
      const full = barWrap.dataset.fullLabel || barWrap.dataset.label || "";
      elements.statsTooltip.textContent = `${full} · ${t("stats.minuteShort", { minutes: barWrap.dataset.minutes || "0" })}`;
      elements.statsTooltip.classList.remove("hidden");
      moveTooltip(event);
    }

    function moveTooltip(event) {
      const bounds = elements.statsBars.getBoundingClientRect();
      const x = core.clamp(event.clientX - bounds.left, 12, bounds.width - 12);
      const y = core.clamp(event.clientY - bounds.top - 16, 0, bounds.height - 8);
      elements.statsTooltip.style.left = `${x}px`;
      elements.statsTooltip.style.top = `${Math.max(0, y)}px`;
    }

    function hideTooltip() {
      elements.statsTooltip.classList.add("hidden");
    }

    function persistSessions(mutator) {
      const committed = appStorage.update((state) => {
        state.stats.focusSessions = mutator(state.stats.focusSessions);
      });
      onStatsChange(committed);
      renderStats();
    }

    function updateFocusSession(id, day, minutes) {
      try {
        if (day > core.getLocalDayKey(new Date())) throw new Error(t("stats.futureDate"));
        persistSessions((sessions) => statsModel.upsertFocusSession(sessions, {
          id,
          day,
          focusSeconds: Math.round(Number(minutes) * 60)
        }));
        announce(t("stats.updated", { day, minutes: Math.round(Number(minutes)) }));
      } catch (error) {
        showAlert(error instanceof Error ? error.message : "Could not update this session.");
      }
    }

    function deleteFocusSession(id) {
      if (!confirmAction(t("stats.deleteConfirm"))) return;
      try {
        persistSessions((sessions) => statsModel.removeFocusSession(sessions, id));
        announce(t("stats.deleted"));
      } catch (error) {
        showAlert(error instanceof Error ? error.message : "Could not delete this session.");
      }
    }

    function renderSessionHistory(sessions) {
      if (!elements.sessionHistoryList) return;
      const normalized = core.normalizeFocusSessions(sessions, []);
      const recent = normalized.slice(-visibleHistoryLimit).reverse();
      elements.sessionHistoryCount.textContent = t("stats.savedCount", { count: normalized.length });
      elements.sessionHistoryEmpty.classList.toggle("hidden", normalized.length > 0);
      elements.sessionHistoryList.innerHTML = "";

      recent.forEach((session) => {
        const row = elements.document.createElement("div");
        row.className = "session-history-row";
        row.dataset.sessionId = session.id;

        const dateInput = elements.document.createElement("input");
        dateInput.type = "date";
        dateInput.className = "session-history-input";
        dateInput.value = session.day;
        dateInput.max = core.getLocalDayKey(new Date());
        dateInput.setAttribute("aria-label", t("stats.sessionDate"));

        const minutesInput = elements.document.createElement("input");
        minutesInput.type = "number";
        minutesInput.className = "session-history-input";
        minutesInput.min = "1";
        minutesInput.max = "720";
        minutesInput.value = String(Math.max(1, Math.round(session.focusSeconds / 60)));
        minutesInput.setAttribute("aria-label", t("stats.sessionMinutes"));

        const source = elements.document.createElement("span");
        source.className = "session-history-source";
        source.textContent = session.source === "migrated"
          ? t("stats.imported")
          : session.source === "timer"
          ? t("stats.timer")
          : t("stats.manual");
        if (session.taskTitle) {
          source.textContent += ` · ${session.taskTitle}`;
          source.title = session.taskTitle;
          source.setAttribute("aria-label", t("stats.snapshotLabel", { text: source.textContent }));
        } else {
          source.textContent += ` · ${t("common.unassigned")}`;
        }

        const actions = elements.document.createElement("div");
        actions.className = "session-history-actions";
        const saveButton = elements.document.createElement("button");
        saveButton.type = "button";
        saveButton.className = "stats-export-btn";
        saveButton.textContent = t("common.save");
        saveButton.setAttribute("aria-label", t("stats.saveSession", { day: session.day }));
        saveButton.addEventListener("click", () =>
          updateFocusSession(session.id, dateInput.value, minutesInput.value)
        );
        const deleteButton = elements.document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "stats-danger-btn";
        deleteButton.textContent = t("common.delete");
        deleteButton.setAttribute("aria-label", t("stats.deleteSession", { day: session.day }));
        deleteButton.addEventListener("click", () => deleteFocusSession(session.id));
        actions.append(saveButton, deleteButton);
        row.append(dateInput, minutesInput, source, actions);
        elements.sessionHistoryList.appendChild(row);
      });
    }

    function addFocusSessionFromForm() {
      const day = elements.sessionHistoryDateInput.value;
      const minutes = elements.sessionHistoryMinutesInput.value;
      const now = new Date();
      const id = `focus-manual-${now.getTime()}-${appStorage.getState().stats.focusSessions.length}`;
      try {
        if (day > core.getLocalDayKey(now)) throw new Error(t("stats.futureDate"));
        persistSessions((sessions) => statsModel.upsertFocusSession(sessions, {
          id,
          day,
          focusSeconds: Math.round(Number(minutes) * 60),
          source: "manual"
        }));
        announce(t("stats.added", { day, minutes: Math.round(Number(minutes)) }));
      } catch (error) {
        showAlert(error instanceof Error ? error.message : "Could not add this session.");
      }
    }

    function renderStats() {
      const state = appStorage.getState();
      const rows = state.stats.focusRows;
      const days = statsModel.buildRangeDays(new Date(), rangeMode, getLocale());
      if (rangeMode === "today" && days[0]) days[0].label = t("stats.today");
      const summary = statsModel.summarizeFocusRows(rows, days);
      const trends = statsModel.summarizeFocusTrends(
        rows,
        days,
        state.settings.goals?.dailyFocusSeconds,
        new Date()
      );
      const todayKey = core.getLocalDayKey(new Date());
      const goal = statsModel.summarizeDailyGoal(
        rows,
        todayKey,
        state.settings.goals?.dailyFocusSeconds
      );
      const todayMinutes = Math.round(goal.focusSeconds / 60);
      const goalMinutes = Math.round(goal.goalSeconds / 60);
      elements.todayFocusStat.textContent = goal.isEnabled
        ? t("stats.todayProgress", { current: todayMinutes, goal: goalMinutes, complete: goal.isComplete ? t("stats.goalComplete") : "" })
        : t("stats.todayOff", { current: todayMinutes });
      if (elements.todayGoalProgress) {
        elements.todayGoalProgress.setAttribute("aria-valuemin", "0");
        elements.todayGoalProgress.setAttribute("aria-valuenow", String(todayMinutes));
        elements.todayGoalProgress.setAttribute(
          "aria-valuemax",
          String(goal.isEnabled ? goalMinutes : Math.max(todayMinutes, 1))
        );
        elements.todayGoalProgress.setAttribute(
          "aria-label",
          goal.isEnabled
            ? t("stats.goalAria", { current: todayMinutes, goal: goalMinutes })
            : t("stats.goalOffAria", { current: todayMinutes })
        );
      }
      if (elements.todayGoalBar) {
        elements.todayGoalBar.style.width = `${Math.round(goal.progress * 100)}%`;
        elements.todayGoalBar.classList.toggle("is-complete", goal.isComplete);
      }
      elements.statsHeadingLabel.textContent = {
        today: t("stats.headingToday"),
        week: t("stats.headingWeek"),
        month: t("stats.headingMonth")
      }[rangeMode];
      elements.statsTotalValue.textContent = formatShortDuration(summary.totalMinutes);
      elements.statsAverageValue.textContent = t("stats.minuteShort", { minutes: summary.averageMinutes });
      elements.statsPeakValue.textContent = t("stats.minuteShort", { minutes: summary.peakMinutes });
      elements.statsActiveDaysValue.textContent = `${trends.activeDays} / ${days.length}`;
      elements.statsActiveDaysValue.title = state.settings.goals?.dailyFocusSeconds > 0
        ? t("stats.dayGoalTitle", { count: trends.goalDays })
        : t("stats.activeTitle");
      elements.statsStreakValue.textContent = t("stats.daysShort", { days: trends.streakDays });
      elements.statsComparisonValue.textContent = trends.comparisonPercent === null
        ? t("stats.new")
        : `${trends.comparisonPercent > 0 ? "+" : ""}${trends.comparisonPercent}%`;
      elements.statsComparisonValue.title = t("stats.previousTitle", { duration: formatShortDuration(trends.previousTotalMinutes) });
      elements.statsBars.classList.toggle("is-month-range", rangeMode === "month");
      elements.statsBars.style.gridTemplateColumns = rangeMode === "month"
        ? `repeat(${days.length}, minmax(2.45rem, 1fr))`
        : `repeat(${days.length}, minmax(0, 1fr))`;
      elements.statsBars.innerHTML = "";

      days.forEach((day, index) => {
        const value = summary.values[index];
        const height = Math.max(6, Math.round((value / summary.maxSeconds) * 100));
        const barWrap = elements.document.createElement("div");
        barWrap.className = `stat-bar stat-bar-${(index % 4) + 1}`;
        barWrap.setAttribute("role", "listitem");
        barWrap.style.transform = `rotate(${((index % 5) - 2) * 0.22}deg) translateY(${((index % 3) - 1) * 0.65}px)`;
        const fill = elements.document.createElement("div");
        fill.className = `stat-bar-fill stat-bar-fill-${(index % 4) + 1}`;
        fill.style.height = `${height}%`;
        fill.style.width = `${core.clamp(92 + (index % 4) * 2, 92, 100)}%`;
        fill.style.marginLeft = `${((index % 3) - 1) * 0.6}px`;
        const stripe = elements.document.createElement("div");
        stripe.className = "stat-bar-paper";
        stripe.style.opacity = String(0.3 + (index % 4) * 0.07);
        const label = elements.document.createElement("div");
        label.className = "stat-bar-label";
        label.textContent = day.label;
        const minutes = Math.round(value / 60);
        Object.assign(barWrap.dataset, {
          day: day.key,
          label: day.label,
          fullLabel: day.fullLabel || "",
          minutes: String(minutes)
        });
        barWrap.setAttribute("aria-label", t("stats.barAria", { day: day.label, minutes }));
        barWrap.addEventListener("mouseenter", (event) => showTooltip(event, barWrap));
        barWrap.addEventListener("mousemove", moveTooltip);
        barWrap.addEventListener("mouseleave", hideTooltip);
        fill.title = t("stats.minuteShort", { minutes });
        barWrap.append(stripe, fill, label);
        elements.statsBars.appendChild(barWrap);
      });

      elements.statsRangeTodayBtn.classList.toggle("is-active", rangeMode === "today");
      elements.statsRangeWeekBtn.classList.toggle("is-active", rangeMode === "week");
      elements.statsRangeMonthBtn.classList.toggle("is-active", rangeMode === "month");
      elements.statsRangeTodayBtn.setAttribute("aria-pressed", String(rangeMode === "today"));
      elements.statsRangeWeekBtn.setAttribute("aria-pressed", String(rangeMode === "week"));
      elements.statsRangeMonthBtn.setAttribute("aria-pressed", String(rangeMode === "month"));
      elements.sessionHistoryDateInput.max = todayKey;
      if (!elements.sessionHistoryDateInput.value || elements.sessionHistoryDateInput.value > todayKey) {
        elements.sessionHistoryDateInput.value = todayKey;
      }
      if (!elements.sessionHistoryMinutesInput.value) {
        elements.sessionHistoryMinutesInput.value = String(
          Math.round(state.settings.timer.focusSeconds / 60)
        );
      }
      renderSessionHistory(state.stats.focusSessions);
    }

    function setStatsRange(mode) {
      const previousMode = rangeMode;
      rangeMode = mode === "today" || mode === "month" ? mode : "week";
      try {
        appStorage.update((state) => {
          state.settings.statsRange = rangeMode;
        });
        renderStats();
      } catch (error) {
        rangeMode = previousMode;
        showAlert(error instanceof Error ? error.message : "Could not save the statistics range.");
        renderStats();
      }
    }

    function exportStatsCsv() {
      const days = statsModel.buildRangeDays(new Date(), rangeMode, getLocale());
      download(
        statsModel.buildDailyCsv(appStorage.getState().stats.focusRows, days),
        `infinite-lofi-focus-stats-${core.getLocalDayKey(new Date())}.csv`,
        "text/csv;charset=utf-8"
      );
    }

    function exportStatsBackup() {
      beforeBackup();
      download(
        JSON.stringify(appStorage.exportBackup(new Date().toISOString()), null, 2),
        `infinite-lofi-backup-${core.getLocalDayKey(new Date())}.json`,
        "application/json;charset=utf-8"
      );
    }

    function renderStorageRecoveryNotice() {
      const recovery = appStorage.getRecoveryNotice();
      elements.storageRecoveryNotice.classList.toggle("hidden", !recovery);
      if (recovery) {
        elements.storageRecoveryMessage.textContent = `${recovery.message} ${t("app.recoveryMessage")}`;
      }
    }

    function downloadStorageRecoveryCopy() {
      const recovery = appStorage.getRecoveryNotice();
      if (!recovery) return;
      download(
        JSON.stringify(recovery, null, 2),
        `infinite-lofi-recovery-${core.getLocalDayKey(new Date())}.json`,
        "application/json;charset=utf-8"
      );
    }

    async function restoreStatsBackup(event) {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      try {
        const rawBackup = await file.text();
        const restored = globalScope.InfiniteLofiStorage.importBackup(rawBackup);
        if (!confirmAction(t("stats.restoreConfirm", { notes: restored.notes.files.length, tasks: restored.tasks.items.length, sessions: restored.stats.focusSessions.length }))) return;
        beforeRestore();
        appStorage.importBackup(rawBackup);
        appStorage.dismissRecoveryNotice();
        showAlert(t("stats.restoreSuccess"));
        globalScope.location.reload();
      } catch (error) {
        showAlert(t("stats.restoreError", { error: error instanceof Error ? error.message : t("stats.unknownBackupError") }));
      }
    }

    function dismissStorageRecovery() {
      appStorage.dismissRecoveryNotice();
      renderStorageRecoveryNotice();
    }

    function clearStats() {
      if (!confirmAction(t("stats.clearConfirm"))) return;
      try {
        const committed = appStorage.update((state) => {
          state.stats.focusSessions = [];
          state.stats.focusRows = [];
        });
        onStatsChange(committed);
        renderStats();
        announce(t("stats.cleared"));
      } catch (error) {
        showAlert(error instanceof Error ? error.message : "Could not clear focus statistics.");
      }
    }

    return {
      addFocusSessionFromForm,
      clearStats,
      dismissStorageRecovery,
      downloadStorageRecoveryCopy,
      exportStatsBackup,
      exportStatsCsv,
      loadStatsRange,
      renderStats,
      renderStorageRecoveryNotice,
      restoreStatsBackup,
      setStatsRange,
      toggleStatsDrawer
    };
  }

  const api = { createStatsController };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalScope) globalScope.InfiniteLofiStatsController = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
