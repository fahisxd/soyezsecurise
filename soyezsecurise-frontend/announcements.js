(() => {
  const copy = document.querySelector('[data-announcements]');
  if (!copy) return;

  const endpoint = copy.dataset.endpoint;
  fetch(endpoint, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
    .then(response => {
      if (!response.ok) throw new Error('Announcements unavailable');
      return response.json();
    })
    .then(data => {
      if (typeof data.text !== 'string') throw new Error('Invalid announcement');
      if (data.text.trim()) copy.textContent = data.text.trim();
    })
    .catch(() => {
      copy.textContent = 'Announcements are temporarily unavailable. Please check back soon.';
    });
})();
