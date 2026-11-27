// Placeholder used by games that are listed in the menu but not built yet:
//   WorkGames.registerGame('my-game', WorkGames.comingSoon());
// Replace that line with a real implementation (see games/_template/game.js).
(function (WG) {
  'use strict';
  const { h, icon } = WG;

  WG.comingSoon = function comingSoon() {
    return {
      mount(root, { game, exit }) {
        root.append(
          h(
            'div',
            { class: 'coming-soon' },
            h('img', { class: 'coming-soon__bg', src: game.cover, alt: '' }),
            h(
              'div',
              { class: 'coming-soon__content' },
              h('img', { class: 'coming-soon__art', src: game.cover, alt: '' }),
              h('p', { class: 'coming-soon__kicker' }, 'Coming soon'),
              h('h1', { class: 'coming-soon__title' }, game.title),
              h(
                'p',
                { class: 'coming-soon__text' },
                'This game is a placeholder. Build it in ',
                h('code', {}, `games/${game.id}/game.js`),
                ', starting from ',
                h('code', {}, 'games/_template/game.js'),
                '.',
              ),
              h('button', { class: 'btn btn--primary', type: 'button', onclick: exit }, icon('back'), 'Back to menu'),
            ),
          ),
        );
      },
    };
  };
})(window.WorkGames);
