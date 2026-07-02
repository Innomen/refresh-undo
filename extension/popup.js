const guardAllEl = document.getElementById('guardAll');
const listEl = document.getElementById('list');
const restoreEl = document.getElementById('restore');
const restoreMetaEl = document.getElementById('restoreMeta');

chrome.storage.local.get({ guardAll: false }, v => { guardAllEl.checked = !!v.guardAll; });
guardAllEl.addEventListener('change', () => {
  chrome.storage.local.set({ guardAll: guardAllEl.checked });
});

function age(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return Math.round(s) + 's ago';
  if (s < 3600) return Math.round(s / 60) + 'm ago';
  return (s / 3600).toFixed(1) + 'h ago';
}

function fmtSize(n) {
  return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB';
}

function openSnap(id) {
  chrome.tabs.create({ url: chrome.runtime.getURL('viewer.html?id=' + id) });
}

function row(m) {
  const div = document.createElement('div');
  div.className = 'snap';
  const t = document.createElement('div');
  t.className = 't';
  t.textContent = m.title;
  const meta = document.createElement('div');
  meta.className = 'm';
  meta.textContent = age(m.ts) + ' · ' + fmtSize(m.size || 0) + ' · ' + (m.reason || '') + ' · ' + m.url;
  div.append(t, meta);
  div.addEventListener('click', () => openSnap(m.id));
  return div;
}

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  chrome.runtime.sendMessage({ type: 'list' }, (resp = {}) => {
    const metas = resp.metas || [];
    const here = metas.filter(m => tab && m.url === tab.url);

    if (here.length) {
      restoreEl.disabled = false;
      restoreMetaEl.textContent = 'Latest save-state: ' + age(here[0].ts) +
        (here.length > 1 ? ' (' + here.length + ' kept)' : '');
      restoreEl.addEventListener('click', () => openSnap(here[0].id));
    } else {
      restoreMetaEl.textContent = 'No save-state of this page yet.';
    }

    listEl.textContent = '';
    listEl.className = '';
    if (!metas.length) {
      listEl.className = 'empty';
      listEl.textContent = 'No snapshots yet — browse a page for ~30 seconds and it will appear here.';
      return;
    }
    if (here.length) {
      const h = document.createElement('h4');
      h.textContent = 'This page';
      listEl.appendChild(h);
      here.forEach(m => listEl.appendChild(row(m)));
    }
    const rest = metas.filter(m => !tab || m.url !== tab.url).slice(0, 40);
    if (rest.length) {
      const h = document.createElement('h4');
      h.textContent = 'Recent pages';
      listEl.appendChild(h);
      rest.forEach(m => listEl.appendChild(row(m)));
    }
  });
});
