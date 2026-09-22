function createNativeMediaOwnershipController(options = {}) {
  const { createBridge } = options;
  if (typeof createBridge !== "function") {
    throw new TypeError("A native media bridge factory is required.");
  }
  let bridge = null;

  function acquire() {
    if (bridge?.isAvailable?.() === true) return true;
    bridge?.destroy?.();
    bridge = createBridge();
    if (bridge?.isAvailable?.() === true) return true;
    bridge?.destroy?.();
    bridge = null;
    return false;
  }

  function release() {
    if (!bridge) return false;
    bridge.destroy?.();
    bridge = null;
    return true;
  }

  return {
    acquire,
    destroy: release,
    isAvailable: () => bridge?.isAvailable?.() === true,
    isOwned: () => bridge?.isAvailable?.() === true,
    release,
    update(state) {
      if (bridge?.isAvailable?.() === true) bridge.update?.(state);
    }
  };
}

module.exports = { createNativeMediaOwnershipController };
