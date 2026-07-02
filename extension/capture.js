// Refresh Undo content script: DOM save-states + keyboard-refresh guard.
(() => {
  // Guard against double injection (manifest content_script + onInstalled executeScript)
  if (window.__refreshUndoLoaded) return;
  window.__refreshUndoLoaded = true;

  const MAX_BYTES = 25 * 1024 * 1024;
  const isYouTube = /(^|\.)youtube\.com$/.test(location.hostname);
  let guardAll = false;

  try {
    chrome.storage.local.get({ guardAll: false }, v => { guardAll = !!v.guardAll; });
    chrome.storage.onChanged.addListener(ch => {
      if (ch.guardAll) guardAll = !!ch.guardAll.newValue;
    });
  } catch (e) {}

  function send(msg) {
    try { chrome.runtime.sendMessage(msg); } catch (e) {}
  }

  function grab(reason) {
    let html;
    try { html = '<!DOCTYPE html>\n' + document.documentElement.outerHTML; } catch (e) { return; }
    if (!html || html.length > MAX_BYTES) return;
    send({
      type: 'snapshot',
      data: {
        url: location.href,
        title: document.title || location.href,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        size: html.length,
        reason,
        html
      }
    });
  }

  // Keyboard refresh (F5 / Ctrl+R / Ctrl+Shift+R) -> fresh copy in a NEW tab,
  // leaving this tab (and anything it has buffered) untouched.
  window.addEventListener('keydown', e => {
    const refreshKey = e.key === 'F5' ||
      ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R'));
    if (!refreshKey) return;
    // If this script was orphaned by an extension reload, stay inert so we
    // never block a refresh we can't replace with a new tab.
    if (!(chrome.runtime && chrome.runtime.id)) return;
    if (!(isYouTube || guardAll)) {
      grab('pre-refresh'); // not guarded here: let the reload happen, but save state first
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    grab('refresh-guard');
    send({ type: 'freshTab', url: location.href });
  }, true);

  // Snapshot whenever the page is about to go away or loses visibility.
  window.addEventListener('pagehide', () => grab('pagehide'));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') grab('hidden');
  });

  // Periodic fallback while the page is visible.
  setInterval(() => { if (!document.hidden) grab('periodic'); }, 30000);
})();
