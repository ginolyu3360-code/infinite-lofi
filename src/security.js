function isTrustedNavigationUrl(candidateUrl, trustedDocumentUrl) {
  try {
    const candidate = new URL(candidateUrl);
    const trusted = new URL(trustedDocumentUrl);
    candidate.hash = "";
    trusted.hash = "";
    return candidate.href === trusted.href;
  } catch {
    return false;
  }
}

module.exports = { isTrustedNavigationUrl };
