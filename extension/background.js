// Refresh Undo service worker: snapshot storage (IndexedDB), pruning,
// fresh-tab refresh, and the restore-last command.
const DB = 'refresh_undo';
const STORE = 'snaps';
const KEEP_HOURS = 48;
const KEEP_PER_URL = 5;
const KEEP_TOTAL = 400;

function openDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      const s = r.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      s.createIndex('ts', 'ts');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function allMeta(d) {
  return new Promise((res, rej) => {
    const metas = [];
    const t = d.transaction(STORE, 'readonly');
    t.objectStore(STORE).openCursor().onsuccess = e => {
      const c = e.target.result;
      if (c) {
        const { html, ...meta } = c.value;
        metas.push(meta);
        c.continue();
      } else {
        res(metas);
      }
    };
    t.onerror = () => rej(t.error);
  });
}

function getRec(d, id) {
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, 'readonly');
    const q = t.objectStore(STORE).get(id);
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}

function rw(d, fn) {
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, 'readwrite');
    fn(t.objectStore(STORE));
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}

async function prune(d) {
  const metas = (await allMeta(d)).sort((a, b) => b.ts - a.ts);
  const cutoff = Date.now() - KEEP_HOURS * 3600 * 1000;
  const perUrl = {};
  const doomed = [];
  metas.forEach((m, i) => {
    perUrl[m.url] = (perUrl[m.url] || 0) + 1;
    if (m.ts < cutoff || perUrl[m.url] > KEEP_PER_URL || i >= KEEP_TOTAL) doomed.push(m.id);
  });
  if (doomed.length) await rw(d, s => doomed.forEach(id => s.delete(id)));
}

async function addSnap(data, sender) {
  const d = await openDb();
  const rec = { ...data, ts: Date.now(), tabId: sender.tab ? sender.tab.id : -1 };
  await rw(d, s => s.add(rec));
  await prune(d);
}

// Inject the content script into tabs that were already open when the
// extension was installed/reloaded, so protection doesn't wait for a reload.
chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  for (const t of tabs) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['capture.js'] });
    } catch (e) {} // some pages (web store, PDFs) refuse injection; fine
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg.type === 'snapshot') {
      await addSnap(msg.data, sender);
      sendResponse({ ok: true });
    } else if (msg.type === 'freshTab') {
      await chrome.tabs.create({
        url: msg.url,
        index: sender.tab ? sender.tab.index + 1 : undefined,
        active: true
      });
      sendResponse({ ok: true });
    } else if (msg.type === 'list') {
      const d = await openDb();
      sendResponse({ metas: (await allMeta(d)).sort((a, b) => b.ts - a.ts) });
    } else if (msg.type === 'get') {
      const d = await openDb();
      sendResponse({ rec: await getRec(d, msg.id) });
    }
  })().catch(e => sendResponse({ error: String(e) }));
  return true;
});

chrome.commands.onCommand.addListener(async cmd => {
  if (cmd !== 'restore-last') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  const d = await openDb();
  const metas = (await allMeta(d)).sort((a, b) => b.ts - a.ts);
  const m = metas.find(x => x.tabId === tab.id && x.url === tab.url) ||
            metas.find(x => x.url === tab.url) ||
            metas.find(x => x.tabId === tab.id) ||
            metas[0];
  if (m) chrome.tabs.create({ url: chrome.runtime.getURL('viewer.html?id=' + m.id) });
});
