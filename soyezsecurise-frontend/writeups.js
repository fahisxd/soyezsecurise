(() => {
  const list = document.querySelector('[data-writeups]');
  if (!list) return;
  const status = document.querySelector('[data-writeups-status]');
  function element(tag, text, className) {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  fetch(list.dataset.endpoint, { cache: 'no-store', signal: AbortSignal.timeout(10000) })
    .then(response => {
      if (!response.ok) throw new Error('Links unavailable');
      return response.json();
    })
    .then(data => {
      if (!Array.isArray(data.writeups)) throw new Error('Invalid links');
      const fragment = document.createDocumentFragment();
      for (const post of data.writeups) {
        const url = new URL(post.url);
        if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Invalid URL');
        const row = element('a', '', 'writeup-row writeup-link');
        row.href = url.href;
        row.target = '_blank';
        row.rel = 'noopener noreferrer';
        row.append(element('span', post.title, 'writeup-title'), element('span', ' ↗'));
        if (post.description) row.append(element('span', post.description, 'writeup-summary'));
        fragment.append(row);
      }
      list.replaceChildren(fragment);
      status.textContent = data.writeups.length ? '' : 'No writeup links published yet. Check back soon.';
    })
    .catch(() => {
      status.textContent = 'Writeup links are temporarily unavailable. Please reload to try again.';
    });
})();
