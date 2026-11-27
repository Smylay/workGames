// Full-screen game host and the game registration API.
//
// Each game lives in games/<id>/game.js, a plain script that calls
//   WorkGames.registerGame('<id>', { mount(root, ctx) { ... return cleanup; } });
// The script is loaded the first time the game is played (a <script> tag, which works from
// file://), then mount() is called with:
//   root          an empty element filling the screen; render the game into it
//   ctx.game      the registry entry (title, description, ...)
//   ctx.exit()    go back to the menu
//   ctx.signal    AbortSignal aborted when the game closes: addEventListener(..., { signal })
//   ctx.storage   { get(key, fallback), set(key, value), remove(key) } saved per game
// mount may return a cleanup function (or a Promise of one); it runs when the game closes.
(function (WG) {
  'use strict';
  const { h, icon } = WG;

  const IDLE_MS = 3000; // hide the top bar after this long without mouse movement
  const definitions = new Map();
  const loading = new Map();

  function registerGame(id, definition) {
    if (!definition || typeof definition.mount !== 'function') {
      console.error(`[WorkGames] registerGame('${id}'): the second argument must be an object with a mount(root, ctx) function.`);
      return;
    }
    definitions.set(id, definition);
  }

  function loadDefinition(id) {
    if (definitions.has(id)) return Promise.resolve(definitions.get(id));
    if (!loading.has(id)) {
      const src = `games/${id}/game.js`;
      const promise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => {
          if (definitions.has(id)) resolve(definitions.get(id));
          else
            reject(
              new Error(
                `${src} loaded but did not call WorkGames.registerGame('${id}', { mount(root, ctx) { … } }).\n` +
                  'Check the id matches the folder name, and look in the browser console (F12) for script errors.',
              ),
            );
        };
        script.onerror = () => reject(new Error(`Could not load ${src}. Does the file exist?`));
        document.head.append(script);
      });
      loading.set(id, promise);
      promise.catch(() => loading.delete(id)); // allow a retry after fixing the file
    }
    return loading.get(id);
  }

  function renderPlayer(outlet, id) {
    const game = WG.catalog.getGame(id);
    if (!game) {
      location.replace('#/');
      return null;
    }

    document.title = `${game.title} · WorkGames`;
    WG.store.recent.add(game.id);

    const controller = new AbortController();
    const { signal } = controller;
    let disposed = false;
    let unmount = null;

    const stage = h('div', { class: 'player__stage', tabindex: '-1' });
    const bar = h(
      'div',
      { class: 'player__bar' },
      h(
        'button',
        { class: 'player__back', type: 'button', 'aria-label': 'Back to menu', title: 'Back to menu', onclick: WG.router.goHome },
        icon('back'),
      ),
      h('span', { class: 'player__title' }, game.title),
    );
    const root = h('div', { class: 'player' }, bar, stage);
    outlet.append(root);

    // Auto-hiding top bar, like a video player.
    let idleTimer = 0;
    const wake = () => {
      root.classList.remove('player--idle');
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => root.classList.add('player--idle'), IDLE_MS);
    };
    root.addEventListener('mousemove', wake, { signal });
    wake();

    const ctx = Object.freeze({ game, exit: WG.router.goHome, signal, storage: WG.store.gameStorage(game.id) });

    loadDefinition(game.id)
      .then((definition) => {
        if (disposed) return null;
        return Promise.resolve(definition.mount(stage, ctx)).then((result) => {
          if (typeof result === 'function') {
            if (disposed) result();
            else unmount = result;
          }
          if (!disposed && !stage.contains(document.activeElement)) stage.focus({ preventScroll: true });
        });
      })
      .catch((error) => {
        console.error(`[WorkGames] Failed to start "${game.id}"`, error);
        if (!disposed) stage.replaceChildren(errorPanel(game, error));
      });

    return () => {
      disposed = true;
      clearTimeout(idleTimer);
      controller.abort();
      try {
        if (unmount) unmount();
      } catch (error) {
        console.error(`[WorkGames] Cleanup for "${game.id}" failed`, error);
      }
    };
  }

  function errorPanel(game, error) {
    return h(
      'div',
      { class: 'player__error', role: 'alert' },
      h('h2', {}, `${game.title} failed to load`),
      h('pre', {}, String((error && error.message) || error)),
      h('button', { class: 'btn btn--primary', type: 'button', onclick: WG.router.goHome }, icon('back'), 'Back to menu'),
    );
  }

  WG.registerGame = registerGame;
  WG.renderPlayer = renderPlayer;
})(window.WorkGames);
