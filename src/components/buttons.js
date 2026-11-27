// Small shared UI pieces: My List toggle, round play button, meta line.
(function (WG) {
  'use strict';
  const { h, icon } = WG;

  /** Round "+ / ✓" button that toggles the game in My List. */
  function listButton(game, className = 'circle-btn') {
    const button = h('button', { class: className, type: 'button' });

    function sync(inList) {
      button.replaceChildren(icon(inList ? 'check' : 'plus'));
      button.setAttribute('aria-pressed', String(inList));
      button.setAttribute('aria-label', inList ? `Remove ${game.title} from My List` : `Add ${game.title} to My List`);
      button.title = inList ? 'Remove from My List' : 'Add to My List';
    }

    button.addEventListener('click', (event) => {
      event.stopPropagation();
      sync(WG.store.myList.toggle(game.id));
    });
    sync(WG.store.myList.has(game.id));
    return button;
  }

  /** Round white play button. `before` runs first (e.g. to close an overlay). */
  function playCircleButton(game, before) {
    return h(
      'button',
      {
        class: 'circle-btn circle-btn--play',
        type: 'button',
        'aria-label': `Play ${game.title}`,
        title: 'Play',
        onclick: (event) => {
          event.stopPropagation();
          if (before) before();
          WG.router.playGame(game.id);
        },
      },
      icon('play'),
    );
  }

  /** "New · 2–5 min · [1 Player]" line used by previews and the details modal. */
  function metaLine(game, className) {
    return h(
      'div',
      { class: className },
      game.isNew && h('span', { class: 'meta-new' }, 'New'),
      game.playtime && h('span', {}, game.playtime),
      game.players && h('span', { class: 'meta-box' }, game.players),
    );
  }

  WG.buttons = { listButton, playCircleButton, metaLine };
})(window.WorkGames);
