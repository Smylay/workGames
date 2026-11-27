// Hover preview card that grows out of a tile. It is rendered in <body>, not inside the row,
// so the row's horizontal scroll container never clips it. Mouse/trackpad devices only.
(function (WG) {
  'use strict';
  const { h, icon } = WG;

  const HOVER_DELAY = 450; // ms the pointer must rest on a tile before the card opens
  const SCALE = 1.5; // card width relative to the tile
  const EDGE = 8; // min distance from the viewport edge
  const CLOSE_MS = 220;

  function createPreviewController() {
    const enabled = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    let timer = 0;
    let current = null;

    const onResize = () => close(true);
    window.addEventListener('resize', onResize);

    /** sizeFrom: element whose width sets the card size (defaults to the anchor). */
    function bind(anchor, game, options) {
      if (!enabled) return;
      const sizeFrom = (options && options.sizeFrom) || anchor;
      anchor.addEventListener('mouseenter', () => {
        clearTimeout(timer);
        timer = setTimeout(() => open(anchor, game, sizeFrom), HOVER_DELAY);
      });
      anchor.addEventListener('mouseleave', () => clearTimeout(timer));
      anchor.addEventListener('click', () => clearTimeout(timer));
    }

    function open(anchor, game, sizeFrom) {
      if (!anchor.isConnected) return;
      close(true);

      const rect = anchor.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const width = Math.min(sizeFrom.getBoundingClientRect().width * SCALE, viewportWidth - EDGE * 2);
      const artHeight = (width * 9) / 16;

      // Centre over the tile, but pin to the tile's edge when that would leave the viewport.
      let left = rect.left + rect.width / 2 - width / 2;
      left = Math.max(EDGE, Math.min(left, viewportWidth - EDGE - width));
      const top = Math.max(EDGE, rect.top + rect.height / 2 - artHeight / 2);

      // Transform origin that makes scale(s) map the card's art exactly onto the tile.
      const scale = Math.min(rect.width / width, 0.99);
      const originX = (rect.left - left) / (1 - scale);
      const originY = (rect.top + (rect.height - artHeight * scale) / 2 - top) / (1 - scale);

      const genre = WG.catalog.genreOf(game);
      const { listButton, metaLine, playCircleButton } = WG.buttons;
      const card = h(
        'div',
        { class: 'preview', role: 'group', 'aria-label': `${game.title} preview` },
        h(
          'div',
          { class: 'preview__art', onclick: () => showDetails(game) },
          WG.coverImg(game),
          h('span', { class: 'preview__title' }, game.title),
        ),
        h(
          'div',
          { class: 'preview__body' },
          h(
            'div',
            { class: 'preview__actions' },
            playCircleButton(game, () => close(true)),
            listButton(game),
            h(
              'button',
              {
                class: 'circle-btn circle-btn--more',
                type: 'button',
                'aria-label': `More info about ${game.title}`,
                title: 'More info',
                onclick: () => showDetails(game),
              },
              icon('chevronDown'),
            ),
          ),
          metaLine(game, 'preview__meta'),
          h(
            'ul',
            { class: 'preview__tags' },
            [genre && genre.label, ...game.tags].filter(Boolean).map((tag) => h('li', {}, tag)),
          ),
        ),
      );

      Object.assign(card.style, {
        width: `${width}px`,
        left: `${left + window.scrollX}px`,
        top: `${top + window.scrollY}px`,
        transformOrigin: `${originX}px ${originY}px`,
        transform: `scale(${scale})`,
      });
      card.dataset.scale = String(scale);
      card.addEventListener('mouseleave', () => close());

      document.body.append(card);
      card.getBoundingClientRect(); // commit the start state so the transition runs
      card.classList.add('is-open');
      card.style.transform = 'none';
      current = card;
    }

    function showDetails(game) {
      close(true);
      WG.details.open(game);
    }

    function close(immediate = false) {
      clearTimeout(timer);
      if (!current) return;
      const card = current;
      current = null;
      if (immediate) {
        card.remove();
        return;
      }
      card.classList.remove('is-open');
      card.classList.add('is-closing');
      card.style.transform = `scale(${card.dataset.scale})`;
      setTimeout(() => card.remove(), CLOSE_MS);
    }

    return {
      bind,
      close,
      destroy() {
        close(true);
        window.removeEventListener('resize', onResize);
      },
    };
  }

  WG.createPreviewController = createPreviewController;
})(window.WorkGames);
