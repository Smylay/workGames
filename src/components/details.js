// Details modal. One at a time; opening another game swaps the content in place.
(function (WG) {
  'use strict';
  const { h, icon } = WG;

  let state = null;

  function open(game) {
    if (!state) {
      const panel = h('div', { class: 'details', role: 'dialog', 'aria-modal': 'true', tabindex: '-1' });
      const backdrop = h('div', { class: 'details-backdrop' }, panel);
      backdrop.addEventListener('mousedown', (event) => {
        if (event.target === backdrop) close();
      });
      const onKeyDown = (event) => {
        if (event.key === 'Escape') close();
        else if (event.key === 'Tab') trapFocus(event, panel);
      };
      document.addEventListener('keydown', onKeyDown);
      document.body.classList.add('is-locked');
      document.body.append(backdrop);
      state = { backdrop, panel, onKeyDown, returnFocus: document.activeElement };
    }
    render(game);
  }

  function close() {
    if (!state) return;
    const { backdrop, onKeyDown, returnFocus } = state;
    state = null;
    document.removeEventListener('keydown', onKeyDown);
    document.body.classList.remove('is-locked');
    backdrop.remove();
    if (returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
  }

  function play(game) {
    close();
    WG.router.playGame(game.id);
  }

  function render(game) {
    const { panel, backdrop } = state;
    const { listButton, metaLine } = WG.buttons;
    const titleId = `details-title-${game.id}`;
    const genre = WG.catalog.genreOf(game);
    const similar = WG.catalog.similarTo(game);
    const closeButton = h('button', { class: 'details__close', type: 'button', 'aria-label': 'Close', onclick: close }, icon('close'));

    panel.setAttribute('aria-labelledby', titleId);
    panel.replaceChildren(
      closeButton,
      h(
        'div',
        { class: 'details__hero' },
        WG.coverImg(game),
        h(
          'div',
          { class: 'details__hero-content' },
          h('h2', { class: 'details__title', id: titleId }, game.title),
          h(
            'div',
            { class: 'details__actions' },
            h('button', { class: 'btn btn--primary', type: 'button', onclick: () => play(game) }, icon('play'), 'Play'),
            listButton(game, 'circle-btn circle-btn--lg'),
          ),
        ),
      ),
      h(
        'div',
        { class: 'details__body' },
        h(
          'div',
          { class: 'details__info' },
          h('div', {}, metaLine(game, 'details__meta'), h('p', { class: 'details__desc' }, game.description)),
          h(
            'dl',
            { class: 'details__facts' },
            fact('Genre', [genre && genre.label, ...game.tags].filter(Boolean).join(', ')),
            fact('Controls', game.controls),
            fact('Players', game.players),
          ),
        ),
        similar.length > 0 && [
          h('h3', { class: 'details__section-title' }, 'More Like This'),
          h('ul', { class: 'similar' }, similar.map((other) => h('li', {}, similarCard(other)))),
        ],
      ),
    );

    backdrop.scrollTop = 0;
    closeButton.focus({ preventScroll: true });
  }

  function fact(label, value) {
    if (!value) return null;
    return h('div', { class: 'details__fact' }, h('dt', {}, `${label}:`), h('dd', {}, value));
  }

  function similarCard(game) {
    const { listButton, metaLine } = WG.buttons;
    return h(
      'article',
      { class: 'similar__card' },
      h(
        'button',
        { class: 'similar__art', type: 'button', 'aria-label': `Play ${game.title}`, onclick: () => play(game) },
        WG.coverImg(game, { loading: 'lazy' }),
        h('span', { class: 'similar__title', 'aria-hidden': 'true' }, game.title),
        h('span', { class: 'similar__play', 'aria-hidden': 'true' }, icon('play')),
      ),
      h(
        'div',
        { class: 'similar__body' },
        h('div', { class: 'similar__head' }, metaLine(game, 'similar__meta'), listButton(game)),
        h('p', { class: 'similar__desc' }, game.description),
      ),
    );
  }

  function trapFocus(event, container) {
    const focusable = [...container.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])')].filter(
      (el) => !el.disabled && el.offsetParent !== null,
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!container.contains(document.activeElement)) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  WG.details = { open, close };
})(window.WorkGames);
