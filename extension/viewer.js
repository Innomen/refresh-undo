const id = Number(new URLSearchParams(location.search).get('id'));

chrome.runtime.sendMessage({ type: 'get', id }, (resp = {}) => {
  const bar = document.getElementById('bar');
  const rec = resp.rec;
  if (!rec) {
    bar.textContent = 'Snapshot not found.' + (resp.error ? ' ' + resp.error : '');
    return;
  }
  document.title = 'Snapshot: ' + rec.title;

  bar.textContent = '';
  const strong = document.createElement('strong');
  strong.textContent = 'SNAPSHOT';
  bar.appendChild(strong);
  bar.appendChild(document.createTextNode(
    ' taken ' + new Date(rec.ts).toLocaleString() + ' (' + rec.reason + ') — '));
  const a = document.createElement('a');
  a.href = rec.url;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = rec.url;
  bar.appendChild(a);
  bar.appendChild(document.createTextNode(
    ' — static save-state: text, layout and comments are preserved; scripts are disabled and images load from the live site if still up.'));

  let html = rec.html;
  const base = '<base href="' + rec.url.replace(/"/g, '&quot;') + '">';
  if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, m => m + base);
  else html = base + html;

  const f = document.getElementById('frame');
  f.addEventListener('load', () => {
    try { f.contentWindow.scrollTo(rec.scrollX || 0, rec.scrollY || 0); } catch (e) {}
  });
  f.srcdoc = html;
});
