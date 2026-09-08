(function exposeInfiniteLofiStatsController(globalScope) {
  function createStatsController(options) {
    const {
      appStorage,
      statsModel,
      core,
      elements,
      beforeBackup = () => {},
      beforeRestore = () => {},
      announce = () => {},
      focusManager = null,
      setDisclosureState = (trigger, expanded) => trigger?.setAttribute?.("aria-expanded", String(expanded)),
      confirm: confirmAction = globalScope.confirm.bind(globalScope),
      alert: showAlert = globalScope.alert.bind(globalScope)
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
      return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    }

    function toggleStatsDrawer(forceOpen) {
      const nextOpen = typeof forceOpen === "boolean"
        ? forceOpen
        : !elements.statsDrawer.classList.contains("is-open");
      elements.statsDrawer.classList.toggle("is-open", nextOpen);
      elements.statsToggleBtn.textContent = nextOpen ? "Hide Stats" : "Stats";
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
      elements.statsTooltip.textContent = `${full} · ${barWrap.dataset.minutes || "0"}m`;
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
      appStorage.update((state) => {
        state.stats.focusSessions = mutator(state.stats.focusSessions);
      });
      renderStats();
    }

    function updateFocusSession(id, day, minutes) {
      try {
        if (day > core.getLocalDayKey(new Date())) throw new Error("Session date cannot be in the future.");
        persistSessions((sessions) => statsModel.upsertFocusSession(sessions, {
          id,
          day,
          focusSeconds: Math.round(Number(minutes) * 60)
        }));
        announce(`Focus session updated for ${day}, ${Math.round(Number(minutes))} minutes.`);
      } catch (error) {
        showAlert(error instanceof Error ? error.message : "Could not update this session.");
      }
    }

    function deleteFocusSession(id) {
      if (!confirmAction("Delete this focus session? This cannot be undone.")) return;
      persistSessions((sessions) => statsModel.removeFocusSession(sessions, id));
      announce("Focus session deleted.");
    }

    function renderSessionHistory(sessions) {
      if (!elements.sessionHistoryList) return;
      const normalized = core.normalizeFocusSessions(sessions, []);
      const recent = normalized.slice(-visibleHistoryLimit).reverse();
      elements.sessionHistoryCount.textContent = `${normalized.length} saved`;
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
        dateInput.setAttribute("aria-label", "Focus session date");

        const minutesInput = elements.document.createElement("input");
        minutesInput.type = "number";
        minutesInput.className = "session-history-input";
        minutesInput.min = "1";
        minutesInput.max = "720";
        minutesInput.value = String(Math.max(1, Math.round(session.focusSeconds / 60)));
        minutesInput.setAttribute("aria-label", "Focus session minutes");

        const source = elements.document.createElement("span");
        source.className = "session-history-source";
        source.textContent = session.source === "migrated"
          ? "Imported daily total"
          : session.source === "timer"
          ? "Timer"
          : "Manual";

        const actions = elements.document.createElement("div");
        actions.className = "session-history-actions";
        const saveButton = elements.document.createElement("button");
        saveButton.type = "button";
        saveButton.className = "stats-export-btn";
        saveButton.textContent = "Save";
        saveButton.setAttribute("aria-label", `Save focus session for ${session.day}`);
        saveButton.addEventListener("click", () =>
          updateFocusSession(session.id, dateInput.value, minutesInput.value)
        );
        const deleteButton = elements.document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "stats-danger-btn";
        deleteButton.textContent = "Delete";
        deleteButton.setAttribute("aria-label", `Delete focus session for ${session.day}`);
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
        if (day > core.getLocalDayKey(now)) throw new Error("Session date cannot be in the future.");
        persistSessions((sessions) => statsModel.upsertFocusSession(sessions, {
          id,
          day,
          focusSeconds: Math.round(Number(minutes) * 60),
          source: "manual"
        }));
        announce(`Focus session added for ${day}, ${Math.round(Number(minutes))} minutes.`);
      } catch (error) {
        showAlert(error instanceof Error ? error.message : "Could not add this session.");
      }
    }

    function renderStats() {
      const state = appStorage.getState();
      const rows = state.stats.focusRows;
      const days = statsModel.buildRangeDays(new Date(), rangeMode);
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
        ? `Today ${todayMinutes} / ${goalMinutes}m${goal.isComplete ? " · Goal complete" : ""}`
        : `Today ${todayMinutes}m · Daily goal off`;
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
            ? `${todayMinutes} of ${goalMinutes} focus minutes completed today`
            : `${todayMinutes} focus minutes completed today; daily goal is off`
        );
      }
      if (elements.todayGoalBar) {
        elements.todayGoalBar.style.width = `${Math.round(goal.progress * 100)}%`;
        elements.todayGoalBar.classList.toggle("is-complete", goal.isComplete);
      }
      elements.statsHeadingLabel.textContent = {
        today: "Focus Stats (Today)",
        week: "Focus Stats (This Week)",
        month: "Focus Stats (This Month)"
      }[rangeMode];
      elements.statsTotalValue.textContent = formatShortDuration(summary.totalMinutes);
      elements.statsAverageValue.textContent = `${summary.averageMinutes}m`;
      elements.statsPeakValue.textContent = `${summary.peakMinutes}m`;
      elements.statsActiveDaysValue.textContent = `${trends.activeDays} / ${days.length}`;
      elements.statsActiveDaysValue.title = state.settings.goals?.dailyFocusSeconds > 0
        ? `${trends.goalDays} day${trends.goalDays === 1 ? "" : "s"} reached the daily goal in this range`
        : "Days with recorded focus in this range";
      elements.statsStreakValue.textContent = `${trends.streakDays}d`;
      elements.statsComparisonValue.textContent = trends.comparisonPercent === null
        ? "New"
        : `${trends.comparisonPercent > 0 ? "+" : ""}${trends.comparisonPercent}%`;
      elements.statsComparisonValue.title = `${formatShortDuration(trends.previousTotalMinutes)} in the previous matching period`;
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
        barWrap.setAttribute("aria-label", `${day.label} ${minutes} minutes`);
        barWrap.addEventListener("mouseenter", (event) => showTooltip(event, barWrap));
        barWrap.addEventListener("mousemove", moveTooltip);
        barWrap.addEventListener("mouseleave", hideTooltip);
        fill.title = `${minutes} min`;
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
      rangeMode = mode === "today" || mode === "month" ? mode : "week";
      appStorage.update((state) => {
        state.settings.statsRange = rangeMode;
      });
      renderStats();
    }

    function recordCompletedFocusSession(focusSeconds, completedAt = new Date()) {
      const today = core.getLocalDayKey(completedAt);
      appStorage.update((state) => {
        state.stats.focusSessions = statsModel.recordFocusSession(
          state.stats.focusSessions,
          today,
          focusSeconds,
          {
            id: `focus-timer-${completedAt.getTime()}-${state.stats.focusSessions.length}`,
            completedAt,
            source: "timer"
          }
        );
      });
      renderStats();
    }

    function exportStatsCsv() {
      const days = statsModel.buildRangeDays(new Date(), rangeMode);
      const summary = statsModel.summarizeFocusRows(appStorage.getState().stats.focusRows, days);
      const lines = ["day,focusMinutes"];
      days.forEach((day) => lines.push(`${day.key},${Math.round((summary.totals.get(day.key) || 0) / 60)}`));
      download(
        lines.join("\n"),
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
        elements.storageRecoveryMessage.textContent = `${recovery.message} The original value was preserved before a safe state was created.`;
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
        if (!confirmAction(`Restore this backup (${restored.notes.files.length} notes, ${restored.stats.focusSessions.length} focus sessions)? Current local data will be replaced.`)) return;
        beforeRestore();
        appStorage.importBackup(rawBackup);
        appStorage.dismissRecoveryNotice();
        showAlert("Backup restored successfully. Infinite Lo-Fi will reload now.");
        globalScope.location.reload();
      } catch (error) {
        showAlert(`Could not restore backup: ${error instanceof Error ? error.message : "Unknown backup error"}`);
      }
    }

    function dismissStorageRecovery() {
      appStorage.dismissRecoveryNotice();
      renderStorageRecoveryNotice();
    }

    function clearStats() {
      if (!confirmAction("Clear all focus stats? This cannot be undone.")) return;
      appStorage.update((state) => {
        state.stats.focusSessions = [];
        state.stats.focusRows = [];
      });
      renderStats();
      announce("All focus statistics cleared.");
    }

    return {
      addFocusSessionFromForm,
      clearStats,
      dismissStorageRecovery,
      downloadStorageRecoveryCopy,
      exportStatsBackup,
      exportStatsCsv,
      loadStatsRange,
      recordCompletedFocusSession,
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
