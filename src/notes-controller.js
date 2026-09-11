(function exposeInfiniteLofiNotesController(globalScope) {
  function createNotesController(options) {
    const {
      appStorage,
      noteModel,
      sanitizeNoteFiles,
      elements,
      onError = () => {},
      confirm: confirmAction = globalScope.confirm.bind(globalScope),
      now = () => Date.now(),
      random = () => Math.random(),
      requestAnimationFrame: requestFrame = globalScope.requestAnimationFrame.bind(globalScope)
    } = options;

    let noteFiles = [];
    let activeNoteId = "";
    let saveTimer = null;
    let draggedNoteId = "";
    let renamingNoteId = "";

    function createNoteFile(name = "Untitled", content = "") {
      const timestamp = now();
      return {
        id: `note-${timestamp}-${Math.floor(random() * 10000)}`,
        name: (name || "Untitled").trim().slice(0, 40) || "Untitled",
        content: content || "",
        pinned: false,
        updatedAt: timestamp
      };
    }

    function restoreCommittedNotes() {
      const storedNotes = appStorage.getState().notes;
      const loaded = sanitizeNoteFiles(storedNotes.files);
      noteFiles = loaded.length > 0 ? noteModel.sortPinnedFirst(loaded) : [createNoteFile("Note 1", "")];
      activeNoteId = noteModel.resolveActiveId(noteFiles, storedNotes.activeId || "");
      const active = getActiveNoteFile();
      elements.notesInput.value = active?.content || "";
      renderTabs();
    }

    function persist() {
      try {
        appStorage.update((state) => {
          state.notes.files = noteFiles;
          state.notes.activeId = activeNoteId || "";
        });
        return true;
      } catch (error) {
        restoreCommittedNotes();
        onError(error);
        return false;
      }
    }

    function getActiveNoteFile() {
      return noteFiles.find((file) => file.id === activeNoteId) || null;
    }

    function updatePinButton() {
      if (!elements.notePinBtn) return;
      const active = getActiveNoteFile();
      elements.notePinBtn.textContent = active?.pinned ? "Unpin" : "Pin";
    }

    function finalizeRename(noteId, rawName) {
      const target = noteFiles.find((file) => file.id === noteId);
      if (!target) {
        renamingNoteId = "";
        return;
      }
      const nextName = String(rawName || "").trim().slice(0, 40);
      if (nextName) {
        target.name = nextName;
        target.updatedAt = now();
      }
      renamingNoteId = "";
      renderTabs();
      return persist();
    }

    function beginRename(noteId) {
      if (!noteId) return;
      renamingNoteId = noteId;
      renderTabs();
      requestFrame(() => {
        const input = elements.document.getElementById("noteTabRenameInput");
        if (input) {
          input.focus();
          input.select();
        }
      });
    }

    function reorder(fromId, toId) {
      noteFiles = noteModel.reorderById(noteFiles, fromId, toId);
      renderTabs();
      persist();
    }

    function renderTabs() {
      if (!elements.noteTabs) return;
      elements.noteTabs.innerHTML = "";
      noteFiles.forEach((file) => {
        const isRenaming = renamingNoteId === file.id;
        const tab = elements.document.createElement(isRenaming ? "div" : "button");
        if (!isRenaming) tab.type = "button";
        tab.className = "note-tab";
        tab.classList.toggle("is-active", file.id === activeNoteId);
        tab.classList.toggle("is-pinned", file.pinned);
        tab.draggable = !isRenaming;
        tab.dataset.noteId = file.id;

        let nameNode;
        if (isRenaming) {
          const renameInput = elements.document.createElement("input");
          renameInput.id = "noteTabRenameInput";
          renameInput.className = "note-tab-name";
          renameInput.value = file.name;
          renameInput.maxLength = 40;
          Object.assign(renameInput.style, {
            background: "rgba(0, 0, 0, 0.22)",
            border: "1px solid rgba(251, 191, 36, 0.52)",
            borderRadius: "0.45rem",
            padding: "0.1rem 0.3rem",
            outline: "none"
          });
          renameInput.addEventListener("click", (event) => event.stopPropagation());
          renameInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              finalizeRename(file.id, renameInput.value);
            } else if (event.key === "Escape") {
              event.preventDefault();
              renamingNoteId = "";
              renderTabs();
            }
          });
          renameInput.addEventListener("blur", () => finalizeRename(file.id, renameInput.value));
          nameNode = renameInput;
        } else {
          nameNode = elements.document.createElement("span");
          nameNode.className = "note-tab-name";
          nameNode.textContent = file.name;
        }

        const pin = elements.document.createElement("span");
        pin.className = "note-tab-pin";
        pin.textContent = file.pinned ? "PIN" : "";
        tab.appendChild(nameNode);
        tab.appendChild(pin);

        if (!isRenaming) {
          tab.addEventListener("click", () => setActiveNoteFile(file.id));
          tab.addEventListener("dblclick", () => beginRename(file.id));
        }
        tab.title = isRenaming ? `Rename note ${file.name}` : `Open note ${file.name}`;
        tab.addEventListener("dragstart", (event) => {
          draggedNoteId = file.id;
          tab.classList.add("is-dragging");
          if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
        });
        tab.addEventListener("dragend", () => {
          draggedNoteId = "";
          tab.classList.remove("is-dragging");
          elements.noteTabs.querySelectorAll(".note-tab.is-drag-over").forEach((item) => item.classList.remove("is-drag-over"));
        });
        tab.addEventListener("dragover", (event) => {
          event.preventDefault();
          if (draggedNoteId && draggedNoteId !== file.id) tab.classList.add("is-drag-over");
        });
        tab.addEventListener("dragleave", () => tab.classList.remove("is-drag-over"));
        tab.addEventListener("drop", (event) => {
          event.preventDefault();
          tab.classList.remove("is-drag-over");
          reorder(draggedNoteId, file.id);
        });
        elements.noteTabs.appendChild(tab);
      });
      updatePinButton();
    }

    function setActiveNoteFile(noteId) {
      const target = noteFiles.find((file) => file.id === noteId) || noteFiles[0] || null;
      if (!target) return;
      activeNoteId = target.id;
      elements.notesInput.value = target.content || "";
      renderTabs();
      return persist();
    }

    function loadNotes() {
      const storedNotes = appStorage.getState().notes;
      const loaded = sanitizeNoteFiles(storedNotes.files);
      noteFiles = loaded.length > 0 ? loaded : [createNoteFile("Note 1", "")];
      noteFiles = noteModel.sortPinnedFirst(noteFiles);
      activeNoteId = noteModel.resolveActiveId(noteFiles, storedNotes.activeId || "");
      setActiveNoteFile(activeNoteId);
    }

    function createNewNoteFile() {
      const file = createNoteFile(`Note ${noteFiles.length + 1}`, "");
      noteFiles.push(file);
      noteFiles = noteModel.sortPinnedFirst(noteFiles);
      if (setActiveNoteFile(file.id)) beginRename(file.id);
    }

    function toggleActiveNotePin() {
      const active = getActiveNoteFile();
      if (!active) return;
      active.pinned = !active.pinned;
      active.updatedAt = now();
      noteFiles = noteModel.sortPinnedFirst(noteFiles);
      setActiveNoteFile(active.id);
    }

    function clearNotesWithConfirm() {
      if (!confirmAction("Clear all notes?")) return;
      elements.notesInput.value = "";
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      const active = getActiveNoteFile();
      if (active) {
        active.content = "";
        active.updatedAt = now();
        persist();
      }
    }

    function deleteActiveNoteFile() {
      if (noteFiles.length <= 1) {
        clearNotesWithConfirm();
        return;
      }
      const active = getActiveNoteFile();
      if (!active || !confirmAction(`Delete note \"${active.name}\"?`)) return;
      noteFiles = noteFiles.filter((file) => file.id !== active.id);
      setActiveNoteFile(noteFiles[0].id);
    }

    function saveNotesSoon() {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        const active = getActiveNoteFile();
        if (!active) return;
        active.content = elements.notesInput.value;
        active.updatedAt = now();
        persist();
      }, 180);
    }

    function saveNotesNow() {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      const active = getActiveNoteFile();
      if (active) {
        active.content = elements.notesInput.value || "";
        active.updatedAt = now();
        persist();
      }
    }

    return {
      clearNotesWithConfirm,
      createNewNoteFile,
      deleteActiveNoteFile,
      loadNotes,
      saveNotesNow,
      saveNotesSoon,
      toggleActiveNotePin
    };
  }

  const api = { createNotesController };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalScope) globalScope.InfiniteLofiNotesController = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
