// Full-bleed billboard for the featured game.
(function (WG) {
  'use strict';
  const { h, icon } = WG;

  function createHero(game) {
    return h(
      'section',
      { class: 'hero', 'aria-label': 'Featured game' },
      WG.coverImg(game, { class: 'hero__art', fetchpriority: 'high' }),
      h(
        'div',
        { class: 'hero__content' },
        h('div', { class: 'hero__kicker' }, h('span', { class: 'hero__kicker-mark' }, 'W'), 'Game'),
        h('h1', { class: 'hero__title' }, game.title),
        h('p', { class: 'hero__desc' }, game.description),
        h(
          'div',
          { class: 'hero__actions' },
          h('button', { class: 'btn btn--primary', type: 'button', onclick: () => WG.router.playGame(game.id) }, icon('play'), 'Play'),
          h('button', { class: 'btn btn--secondary', type: 'button', onclick: () => WG.details.open(game) }, icon('info'), 'More Info'),
        ),
      ),
      h('div', { class: 'hero__rating' }, 'All ages'),
    );
  }

  WG.createHero = createHero;
})(window.WorkGames);
