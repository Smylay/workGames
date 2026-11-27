// Small persistence layer over localStorage. Every access is wrapped because storage can
// be unavailable (private windows, locked-down browsers); the app must work without it.
(function (WG) {
  'use strict';

  const KEYS = {
    list: 'workgames:my-list',
    recent: 'workgames:recent',
  };
  const MAX_RECENT = 12;
  const listeners = new Set();

  function readArray(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage unavailable or full: keep running without persistence.
    }
  }

  function notify(change) {
    for (const listener of listeners) listener(change);
  }

  /** Subscribe to store changes. Returns an unsubscribe function. */
  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  const myList = {
    ids: () => readArray(KEYS.list),
    has: (id) => readArray(KEYS.list).includes(id),
    /** Adds or removes the game; returns true when it is now in the list. */
    toggle(id) {
      const ids = readArray(KEYS.list);
      const next = ids.includes(id) ? ids.filter((x) => x !== id) : [id, ...ids];
      write(KEYS.list, next);
      notify({ type: 'list', id });
      return next.includes(id);
    },
  };

  const recent = {
    ids: () => readArray(KEYS.recent),
    add(id) {
      const next = [id, ...readArray(KEYS.recent).filter((x) => x !== id)].slice(0, MAX_RECENT);
      write(KEYS.recent, next);
      notify({ type: 'recent', id });
    },
  };

  /** Per-game key/value storage handed to games as ctx.storage (e.g. for high scores). */
  function gameStorage(gameId) {
    const prefix = `workgames:game:${gameId}:`;
    return Object.freeze({
      get(key, fallback = null) {
        try {
          const raw = localStorage.getItem(prefix + key);
          return raw == null ? fallback : JSON.parse(raw);
        } catch {
          return fallback;
        }
      },
      set(key, value) {
        write(prefix + key, value);
      },
      remove(key) {
        try {
          localStorage.removeItem(prefix + key);
        } catch {
          // ignore
        }
      },
    });
  }

  WG.store = { subscribe, myList, recent, gameStorage };
})(window.WorkGames);
