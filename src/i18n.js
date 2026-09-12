(function exposeInfiniteLofiI18n(globalScope) {
  const SUPPORTED_LANGUAGES = Object.freeze([
    { code: "zh-CN", label: "简体中文", locale: "zh-CN" },
    { code: "zh-TW", label: "繁體中文", locale: "zh-TW" },
    { code: "en", label: "English", locale: "en" },
    { code: "ja", label: "日本語", locale: "ja" },
    { code: "fr", label: "Français", locale: "fr" },
    { code: "ko", label: "한국어", locale: "ko" },
    { code: "es", label: "Español", locale: "es" }
  ]);

  const ENGLISH = Object.freeze({
    "app.recoveryTitle": "Local data needed recovery",
    "app.recoveryMessage": "The unreadable original was preserved before a safe state was created.",
    "app.downloadOriginal": "Download Original",
    "app.restoreBackup": "Restore Backup",
    "common.dismiss": "Dismiss",
    "common.close": "Close",
    "common.add": "Add",
    "common.save": "Save",
    "common.delete": "Delete",
    "common.apply": "Apply",
    "common.previous": "Previous",
    "common.next": "Next",
    "common.unassigned": "Unassigned",
    "common.default": "Default",
    "common.none": "None",
    "common.new": "New",
    "nav.notes": "Notes",
    "nav.tasks": "Tasks",
    "nav.plan": "Plan",
    "nav.keys": "Keys ?",
    "nav.mini": "Mini",
    "nav.full": "Full",
    "nav.openNotes": "Open notes",
    "nav.openTasks": "Open tasks",
    "nav.openPlan": "Configure focus cycle and daily goal",
    "nav.openKeys": "Open keyboard shortcuts",
    "nav.keysTitle": "Keyboard shortcuts (Shift + /)",
    "nav.enterMini": "Enter Mini Mode",
    "nav.returnFull": "Return to full view",
    "notes.workspace": "Workspace",
    "notes.title": "Notes",
    "notes.close": "Close notes",
    "notes.new": "New",
    "notes.pin": "Pin",
    "notes.unpin": "Unpin",
    "notes.pinAction": "Pin / Unpin Note",
    "notes.delete": "Delete",
    "notes.tabs": "Note tabs",
    "notes.placeholder": "Capture ideas, tasks, and small sparks...",
    "notes.untitled": "Untitled",
    "notes.defaultName": "Note {number}",
    "notes.pinned": "PIN",
    "notes.renameTitle": "Rename note {name}",
    "notes.openTitle": "Open note {name}",
    "notes.clearConfirm": "Clear all notes?",
    "notes.deleteConfirm": "Delete note \"{name}\"?",
    "timer.infiniteFocus": "Infinite Focus",
    "timer.focus": "Focus Session",
    "timer.shortBreak": "Short Break",
    "timer.longBreak": "Long Break",
    "timer.currentIntention": "Current intention",
    "timer.nextIntention": "Next intention",
    "timer.start": "Start",
    "timer.pause": "Pause",
    "timer.reset": "Reset",
    "timer.startPauseTitle": "Start or pause timer",
    "timer.resetTitle": "Reset timer",
    "timer.cycleComplete": "Cycle complete",
    "timer.focusPosition": "Focus {current} of {total}",
    "timer.goalOff": "Goal off",
    "timer.todayGoal": "Today {current} / {goal}m",
    "timer.planSummary": "{focus} / {short} / {long} min · long every {count}",
    "timer.pausedAnnouncement": "Timer paused at {time}.",
    "timer.startedAnnouncement": "{phase} timer started. {time} remaining.",
    "timer.resetAnnouncement": "Timer reset to Focus Session, {time}.",
    "timer.phaseStartedAnnouncement": "{phase} started. {time} remaining.",
    "timer.focusTime": "Focus Time",
    "timer.focusNotification": "Back to deep focus.",
    "timer.shortBreakNotification": "Take a short reset break.",
    "timer.longBreakNotification": "Cycle complete. Take a longer reset.",
    "timer.miniEnabled": "Mini Mode enabled",
    "timer.fullRestored": "Full view restored",
    "timer.show": "Show",
    "timer.showTitle": "Enter showcase mode",
    "timer.exitShowcase": "Click to exit showcase mode",
    "timer.exitShowcaseTitle": "Click anywhere on this card to exit showcase mode",
    "timer.card": "Timer card",
    "plan.eyebrow": "Routine",
    "plan.title": "Focus Plan",
    "plan.close": "Close Focus Plan",
    "plan.description": "Set the rhythm for one focus cycle. A long break follows the configured number of completed focus sessions.",
    "plan.focusMinutes": "Focus minutes",
    "plan.shortBreak": "Short break",
    "plan.longBreak": "Long break",
    "plan.focusesPerCycle": "Focuses per cycle",
    "plan.dailyGoal": "Daily goal minutes",
    "plan.dailyGoalHint": "0 turns it off · try 120",
    "plan.autoBreaks": "Auto-start breaks",
    "plan.autoBreaksHint": "Begin short and long breaks automatically.",
    "plan.autoFocus": "Auto-start focus",
    "plan.autoFocusHint": "Begin the next focus after a break automatically.",
    "plan.readyHint": "Changes start a fresh focus cycle.",
    "plan.lockedHint": "Pause the timer before changing this plan.",
    "plan.apply": "Apply Plan",
    "plan.applied": "Focus Plan applied. A new focus cycle is ready.",
    "tasks.eyebrow": "Focus Intent",
    "tasks.title": "Tasks",
    "tasks.close": "Close Tasks",
    "tasks.description": "Choose an optional intention for the next focus session. Notes remain your free-form workspace.",
    "tasks.currentSession": "Current session",
    "tasks.nextSession": "Next session",
    "tasks.newTask": "New task",
    "tasks.shortTitle": "Short title",
    "tasks.open": "Open",
    "tasks.completed": "Completed",
    "tasks.noOpen": "No open tasks. You can still focus unassigned.",
    "tasks.noCompleted": "No completed tasks.",
    "tasks.capacity": "{count} / {max} tasks",
    "tasks.openCount": "{count} open",
    "tasks.completedCount": "{count} completed",
    "tasks.page": "Page {page} of {pages}",
    "tasks.previousPage": "Previous {section} tasks page",
    "tasks.nextPage": "Next {section} tasks page",
    "tasks.sectionOpen": "open",
    "tasks.sectionCompleted": "completed",
    "tasks.select": "Select",
    "tasks.selected": "Selected",
    "tasks.rename": "Rename",
    "tasks.complete": "Complete",
    "tasks.reopen": "Reopen",
    "tasks.actionLabel": "{action} task {title}",
    "tasks.renameLabel": "Rename task {title}",
    "tasks.added": "Task added.",
    "tasks.renamed": "Task renamed. The current and recorded session names were not changed.",
    "tasks.unselected": "Next session is now unassigned.",
    "tasks.selectedAnnouncement": "{title} selected for the next focus session.",
    "tasks.completedAnnouncement": "{title} completed. The timer was not changed.",
    "tasks.reopenedAnnouncement": "{title} reopened.",
    "tasks.deleteConfirm": "Delete \"{title}\"? Recorded names remain in session history, including an in-progress session. This cannot be undone.",
    "tasks.deletedAnnouncement": "{title} deleted. Recorded session names were kept.",
    "tasks.saveError": "Could not save this task change.",
    "player.nowPlaying": "Now Playing",
    "player.queue": "Queue",
    "player.stats": "Stats",
    "player.hideStats": "Hide Stats",
    "player.scene": "Scene",
    "player.play": "Play",
    "player.pause": "Pause",
    "player.previousTrack": "Previous track",
    "player.nextTrack": "Next track",
    "player.playPauseTitle": "Play or pause music",
    "player.progress": "Playback progress",
    "player.seekTitle": "Seek within the current track",
    "player.volume": "Vol",
    "player.volumeLabel": "Volume",
    "player.volumeTitle": "Adjust music volume",
    "player.light": "Light",
    "player.brightness": "Brightness",
    "player.brightnessTitle": "Adjust background brightness",
    "player.loadFolder": "Load Folder",
    "player.reconnectFolder": "Reconnect Folder",
    "player.rescan": "Rescan",
    "player.useDefaults": "Use Defaults",
    "player.clearMissing": "Clear Missing",
    "player.bundledStatus": "Using the bundled offline playlist.",
    "player.bundledTitle": "Bundled Infinite Lo-Fi tracks",
    "player.folderTracks": "{folder} · {count} tracks",
    "player.scanning": "{folder} · Scanning…",
    "player.reconnectNeeded": "{folder} · Reconnect needed",
    "player.missingCount": "{count} missing",
    "player.folderUnavailable": "The saved folder cannot be read. Choose Reconnect Folder to locate it again.",
    "player.savedMissing": "{count} saved tracks are unavailable. Restore the files and rescan, or remove missing entries.",
    "player.savedMissingOne": "1 saved track is unavailable. Restore the file and rescan, or remove the missing entry.",
    "player.localStatus": "Queue order and the current track are saved automatically.",
    "player.missing": "Missing",
    "player.trackUnavailableTitle": "{title} is unavailable. Restore it and choose Rescan.",
    "player.playTrackTitle": "Play {title}",
    "player.trackMissingAlert": "This track is missing. Restore the file and choose Rescan, or remove missing entries.",
    "player.noPlayable": "No playable tracks",
    "player.empty": "Playlist is empty",
    "player.cover": "{title} Cover",
    "player.nowPlayingAnnouncement": "Now playing {title}.",
    "player.folderUnsupported": "Music folder selection is not supported.",
    "player.noMusicFiles": "No music files were found in the selected folder.",
    "player.folderUnreadable": "Folder unreadable · Try another",
    "player.started": "Music playback started.",
    "player.paused": "Music playback paused.",
    "stats.review": "Review",
    "stats.headingToday": "Focus Stats (Today)",
    "stats.headingWeek": "Focus Stats (This Week)",
    "stats.headingMonth": "Focus Stats (This Month)",
    "stats.close": "Close Stats",
    "stats.range": "Statistics range",
    "stats.today": "Today",
    "stats.week": "Week",
    "stats.month": "Month",
    "stats.csv": "CSV",
    "stats.backup": "Backup",
    "stats.restore": "Restore",
    "stats.clear": "Clear",
    "stats.total": "Total",
    "stats.average": "Avg / Day",
    "stats.peak": "Peak",
    "stats.activeDays": "Active Days",
    "stats.streak": "Current Streak",
    "stats.vsPrevious": "Vs Previous",
    "stats.chart": "Scrollable focus chart",
    "stats.minutesByDay": "Focus minutes by day",
    "stats.ledger": "Ledger",
    "stats.recentSessions": "Recent Focus Sessions",
    "stats.date": "Date",
    "stats.minutes": "Minutes",
    "stats.addSession": "Add Session",
    "stats.noSessions": "No focus sessions yet.",
    "stats.historyNote": "Showing the 12 most recent entries. Imported daily totals remain editable as one entry per day.",
    "stats.savedCount": "{count} saved",
    "stats.sessionDate": "Focus session date",
    "stats.sessionMinutes": "Focus session minutes",
    "stats.imported": "Imported daily total",
    "stats.timer": "Timer",
    "stats.manual": "Manual",
    "stats.snapshotLabel": "{text}. Saved task-title snapshot.",
    "stats.saveSession": "Save focus session for {day}",
    "stats.deleteSession": "Delete focus session for {day}",
    "stats.todayProgress": "Today {current} / {goal}m{complete}",
    "stats.todayOff": "Today {current}m · Daily goal off",
    "stats.goalComplete": " · Goal complete",
    "stats.goalAria": "{current} of {goal} focus minutes completed today",
    "stats.goalOffAria": "{current} focus minutes completed today; daily goal is off",
    "stats.dayGoalTitle": "{count} days reached the daily goal in this range",
    "stats.activeTitle": "Days with recorded focus in this range",
    "stats.new": "New",
    "stats.previousTitle": "{duration} in the previous matching period",
    "stats.barAria": "{day} {minutes} minutes",
    "stats.minuteShort": "{minutes} min",
    "stats.hourMinute": "{hours}h {minutes}m",
    "stats.minutesShort": "{minutes}m",
    "stats.daysShort": "{days}d",
    "stats.updated": "Focus session updated for {day}, {minutes} minutes.",
    "stats.added": "Focus session added for {day}, {minutes} minutes.",
    "stats.deleted": "Focus session deleted.",
    "stats.futureDate": "Session date cannot be in the future.",
    "stats.deleteConfirm": "Delete this focus session? This cannot be undone.",
    "stats.restoreConfirm": "Restore this backup ({notes} notes, {tasks} tasks, {sessions} focus sessions)? Current local data will be replaced.",
    "stats.restoreSuccess": "Backup restored successfully. Infinite Lo-Fi will reload now.",
    "stats.restoreError": "Could not restore backup: {error}",
    "stats.unknownBackupError": "Unknown backup error",
    "stats.clearConfirm": "Clear all focus stats? This cannot be undone.",
    "stats.cleared": "All focus statistics cleared.",
    "weather.title": "Weather",
    "weather.offOption": "Off",
    "weather.autoOption": "Automatic (IP)",
    "weather.cityOption": "Choose City",
    "weather.cityPlaceholder": "City name",
    "weather.cityLabel": "Weather city",
    "weather.modeTitle": "Choose weather privacy mode",
    "weather.off": "Weather off",
    "weather.enterCity": "Enter a city",
    "weather.loading": "Loading weather…",
    "weather.unavailable": "Weather unavailable",
    "weather.autoPrivacy": "Automatic mode sends your IP address to ipapi.co, then coordinates to Open-Meteo.",
    "weather.cityPrivacy": "City mode sends only the city name and resulting coordinates to Open-Meteo.",
    "weather.offPrivacy": "Weather is off. No weather or location requests are made.",
    "weather.updated": "{age} ago",
    "weather.justNow": "just now",
    "weather.minutesAgo": "{count}m ago",
    "weather.hoursAgo": "{count}h ago",
    "weather.daysAgo": "{count}d ago",
    "weather.clear": "Clear",
    "weather.partlyCloudy": "Partly Cloudy",
    "weather.cloudy": "Cloudy",
    "weather.fog": "Fog",
    "weather.drizzle": "Drizzle",
    "weather.rain": "Rain",
    "weather.snow": "Snow",
    "weather.thunderstorm": "Thunderstorm",
    "weather.unknown": "Unknown",
    "scene.atmosphere": "Atmosphere",
    "scene.title": "Scene",
    "scene.close": "Close Background",
    "scene.description": "Choose a curated atmosphere, the current track cover, or your own local media.",
    "scene.presets": "Curated presets",
    "scene.quietStudio": "Quiet Studio",
    "scene.warmCharcoal": "Warm charcoal",
    "scene.midnight": "Midnight",
    "scene.deepBlue": "Deep blue",
    "scene.moss": "Moss",
    "scene.forestGreen": "Forest green",
    "scene.paper": "Paper",
    "scene.warmLight": "Warm light",
    "scene.localMedia": "Local media",
    "scene.video": "Video",
    "scene.trackCover": "Track Cover",
    "scene.wallpaper": "Wallpaper",
    "scene.importImage": "Import Image",
    "scene.preset": "Preset:",
    "scene.source": "Source:",
    "scene.media": "Media:",
    "scene.builtIn": "Built-in",
    "scene.image": "Image",
    "scene.customMedia": "Custom Media",
    "scene.importedImage": "Imported Image",
    "scene.importedVideo": "Imported Video",
    "scene.builtInVideo": "Built-in Video",
    "scene.noTrackCover": "No cover for current track",
    "scene.selected": "{name} preset selected.",
    "scene.wallpaperUnsupported": "Wallpaper background is not supported.",
    "scene.wallpaperUnreadable": "Could not read the current desktop wallpaper.",
    "scene.imageUnsupported": "Background image selection is not supported.",
    "scene.videoUnsupported": "Background video selection is not supported.",
    "keys.title": "Keyboard Shortcuts",
    "keys.description": "Open this anytime from Keys ? in the top bar, or press Shift + /. Use the checkboxes to enable or disable each shortcut.",
    "keys.language": "Display language",
    "keys.languageHint": "Changes apply immediately and are saved on this device.",
    "keys.timer": "Timer",
    "keys.player": "Player",
    "keys.panels": "Panels & Stats",
    "keys.notes": "Notes",
    "keys.startPause": "Start / Pause Timer",
    "keys.resetTimer": "Reset Timer",
    "keys.playPause": "Play / Pause",
    "keys.nextTrack": "Next Track",
    "keys.previousTrack": "Previous Track",
    "keys.seekBack": "Seek -5s",
    "keys.seekForward": "Seek +5s",
    "keys.volumeUp": "Volume +5%",
    "keys.volumeDown": "Volume -5%",
    "keys.loadFolder": "Load Local Folder",
    "keys.toggleHelp": "Toggle Shortcut Help",
    "keys.togglePlaylist": "Toggle Playlist",
    "keys.toggleStats": "Toggle Stats Drawer",
    "keys.statsToday": "Stats Range: Today",
    "keys.statsWeek": "Stats Range: Week",
    "keys.statsMonth": "Stats Range: Month",
    "keys.closePanels": "Close Panels / Help",
    "keys.focusNotes": "Focus Notes Input",
    "keys.saveNotes": "Save Notes Now",
    "keys.clearNotes": "Clear Notes",
    "keys.toggleAria": "Toggle {label} shortcut",
    "language.saveError": "Could not save the display language. Your previous language is unchanged.",
    "storage.genericError": "Could not save local data. Your last saved state is unchanged.",
    "storage.notesError": "Notes were not saved because local storage is unavailable.",
    "storage.timerPauseError": "The timer could not be paused because its state was not saved.",
    "storage.timerStartError": "The timer was not started because its session context could not be saved.",
    "storage.timerResetError": "The timer was not reset because the new state could not be saved.",
    "storage.planError": "The Focus Plan was not applied because it could not be saved.",
    "storage.completionError": "The completed timer could not be saved. It will retry without duplicating history.",
    "storage.restoredCompletionError": "The completed focus session could not be saved. It will retry without duplicating history.",
    "tray.startTimer": "Start Timer",
    "tray.pauseTimer": "Pause Timer",
    "tray.resetTimer": "Reset Timer",
    "tray.showWindow": "Show Window",
    "tray.hideWindow": "Hide Window",
    "tray.quit": "Quit"
  });

  const TRANSLATIONS = {
    en: ENGLISH,
    "zh-CN": {
      "app.recoveryTitle":"本地数据需要恢复","app.recoveryMessage":"已在创建安全状态前保留无法读取的原始数据。","app.downloadOriginal":"下载原始数据","app.restoreBackup":"恢复备份","common.dismiss":"忽略","common.close":"关闭","common.add":"添加","common.save":"保存","common.delete":"删除","common.apply":"应用","common.previous":"上一页","common.next":"下一页","common.unassigned":"未指定","common.default":"默认","common.none":"无","common.new":"新建",
      "nav.notes":"笔记","nav.tasks":"任务","nav.plan":"计划","nav.keys":"快捷键 ?","nav.mini":"迷你","nav.full":"完整","nav.openNotes":"打开笔记","nav.openTasks":"打开任务","nav.openPlan":"设置专注循环与每日目标","nav.openKeys":"打开键盘快捷键","nav.keysTitle":"键盘快捷键（Shift + /）","nav.enterMini":"进入迷你模式","nav.returnFull":"返回完整视图",
      "notes.workspace":"工作区","notes.title":"笔记","notes.close":"关闭笔记","notes.new":"新建","notes.pin":"置顶","notes.unpin":"取消置顶","notes.pinAction":"置顶或取消置顶笔记","notes.delete":"删除","notes.tabs":"笔记标签页","notes.placeholder":"记录想法、任务和灵感……","notes.untitled":"未命名","notes.defaultName":"笔记 {number}","notes.pinned":"置顶","notes.renameTitle":"重命名笔记 {name}","notes.openTitle":"打开笔记 {name}","notes.clearConfirm":"清空全部笔记？","notes.deleteConfirm":"删除笔记“{name}”？",
      "timer.infiniteFocus":"无限专注","timer.focus":"专注时段","timer.shortBreak":"短休息","timer.longBreak":"长休息","timer.currentIntention":"本轮意图","timer.nextIntention":"下轮意图","timer.start":"开始","timer.pause":"暂停","timer.reset":"重置","timer.startPauseTitle":"开始或暂停计时器","timer.resetTitle":"重置计时器","timer.cycleComplete":"循环完成","timer.focusPosition":"专注 {current}/{total}","timer.goalOff":"目标关闭","timer.todayGoal":"今天 {current}/{goal} 分钟","timer.planSummary":"{focus} / {short} / {long} 分钟 · 每 {count} 轮长休息","timer.pausedAnnouncement":"计时器已在 {time} 暂停。","timer.startedAnnouncement":"{phase}计时已开始，剩余 {time}。","timer.resetAnnouncement":"计时器已重置为专注时段，{time}。","timer.phaseStartedAnnouncement":"{phase}已开始，剩余 {time}。","timer.focusTime":"专注时间","timer.focusNotification":"回到深度专注。","timer.shortBreakNotification":"短暂休息一下。","timer.longBreakNotification":"循环完成，充分休息一下。","timer.miniEnabled":"已启用迷你模式","timer.fullRestored":"已恢复完整视图","timer.show":"展示","timer.showTitle":"进入展示模式","timer.exitShowcase":"点击退出展示模式","timer.exitShowcaseTitle":"点击此卡片任意位置退出展示模式","timer.card":"计时器卡片",
      "plan.eyebrow":"节奏","plan.title":"专注计划","plan.close":"关闭专注计划","plan.description":"设置一个专注循环的节奏。完成设定数量的专注时段后进入长休息。","plan.focusMinutes":"专注分钟数","plan.shortBreak":"短休息","plan.longBreak":"长休息","plan.focusesPerCycle":"每循环专注次数","plan.dailyGoal":"每日目标分钟数","plan.dailyGoalHint":"0 表示关闭 · 可尝试 120","plan.autoBreaks":"自动开始休息","plan.autoBreaksHint":"自动开始短休息和长休息。","plan.autoFocus":"自动开始专注","plan.autoFocusHint":"休息结束后自动开始下一轮专注。","plan.readyHint":"更改会开始新的专注循环。","plan.lockedHint":"请先暂停计时器再修改计划。","plan.apply":"应用计划","plan.applied":"专注计划已应用，新循环已准备好。",
      "tasks.eyebrow":"专注意图","tasks.title":"任务","tasks.close":"关闭任务","tasks.description":"为下一轮专注选择一个可选意图。笔记仍是自由记录区。","tasks.currentSession":"本轮时段","tasks.nextSession":"下轮时段","tasks.newTask":"新任务","tasks.shortTitle":"简短标题","tasks.open":"进行中","tasks.completed":"已完成","tasks.noOpen":"没有进行中的任务，仍可在未指定状态下专注。","tasks.noCompleted":"没有已完成的任务。","tasks.capacity":"{count} / {max} 个任务","tasks.openCount":"{count} 个进行中","tasks.completedCount":"{count} 个已完成","tasks.page":"第 {page}/{pages} 页","tasks.previousPage":"上一页{section}任务","tasks.nextPage":"下一页{section}任务","tasks.sectionOpen":"进行中","tasks.sectionCompleted":"已完成","tasks.select":"选择","tasks.selected":"已选择","tasks.rename":"改名","tasks.complete":"完成","tasks.reopen":"重新打开","tasks.actionLabel":"{action}任务 {title}","tasks.renameLabel":"重命名任务 {title}","tasks.added":"任务已添加。","tasks.renamed":"任务已改名，本轮及历史时段名称未改变。","tasks.unselected":"下轮时段现为未指定。","tasks.selectedAnnouncement":"已为下一轮专注选择 {title}。","tasks.completedAnnouncement":"{title} 已完成，计时器未改变。","tasks.reopenedAnnouncement":"{title} 已重新打开。","tasks.deleteConfirm":"删除“{title}”？已记录的名称仍会保留在时段历史中，包括进行中的时段。此操作无法撤销。","tasks.deletedAnnouncement":"{title} 已删除，已记录的时段名称已保留。","tasks.saveError":"无法保存此任务更改。",
      "player.nowPlaying":"正在播放","player.queue":"队列","player.stats":"统计","player.hideStats":"隐藏统计","player.scene":"场景","player.play":"播放","player.pause":"暂停","player.previousTrack":"上一曲","player.nextTrack":"下一曲","player.playPauseTitle":"播放或暂停音乐","player.progress":"播放进度","player.seekTitle":"在当前曲目中跳转","player.volume":"音量","player.volumeLabel":"音量","player.volumeTitle":"调整音乐音量","player.light":"亮度","player.brightness":"亮度","player.brightnessTitle":"调整背景亮度","player.loadFolder":"载入文件夹","player.reconnectFolder":"重新连接","player.rescan":"重新扫描","player.useDefaults":"使用默认曲目","player.clearMissing":"清除缺失项","player.bundledStatus":"正在使用内置离线播放列表。","player.bundledTitle":"Infinite Lo-Fi 内置曲目","player.folderTracks":"{folder} · {count} 首曲目","player.scanning":"{folder} · 正在扫描……","player.reconnectNeeded":"{folder} · 需要重新连接","player.missingCount":"缺失 {count} 首","player.folderUnavailable":"无法读取已保存的文件夹。请选择“重新连接”重新定位。","player.savedMissing":"有 {count} 首已保存曲目不可用。请恢复文件后重新扫描，或移除缺失项。","player.savedMissingOne":"有 1 首已保存曲目不可用。请恢复文件后重新扫描，或移除缺失项。","player.localStatus":"队列顺序和当前曲目会自动保存。","player.missing":"缺失","player.trackUnavailableTitle":"{title} 不可用。请恢复文件后重新扫描。","player.playTrackTitle":"播放 {title}","player.trackMissingAlert":"此曲目缺失。请恢复文件后重新扫描，或移除缺失项。","player.noPlayable":"没有可播放的曲目","player.empty":"播放列表为空","player.cover":"{title} 封面","player.nowPlayingAnnouncement":"正在播放 {title}。","player.folderUnsupported":"不支持选择音乐文件夹。","player.noMusicFiles":"所选文件夹中未找到音乐文件。","player.folderUnreadable":"文件夹无法读取 · 请尝试其他文件夹","player.started":"音乐已开始播放。","player.paused":"音乐已暂停。",
      "stats.review":"回顾","stats.headingToday":"专注统计（今天）","stats.headingWeek":"专注统计（本周）","stats.headingMonth":"专注统计（本月）","stats.close":"关闭统计","stats.range":"统计范围","stats.today":"今天","stats.week":"本周","stats.month":"本月","stats.csv":"CSV","stats.backup":"备份","stats.restore":"恢复","stats.clear":"清空","stats.total":"总计","stats.average":"日均","stats.peak":"峰值","stats.activeDays":"活跃天数","stats.streak":"当前连续","stats.vsPrevious":"对比上一周期","stats.chart":"可滚动专注图表","stats.minutesByDay":"每日专注分钟数","stats.ledger":"记录","stats.recentSessions":"最近专注时段","stats.date":"日期","stats.minutes":"分钟","stats.addSession":"添加时段","stats.noSessions":"还没有专注时段。","stats.historyNote":"显示最近 12 条记录。导入的每日总计仍以每天一条记录编辑。","stats.savedCount":"已保存 {count} 条","stats.sessionDate":"专注时段日期","stats.sessionMinutes":"专注时段分钟数","stats.imported":"导入的每日总计","stats.timer":"计时器","stats.manual":"手动","stats.snapshotLabel":"{text}。已保存的任务标题快照。","stats.saveSession":"保存 {day} 的专注时段","stats.deleteSession":"删除 {day} 的专注时段","stats.todayProgress":"今天 {current}/{goal} 分钟{complete}","stats.todayOff":"今天 {current} 分钟 · 每日目标关闭","stats.goalComplete":" · 目标完成","stats.goalAria":"今天已完成 {current}/{goal} 分钟专注","stats.goalOffAria":"今天已完成 {current} 分钟专注；每日目标关闭","stats.dayGoalTitle":"此范围内有 {count} 天达成每日目标","stats.activeTitle":"此范围内有专注记录的天数","stats.new":"新增","stats.previousTitle":"上一相同周期共 {duration}","stats.barAria":"{day} {minutes} 分钟","stats.minuteShort":"{minutes} 分钟","stats.hourMinute":"{hours} 小时 {minutes} 分钟","stats.minutesShort":"{minutes} 分钟","stats.daysShort":"{days} 天","stats.updated":"已更新 {day} 的专注时段：{minutes} 分钟。","stats.added":"已添加 {day} 的专注时段：{minutes} 分钟。","stats.deleted":"专注时段已删除。","stats.futureDate":"时段日期不能在未来。","stats.deleteConfirm":"删除此专注时段？此操作无法撤销。","stats.restoreConfirm":"恢复此备份（{notes} 条笔记、{tasks} 个任务、{sessions} 个专注时段）？当前本地数据将被替换。","stats.restoreSuccess":"备份恢复成功，Infinite Lo-Fi 即将重新载入。","stats.restoreError":"无法恢复备份：{error}","stats.unknownBackupError":"未知备份错误","stats.clearConfirm":"清空全部专注统计？此操作无法撤销。","stats.cleared":"全部专注统计已清空。",
      "weather.title":"天气","weather.offOption":"关闭","weather.autoOption":"自动（IP）","weather.cityOption":"选择城市","weather.cityPlaceholder":"城市名称","weather.cityLabel":"天气城市","weather.modeTitle":"选择天气隐私模式","weather.off":"天气已关闭","weather.enterCity":"请输入城市","weather.loading":"正在载入天气……","weather.unavailable":"天气不可用","weather.autoPrivacy":"自动模式会将你的 IP 地址发送到 ipapi.co，再将坐标发送到 Open-Meteo。","weather.cityPrivacy":"城市模式只会将城市名称及查询所得坐标发送到 Open-Meteo。","weather.offPrivacy":"天气已关闭，不会发出天气或位置请求。","weather.updated":"{age}更新","weather.justNow":"刚刚","weather.minutesAgo":"{count} 分钟前","weather.hoursAgo":"{count} 小时前","weather.daysAgo":"{count} 天前","weather.clear":"晴朗","weather.partlyCloudy":"局部多云","weather.cloudy":"多云","weather.fog":"雾","weather.drizzle":"毛毛雨","weather.rain":"雨","weather.snow":"雪","weather.thunderstorm":"雷暴","weather.unknown":"未知",
      "scene.atmosphere":"氛围","scene.title":"场景","scene.close":"关闭背景","scene.description":"选择精选氛围、当前曲目封面或自己的本地媒体。","scene.presets":"精选预设","scene.quietStudio":"静谧工作室","scene.warmCharcoal":"暖调炭黑","scene.midnight":"午夜","scene.deepBlue":"深蓝","scene.moss":"苔藓","scene.forestGreen":"森林绿","scene.paper":"纸张","scene.warmLight":"暖白","scene.localMedia":"本地媒体","scene.video":"视频","scene.trackCover":"曲目封面","scene.wallpaper":"桌面壁纸","scene.importImage":"导入图片","scene.preset":"预设：","scene.source":"来源：","scene.media":"媒体：","scene.builtIn":"内置","scene.image":"图片","scene.customMedia":"自定义媒体","scene.importedImage":"已导入图片","scene.importedVideo":"已导入视频","scene.builtInVideo":"内置视频","scene.noTrackCover":"当前曲目没有封面","scene.selected":"已选择{name}预设。","scene.wallpaperUnsupported":"不支持桌面壁纸背景。","scene.wallpaperUnreadable":"无法读取当前桌面壁纸。","scene.imageUnsupported":"不支持选择背景图片。","scene.videoUnsupported":"不支持选择背景视频。",
      "keys.title":"键盘快捷键","keys.description":"可随时点击顶部的“快捷键 ?”或按 Shift + / 打开。使用复选框启用或停用各快捷键。","keys.language":"显示语言","keys.languageHint":"更改会立即生效并保存在此设备上。","keys.timer":"计时器","keys.player":"播放器","keys.panels":"面板与统计","keys.notes":"笔记","keys.startPause":"开始 / 暂停计时器","keys.resetTimer":"重置计时器","keys.playPause":"播放 / 暂停","keys.nextTrack":"下一曲","keys.previousTrack":"上一曲","keys.seekBack":"后退 5 秒","keys.seekForward":"前进 5 秒","keys.volumeUp":"音量 +5%","keys.volumeDown":"音量 -5%","keys.loadFolder":"载入本地文件夹","keys.toggleHelp":"显示/隐藏快捷键帮助","keys.togglePlaylist":"显示/隐藏播放列表","keys.toggleStats":"显示/隐藏统计抽屉","keys.statsToday":"统计范围：今天","keys.statsWeek":"统计范围：本周","keys.statsMonth":"统计范围：本月","keys.closePanels":"关闭面板 / 帮助","keys.focusNotes":"聚焦笔记输入框","keys.saveNotes":"立即保存笔记","keys.clearNotes":"清空笔记","keys.toggleAria":"启用或停用“{label}”快捷键","language.saveError":"无法保存显示语言，已保留之前的语言。","storage.genericError":"无法保存本地数据，最后保存的状态未改变。","storage.notesError":"本地存储不可用，笔记未保存。","storage.timerPauseError":"计时器状态无法保存，因此未能暂停。","storage.timerStartError":"时段上下文无法保存，因此计时器未启动。","storage.timerResetError":"新状态无法保存，因此计时器未重置。","storage.planError":"专注计划无法保存，因此未应用。","storage.completionError":"已完成的计时器无法保存。系统会重试且不会重复记录。","storage.restoredCompletionError":"已完成的专注时段无法保存。系统会重试且不会重复记录。"
    },
    "zh-TW": {}, ja: {}, fr: {}, ko: {}, es: {}
  };

  function completePack(overrides) {
    return Object.freeze({ ...ENGLISH, ...overrides });
  }

  function toTraditionalChinese(text) {
    const phrases = [
      ["文件夹", "資料夾"], ["文件", "檔案"], ["默认", "預設"], ["导入", "匯入"],
      ["保存", "儲存"], ["载入", "載入"], ["重新载入", "重新載入"], ["视频", "影片"],
      ["信息", "資訊"], ["通过", "透過"], ["网络", "網路"], ["鼠标", "滑鼠"],
      ["显示语言", "顯示語言"], ["选中", "選取"], ["选择", "選擇"], ["创建", "建立"], ["删除", "刪除"]
    ];
    let result = String(text);
    for (const [from, to] of phrases) result = result.split(from).join(to);
    const chars = { "数":"數","据":"據","为":"為","个":"個","关":"關","闭":"閉","开":"開","这":"這","时":"時","间":"間","后":"後","长":"長","轮":"輪","钟":"鐘","钟":"鐘","设":"設","记":"記","录":"錄","历":"歷","态":"態","现":"現","显":"顯","页":"頁","签":"籤","还":"還","发":"發","启":"啟","动":"動","应":"應","与":"與","专":"專","注":"註","务":"務","项":"項","题":"題","点":"點","达":"達","标":"標","经":"經","过":"過","将":"將","仅":"僅","无":"無","声":"聲","乐":"樂","节":"節","续":"續","复":"復","试":"試","览":"覽","线":"線","调":"調","单":"單","图":"圖","对":"對","气":"氣","报":"報","输":"輸","入":"入","换":"換","简":"簡","体":"體","删":"刪","档":"檔","夹":"夾","载":"載","备":"備","份":"份","统":"統","计":"計","览":"覽","签":"籤","话":"話","达":"達","变":"變","场":"場","景":"景","调":"調","整":"整","亮":"亮","度":"度","内":"內","置":"置","户":"戶","读":"讀","写":"寫","误":"誤","获":"獲","区":"區","总":"總","均":"均","围":"圍","导":"導","汇":"匯","清":"清","空":"空","毕":"畢","边":"邊","录":"錄","联":"聯","储":"儲","览":"覽","须":"須","请":"請","击":"擊","顶":"頂","签":"籤","随":"隨","复":"復","码":"碼","间":"間" };
    return [...result].map((char) => chars[char] || char).join("");
  }

  const JAPANESE = {
    "app.recoveryTitle":"ローカルデータの復旧が必要です","app.recoveryMessage":"安全な状態を作成する前に、読み取れない元データを保存しました。","app.downloadOriginal":"元データをダウンロード","app.restoreBackup":"バックアップを復元","common.dismiss":"閉じる","common.close":"閉じる","common.add":"追加","common.save":"保存","common.delete":"削除","common.apply":"適用","common.previous":"前へ","common.next":"次へ","common.unassigned":"未指定","common.default":"デフォルト","common.none":"なし","common.new":"新規",
    "nav.notes":"ノート","nav.tasks":"タスク","nav.plan":"プラン","nav.keys":"キー ?","nav.mini":"ミニ","nav.full":"全画面","nav.openNotes":"ノートを開く","nav.openTasks":"タスクを開く","nav.openPlan":"集中サイクルと毎日の目標を設定","nav.openKeys":"キーボードショートカットを開く","nav.keysTitle":"キーボードショートカット（Shift + /）","nav.enterMini":"ミニモードに切り替え","nav.returnFull":"通常表示に戻る",
    "notes.workspace":"ワークスペース","notes.title":"ノート","notes.close":"ノートを閉じる","notes.new":"新規","notes.pin":"固定","notes.unpin":"固定解除","notes.pinAction":"ノートを固定／解除","notes.delete":"削除","notes.tabs":"ノートタブ","notes.placeholder":"アイデア、タスク、ひらめきを記録…","notes.untitled":"無題","notes.defaultName":"ノート {number}","notes.pinned":"固定","notes.renameTitle":"ノート {name} の名前を変更","notes.openTitle":"ノート {name} を開く","notes.clearConfirm":"すべてのノートを消去しますか？","notes.deleteConfirm":"ノート「{name}」を削除しますか？",
    "timer.infiniteFocus":"Infinite Focus","timer.focus":"集中セッション","timer.shortBreak":"短い休憩","timer.longBreak":"長い休憩","timer.currentIntention":"現在の意図","timer.nextIntention":"次の意図","timer.start":"開始","timer.pause":"一時停止","timer.reset":"リセット","timer.startPauseTitle":"タイマーを開始または一時停止","timer.resetTitle":"タイマーをリセット","timer.cycleComplete":"サイクル完了","timer.focusPosition":"集中 {current}/{total}","timer.goalOff":"目標オフ","timer.todayGoal":"今日 {current}/{goal}分","timer.planSummary":"{focus} / {short} / {long}分 · {count}回ごとに長い休憩","timer.focusTime":"集中時間","timer.show":"表示","timer.showTitle":"ショーケースモードにする","timer.card":"タイマーカード","timer.miniEnabled":"ミニモードを有効にしました","timer.fullRestored":"通常表示に戻しました",
    "plan.eyebrow":"ルーティン","plan.title":"集中プラン","plan.close":"集中プランを閉じる","plan.description":"集中サイクルのリズムを設定します。指定回数の集中後に長い休憩へ進みます。","plan.focusMinutes":"集中（分）","plan.shortBreak":"短い休憩","plan.longBreak":"長い休憩","plan.focusesPerCycle":"1サイクルの集中回数","plan.dailyGoal":"1日の目標（分）","plan.dailyGoalHint":"0でオフ · 例：120","plan.autoBreaks":"休憩を自動開始","plan.autoBreaksHint":"短い休憩と長い休憩を自動で開始します。","plan.autoFocus":"集中を自動開始","plan.autoFocusHint":"休憩後に次の集中を自動で開始します。","plan.readyHint":"変更すると新しい集中サイクルが始まります。","plan.lockedHint":"変更する前にタイマーを一時停止してください。","plan.apply":"プランを適用","plan.applied":"集中プランを適用しました。新しいサイクルの準備ができました。",
    "tasks.eyebrow":"集中する意図","tasks.title":"タスク","tasks.close":"タスクを閉じる","tasks.description":"次の集中セッションの意図を任意で選びます。ノートは自由記入欄のままです。","tasks.currentSession":"現在のセッション","tasks.nextSession":"次のセッション","tasks.newTask":"新しいタスク","tasks.shortTitle":"短いタイトル","tasks.open":"未完了","tasks.completed":"完了","tasks.noOpen":"未完了タスクはありません。未指定でも集中できます。","tasks.noCompleted":"完了したタスクはありません。","tasks.capacity":"{count} / {max} タスク","tasks.openCount":"未完了 {count}","tasks.completedCount":"完了 {count}","tasks.select":"選択","tasks.selected":"選択済み","tasks.rename":"名前変更","tasks.complete":"完了","tasks.reopen":"再開","tasks.added":"タスクを追加しました。","tasks.saveError":"タスクの変更を保存できませんでした。",
    "player.nowPlaying":"再生中","player.queue":"キュー","player.stats":"統計","player.hideStats":"統計を隠す","player.scene":"シーン","player.play":"再生","player.pause":"一時停止","player.previousTrack":"前の曲","player.nextTrack":"次の曲","player.playPauseTitle":"音楽を再生または一時停止","player.progress":"再生位置","player.seekTitle":"現在の曲内を移動","player.volume":"音量","player.volumeLabel":"音量","player.volumeTitle":"音楽の音量を調整","player.light":"明るさ","player.brightness":"明るさ","player.brightnessTitle":"背景の明るさを調整","player.loadFolder":"フォルダを読み込む","player.reconnectFolder":"再接続","player.rescan":"再スキャン","player.useDefaults":"デフォルト曲を使用","player.clearMissing":"不足項目を削除","player.bundledStatus":"内蔵オフラインプレイリストを使用中。","player.missing":"不足","player.noPlayable":"再生可能な曲がありません","player.empty":"プレイリストは空です",
    "stats.review":"レビュー","stats.headingToday":"集中統計（今日）","stats.headingWeek":"集中統計（今週）","stats.headingMonth":"集中統計（今月）","stats.close":"統計を閉じる","stats.range":"統計範囲","stats.today":"今日","stats.week":"今週","stats.month":"今月","stats.csv":"CSV","stats.backup":"バックアップ","stats.restore":"復元","stats.clear":"消去","stats.total":"合計","stats.average":"1日平均","stats.peak":"最大","stats.activeDays":"活動日","stats.streak":"現在の連続","stats.vsPrevious":"前期間との比較","stats.chart":"スクロール可能な集中グラフ","stats.minutesByDay":"日別の集中時間","stats.ledger":"記録","stats.recentSessions":"最近の集中セッション","stats.date":"日付","stats.minutes":"分","stats.addSession":"セッションを追加","stats.noSessions":"集中セッションはまだありません。","stats.historyNote":"最新12件を表示します。取り込んだ日別合計は1日1件として編集されます。","stats.savedCount":"{count}件保存済み","stats.timer":"タイマー","stats.manual":"手動","stats.imported":"取り込んだ日別合計","stats.new":"新規","stats.daysShort":"{days}日","stats.minutesShort":"{minutes}分","stats.hourMinute":"{hours}時間{minutes}分",
    "weather.title":"天気","weather.offOption":"オフ","weather.autoOption":"自動（IP）","weather.cityOption":"都市を選択","weather.cityPlaceholder":"都市名","weather.cityLabel":"天気の都市","weather.modeTitle":"天気のプライバシーモードを選択","weather.off":"天気はオフです","weather.enterCity":"都市を入力","weather.loading":"天気を読み込み中…","weather.unavailable":"天気を取得できません","weather.updated":"{age}更新","weather.justNow":"たった今","weather.minutesAgo":"{count}分前","weather.hoursAgo":"{count}時間前","weather.daysAgo":"{count}日前","weather.clear":"快晴","weather.partlyCloudy":"晴れ時々曇り","weather.cloudy":"曇り","weather.fog":"霧","weather.drizzle":"霧雨","weather.rain":"雨","weather.snow":"雪","weather.thunderstorm":"雷雨","weather.unknown":"不明",
    "scene.atmosphere":"雰囲気","scene.title":"シーン","scene.close":"背景を閉じる","scene.description":"厳選した雰囲気、現在の曲のカバー、またはローカルメディアを選択します。","scene.presets":"プリセット","scene.quietStudio":"静かなスタジオ","scene.warmCharcoal":"暖かなチャコール","scene.midnight":"ミッドナイト","scene.deepBlue":"深い青","scene.moss":"モス","scene.forestGreen":"フォレストグリーン","scene.paper":"ペーパー","scene.warmLight":"暖かな光","scene.localMedia":"ローカルメディア","scene.video":"動画","scene.trackCover":"曲のカバー","scene.wallpaper":"壁紙","scene.importImage":"画像を読み込む","scene.preset":"プリセット：","scene.source":"ソース：","scene.media":"メディア：","scene.builtIn":"内蔵","scene.image":"画像","scene.customMedia":"カスタムメディア","scene.noTrackCover":"現在の曲にカバーがありません",
    "keys.title":"キーボードショートカット","keys.description":"上部の「キー ?」または Shift + / でいつでも開けます。チェックボックスで各ショートカットを有効／無効にできます。","keys.language":"表示言語","keys.languageHint":"変更はすぐに反映され、このデバイスに保存されます。","keys.timer":"タイマー","keys.player":"プレーヤー","keys.panels":"パネルと統計","keys.notes":"ノート","keys.startPause":"タイマーを開始／一時停止","keys.resetTimer":"タイマーをリセット","keys.playPause":"再生／一時停止","keys.nextTrack":"次の曲","keys.previousTrack":"前の曲","keys.seekBack":"5秒戻る","keys.seekForward":"5秒進む","keys.volumeUp":"音量 +5%","keys.volumeDown":"音量 -5%","keys.loadFolder":"ローカルフォルダを読み込む","keys.toggleHelp":"ショートカットヘルプを表示／非表示","keys.togglePlaylist":"プレイリストを表示／非表示","keys.toggleStats":"統計ドロワーを表示／非表示","keys.statsToday":"統計範囲：今日","keys.statsWeek":"統計範囲：今週","keys.statsMonth":"統計範囲：今月","keys.closePanels":"パネル／ヘルプを閉じる","keys.focusNotes":"ノート入力欄にフォーカス","keys.saveNotes":"ノートを今すぐ保存","keys.clearNotes":"ノートを消去","keys.toggleAria":"「{label}」ショートカットを有効または無効にする","language.saveError":"表示言語を保存できなかったため、以前の言語を維持しました。"
  };

  const FRENCH = {
    "app.recoveryTitle":"Les données locales doivent être restaurées","app.recoveryMessage":"L’original illisible a été conservé avant la création d’un état sûr.","app.downloadOriginal":"Télécharger l’original","app.restoreBackup":"Restaurer la sauvegarde","common.dismiss":"Ignorer","common.close":"Fermer","common.add":"Ajouter","common.save":"Enregistrer","common.delete":"Supprimer","common.apply":"Appliquer","common.previous":"Précédent","common.next":"Suivant","common.unassigned":"Non attribué","common.default":"Par défaut","common.none":"Aucun","common.new":"Nouveau",
    "nav.notes":"Notes","nav.tasks":"Tâches","nav.plan":"Plan","nav.keys":"Touches ?","nav.mini":"Mini","nav.full":"Complet","nav.openNotes":"Ouvrir les notes","nav.openTasks":"Ouvrir les tâches","nav.openPlan":"Configurer le cycle et l’objectif quotidien","nav.openKeys":"Ouvrir les raccourcis clavier","nav.keysTitle":"Raccourcis clavier (Maj + /)","nav.enterMini":"Passer en mode Mini","nav.returnFull":"Revenir à l’affichage complet",
    "notes.workspace":"Espace de travail","notes.title":"Notes","notes.close":"Fermer les notes","notes.new":"Nouveau","notes.pin":"Épingler","notes.unpin":"Désépingler","notes.pinAction":"Épingler ou désépingler la note","notes.delete":"Supprimer","notes.tabs":"Onglets de notes","notes.placeholder":"Notez vos idées, tâches et inspirations…","notes.untitled":"Sans titre","notes.defaultName":"Note {number}","notes.pinned":"ÉPINGLÉ","notes.renameTitle":"Renommer la note {name}","notes.openTitle":"Ouvrir la note {name}","notes.clearConfirm":"Effacer toutes les notes ?","notes.deleteConfirm":"Supprimer la note « {name} » ?",
    "timer.infiniteFocus":"Concentration infinie","timer.focus":"Session de concentration","timer.shortBreak":"Pause courte","timer.longBreak":"Pause longue","timer.currentIntention":"Intention actuelle","timer.nextIntention":"Prochaine intention","timer.start":"Démarrer","timer.pause":"Pause","timer.reset":"Réinitialiser","timer.startPauseTitle":"Démarrer ou mettre en pause le minuteur","timer.resetTitle":"Réinitialiser le minuteur","timer.cycleComplete":"Cycle terminé","timer.focusPosition":"Concentration {current} sur {total}","timer.goalOff":"Objectif désactivé","timer.todayGoal":"Aujourd’hui {current} / {goal} min","timer.planSummary":"{focus} / {short} / {long} min · pause longue toutes les {count}","timer.focusTime":"Temps de concentration","timer.show":"Afficher","timer.showTitle":"Passer en mode vitrine","timer.card":"Carte du minuteur","timer.miniEnabled":"Mode Mini activé","timer.fullRestored":"Affichage complet restauré",
    "plan.eyebrow":"Routine","plan.title":"Plan de concentration","plan.close":"Fermer le plan","plan.description":"Réglez le rythme d’un cycle. Une pause longue suit le nombre défini de sessions terminées.","plan.focusMinutes":"Minutes de concentration","plan.shortBreak":"Pause courte","plan.longBreak":"Pause longue","plan.focusesPerCycle":"Sessions par cycle","plan.dailyGoal":"Objectif quotidien en minutes","plan.dailyGoalHint":"0 le désactive · essayez 120","plan.autoBreaks":"Démarrer les pauses automatiquement","plan.autoBreaksHint":"Démarrer automatiquement les pauses courtes et longues.","plan.autoFocus":"Démarrer la concentration automatiquement","plan.autoFocusHint":"Démarrer la prochaine concentration après une pause.","plan.readyHint":"Les modifications lancent un nouveau cycle.","plan.lockedHint":"Mettez le minuteur en pause avant de modifier ce plan.","plan.apply":"Appliquer le plan","plan.applied":"Plan appliqué. Un nouveau cycle est prêt.",
    "tasks.eyebrow":"Intention de concentration","tasks.title":"Tâches","tasks.close":"Fermer les tâches","tasks.description":"Choisissez une intention facultative pour la prochaine session. Les notes restent votre espace libre.","tasks.currentSession":"Session actuelle","tasks.nextSession":"Prochaine session","tasks.newTask":"Nouvelle tâche","tasks.shortTitle":"Titre court","tasks.open":"Ouvertes","tasks.completed":"Terminées","tasks.noOpen":"Aucune tâche ouverte. Vous pouvez rester sans intention.","tasks.noCompleted":"Aucune tâche terminée.","tasks.capacity":"{count} / {max} tâches","tasks.openCount":"{count} ouvertes","tasks.completedCount":"{count} terminées","tasks.select":"Choisir","tasks.selected":"Choisie","tasks.rename":"Renommer","tasks.complete":"Terminer","tasks.reopen":"Rouvrir","tasks.added":"Tâche ajoutée.","tasks.saveError":"Impossible d’enregistrer cette modification.",
    "player.nowPlaying":"Lecture en cours","player.queue":"File","player.stats":"Stats","player.hideStats":"Masquer les stats","player.scene":"Scène","player.play":"Lire","player.pause":"Pause","player.previousTrack":"Piste précédente","player.nextTrack":"Piste suivante","player.playPauseTitle":"Lire ou mettre la musique en pause","player.progress":"Progression","player.seekTitle":"Se déplacer dans la piste actuelle","player.volume":"Volume","player.volumeLabel":"Volume","player.volumeTitle":"Régler le volume","player.light":"Lumière","player.brightness":"Luminosité","player.brightnessTitle":"Régler la luminosité du fond","player.loadFolder":"Charger un dossier","player.reconnectFolder":"Reconnecter","player.rescan":"Réanalyser","player.useDefaults":"Utiliser les pistes par défaut","player.clearMissing":"Retirer les absentes","player.bundledStatus":"Liste hors ligne intégrée utilisée.","player.missing":"Absente","player.noPlayable":"Aucune piste lisible","player.empty":"La liste est vide",
    "stats.review":"Bilan","stats.headingToday":"Statistiques (aujourd’hui)","stats.headingWeek":"Statistiques (cette semaine)","stats.headingMonth":"Statistiques (ce mois)","stats.close":"Fermer les statistiques","stats.range":"Période","stats.today":"Aujourd’hui","stats.week":"Cette semaine","stats.month":"Ce mois","stats.csv":"CSV","stats.backup":"Sauvegarde","stats.restore":"Restaurer","stats.clear":"Effacer","stats.total":"Total","stats.average":"Moyenne/jour","stats.peak":"Pic","stats.activeDays":"Jours actifs","stats.streak":"Série actuelle","stats.vsPrevious":"Période précédente","stats.chart":"Graphique de concentration défilable","stats.minutesByDay":"Minutes par jour","stats.ledger":"Journal","stats.recentSessions":"Sessions récentes","stats.date":"Date","stats.minutes":"Minutes","stats.addSession":"Ajouter une session","stats.noSessions":"Aucune session pour le moment.","stats.historyNote":"Les 12 entrées les plus récentes sont affichées.","stats.savedCount":"{count} enregistrées","stats.timer":"Minuteur","stats.manual":"Manuel","stats.imported":"Total quotidien importé","stats.new":"Nouveau","stats.daysShort":"{days} j","stats.minutesShort":"{minutes} min","stats.hourMinute":"{hours} h {minutes} min",
    "weather.title":"Météo","weather.offOption":"Désactivée","weather.autoOption":"Auto (IP)","weather.cityOption":"Choisir une ville","weather.cityPlaceholder":"Nom de la ville","weather.cityLabel":"Ville météo","weather.modeTitle":"Choisir le mode de confidentialité météo","weather.off":"Météo désactivée","weather.enterCity":"Saisissez une ville","weather.loading":"Chargement de la météo…","weather.unavailable":"Météo indisponible","weather.updated":"mis à jour {age}","weather.justNow":"à l’instant","weather.minutesAgo":"il y a {count} min","weather.hoursAgo":"il y a {count} h","weather.daysAgo":"il y a {count} j","weather.clear":"Dégagé","weather.partlyCloudy":"Partiellement nuageux","weather.cloudy":"Nuageux","weather.fog":"Brouillard","weather.drizzle":"Bruine","weather.rain":"Pluie","weather.snow":"Neige","weather.thunderstorm":"Orage","weather.unknown":"Inconnu",
    "scene.atmosphere":"Ambiance","scene.title":"Scène","scene.close":"Fermer l’arrière-plan","scene.description":"Choisissez une ambiance, la pochette actuelle ou votre propre média local.","scene.presets":"Préréglages","scene.quietStudio":"Studio calme","scene.warmCharcoal":"Charbon chaud","scene.midnight":"Minuit","scene.deepBlue":"Bleu profond","scene.moss":"Mousse","scene.forestGreen":"Vert forêt","scene.paper":"Papier","scene.warmLight":"Lumière chaude","scene.localMedia":"Média local","scene.video":"Vidéo","scene.trackCover":"Pochette","scene.wallpaper":"Fond d’écran","scene.importImage":"Importer une image","scene.preset":"Préréglage :","scene.source":"Source :","scene.media":"Média :","scene.builtIn":"Intégré","scene.image":"Image","scene.customMedia":"Média personnalisé","scene.noTrackCover":"Aucune pochette pour la piste actuelle",
    "keys.title":"Raccourcis clavier","keys.description":"Ouvrez-les avec « Touches ? » ou Maj + /. Les cases activent ou désactivent chaque raccourci.","keys.language":"Langue d’affichage","keys.languageHint":"Le changement est immédiat et enregistré sur cet appareil.","keys.timer":"Minuteur","keys.player":"Lecteur","keys.panels":"Panneaux et statistiques","keys.notes":"Notes","keys.startPause":"Démarrer / Pause","keys.resetTimer":"Réinitialiser le minuteur","keys.playPause":"Lire / Pause","keys.nextTrack":"Piste suivante","keys.previousTrack":"Piste précédente","keys.seekBack":"Reculer de 5 s","keys.seekForward":"Avancer de 5 s","keys.volumeUp":"Volume +5 %","keys.volumeDown":"Volume -5 %","keys.loadFolder":"Charger un dossier local","keys.toggleHelp":"Afficher/masquer l’aide","keys.togglePlaylist":"Afficher/masquer la liste","keys.toggleStats":"Afficher/masquer les statistiques","keys.statsToday":"Période : aujourd’hui","keys.statsWeek":"Période : semaine","keys.statsMonth":"Période : mois","keys.closePanels":"Fermer les panneaux / l’aide","keys.focusNotes":"Placer le focus dans les notes","keys.saveNotes":"Enregistrer les notes","keys.clearNotes":"Effacer les notes","keys.toggleAria":"Activer ou désactiver le raccourci « {label} »","language.saveError":"Impossible d’enregistrer la langue ; la précédente est conservée."
  };

  const KOREAN = {
    "app.recoveryTitle":"로컬 데이터를 복구해야 합니다","app.recoveryMessage":"안전한 상태를 만들기 전에 읽을 수 없는 원본을 보존했습니다.","app.downloadOriginal":"원본 다운로드","app.restoreBackup":"백업 복원","common.dismiss":"닫기","common.close":"닫기","common.add":"추가","common.save":"저장","common.delete":"삭제","common.apply":"적용","common.previous":"이전","common.next":"다음","common.unassigned":"지정 안 함","common.default":"기본값","common.none":"없음","common.new":"새로 만들기",
    "nav.notes":"노트","nav.tasks":"작업","nav.plan":"계획","nav.keys":"단축키 ?","nav.mini":"미니","nav.full":"전체","nav.openNotes":"노트 열기","nav.openTasks":"작업 열기","nav.openPlan":"집중 주기와 일일 목표 설정","nav.openKeys":"키보드 단축키 열기","nav.keysTitle":"키보드 단축키(Shift + /)","nav.enterMini":"미니 모드로 전환","nav.returnFull":"전체 보기로 돌아가기",
    "notes.workspace":"작업 공간","notes.title":"노트","notes.close":"노트 닫기","notes.new":"새로 만들기","notes.pin":"고정","notes.unpin":"고정 해제","notes.pinAction":"노트 고정/해제","notes.delete":"삭제","notes.tabs":"노트 탭","notes.placeholder":"아이디어, 작업, 영감을 기록하세요…","notes.untitled":"제목 없음","notes.defaultName":"노트 {number}","notes.pinned":"고정","notes.renameTitle":"노트 {name} 이름 바꾸기","notes.openTitle":"노트 {name} 열기","notes.clearConfirm":"모든 노트를 지울까요?","notes.deleteConfirm":"노트 “{name}”을(를) 삭제할까요?",
    "timer.infiniteFocus":"무한 집중","timer.focus":"집중 세션","timer.shortBreak":"짧은 휴식","timer.longBreak":"긴 휴식","timer.currentIntention":"현재 의도","timer.nextIntention":"다음 의도","timer.start":"시작","timer.pause":"일시 정지","timer.reset":"재설정","timer.startPauseTitle":"타이머 시작 또는 일시 정지","timer.resetTitle":"타이머 재설정","timer.cycleComplete":"주기 완료","timer.focusPosition":"집중 {current}/{total}","timer.goalOff":"목표 꺼짐","timer.todayGoal":"오늘 {current}/{goal}분","timer.planSummary":"{focus} / {short} / {long}분 · {count}회마다 긴 휴식","timer.focusTime":"집중 시간","timer.show":"보기","timer.showTitle":"쇼케이스 모드로 전환","timer.card":"타이머 카드","timer.miniEnabled":"미니 모드가 켜졌습니다","timer.fullRestored":"전체 보기가 복원되었습니다",
    "plan.eyebrow":"루틴","plan.title":"집중 계획","plan.close":"집중 계획 닫기","plan.description":"집중 주기의 리듬을 설정합니다. 설정한 집중 횟수 뒤에 긴 휴식이 이어집니다.","plan.focusMinutes":"집중 시간(분)","plan.shortBreak":"짧은 휴식","plan.longBreak":"긴 휴식","plan.focusesPerCycle":"주기당 집중 횟수","plan.dailyGoal":"일일 목표(분)","plan.dailyGoalHint":"0이면 끔 · 120을 시도해 보세요","plan.autoBreaks":"휴식 자동 시작","plan.autoBreaksHint":"짧은 휴식과 긴 휴식을 자동으로 시작합니다.","plan.autoFocus":"집중 자동 시작","plan.autoFocusHint":"휴식 후 다음 집중을 자동으로 시작합니다.","plan.readyHint":"변경하면 새 집중 주기가 시작됩니다.","plan.lockedHint":"계획을 변경하기 전에 타이머를 일시 정지하세요.","plan.apply":"계획 적용","plan.applied":"집중 계획이 적용되었습니다. 새 주기가 준비되었습니다.",
    "tasks.eyebrow":"집중 의도","tasks.title":"작업","tasks.close":"작업 닫기","tasks.description":"다음 집중 세션의 선택적 의도를 고르세요. 노트는 자유롭게 사용할 수 있습니다.","tasks.currentSession":"현재 세션","tasks.nextSession":"다음 세션","tasks.newTask":"새 작업","tasks.shortTitle":"짧은 제목","tasks.open":"진행 중","tasks.completed":"완료","tasks.noOpen":"진행 중인 작업이 없습니다. 지정 없이 집중할 수도 있습니다.","tasks.noCompleted":"완료된 작업이 없습니다.","tasks.capacity":"작업 {count} / {max}","tasks.openCount":"진행 중 {count}개","tasks.completedCount":"완료 {count}개","tasks.select":"선택","tasks.selected":"선택됨","tasks.rename":"이름 바꾸기","tasks.complete":"완료","tasks.reopen":"다시 열기","tasks.added":"작업을 추가했습니다.","tasks.saveError":"작업 변경을 저장할 수 없습니다.",
    "player.nowPlaying":"재생 중","player.queue":"대기열","player.stats":"통계","player.hideStats":"통계 숨기기","player.scene":"장면","player.play":"재생","player.pause":"일시 정지","player.previousTrack":"이전 트랙","player.nextTrack":"다음 트랙","player.playPauseTitle":"음악 재생 또는 일시 정지","player.progress":"재생 진행률","player.seekTitle":"현재 트랙 탐색","player.volume":"볼륨","player.volumeLabel":"볼륨","player.volumeTitle":"음악 볼륨 조절","player.light":"밝기","player.brightness":"밝기","player.brightnessTitle":"배경 밝기 조절","player.loadFolder":"폴더 불러오기","player.reconnectFolder":"다시 연결","player.rescan":"다시 스캔","player.useDefaults":"기본 트랙 사용","player.clearMissing":"누락 항목 제거","player.bundledStatus":"내장 오프라인 재생 목록을 사용 중입니다.","player.missing":"누락","player.noPlayable":"재생 가능한 트랙이 없습니다","player.empty":"재생 목록이 비었습니다",
    "stats.review":"검토","stats.headingToday":"집중 통계(오늘)","stats.headingWeek":"집중 통계(이번 주)","stats.headingMonth":"집중 통계(이번 달)","stats.close":"통계 닫기","stats.range":"통계 범위","stats.today":"오늘","stats.week":"이번 주","stats.month":"이번 달","stats.csv":"CSV","stats.backup":"백업","stats.restore":"복원","stats.clear":"지우기","stats.total":"합계","stats.average":"일평균","stats.peak":"최고","stats.activeDays":"활동 일수","stats.streak":"현재 연속","stats.vsPrevious":"이전 기간 대비","stats.chart":"스크롤 가능한 집중 차트","stats.minutesByDay":"일별 집중 시간","stats.ledger":"기록","stats.recentSessions":"최근 집중 세션","stats.date":"날짜","stats.minutes":"분","stats.addSession":"세션 추가","stats.noSessions":"아직 집중 세션이 없습니다.","stats.historyNote":"최근 12개 항목을 표시합니다.","stats.savedCount":"{count}개 저장됨","stats.timer":"타이머","stats.manual":"수동","stats.imported":"가져온 일일 합계","stats.new":"신규","stats.daysShort":"{days}일","stats.minutesShort":"{minutes}분","stats.hourMinute":"{hours}시간 {minutes}분",
    "weather.title":"날씨","weather.offOption":"끔","weather.autoOption":"자동(IP)","weather.cityOption":"도시 선택","weather.cityPlaceholder":"도시 이름","weather.cityLabel":"날씨 도시","weather.modeTitle":"날씨 개인정보 모드 선택","weather.off":"날씨 꺼짐","weather.enterCity":"도시를 입력하세요","weather.loading":"날씨 불러오는 중…","weather.unavailable":"날씨를 사용할 수 없음","weather.updated":"{age} 업데이트","weather.justNow":"방금","weather.minutesAgo":"{count}분 전","weather.hoursAgo":"{count}시간 전","weather.daysAgo":"{count}일 전","weather.clear":"맑음","weather.partlyCloudy":"구름 조금","weather.cloudy":"흐림","weather.fog":"안개","weather.drizzle":"이슬비","weather.rain":"비","weather.snow":"눈","weather.thunderstorm":"뇌우","weather.unknown":"알 수 없음",
    "scene.atmosphere":"분위기","scene.title":"장면","scene.close":"배경 닫기","scene.description":"엄선된 분위기, 현재 트랙 커버 또는 로컬 미디어를 선택하세요.","scene.presets":"프리셋","scene.quietStudio":"조용한 스튜디오","scene.warmCharcoal":"따뜻한 차콜","scene.midnight":"한밤중","scene.deepBlue":"짙은 파랑","scene.moss":"이끼","scene.forestGreen":"숲의 초록","scene.paper":"종이","scene.warmLight":"따뜻한 빛","scene.localMedia":"로컬 미디어","scene.video":"비디오","scene.trackCover":"트랙 커버","scene.wallpaper":"배경화면","scene.importImage":"이미지 가져오기","scene.preset":"프리셋:","scene.source":"소스:","scene.media":"미디어:","scene.builtIn":"내장","scene.image":"이미지","scene.customMedia":"사용자 미디어","scene.noTrackCover":"현재 트랙에 커버가 없습니다",
    "keys.title":"키보드 단축키","keys.description":"상단의 ‘단축키 ?’ 또는 Shift + /로 언제든 열 수 있습니다. 체크박스로 각 단축키를 켜거나 끄세요.","keys.language":"표시 언어","keys.languageHint":"변경 사항은 즉시 적용되며 이 기기에 저장됩니다.","keys.timer":"타이머","keys.player":"플레이어","keys.panels":"패널 및 통계","keys.notes":"노트","keys.startPause":"타이머 시작 / 일시 정지","keys.resetTimer":"타이머 재설정","keys.playPause":"재생 / 일시 정지","keys.nextTrack":"다음 트랙","keys.previousTrack":"이전 트랙","keys.seekBack":"5초 뒤로","keys.seekForward":"5초 앞으로","keys.volumeUp":"볼륨 +5%","keys.volumeDown":"볼륨 -5%","keys.loadFolder":"로컬 폴더 불러오기","keys.toggleHelp":"단축키 도움말 표시/숨기기","keys.togglePlaylist":"재생 목록 표시/숨기기","keys.toggleStats":"통계 서랍 표시/숨기기","keys.statsToday":"통계 범위: 오늘","keys.statsWeek":"통계 범위: 이번 주","keys.statsMonth":"통계 범위: 이번 달","keys.closePanels":"패널 / 도움말 닫기","keys.focusNotes":"노트 입력에 포커스","keys.saveNotes":"노트 즉시 저장","keys.clearNotes":"노트 지우기","keys.toggleAria":"‘{label}’ 단축키 켜기 또는 끄기","language.saveError":"표시 언어를 저장할 수 없어 이전 언어를 유지했습니다."
  };

  const SPANISH = {
    "app.recoveryTitle":"Los datos locales necesitan recuperación","app.recoveryMessage":"El original ilegible se conservó antes de crear un estado seguro.","app.downloadOriginal":"Descargar original","app.restoreBackup":"Restaurar copia","common.dismiss":"Descartar","common.close":"Cerrar","common.add":"Añadir","common.save":"Guardar","common.delete":"Eliminar","common.apply":"Aplicar","common.previous":"Anterior","common.next":"Siguiente","common.unassigned":"Sin asignar","common.default":"Predeterminado","common.none":"Ninguno","common.new":"Nuevo",
    "nav.notes":"Notas","nav.tasks":"Tareas","nav.plan":"Plan","nav.keys":"Teclas ?","nav.mini":"Mini","nav.full":"Completo","nav.openNotes":"Abrir notas","nav.openTasks":"Abrir tareas","nav.openPlan":"Configurar ciclo y objetivo diario","nav.openKeys":"Abrir atajos de teclado","nav.keysTitle":"Atajos de teclado (Mayús + /)","nav.enterMini":"Entrar en modo Mini","nav.returnFull":"Volver a la vista completa",
    "notes.workspace":"Espacio de trabajo","notes.title":"Notas","notes.close":"Cerrar notas","notes.new":"Nueva","notes.pin":"Fijar","notes.unpin":"Desfijar","notes.pinAction":"Fijar o desfijar nota","notes.delete":"Eliminar","notes.tabs":"Pestañas de notas","notes.placeholder":"Anota ideas, tareas y pequeñas inspiraciones…","notes.untitled":"Sin título","notes.defaultName":"Nota {number}","notes.pinned":"FIJADA","notes.renameTitle":"Renombrar nota {name}","notes.openTitle":"Abrir nota {name}","notes.clearConfirm":"¿Borrar todas las notas?","notes.deleteConfirm":"¿Eliminar la nota «{name}»?",
    "timer.infiniteFocus":"Concentración infinita","timer.focus":"Sesión de concentración","timer.shortBreak":"Descanso corto","timer.longBreak":"Descanso largo","timer.currentIntention":"Intención actual","timer.nextIntention":"Próxima intención","timer.start":"Iniciar","timer.pause":"Pausar","timer.reset":"Reiniciar","timer.startPauseTitle":"Iniciar o pausar temporizador","timer.resetTitle":"Reiniciar temporizador","timer.cycleComplete":"Ciclo completo","timer.focusPosition":"Concentración {current} de {total}","timer.goalOff":"Objetivo desactivado","timer.todayGoal":"Hoy {current} / {goal} min","timer.planSummary":"{focus} / {short} / {long} min · descanso largo cada {count}","timer.focusTime":"Tiempo de concentración","timer.show":"Mostrar","timer.showTitle":"Entrar en modo escaparate","timer.card":"Tarjeta del temporizador","timer.miniEnabled":"Modo Mini activado","timer.fullRestored":"Vista completa restaurada",
    "plan.eyebrow":"Rutina","plan.title":"Plan de concentración","plan.close":"Cerrar plan","plan.description":"Define el ritmo de un ciclo. Tras el número configurado de sesiones, comienza un descanso largo.","plan.focusMinutes":"Minutos de concentración","plan.shortBreak":"Descanso corto","plan.longBreak":"Descanso largo","plan.focusesPerCycle":"Sesiones por ciclo","plan.dailyGoal":"Objetivo diario en minutos","plan.dailyGoalHint":"0 lo desactiva · prueba 120","plan.autoBreaks":"Iniciar descansos automáticamente","plan.autoBreaksHint":"Inicia descansos cortos y largos automáticamente.","plan.autoFocus":"Iniciar concentración automáticamente","plan.autoFocusHint":"Inicia la siguiente sesión después de un descanso.","plan.readyHint":"Los cambios inician un nuevo ciclo.","plan.lockedHint":"Pausa el temporizador antes de cambiar este plan.","plan.apply":"Aplicar plan","plan.applied":"Plan aplicado. Hay un nuevo ciclo preparado.",
    "tasks.eyebrow":"Intención de concentración","tasks.title":"Tareas","tasks.close":"Cerrar tareas","tasks.description":"Elige una intención opcional para la próxima sesión. Las notas siguen siendo un espacio libre.","tasks.currentSession":"Sesión actual","tasks.nextSession":"Próxima sesión","tasks.newTask":"Nueva tarea","tasks.shortTitle":"Título corto","tasks.open":"Abiertas","tasks.completed":"Completadas","tasks.noOpen":"No hay tareas abiertas. Puedes concentrarte sin asignación.","tasks.noCompleted":"No hay tareas completadas.","tasks.capacity":"{count} / {max} tareas","tasks.openCount":"{count} abiertas","tasks.completedCount":"{count} completadas","tasks.select":"Seleccionar","tasks.selected":"Seleccionada","tasks.rename":"Renombrar","tasks.complete":"Completar","tasks.reopen":"Reabrir","tasks.added":"Tarea añadida.","tasks.saveError":"No se pudo guardar este cambio.",
    "player.nowPlaying":"Reproduciendo","player.queue":"Cola","player.stats":"Estadísticas","player.hideStats":"Ocultar estadísticas","player.scene":"Escena","player.play":"Reproducir","player.pause":"Pausar","player.previousTrack":"Pista anterior","player.nextTrack":"Pista siguiente","player.playPauseTitle":"Reproducir o pausar música","player.progress":"Progreso","player.seekTitle":"Desplazarse por la pista actual","player.volume":"Volumen","player.volumeLabel":"Volumen","player.volumeTitle":"Ajustar volumen","player.light":"Luz","player.brightness":"Brillo","player.brightnessTitle":"Ajustar brillo del fondo","player.loadFolder":"Cargar carpeta","player.reconnectFolder":"Reconectar","player.rescan":"Volver a explorar","player.useDefaults":"Usar pistas predeterminadas","player.clearMissing":"Quitar ausentes","player.bundledStatus":"Usando la lista sin conexión incluida.","player.missing":"Ausente","player.noPlayable":"No hay pistas reproducibles","player.empty":"La lista está vacía",
    "stats.review":"Revisión","stats.headingToday":"Estadísticas (hoy)","stats.headingWeek":"Estadísticas (esta semana)","stats.headingMonth":"Estadísticas (este mes)","stats.close":"Cerrar estadísticas","stats.range":"Intervalo","stats.today":"Hoy","stats.week":"Esta semana","stats.month":"Este mes","stats.csv":"CSV","stats.backup":"Copia","stats.restore":"Restaurar","stats.clear":"Borrar","stats.total":"Total","stats.average":"Promedio diario","stats.peak":"Máximo","stats.activeDays":"Días activos","stats.streak":"Racha actual","stats.vsPrevious":"Período anterior","stats.chart":"Gráfico de concentración desplazable","stats.minutesByDay":"Minutos por día","stats.ledger":"Registro","stats.recentSessions":"Sesiones recientes","stats.date":"Fecha","stats.minutes":"Minutos","stats.addSession":"Añadir sesión","stats.noSessions":"Aún no hay sesiones.","stats.historyNote":"Se muestran las 12 entradas más recientes.","stats.savedCount":"{count} guardadas","stats.timer":"Temporizador","stats.manual":"Manual","stats.imported":"Total diario importado","stats.new":"Nuevo","stats.daysShort":"{days} d","stats.minutesShort":"{minutes} min","stats.hourMinute":"{hours} h {minutes} min",
    "weather.title":"Tiempo","weather.offOption":"Desactivado","weather.autoOption":"Automático (IP)","weather.cityOption":"Elegir ciudad","weather.cityPlaceholder":"Nombre de la ciudad","weather.cityLabel":"Ciudad del tiempo","weather.modeTitle":"Elegir modo de privacidad del tiempo","weather.off":"Tiempo desactivado","weather.enterCity":"Introduce una ciudad","weather.loading":"Cargando el tiempo…","weather.unavailable":"Tiempo no disponible","weather.updated":"actualizado {age}","weather.justNow":"ahora mismo","weather.minutesAgo":"hace {count} min","weather.hoursAgo":"hace {count} h","weather.daysAgo":"hace {count} d","weather.clear":"Despejado","weather.partlyCloudy":"Parcialmente nublado","weather.cloudy":"Nublado","weather.fog":"Niebla","weather.drizzle":"Llovizna","weather.rain":"Lluvia","weather.snow":"Nieve","weather.thunderstorm":"Tormenta","weather.unknown":"Desconocido",
    "scene.atmosphere":"Ambiente","scene.title":"Escena","scene.close":"Cerrar fondo","scene.description":"Elige un ambiente, la portada actual o tus propios medios locales.","scene.presets":"Preajustes","scene.quietStudio":"Estudio tranquilo","scene.warmCharcoal":"Carbón cálido","scene.midnight":"Medianoche","scene.deepBlue":"Azul profundo","scene.moss":"Musgo","scene.forestGreen":"Verde bosque","scene.paper":"Papel","scene.warmLight":"Luz cálida","scene.localMedia":"Medios locales","scene.video":"Vídeo","scene.trackCover":"Portada de pista","scene.wallpaper":"Fondo de escritorio","scene.importImage":"Importar imagen","scene.preset":"Preajuste:","scene.source":"Fuente:","scene.media":"Medio:","scene.builtIn":"Incluido","scene.image":"Imagen","scene.customMedia":"Medio personalizado","scene.noTrackCover":"La pista actual no tiene portada",
    "keys.title":"Atajos de teclado","keys.description":"Ábrelos con «Teclas ?» o Mayús + /. Usa las casillas para activar o desactivar cada atajo.","keys.language":"Idioma de la interfaz","keys.languageHint":"El cambio se aplica al instante y se guarda en este dispositivo.","keys.timer":"Temporizador","keys.player":"Reproductor","keys.panels":"Paneles y estadísticas","keys.notes":"Notas","keys.startPause":"Iniciar / Pausar temporizador","keys.resetTimer":"Reiniciar temporizador","keys.playPause":"Reproducir / Pausar","keys.nextTrack":"Pista siguiente","keys.previousTrack":"Pista anterior","keys.seekBack":"Retroceder 5 s","keys.seekForward":"Avanzar 5 s","keys.volumeUp":"Volumen +5 %","keys.volumeDown":"Volumen -5 %","keys.loadFolder":"Cargar carpeta local","keys.toggleHelp":"Mostrar/ocultar ayuda","keys.togglePlaylist":"Mostrar/ocultar lista","keys.toggleStats":"Mostrar/ocultar estadísticas","keys.statsToday":"Intervalo: hoy","keys.statsWeek":"Intervalo: semana","keys.statsMonth":"Intervalo: mes","keys.closePanels":"Cerrar paneles / ayuda","keys.focusNotes":"Enfocar entrada de notas","keys.saveNotes":"Guardar notas ahora","keys.clearNotes":"Borrar notas","keys.toggleAria":"Activar o desactivar el atajo «{label}»","language.saveError":"No se pudo guardar el idioma; se mantiene el anterior."
  };

  Object.assign(JAPANESE, {
    "tray.startTimer":"タイマーを開始","tray.pauseTimer":"タイマーを一時停止","tray.resetTimer":"タイマーをリセット","tray.showWindow":"ウインドウを表示","tray.hideWindow":"ウインドウを隠す","tray.quit":"終了",
    "timer.pausedAnnouncement":"タイマーを{time}で一時停止しました。","timer.startedAnnouncement":"{phase}タイマーを開始しました。残り{time}。","timer.resetAnnouncement":"タイマーを集中セッションの{time}にリセットしました。","timer.phaseStartedAnnouncement":"{phase}を開始しました。残り{time}。","timer.focusNotification":"深い集中に戻りましょう。","timer.shortBreakNotification":"短い休憩を取りましょう。","timer.longBreakNotification":"サイクル完了。長めの休憩を取りましょう。","timer.exitShowcase":"クリックしてショーケースモードを終了","timer.exitShowcaseTitle":"このカード内をクリックしてショーケースモードを終了",
    "player.bundledTitle":"Infinite Lo-Fi内蔵曲","player.trackUnavailableTitle":"{title}は利用できません。復元して再スキャンしてください。","player.playTrackTitle":"{title}を再生","player.cover":"{title}のカバー",
    "stats.sessionDate":"集中セッションの日付","stats.sessionMinutes":"集中セッションの分数","stats.snapshotLabel":"{text}。保存されたタスク名のスナップショット。","stats.saveSession":"{day}の集中セッションを保存","stats.deleteSession":"{day}の集中セッションを削除","stats.dayGoalTitle":"この範囲で{count}日が1日の目標を達成","stats.restoreConfirm":"このバックアップ（ノート{notes}件、タスク{tasks}件、集中セッション{sessions}件）を復元しますか？現在のローカルデータは置き換わります。","stats.restoreSuccess":"バックアップを復元しました。Infinite Lo-Fiを再読み込みします。","stats.restoreError":"バックアップを復元できません：{error}","stats.unknownBackupError":"不明なバックアップエラー",
    "scene.importedImage":"読み込んだ画像","scene.importedVideo":"読み込んだ動画","scene.builtInVideo":"内蔵動画","scene.selected":"{name}プリセットを選択しました。","scene.wallpaperUnsupported":"壁紙背景には対応していません。","scene.wallpaperUnreadable":"現在の壁紙を読み取れません。","scene.imageUnsupported":"背景画像の選択には対応していません。","scene.videoUnsupported":"背景動画の選択には対応していません。",
    "storage.genericError":"ローカルデータを保存できません。最後に保存した状態は変更されていません。","storage.notesError":"ローカルストレージを利用できないため、ノートは保存されませんでした。","storage.timerPauseError":"状態を保存できないため、タイマーを一時停止できませんでした。","storage.timerStartError":"セッション情報を保存できないため、タイマーを開始しませんでした。","storage.timerResetError":"新しい状態を保存できないため、タイマーをリセットしませんでした。","storage.planError":"保存できないため、集中プランは適用されませんでした。","storage.completionError":"完了したタイマーを保存できません。履歴を重複させずに再試行します。","storage.restoredCompletionError":"完了した集中セッションを保存できません。履歴を重複させずに再試行します。",
    "tasks.page":"{page}/{pages}ページ","tasks.previousPage":"{section}タスクの前ページ","tasks.nextPage":"{section}タスクの次ページ","tasks.sectionOpen":"未完了","tasks.sectionCompleted":"完了","tasks.actionLabel":"タスク「{title}」を{action}","tasks.renameLabel":"タスク「{title}」の名前を変更","tasks.unselected":"次のセッションは未指定になりました。","tasks.selectedAnnouncement":"次の集中に「{title}」を選択しました。","tasks.completedAnnouncement":"「{title}」を完了しました。タイマーは変更されません。","tasks.reopenedAnnouncement":"「{title}」を再開しました。","tasks.deletedAnnouncement":"「{title}」を削除しました。記録済みの名前は保持されます。","tasks.deleteConfirm":"「{title}」を削除しますか？進行中を含むセッション履歴の名前は保持されます。この操作は元に戻せません。","tasks.renamed":"タスク名を変更しました。現在および履歴のセッション名は変わりません。",
    "player.folderTracks":"{folder} · {count}曲","player.scanning":"{folder} · スキャン中…","player.reconnectNeeded":"{folder} · 再接続が必要","player.missingCount":"不足 {count}曲","player.folderUnavailable":"保存したフォルダを読み取れません。再接続して場所を指定してください。","player.savedMissing":"保存した{count}曲を利用できません。ファイルを復元して再スキャンするか、不足項目を削除してください。","player.savedMissingOne":"保存した1曲を利用できません。ファイルを復元して再スキャンするか、不足項目を削除してください。","player.localStatus":"キューの順序と現在の曲は自動保存されます。","player.trackMissingAlert":"この曲は不足しています。復元して再スキャンするか、不足項目を削除してください。","player.nowPlayingAnnouncement":"{title}を再生中。","player.folderUnsupported":"音楽フォルダの選択には対応していません。","player.noMusicFiles":"選択したフォルダに音楽ファイルがありません。","player.folderUnreadable":"フォルダを読み取れません · 別のフォルダをお試しください","player.started":"音楽を再生しました。","player.paused":"音楽を一時停止しました。",
    "stats.todayProgress":"今日 {current}/{goal}分{complete}","stats.todayOff":"今日 {current}分 · 1日の目標はオフ","stats.goalComplete":" · 目標達成","stats.goalAria":"今日の集中は{current}/{goal}分完了","stats.goalOffAria":"今日の集中は{current}分完了、1日の目標はオフ","stats.activeTitle":"この範囲で集中記録がある日数","stats.previousTitle":"前の同期間は{duration}","stats.barAria":"{day} {minutes}分","stats.minuteShort":"{minutes}分","stats.added":"{day}に{minutes}分の集中セッションを追加しました。","stats.updated":"{day}の集中セッションを{minutes}分に更新しました。","stats.deleted":"集中セッションを削除しました。","stats.futureDate":"未来の日付は指定できません。","stats.deleteConfirm":"この集中セッションを削除しますか？元に戻せません。","stats.clearConfirm":"すべての集中統計を消去しますか？元に戻せません。","stats.cleared":"集中統計をすべて消去しました。",
    "weather.autoPrivacy":"自動モードはIPアドレスをipapi.coへ、その後座標をOpen-Meteoへ送信します。","weather.cityPrivacy":"都市モードは都市名と検索で得た座標のみをOpen-Meteoへ送信します。","weather.offPrivacy":"天気はオフです。天気や位置情報の通信は行いません。"
  });
  Object.assign(FRENCH, {
    "tray.startTimer":"Démarrer le minuteur","tray.pauseTimer":"Mettre le minuteur en pause","tray.resetTimer":"Réinitialiser le minuteur","tray.showWindow":"Afficher la fenêtre","tray.hideWindow":"Masquer la fenêtre","tray.quit":"Quitter",
    "timer.pausedAnnouncement":"Minuteur en pause à {time}.","timer.startedAnnouncement":"Minuteur {phase} démarré. {time} restantes.","timer.resetAnnouncement":"Minuteur réinitialisé sur la concentration, {time}.","timer.phaseStartedAnnouncement":"{phase} démarrée. {time} restantes.","timer.focusNotification":"Revenez à une concentration profonde.","timer.shortBreakNotification":"Prenez une courte pause.","timer.longBreakNotification":"Cycle terminé. Prenez une pause plus longue.","timer.exitShowcase":"Cliquer pour quitter le mode vitrine","timer.exitShowcaseTitle":"Cliquez sur cette carte pour quitter le mode vitrine",
    "player.bundledTitle":"Pistes Infinite Lo-Fi intégrées","player.trackUnavailableTitle":"{title} est indisponible. Restaurez-la puis réanalysez.","player.playTrackTitle":"Lire {title}","player.cover":"Pochette de {title}",
    "stats.sessionDate":"Date de la session","stats.sessionMinutes":"Minutes de la session","stats.snapshotLabel":"{text}. Instantané du titre de tâche enregistré.","stats.saveSession":"Enregistrer la session du {day}","stats.deleteSession":"Supprimer la session du {day}","stats.dayGoalTitle":"Objectif quotidien atteint {count} jours sur cette période","stats.restoreConfirm":"Restaurer cette sauvegarde ({notes} notes, {tasks} tâches, {sessions} sessions) ? Les données locales actuelles seront remplacées.","stats.restoreSuccess":"Sauvegarde restaurée. Infinite Lo-Fi va redémarrer.","stats.restoreError":"Impossible de restaurer la sauvegarde : {error}","stats.unknownBackupError":"Erreur de sauvegarde inconnue",
    "scene.importedImage":"Image importée","scene.importedVideo":"Vidéo importée","scene.builtInVideo":"Vidéo intégrée","scene.selected":"Préréglage {name} sélectionné.","scene.wallpaperUnsupported":"Le fond d’écran du bureau n’est pas pris en charge.","scene.wallpaperUnreadable":"Impossible de lire le fond d’écran actuel.","scene.imageUnsupported":"La sélection d’une image de fond n’est pas prise en charge.","scene.videoUnsupported":"La sélection d’une vidéo de fond n’est pas prise en charge.",
    "storage.genericError":"Impossible d’enregistrer les données locales. Le dernier état enregistré est inchangé.","storage.notesError":"Le stockage local est indisponible ; les notes n’ont pas été enregistrées.","storage.timerPauseError":"Le minuteur n’a pas été mis en pause car son état n’a pas été enregistré.","storage.timerStartError":"Le minuteur n’a pas démarré car le contexte de session n’a pas été enregistré.","storage.timerResetError":"Le minuteur n’a pas été réinitialisé car le nouvel état n’a pas été enregistré.","storage.planError":"Le plan n’a pas été appliqué car il n’a pas pu être enregistré.","storage.completionError":"Le minuteur terminé n’a pas pu être enregistré. Une nouvelle tentative évitera les doublons.","storage.restoredCompletionError":"La session terminée n’a pas pu être enregistrée. Une nouvelle tentative évitera les doublons.",
    "tasks.page":"Page {page} sur {pages}","tasks.previousPage":"Page précédente des tâches {section}","tasks.nextPage":"Page suivante des tâches {section}","tasks.sectionOpen":"ouvertes","tasks.sectionCompleted":"terminées","tasks.actionLabel":"{action} la tâche {title}","tasks.renameLabel":"Renommer la tâche {title}","tasks.unselected":"La prochaine session n’est plus attribuée.","tasks.selectedAnnouncement":"{title} sélectionnée pour la prochaine session.","tasks.completedAnnouncement":"{title} terminée. Le minuteur n’a pas changé.","tasks.reopenedAnnouncement":"{title} rouverte.","tasks.deletedAnnouncement":"{title} supprimée. Les noms enregistrés sont conservés.","tasks.deleteConfirm":"Supprimer « {title} » ? Les noms enregistrés restent dans l’historique, y compris la session en cours. Cette action est irréversible.","tasks.renamed":"Tâche renommée. Les noms de la session actuelle et de l’historique n’ont pas changé.",
    "player.folderTracks":"{folder} · {count} pistes","player.scanning":"{folder} · Analyse…","player.reconnectNeeded":"{folder} · Reconnexion requise","player.missingCount":"{count} absentes","player.folderUnavailable":"Le dossier enregistré est illisible. Choisissez Reconnecter pour le localiser.","player.savedMissing":"{count} pistes enregistrées sont indisponibles. Restaurez-les puis réanalysez, ou retirez-les.","player.savedMissingOne":"1 piste enregistrée est indisponible. Restaurez-la puis réanalysez, ou retirez-la.","player.localStatus":"L’ordre de la file et la piste actuelle sont enregistrés automatiquement.","player.trackMissingAlert":"Cette piste est absente. Restaurez-la puis réanalysez, ou retirez-la.","player.nowPlayingAnnouncement":"Lecture de {title}.","player.folderUnsupported":"La sélection de dossier musical n’est pas prise en charge.","player.noMusicFiles":"Aucun fichier musical trouvé dans le dossier choisi.","player.folderUnreadable":"Dossier illisible · Essayez-en un autre","player.started":"Lecture démarrée.","player.paused":"Lecture en pause.",
    "stats.todayProgress":"Aujourd’hui {current}/{goal} min{complete}","stats.todayOff":"Aujourd’hui {current} min · objectif désactivé","stats.goalComplete":" · objectif atteint","stats.goalAria":"{current} minutes sur {goal} effectuées aujourd’hui","stats.goalOffAria":"{current} minutes effectuées aujourd’hui ; objectif désactivé","stats.activeTitle":"Jours avec une activité enregistrée sur cette période","stats.previousTitle":"{duration} sur la période précédente","stats.barAria":"{day} {minutes} minutes","stats.added":"Session ajoutée le {day} : {minutes} minutes.","stats.updated":"Session du {day} mise à jour : {minutes} minutes.","stats.deleted":"Session supprimée.","stats.futureDate":"La date ne peut pas être dans le futur.","stats.deleteConfirm":"Supprimer cette session ? Cette action est irréversible.","stats.clearConfirm":"Effacer toutes les statistiques ? Cette action est irréversible.","stats.cleared":"Toutes les statistiques ont été effacées.",
    "weather.autoPrivacy":"Le mode automatique envoie votre adresse IP à ipapi.co, puis les coordonnées à Open-Meteo.","weather.cityPrivacy":"Le mode ville envoie uniquement le nom et les coordonnées obtenues à Open-Meteo.","weather.offPrivacy":"La météo est désactivée. Aucune requête météo ou de localisation n’est envoyée."
  });
  Object.assign(KOREAN, {
    "tray.startTimer":"타이머 시작","tray.pauseTimer":"타이머 일시 정지","tray.resetTimer":"타이머 재설정","tray.showWindow":"창 표시","tray.hideWindow":"창 숨기기","tray.quit":"종료",
    "timer.pausedAnnouncement":"타이머가 {time}에서 일시 정지되었습니다.","timer.startedAnnouncement":"{phase} 타이머가 시작되었습니다. {time} 남음.","timer.resetAnnouncement":"타이머를 집중 세션 {time}(으)로 재설정했습니다.","timer.phaseStartedAnnouncement":"{phase} 시작. {time} 남음.","timer.focusNotification":"깊은 집중으로 돌아가세요.","timer.shortBreakNotification":"짧게 쉬어 가세요.","timer.longBreakNotification":"주기 완료. 더 길게 쉬세요.","timer.exitShowcase":"클릭하여 쇼케이스 모드 종료","timer.exitShowcaseTitle":"이 카드를 클릭하여 쇼케이스 모드 종료",
    "player.bundledTitle":"Infinite Lo-Fi 내장 트랙","player.trackUnavailableTitle":"{title}을(를) 사용할 수 없습니다. 복원 후 다시 스캔하세요.","player.playTrackTitle":"{title} 재생","player.cover":"{title} 커버",
    "stats.sessionDate":"집중 세션 날짜","stats.sessionMinutes":"집중 세션 시간(분)","stats.snapshotLabel":"{text}. 저장된 작업 제목 스냅샷.","stats.saveSession":"{day} 집중 세션 저장","stats.deleteSession":"{day} 집중 세션 삭제","stats.dayGoalTitle":"이 범위에서 {count}일 동안 일일 목표 달성","stats.restoreConfirm":"이 백업(노트 {notes}개, 작업 {tasks}개, 집중 세션 {sessions}개)을 복원할까요? 현재 로컬 데이터가 대체됩니다.","stats.restoreSuccess":"백업을 복원했습니다. Infinite Lo-Fi를 다시 불러옵니다.","stats.restoreError":"백업을 복원할 수 없음: {error}","stats.unknownBackupError":"알 수 없는 백업 오류",
    "scene.importedImage":"가져온 이미지","scene.importedVideo":"가져온 비디오","scene.builtInVideo":"내장 비디오","scene.selected":"{name} 프리셋을 선택했습니다.","scene.wallpaperUnsupported":"바탕화면 배경을 지원하지 않습니다.","scene.wallpaperUnreadable":"현재 바탕화면을 읽을 수 없습니다.","scene.imageUnsupported":"배경 이미지 선택을 지원하지 않습니다.","scene.videoUnsupported":"배경 비디오 선택을 지원하지 않습니다.",
    "storage.genericError":"로컬 데이터를 저장할 수 없습니다. 마지막 저장 상태는 변경되지 않았습니다.","storage.notesError":"로컬 저장소를 사용할 수 없어 노트를 저장하지 못했습니다.","storage.timerPauseError":"상태를 저장하지 못해 타이머를 일시 정지하지 않았습니다.","storage.timerStartError":"세션 정보를 저장하지 못해 타이머를 시작하지 않았습니다.","storage.timerResetError":"새 상태를 저장하지 못해 타이머를 재설정하지 않았습니다.","storage.planError":"저장하지 못해 집중 계획을 적용하지 않았습니다.","storage.completionError":"완료된 타이머를 저장하지 못했습니다. 기록을 중복하지 않고 다시 시도합니다.","storage.restoredCompletionError":"완료된 집중 세션을 저장하지 못했습니다. 기록을 중복하지 않고 다시 시도합니다.",
    "tasks.page":"{page}/{pages}페이지","tasks.previousPage":"{section} 작업 이전 페이지","tasks.nextPage":"{section} 작업 다음 페이지","tasks.sectionOpen":"진행 중","tasks.sectionCompleted":"완료","tasks.actionLabel":"{title} 작업 {action}","tasks.renameLabel":"{title} 작업 이름 바꾸기","tasks.unselected":"다음 세션은 지정 안 함으로 설정되었습니다.","tasks.selectedAnnouncement":"다음 집중에 {title}을(를) 선택했습니다.","tasks.completedAnnouncement":"{title}을(를) 완료했습니다. 타이머는 변경되지 않았습니다.","tasks.reopenedAnnouncement":"{title}을(를) 다시 열었습니다.","tasks.deletedAnnouncement":"{title}을(를) 삭제했습니다. 기록된 이름은 유지됩니다.","tasks.deleteConfirm":"“{title}”을(를) 삭제할까요? 진행 중 세션을 포함한 기록의 이름은 유지됩니다. 되돌릴 수 없습니다.","tasks.renamed":"작업 이름을 바꿨습니다. 현재 및 기록된 세션 이름은 변경되지 않았습니다.",
    "player.folderTracks":"{folder} · {count}개 트랙","player.scanning":"{folder} · 스캔 중…","player.reconnectNeeded":"{folder} · 다시 연결 필요","player.missingCount":"{count}개 누락","player.folderUnavailable":"저장된 폴더를 읽을 수 없습니다. 다시 연결하여 위치를 지정하세요.","player.savedMissing":"저장된 트랙 {count}개를 사용할 수 없습니다. 파일을 복원하고 다시 스캔하거나 누락 항목을 제거하세요.","player.savedMissingOne":"저장된 트랙 1개를 사용할 수 없습니다. 파일을 복원하고 다시 스캔하거나 누락 항목을 제거하세요.","player.localStatus":"대기열 순서와 현재 트랙은 자동으로 저장됩니다.","player.trackMissingAlert":"이 트랙이 누락되었습니다. 복원 후 다시 스캔하거나 누락 항목을 제거하세요.","player.nowPlayingAnnouncement":"{title} 재생 중.","player.folderUnsupported":"음악 폴더 선택을 지원하지 않습니다.","player.noMusicFiles":"선택한 폴더에 음악 파일이 없습니다.","player.folderUnreadable":"폴더를 읽을 수 없음 · 다른 폴더를 시도하세요","player.started":"음악 재생을 시작했습니다.","player.paused":"음악을 일시 정지했습니다.",
    "stats.todayProgress":"오늘 {current}/{goal}분{complete}","stats.todayOff":"오늘 {current}분 · 일일 목표 꺼짐","stats.goalComplete":" · 목표 달성","stats.goalAria":"오늘 집중 {current}/{goal}분 완료","stats.goalOffAria":"오늘 집중 {current}분 완료, 일일 목표 꺼짐","stats.activeTitle":"이 범위에 집중 기록이 있는 날","stats.previousTitle":"이전 동일 기간 {duration}","stats.barAria":"{day} {minutes}분","stats.added":"{day}에 {minutes}분 집중 세션을 추가했습니다.","stats.updated":"{day} 집중 세션을 {minutes}분으로 업데이트했습니다.","stats.deleted":"집중 세션을 삭제했습니다.","stats.futureDate":"세션 날짜는 미래일 수 없습니다.","stats.deleteConfirm":"이 집중 세션을 삭제할까요? 되돌릴 수 없습니다.","stats.clearConfirm":"모든 집중 통계를 지울까요? 되돌릴 수 없습니다.","stats.cleared":"모든 집중 통계를 지웠습니다.",
    "weather.autoPrivacy":"자동 모드는 IP 주소를 ipapi.co에 보낸 뒤 좌표를 Open-Meteo에 보냅니다.","weather.cityPrivacy":"도시 모드는 도시 이름과 검색된 좌표만 Open-Meteo에 보냅니다.","weather.offPrivacy":"날씨가 꺼져 있습니다. 날씨 또는 위치 요청을 보내지 않습니다."
  });
  Object.assign(SPANISH, {
    "tray.startTimer":"Iniciar temporizador","tray.pauseTimer":"Pausar temporizador","tray.resetTimer":"Reiniciar temporizador","tray.showWindow":"Mostrar ventana","tray.hideWindow":"Ocultar ventana","tray.quit":"Salir",
    "timer.pausedAnnouncement":"Temporizador pausado en {time}.","timer.startedAnnouncement":"Temporizador de {phase} iniciado. Quedan {time}.","timer.resetAnnouncement":"Temporizador reiniciado a concentración, {time}.","timer.phaseStartedAnnouncement":"{phase} iniciado. Quedan {time}.","timer.focusNotification":"Vuelve a la concentración profunda.","timer.shortBreakNotification":"Tómate un descanso corto.","timer.longBreakNotification":"Ciclo completo. Tómate un descanso más largo.","timer.exitShowcase":"Haz clic para salir del modo escaparate","timer.exitShowcaseTitle":"Haz clic en esta tarjeta para salir del modo escaparate",
    "player.bundledTitle":"Pistas incluidas de Infinite Lo-Fi","player.trackUnavailableTitle":"{title} no está disponible. Restáurala y vuelve a explorar.","player.playTrackTitle":"Reproducir {title}","player.cover":"Portada de {title}",
    "stats.sessionDate":"Fecha de la sesión","stats.sessionMinutes":"Minutos de la sesión","stats.snapshotLabel":"{text}. Instantánea guardada del título de tarea.","stats.saveSession":"Guardar sesión del {day}","stats.deleteSession":"Eliminar sesión del {day}","stats.dayGoalTitle":"El objetivo diario se alcanzó {count} días en este intervalo","stats.restoreConfirm":"¿Restaurar esta copia ({notes} notas, {tasks} tareas, {sessions} sesiones)? Se reemplazarán los datos locales actuales.","stats.restoreSuccess":"Copia restaurada. Infinite Lo-Fi se recargará ahora.","stats.restoreError":"No se pudo restaurar la copia: {error}","stats.unknownBackupError":"Error de copia desconocido",
    "scene.importedImage":"Imagen importada","scene.importedVideo":"Vídeo importado","scene.builtInVideo":"Vídeo incluido","scene.selected":"Preajuste {name} seleccionado.","scene.wallpaperUnsupported":"No se admite el fondo de escritorio.","scene.wallpaperUnreadable":"No se pudo leer el fondo de escritorio actual.","scene.imageUnsupported":"No se admite la selección de imágenes de fondo.","scene.videoUnsupported":"No se admite la selección de vídeos de fondo.",
    "storage.genericError":"No se pudieron guardar los datos locales. El último estado guardado no cambió.","storage.notesError":"El almacenamiento local no está disponible; las notas no se guardaron.","storage.timerPauseError":"El temporizador no se pausó porque no se pudo guardar su estado.","storage.timerStartError":"El temporizador no se inició porque no se pudo guardar el contexto de sesión.","storage.timerResetError":"El temporizador no se reinició porque no se pudo guardar el nuevo estado.","storage.planError":"El plan no se aplicó porque no se pudo guardar.","storage.completionError":"No se pudo guardar el temporizador completado. Se reintentará sin duplicar el historial.","storage.restoredCompletionError":"No se pudo guardar la sesión completada. Se reintentará sin duplicar el historial.",
    "tasks.page":"Página {page} de {pages}","tasks.previousPage":"Página anterior de tareas {section}","tasks.nextPage":"Página siguiente de tareas {section}","tasks.sectionOpen":"abiertas","tasks.sectionCompleted":"completadas","tasks.actionLabel":"{action} tarea {title}","tasks.renameLabel":"Renombrar tarea {title}","tasks.unselected":"La próxima sesión queda sin asignar.","tasks.selectedAnnouncement":"{title} seleccionada para la próxima sesión.","tasks.completedAnnouncement":"{title} completada. El temporizador no cambió.","tasks.reopenedAnnouncement":"{title} reabierta.","tasks.deletedAnnouncement":"{title} eliminada. Se conservaron los nombres registrados.","tasks.deleteConfirm":"¿Eliminar «{title}»? Los nombres registrados seguirán en el historial, incluida la sesión en curso. No se puede deshacer.","tasks.renamed":"Tarea renombrada. Los nombres de la sesión actual y del historial no cambiaron.",
    "player.folderTracks":"{folder} · {count} pistas","player.scanning":"{folder} · Explorando…","player.reconnectNeeded":"{folder} · Requiere reconexión","player.missingCount":"{count} ausentes","player.folderUnavailable":"No se puede leer la carpeta guardada. Elige Reconectar para localizarla.","player.savedMissing":"{count} pistas guardadas no están disponibles. Restáuralas y vuelve a explorar, o elimínalas.","player.savedMissingOne":"1 pista guardada no está disponible. Restáurala y vuelve a explorar, o elimínala.","player.localStatus":"El orden de la cola y la pista actual se guardan automáticamente.","player.trackMissingAlert":"Esta pista está ausente. Restáurala y vuelve a explorar, o elimínala.","player.nowPlayingAnnouncement":"Reproduciendo {title}.","player.folderUnsupported":"No se admite la selección de carpetas de música.","player.noMusicFiles":"No se encontraron archivos de música en la carpeta elegida.","player.folderUnreadable":"Carpeta ilegible · Prueba otra","player.started":"La música comenzó a reproducirse.","player.paused":"La música está en pausa.",
    "stats.todayProgress":"Hoy {current}/{goal} min{complete}","stats.todayOff":"Hoy {current} min · objetivo desactivado","stats.goalComplete":" · objetivo alcanzado","stats.goalAria":"{current} de {goal} minutos completados hoy","stats.goalOffAria":"{current} minutos completados hoy; objetivo desactivado","stats.activeTitle":"Días con concentración registrada en este intervalo","stats.previousTitle":"{duration} en el período anterior","stats.barAria":"{day} {minutes} minutos","stats.added":"Sesión añadida el {day}: {minutes} minutos.","stats.updated":"Sesión del {day} actualizada: {minutes} minutos.","stats.deleted":"Sesión eliminada.","stats.futureDate":"La fecha no puede estar en el futuro.","stats.deleteConfirm":"¿Eliminar esta sesión? No se puede deshacer.","stats.clearConfirm":"¿Borrar todas las estadísticas? No se puede deshacer.","stats.cleared":"Se borraron todas las estadísticas.",
    "weather.autoPrivacy":"El modo automático envía tu IP a ipapi.co y después las coordenadas a Open-Meteo.","weather.cityPrivacy":"El modo ciudad solo envía el nombre y las coordenadas resultantes a Open-Meteo.","weather.offPrivacy":"El tiempo está desactivado. No se envían solicitudes del tiempo ni de ubicación."
  });

  Object.assign(TRANSLATIONS["zh-CN"], { "tray.startTimer":"开始计时","tray.pauseTimer":"暂停计时","tray.resetTimer":"重置计时","tray.showWindow":"显示窗口","tray.hideWindow":"隐藏窗口","tray.quit":"退出" });
  TRANSLATIONS["zh-CN"] = completePack(TRANSLATIONS["zh-CN"]);
  TRANSLATIONS["zh-TW"] = completePack(Object.fromEntries(
    Object.entries(TRANSLATIONS["zh-CN"]).map(([key, value]) => [key, toTraditionalChinese(value)])
  ));
  TRANSLATIONS.ja = completePack(JAPANESE);
  TRANSLATIONS.fr = completePack(FRENCH);
  TRANSLATIONS.ko = completePack(KOREAN);
  TRANSLATIONS.es = completePack(SPANISH);

  const LANGUAGE_ALIASES = Object.freeze({
    "zh": "zh-CN", "zh-cn": "zh-CN", "zh-hans": "zh-CN", "zh-sg": "zh-CN",
    "zh-tw": "zh-TW", "zh-hant": "zh-TW", "zh-hk": "zh-TW", "zh-mo": "zh-TW",
    "en": "en", "ja": "ja", "fr": "fr", "ko": "ko", "es": "es"
  });

  function normalizeLanguage(value, fallback = "en") {
    const normalized = typeof value === "string" ? value.trim().toLowerCase().replace(/_/g, "-") : "";
    return LANGUAGE_ALIASES[normalized] || LANGUAGE_ALIASES[normalized.split("-")[0]] || fallback;
  }

  function interpolate(template, params = {}) {
    return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) =>
      Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match
    );
  }

  function createI18n(initialLanguage = "en") {
    let language = normalizeLanguage(initialLanguage);

    function t(key, params = {}) {
      const template = TRANSLATIONS[language]?.[key] ?? ENGLISH[key] ?? key;
      return interpolate(template, params);
    }

    function setLanguage(nextLanguage) {
      language = normalizeLanguage(nextLanguage, language);
      return language;
    }

    function getLocale() {
      return SUPPORTED_LANGUAGES.find((item) => item.code === language)?.locale || "en";
    }

    function applyDocument(root) {
      if (!root?.querySelectorAll) return;
      root.documentElement?.setAttribute("lang", language);
      for (const element of root.querySelectorAll("[data-i18n]")) {
        element.textContent = t(element.dataset.i18n);
      }
      for (const element of root.querySelectorAll("[data-i18n-title]")) {
        element.setAttribute("title", t(element.dataset.i18nTitle));
      }
      for (const element of root.querySelectorAll("[data-i18n-aria-label]")) {
        element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel));
      }
      for (const element of root.querySelectorAll("[data-i18n-placeholder]")) {
        element.setAttribute("placeholder", t(element.dataset.i18nPlaceholder));
      }
    }

    return { applyDocument, getLanguage: () => language, getLocale, setLanguage, t };
  }

  const api = { ENGLISH, SUPPORTED_LANGUAGES, TRANSLATIONS, createI18n, interpolate, normalizeLanguage };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalScope) globalScope.InfiniteLofiI18n = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
