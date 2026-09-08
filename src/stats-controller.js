(function exposeInfiniteLofiStatsController(globalScope) {
  function createStatsController(options) {
    const {
      appStorage,
      statsModel,
      core,
      elements,
      beforeBackup = () => {},
      beforeRestore = () => {},
      confirm: confirmAction = globalScope.confirm.bind(globalScope),
      alert: showAlert = globalScope.alert.bind(globalScope)
    } = options;
    let rangeMode = "week";

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

    function renderStats() {
      const state = appStorage.getState();
      const rows = state.stats.focusRows;
      const days = statsModel.buildRangeDays(new Date(), rangeMode);
      const summary = statsModel.summarizeFocusRows(rows, days);
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
    }

    function setStatsRange(mode) {
      rangeMode = mode === "today" || mode === "month" ? mode : "week";
      appStorage.update((state) => {
        state.settings.statsRange = rangeMode;
      });
      renderStats();
    }

    function recordCompletedFocusSession(focusSeconds, completedAt = new Date()) {
      const rows = appStorage.getState().stats.focusRows;
      const today = core.getLocalDayKey(completedAt);
      appStorage.update((state) => {
        state.stats.focusRows = statsModel.recordFocusSession(rows, today, focusSeconds);
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
        if (!confirmAction(`Restore this backup (${restored.notes.files.length} notes, ${restored.stats.focusRows.length} focus-stat rows)? Current local data will be replaced.`)) return;
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
        state.stats.focusRows = [];
      });
      renderStats();
    }

    return {
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
