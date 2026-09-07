function resolveWindowCloseAction({ closeBehavior, isQuitting }) {
  if (isQuitting) return "close";
  return closeBehavior === "tray" ? "hide" : "quit";
}

module.exports = { resolveWindowCloseAction };
