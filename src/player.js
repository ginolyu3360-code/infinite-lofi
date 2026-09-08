(function exposeInfiniteLofiPlayer(globalScope) {
  function getTrackKey(track) {
    if (!track || typeof track !== "object") {
      return "";
    }
    if (typeof track.key === "string" && track.key) {
      return track.key;
    }
    if (typeof track.src === "string" && track.src) {
      return track.src;
    }
    return typeof track.srcUrl === "string" ? track.srcUrl : "";
  }

  function isTrackPlayable(track) {
    return Boolean(
      track &&
      track.isMissing !== true &&
      ((typeof track.src === "string" && track.src) ||
        (typeof track.srcUrl === "string" && track.srcUrl))
    );
  }

  function createTrackSnapshot(track) {
    const key = getTrackKey(track);
    if (!key) return null;
    return {
      key,
      label: typeof track.label === "string" && track.label.trim()
        ? track.label.trim().slice(0, 512)
        : "Untitled track",
      relativePath: typeof track.relativePath === "string"
        ? track.relativePath.slice(0, 2048)
        : "",
      isLocal: track.isLocal === true
    };
  }

  function createQueueSnapshot(tracks) {
    if (!Array.isArray(tracks)) return [];
    return tracks.map(createTrackSnapshot).filter(Boolean);
  }

  function mergePlaylistTracks(availableTracks, queueSnapshot) {
    const available = Array.isArray(availableTracks) ? availableTracks : [];
    const snapshots = Array.isArray(queueSnapshot) ? queueSnapshot : [];
    if (snapshots.length === 0) return available.map((track) => ({ ...track, isMissing: false }));

    const availableByKey = new Map(
      available.map((track) => [getTrackKey(track), track]).filter(([key]) => Boolean(key))
    );
    const restored = [];
    const included = new Set();

    snapshots.forEach((snapshot) => {
      const key = getTrackKey(snapshot);
      if (!key || included.has(key)) return;
      included.add(key);
      const track = availableByKey.get(key);
      restored.push(
        track
          ? { ...snapshot, ...track, isMissing: false }
          : { ...snapshot, src: "", srcUrl: "", isMissing: true }
      );
    });

    available.forEach((track) => {
      const key = getTrackKey(track);
      if (!key || included.has(key)) return;
      included.add(key);
      restored.push({ ...track, isMissing: false });
    });
    return restored;
  }

  function applyTrackOrder(tracks, order) {
    const source = Array.isArray(tracks) ? tracks : [];
    if (!Array.isArray(order) || order.length === 0) {
      return [...source];
    }
    const byKey = new Map(source.map((track) => [getTrackKey(track), track]));
    const ordered = order.map((key) => byKey.get(key)).filter(Boolean);
    const included = new Set(ordered.map(getTrackKey));
    return [...ordered, ...source.filter((track) => !included.has(getTrackKey(track)))];
  }

  function findActiveTrackIndex(tracks, activeTrackKey) {
    if (!Array.isArray(tracks) || tracks.length === 0) {
      return 0;
    }
    const index = tracks.findIndex((track) => getTrackKey(track) === activeTrackKey);
    if (index >= 0 && isTrackPlayable(tracks[index])) return index;
    const playableIndex = tracks.findIndex(isTrackPlayable);
    return playableIndex >= 0 ? playableIndex : Math.max(index, 0);
  }

  function findAdjacentPlayableIndex(tracks, currentIndex, direction = 1) {
    if (!Array.isArray(tracks) || tracks.length === 0) return -1;
    const step = direction < 0 ? -1 : 1;
    const start = Number.isInteger(currentIndex) ? currentIndex : 0;
    for (let offset = 1; offset <= tracks.length; offset += 1) {
      const index = (start + step * offset + tracks.length * 2) % tracks.length;
      if (isTrackPlayable(tracks[index])) return index;
    }
    return -1;
  }

  const api = {
    applyTrackOrder,
    createQueueSnapshot,
    createTrackSnapshot,
    findActiveTrackIndex,
    findAdjacentPlayableIndex,
    getTrackKey,
    isTrackPlayable,
    mergePlaylistTracks
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (globalScope) {
    globalScope.InfiniteLofiPlayer = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
