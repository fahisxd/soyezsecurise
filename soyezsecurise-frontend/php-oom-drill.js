(() => {
  const list = document.querySelector('[data-flashcards]');
  if (!list) return;
  const template = document.querySelector('[data-flashcards-template]');
  const status = document.querySelector('[data-flashcards-status]');
  const retry = document.querySelector('[data-flashcards-retry]');
  let routes = [];

  function syncRoutes() {
    // Close the previous deck before opening a shared link to another deck.
    list.querySelectorAll('dialog[open]').forEach(dialog => {
      if (location.hash !== `#${dialog.id}`) dialog.close();
    });
    routes.forEach(sync => sync());
  }
  window.addEventListener('hashchange', syncRoutes);
  window.addEventListener('popstate', syncRoutes);

  function createDeck(deck, ids) {
    if (!deck || typeof deck.id !== 'string'
      || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*-deck$/.test(deck.id)
      || typeof deck.title !== 'string' || !deck.title.trim()
      || !Array.isArray(deck.cards) || !deck.cards.length
      || deck.cards.some(card => !card || ['prompt', 'title', 'answer'].some(key => typeof card[key] !== 'string' || !card[key].trim()))) {
      throw new Error('Invalid flash card deck');
    }
    const generatedIds = [deck.id, `${deck.id}-title`, `${deck.id}-share-url`];
    generatedIds.forEach(id => {
      if (ids.has(id) || document.getElementById(id)) throw new Error('Duplicate deck ID');
      ids.add(id);
    });
    const root = template.content.firstElementChild.cloneNode(true);
    const setText = (selector, value) => { root.querySelector(selector).textContent = value || ''; };
    const dialog = root.querySelector('[data-oom-dialog]');
    const opener = root.querySelector('[data-oom-open]');
    dialog.id = deck.id;
    dialog.setAttribute('aria-labelledby', `${deck.id}-title`);
    root.querySelector('[data-deck-dialog-title]').id = `${deck.id}-title`;
    opener.href = `#${deck.id}`;
    opener.setAttribute('aria-controls', deck.id);
    root.querySelector('[data-oom-share-url]').id = `${deck.id}-share-url`;
    root.querySelector('[data-deck-share-label]').htmlFor = `${deck.id}-share-url`;
    setText('[data-deck-count]', `${String(deck.cards.length).padStart(2, '0')} ${deck.cards.length === 1 ? 'card' : 'cards'}`);
    setText('[data-deck-title]', deck.title);
    setText('[data-deck-dialog-title]', deck.title);
    setText('[data-deck-topic]', deck.topic);
    setText('[data-deck-description]', deck.description);
    root.querySelector('[data-deck-description]').hidden = !deck.description;
    setText('[data-deck-eyebrow]', deck.eyebrow);
    setText('[data-deck-front-label]', deck.front_label);
    setText('[data-deck-back-hint]', deck.back_hint);
    const completion = deck.completion;
    setText('[data-deck-complete-title]', completion.title);
    setText('[data-deck-complete-description]', completion.description);
    setText('[data-deck-highlight-label]', completion.highlight_label);
    setText('[data-deck-highlight-text]', completion.highlight);
    root.querySelector('[data-deck-highlight]').hidden = !completion.highlight;
    if (completion.link_url) {
      const url = new URL(completion.link_url);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid deck link');
      const link = root.querySelector('[data-deck-link]');
      link.href = url.href;
      link.textContent = completion.link_label;
      link.hidden = false;
    }
    return { root, deck };
  }

  async function loadDecks() {
    retry.hidden = true;
    status.textContent = 'Loading flash cards…';
    try {
      const response = await fetch(list.dataset.endpoint, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Flash cards unavailable');
      const data = await response.json();
      if (!Array.isArray(data.decks)) throw new Error('Invalid flash cards');
      const ids = new Set();
      const decks = data.decks.map(deck => createDeck(deck, ids));
      list.replaceChildren(...decks.map(({ root }) => root));
      routes = decks.map(({ root, deck }) => initializeDeck(root, deck));
      status.textContent = decks.length ? '' : 'No flash card decks published yet. Check back soon.';
      syncRoutes();
    } catch {
      status.textContent = 'Flash cards are temporarily unavailable. Please try again.';
      retry.hidden = false;
    }
  }
  retry.addEventListener('click', loadDecks);
  loadDecks();

  function initializeDeck(root, deck) {
    const dialog = root.querySelector('[data-oom-dialog]');
    const opener = root.querySelector('[data-oom-open]');
    const deckHash = `#${dialog.id}`;
    const shareButton = root.querySelector('[data-oom-share]');
    const shareStatus = root.querySelector('[data-oom-share-status]');
    const shareFallback = root.querySelector('[data-oom-share-fallback]');
    const shareInput = root.querySelector('[data-oom-share-url]');
    let previousURL = location.pathname + location.search + (location.hash === deckHash ? '#oom-drill' : location.hash);
    let shareTimer;
    let backdropPointer = false;

    const outsideDialog = event => {
      const bounds = dialog.getBoundingClientRect();
      return event.clientX < bounds.left || event.clientX > bounds.right
        || event.clientY < bounds.top || event.clientY > bounds.bottom;
    };

    function openDialog() {
      if (dialog.open) return;
      dialog.showModal();
      document.documentElement.classList.add('oom-modal-open');
    }

    function syncRoute() {
      if (location.hash === deckHash) {
        if (!dialog.open) opener.scrollIntoView({ behavior: 'instant', block: 'center' });
        openDialog();
      } else if (dialog.open) {
        dialog.close();
      }
    }

    opener.addEventListener('click', event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (location.hash !== deckHash) {
        previousURL = location.pathname + location.search + location.hash;
        history.pushState(history.state, '', deckHash);
      }
      openDialog();
    });
    root.querySelector('[data-oom-close]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      if (dialog.open) return;
      const anotherDeckOpen = Boolean(list.querySelector('dialog[open]'));
      document.documentElement.classList.toggle('oom-modal-open', anotherDeckOpen);
      backdropPointer = false;
      if (location.hash === deckHash) history.replaceState(history.state, '', previousURL);
      clearTimeout(shareTimer);
      shareButton.textContent = 'Copy link';
      shareStatus.textContent = '';
      shareFallback.hidden = true;
      if (!anotherDeckOpen) opener.focus({ preventScroll: true });
    });

    shareButton.addEventListener('click', async () => {
      const url = new URL(location.href);
      url.hash = deckHash;
      let copied = false;
      try {
        await navigator.clipboard.writeText(url.href);
        copied = true;
      } catch {
        // Keep the fallback inside the modal so the browser can focus and select it.
        const field = document.createElement('textarea');
        field.value = url.href;
        field.setAttribute('readonly', '');
        field.className = 'oom-copy-field';
        dialog.append(field);
        field.select();
        try { copied = document.execCommand('copy'); } catch { copied = false; }
        field.remove();
        shareButton.focus({ preventScroll: true });
      }
      shareStatus.textContent = copied ? 'Flash card link copied.' : 'Select the link below to copy it.';
      shareButton.textContent = copied ? 'Link copied' : 'Copy link';
      shareFallback.hidden = copied;
      if (!copied) {
        shareInput.value = url.href;
        shareInput.focus({ preventScroll: true });
        shareInput.select();
      }
      clearTimeout(shareTimer);
      shareTimer = setTimeout(() => { shareButton.textContent = 'Copy link'; }, 2200);
    });
    dialog.addEventListener('pointerdown', event => {
      backdropPointer = event.target === dialog && outsideDialog(event);
    });
    dialog.addEventListener('click', event => {
      if (backdropPointer && event.target === dialog && outsideDialog(event)) dialog.close();
      backdropPointer = false;
    });
    dialog.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const controls = [...dialog.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]')]
        .filter(control => control.getClientRects().length && !control.closest('[inert]'));
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    const cards = deck.cards;

    const stage = root.querySelector('[data-oom-stage]');
    const finish = root.querySelector('[data-oom-finish]');
    const cardButton = root.querySelector('[data-oom-card]');
    const cardInner = cardButton.querySelector('.oom-card-inner');
    const front = root.querySelector('[data-oom-front]');
    const back = root.querySelector('[data-oom-back]');
    const kicker = root.querySelector('[data-oom-kicker]');
    const backKicker = root.querySelector('[data-oom-kicker-back]');
    const prompt = root.querySelector('[data-oom-question]');
    const context = root.querySelector('[data-oom-context]');
    const answerTitle = root.querySelector('[data-oom-answer-title]');
    const answer = root.querySelector('[data-oom-answer]');
    const step = root.querySelector('[data-oom-step]');
    const revealedLabel = root.querySelector('[data-oom-revealed]');
    const previous = root.querySelector('[data-oom-prev]');
    const next = root.querySelector('[data-oom-next]');
    const flipButton = root.querySelector('[data-oom-flip]');
    const flipLabel = root.querySelector('[data-oom-flip-label]');
    const markers = root.querySelector('[data-oom-markers]');
    const revealed = new Set();
    let current = 0;
    let flipped = false;

    const markerButtons = cards.map((card, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = String(index + 1).padStart(2, '0');
      button.addEventListener('click', () => goToCard(index));
      markers.append(button);
      return button;
    });

    function updateMarkers() {
      markerButtons.forEach((button, index) => {
        button.classList.toggle('is-revealed', revealed.has(index));
        button.setAttribute('aria-label', `Card ${index + 1}: ${cards[index].kicker || cards[index].prompt}${revealed.has(index) ? ', revealed' : ''}`);
        if (index === current) button.setAttribute('aria-current', 'step');
        else button.removeAttribute('aria-current');
      });
      revealedLabel.textContent = `${revealed.size} of ${cards.length} revealed`;
    }

    function setFlipped(value) {
      flipped = value;
      cardButton.classList.toggle('is-flipped', flipped);
      cardButton.setAttribute('aria-pressed', String(flipped));
      cardButton.setAttribute('aria-label', flipped
        ? `${cards[current].title}. ${cards[current].answer} Flip back to the prompt.`
        : `Card ${current + 1} of ${cards.length}. ${cards[current].prompt} ${cards[current].context} Flip to reveal the explanation.`);
      front.setAttribute('aria-hidden', String(flipped));
      back.setAttribute('aria-hidden', String(!flipped));
      front.inert = flipped;
      back.inert = !flipped;
      flipButton.setAttribute('aria-pressed', String(flipped));
      flipLabel.textContent = flipped ? 'Turn back' : 'Flip card';
      if (flipped) revealed.add(current);
      updateMarkers();
    }

    function renderCard() {
      const card = cards[current];
      // Change cards on their front face without rotating the old answer into view.
      cardButton.classList.add('is-changing');
      root.querySelectorAll('[data-oom-card-number]').forEach(label => {
        label.textContent = `${String(current + 1).padStart(2, '0')} / ${String(cards.length).padStart(2, '0')}`;
      });
      step.textContent = `Card ${current + 1} of ${cards.length}`;
      kicker.textContent = card.kicker || `${String(current + 1).padStart(2, '0')} / STUDY CARD`;
      backKicker.textContent = kicker.textContent;
      prompt.textContent = card.prompt;
      context.textContent = card.context;
      answerTitle.textContent = card.title;
      answer.textContent = card.answer;
      previous.disabled = current === 0;
      root.querySelector('[data-oom-next-label]').textContent = current === cards.length - 1 ? 'Finish deck' : 'Next card';
      setFlipped(false);
      // Commit the unanimated front face before enabling the next manual flip.
      void cardInner.offsetWidth;
      cardButton.classList.remove('is-changing');
    }

    function reset() {
      current = 0;
      revealed.clear();
      finish.hidden = true;
      stage.hidden = false;
      renderCard();
      cardButton.focus({ preventScroll: true });
    }

    function goToCard(index) {
      if (index < 0 || index > cards.length) return;
      if (index === cards.length) {
        stage.hidden = true;
        finish.hidden = false;
        root.querySelector('[data-oom-replay]').focus({ preventScroll: true });
        return;
      }
      const hadCardFocus = document.activeElement === cardButton;
      current = index;
      renderCard();
      // A disabled Previous button must not keep keyboard focus after reaching card one.
      if (document.activeElement === previous && previous.disabled || hadCardFocus) {
        cardButton.focus({ preventScroll: true });
      }
    }

    cardButton.addEventListener('click', () => setFlipped(!flipped));
    flipButton.addEventListener('click', () => setFlipped(!flipped));
    previous.addEventListener('click', () => goToCard(current - 1));
    next.addEventListener('click', () => goToCard(current + 1));
    root.querySelector('[data-oom-replay]').addEventListener('click', reset);
    root.querySelector('[data-oom-reset]').addEventListener('click', reset);
    stage.addEventListener('keydown', event => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        goToCard(current + (event.key === 'ArrowRight' ? 1 : -1));
      }
    });

    renderCard();
    return syncRoute;
  }
})();

