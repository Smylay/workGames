// Hash router (#/ and #/play/<id>). Hash URLs work from file:// with no server.
//
// A route is { pattern: RegExp, view(outlet, ...captures) => cleanup? }. The previous view's
// cleanup runs before the next view renders.
(function (WG) {
  'use strict';

  let outlet = null;
  let routes = [];
  let cleanup = null;
  let currentPath = null;
  let previousPath = null;

  function start(target, table) {
    outlet = target;
    routes = table;
    window.addEventListener('hashchange', render);
    render();
  }

  function hashPath() {
    let path;
    try {
      path = decodeURIComponent(location.hash.slice(1));
    } catch {
      path = '/';
    }
    return path.startsWith('/') ? path : `/${path}`;
  }

  function render() {
    const path = hashPath();
    let match = null;
    let route = null;
    for (const candidate of routes) {
      match = path.match(candidate.pattern);
      if (match) {
        route = candidate;
        break;
      }
    }
    if (!route) {
      location.replace('#/');
      return;
    }

    if (cleanup) {
      try {
        cleanup();
      } catch (error) {
        console.error('[WorkGames] View cleanup failed', error);
      }
      cleanup = null;
    }

    previousPath = currentPath;
    currentPath = path;
    outlet.replaceChildren();
    cleanup = route.view(outlet, ...match.slice(1)) || null;
  }

  function navigate(path) {
    location.hash = path;
  }

  function playGame(id) {
    navigate(`/play/${id}`);
  }

  /** Return to the menu: real history back when we came from it, otherwise replace. */
  function goHome() {
    if (previousPath === '/') history.back();
    else location.replace('#/');
  }

  WG.router = { start, navigate, playGame, goHome };
})(window.WorkGames);
