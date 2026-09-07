(function exposeInfiniteLofiNotes(globalScope) {
  function sortPinnedFirst(files) {
    if (!Array.isArray(files)) {
      return [];
    }
    return [
      ...files.filter((file) => file?.pinned === true),
      ...files.filter((file) => file?.pinned !== true)
    ];
  }

  function reorderById(files, fromId, toId) {
    const reordered = Array.isArray(files) ? [...files] : [];
    if (!fromId || !toId || fromId === toId) {
      return reordered;
    }
    const fromIndex = reordered.findIndex((file) => file?.id === fromId);
    const toIndex = reordered.findIndex((file) => file?.id === toId);
    if (fromIndex < 0 || toIndex < 0) {
      return reordered;
    }
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    return sortPinnedFirst(reordered);
  }

  function resolveActiveId(files, requestedId) {
    if (!Array.isArray(files) || files.length === 0) {
      return "";
    }
    return files.some((file) => file?.id === requestedId) ? requestedId : files[0].id;
  }

  const api = { reorderById, resolveActiveId, sortPinnedFirst };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (globalScope) {
    globalScope.InfiniteLofiNotes = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
