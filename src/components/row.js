// Horizontally scrolling rows of game tiles.
(function (WG) {
  'use strict';
  const { h, icon } = WG;

  /** A single 16:9 cover tile. Click opens details; hovering (desktop) opens the preview card. */
  function createTile(game, preview) {
    const tile = h(
      'button',
      { class: 'tile', type: 'button', 'aria-label': game.title, onclick: () => WG.details.open(game) },
      WG.coverImg(game, { loading: 'lazy' }),
      h('span', { class: 'tile__title', 'aria-hidden': 'true' }, game.title),
      game.isNew && h('span', { class: 'tile__badge' }, 'New'),
    );
    preview.bind(tile, game);
    return tile;
  }

  /** "Top 5" tile: large outlined numeral with a portrait crop of the cover beside it. */
  function createRankedTile(game, rank, preview) {
    const poster = h(
      'span',
      { class: 'rank__poster' },
      WG.coverImg(game, { loading: 'lazy' }),
      h('span', { class: 'tile__title', 'aria-hidden': 'true' }, game.title),
    );
    const tile = h(
      'button',
      { class: 'rank', type: 'button', 'aria-label': `Number ${rank}: ${game.title}`, onclick: () => WG.details.open(game) },
      h('span', { class: 'rank__num', 'aria-hidden': 'true' }, String(rank)),
      poster,
    );
    preview.bind(poster, game, { sizeFrom: tile });
    return tile;
  }

  /**
   * Row with paging arrows and a page indicator.
   * Returns { id, el, setGames(games), destroy() }.
   */
  function createRow({ id, title, games, variant }, preview) {
    const titleId = `row-${id}-title`;
    const track = h('ul', { class: 'row__track' });
    const prev = h(
      'button',
      { class: 'row__arrow row__arrow--prev', type: 'button', 'aria-label': `Scroll ${title} left`, hidden: true },
      icon('chevronLeft'),
    );
    const next = h(
      'button',
      { class: 'row__arrow row__arrow--next', type: 'button', 'aria-label': `Scroll ${title} right`, hidden: true },
      icon('chevronRight'),
    );
    const pager = h('div', { class: 'row__pager', 'aria-hidden': 'true' });

    const el = h(
      'section',
      { class: `row${variant ? ` row--${variant}` : ''}`, id: `row-${id}`, 'aria-labelledby': titleId },
      h('div', { class: 'row__header' }, h('h2', { class: 'row__title', id: titleId }, title), pager),
      h('div', { class: 'row__viewport' }, prev, track, next),
    );

    // Width of one "page" of tiles: the visible area between the gutters plus one gap.
    function pageWidth() {
      const style = getComputedStyle(track);
      return (
        track.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) + (parseFloat(style.columnGap) || 0)
      );
    }

    let pageCount = 0;
    function update() {
      const max = track.scrollWidth - track.clientWidth;
      const pos = track.scrollLeft;
      prev.hidden = pos <= 2;
      next.hidden = pos >= max - 2;

      const width = pageWidth();
      const pages = max > 2 && width > 0 ? Math.ceil((max - 2) / width) + 1 : 1;
      const active = pos >= max - 2 ? pages - 1 : Math.round(pos / width);
      if (pages !== pageCount) {
        pageCount = pages;
        pager.replaceChildren(...(pages > 1 ? Array.from({ length: pages }, () => h('span')) : []));
      }
      [...pager.children].forEach((dash, index) => dash.classList.toggle('is-active', index === active));
    }

    let frame = 0;
    track.addEventListener(
      'scroll',
      () => {
        preview.close(true);
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(update);
      },
      { passive: true },
    );
    prev.addEventListener('click', () => track.scrollBy({ left: -pageWidth(), behavior: 'smooth' }));
    next.addEventListener('click', () => track.scrollBy({ left: pageWidth(), behavior: 'smooth' }));

    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(track);

    function setGames(list) {
      track.replaceChildren(
        ...list.map((game, index) =>
          h(
            'li',
            { class: 'row__item' },
            variant === 'ranked' ? createRankedTile(game, index + 1, preview) : createTile(game, preview),
          ),
        ),
      );
      el.hidden = list.length === 0;
      update();
    }

    setGames(games);

    return {
      id,
      el,
      setGames,
      destroy() {
        resizeObserver.disconnect();
        cancelAnimationFrame(frame);
      },
    };
  }

  WG.createTile = createTile;
  WG.createRow = createRow;
})(window.WorkGames);
