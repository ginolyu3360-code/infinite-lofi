(function exposeInfiniteLofiAccessibility(globalScope) {
  const FOCUSABLE_SELECTOR = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type='hidden'])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])"
  ].join(",");

  function getFocusableElements(surface) {
    if (!surface || typeof surface.querySelectorAll !== "function") return [];
    return [...surface.querySelectorAll(FOCUSABLE_SELECTOR)].filter((element) => {
      if (element.hidden || element.getAttribute?.("aria-hidden") === "true") return false;
      if (typeof element.getClientRects === "function" && element.getClientRects().length === 0) return false;
      return true;
    });
  }

  function createFocusManager(options = {}) {
    const document = options.document || globalScope.document;
    const requestFrame = options.requestAnimationFrame || globalScope.requestAnimationFrame?.bind(globalScope) || ((callback) => callback());
    const states = new WeakMap();

    function open(surface, config = {}) {
      if (!surface) return;
      const trigger = config.trigger || document?.activeElement || null;
      const previous = states.get(surface);
      if (previous?.keydown) surface.removeEventListener("keydown", previous.keydown);

      surface.inert = false;
      surface.setAttribute?.("aria-hidden", "false");
      const keydown = (event) => {
        if (event.key !== "Tab" || config.trap === false) return;
        const focusable = getFocusableElements(surface);
        if (focusable.length === 0) {
          event.preventDefault();
          surface.focus?.();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      };
      surface.addEventListener?.("keydown", keydown);
      states.set(surface, { trigger, keydown });

      requestFrame(() => {
        const target = config.initialFocus || getFocusableElements(surface)[0] || surface;
        target.focus?.({ preventScroll: true });
      });
    }

    function close(surface, config = {}) {
      if (!surface) return;
      const state = states.get(surface);
      if (state?.keydown) surface.removeEventListener?.("keydown", state.keydown);
      surface.setAttribute?.("aria-hidden", "true");
      surface.inert = true;

      const activeWasInside = Boolean(document?.activeElement && surface.contains?.(document.activeElement));
      if (config.restoreFocus !== false && (activeWasInside || config.forceRestore === true)) {
        const target = config.fallbackFocus || state?.trigger;
        if (target?.isConnected !== false && !target?.disabled) target?.focus?.({ preventScroll: true });
      }
      states.delete(surface);
    }

    return { close, open };
  }

  function setDisclosureState(trigger, expanded) {
    if (!trigger) return;
    trigger.setAttribute("aria-expanded", String(Boolean(expanded)));
  }

  function announce(region, message, options = {}) {
    if (!region || !message) return;
    const requestFrame = options.requestAnimationFrame || globalScope.requestAnimationFrame?.bind(globalScope) || ((callback) => callback());
    const nextMessage = String(message).trim();
    if (!nextMessage) return;
    if (region.textContent === nextMessage) {
      region.textContent = "";
      requestFrame(() => { region.textContent = nextMessage; });
      return;
    }
    region.textContent = nextMessage;
  }

  function parseColor(value) {
    const input = String(value || "").trim();
    const hex = input.match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
    if (hex) {
      const normalized = hex.length === 3 ? [...hex].map((part) => `${part}${part}`).join("") : hex;
      return {
        r: Number.parseInt(normalized.slice(0, 2), 16),
        g: Number.parseInt(normalized.slice(2, 4), 16),
        b: Number.parseInt(normalized.slice(4, 6), 16),
        a: 1
      };
    }
    const rgb = input.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i);
    if (!rgb) return null;
    return {
      r: Math.min(255, Math.max(0, Number(rgb[1]))),
      g: Math.min(255, Math.max(0, Number(rgb[2]))),
      b: Math.min(255, Math.max(0, Number(rgb[3]))),
      a: Math.min(1, Math.max(0, rgb[4] === undefined ? 1 : Number(rgb[4])))
    };
  }

  function compositeColor(foreground, background) {
    const fg = typeof foreground === "string" ? parseColor(foreground) : foreground;
    const bg = typeof background === "string" ? parseColor(background) : background;
    if (!fg || !bg) return null;
    const alpha = fg.a + bg.a * (1 - fg.a);
    if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 };
    return {
      r: (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / alpha,
      g: (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / alpha,
      b: (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / alpha,
      a: alpha
    };
  }

  function relativeLuminance(color) {
    const parsed = typeof color === "string" ? parseColor(color) : color;
    if (!parsed) return NaN;
    const channels = [parsed.r, parsed.g, parsed.b].map((value) => {
      const normalized = value / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  }

  function contrastRatio(first, second) {
    const firstLuminance = relativeLuminance(first);
    const secondLuminance = relativeLuminance(second);
    if (!Number.isFinite(firstLuminance) || !Number.isFinite(secondLuminance)) return NaN;
    const lighter = Math.max(firstLuminance, secondLuminance);
    const darker = Math.min(firstLuminance, secondLuminance);
    return (lighter + 0.05) / (darker + 0.05);
  }

  const api = {
    announce,
    compositeColor,
    contrastRatio,
    createFocusManager,
    getFocusableElements,
    parseColor,
    relativeLuminance,
    setDisclosureState
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalScope) globalScope.InfiniteLofiAccessibility = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
