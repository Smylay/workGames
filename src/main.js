// Entry point. Runs last (see the script order in index.html).
(function (WG) {
  'use strict';

  // The home view restores its own scroll position when you come back from a game.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  WG.router.start(document.getElementById('app'), [
    { pattern: /^\/$/, view: WG.renderHome },
    { pattern: /^\/play\/([a-z0-9-]+)$/, view: WG.renderPlayer },
  ]);
})(window.WorkGames);
