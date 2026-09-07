(function exposeInfiniteLofiPlayer(globalScope) {
  function getTrackKey(track) {
    if (!track || typeof track !== "object") {
      return "";
    }
    if (typeof track.src === "string" && track.src) {
      return track.src;
    }
    return typeof track.srcUrl === "string" ? track.srcUrl : "";
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

  function findActiveTrackIndex(tracks, activeTrackSrc) {
    if (!Array.isArray(tracks)) {
      return 0;
    }
    const index = tracks.findIndex((track) => getTrackKey(track) === activeTrackSrc);
    return index >= 0 ? index : 0;
  }

  const api = { applyTrackOrder, findActiveTrackIndex, getTrackKey };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (globalScope) {
    globalScope.InfiniteLofiPlayer = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
