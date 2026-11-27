// Game kit: shared building blocks so every game looks and behaves the same.
// Available to games as WorkGames.kit. Everything that listens to the page takes the game's
// ctx.signal so it is removed automatically when the player leaves the game.
//
//   kit.css(href)                          load a game stylesheet once (await it in mount)
//   kit.screen(root, ...children)          centred DOM layout below the top bar
//   kit.viewport(root, signal, opts)       canvas with a fixed-size world scaled to fit
//   kit.loop(signal, step)                 requestAnimationFrame loop, step(dt) in seconds
//   kit.keyboard(signal, onKey)            held-key tracking + keydown callback
//   kit.swipe(el, signal, onSwipe)         touch swipe → 'up' | 'down' | 'left' | 'right'
//   kit.onHide(signal, fn)                 tab hidden / window blurred (auto-pause)
//   kit.overlay(root)                      start / pause / game-over panel with options
//   kit.hud(root, items)                   score readouts in the top-right corner
//   kit.toast(root, text)                  short message
//   kit.best(storage, key, value, opts)    store a best score / time
//   kit.formatTime(seconds), kit.shuffle(array), kit.randInt(n)
(function (WG) {
  'use strict';
  const { h } = WG;

  // ---------------------------------------------------------------- assets
  const stylesheets = new Map();

  function css(href) {
    if (!stylesheets.has(href)) {
      stylesheets.set(
        href,
        new Promise((resolve) => {
          const link = h('link', { rel: 'stylesheet', href });
          link.addEventListener('load', resolve);
          link.addEventListener('error', () => {
            console.warn(`[WorkGames] Could not load ${href}`);
            resolve();
          });
          document.head.append(link);
        }),
      );
    }
    return stylesheets.get(href);
  }

  // ---------------------------------------------------------------- layout
  function screen(root, ...children) {
    const el = h('div', { class: 'kit-screen' }, ...children);
    root.append(el);
    return el;
  }

  /**
   * Canvas showing a fixed-size world (e.g. 960×540) scaled to fit below the top bar.
   * Call view.begin() at the start of each frame, then draw in world coordinates.
   */
  function viewport(root, signal, { width, height, insetTop = 56, padding = 12, background = '#000' }) {
    const canvas = h('canvas', { class: 'kit-canvas' });
    root.append(canvas);
    const ctx = canvas.getContext('2d');
    const view = { canvas, ctx, width, height, scale: 1, offsetX: 0, offsetY: 0, ratio: 1, cssWidth: 0, cssHeight: 0 };

    function resize() {
      view.ratio = Math.min(window.devicePixelRatio || 1, 2);
      view.cssWidth = canvas.clientWidth;
      view.cssHeight = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(view.cssWidth * view.ratio));
      canvas.height = Math.max(1, Math.round(view.cssHeight * view.ratio));
      const availableWidth = Math.max(1, view.cssWidth - padding * 2);
      const availableHeight = Math.max(1, view.cssHeight - insetTop - padding);
      view.scale = Math.min(availableWidth / width, availableHeight / height);
      view.offsetX = (view.cssWidth - width * view.scale) / 2;
      view.offsetY = insetTop + (availableHeight - height * view.scale) / 2;
    }

    view.begin = () => {
      ctx.setTransform(view.ratio, 0, 0, view.ratio, 0, 0);
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, view.cssWidth, view.cssHeight);
      const s = view.ratio * view.scale;
      ctx.setTransform(s, 0, 0, s, view.ratio * view.offsetX, view.ratio * view.offsetY);
    };

    /** Convert a pointer position (clientX/Y) to world coordinates. */
    view.toWorld = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      return { x: (clientX - rect.left - view.offsetX) / view.scale, y: (clientY - rect.top - view.offsetY) / view.scale };
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    signal.addEventListener('abort', () => observer.disconnect());
    resize();
    return view;
  }

  // ---------------------------------------------------------------- time & input
  function loop(signal, step) {
    let frame = 0;
    let last = 0;
    let running = false;
    function tick(now) {
      if (!running) return;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      step(dt, now);
      frame = requestAnimationFrame(tick);
    }
    const api = {
      start() {
        if (running || signal.aborted) return;
        running = true;
        last = performance.now();
        frame = requestAnimationFrame(tick);
      },
      stop() {
        running = false;
        cancelAnimationFrame(frame);
      },
      get running() {
        return running;
      },
    };
    signal.addEventListener('abort', api.stop);
    return api;
  }

  const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'PageUp', 'PageDown']);

  /**
   * Tracks held keys by event.code ('ArrowLeft', 'KeyA', 'Space'...). onKey(event) fires on
   * every keydown (check event.repeat to ignore auto-repeat). Keys typed into a focused button
   * are left alone so the overlay buttons keep working with Enter/Space.
   */
  function keyboard(signal, onKey) {
    const held = new Set();
    window.addEventListener(
      'keydown',
      (event) => {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        const target = event.target;
        if (target instanceof HTMLButtonElement && (event.code === 'Space' || event.code === 'Enter')) return;
        if (SCROLL_KEYS.has(event.code)) event.preventDefault();
        held.add(event.code);
        if (onKey) onKey(event);
      },
      { signal },
    );
    window.addEventListener('keyup', (event) => held.delete(event.code), { signal });
    window.addEventListener('blur', () => held.clear(), { signal });
    return {
      held,
      isDown: (...codes) => codes.some((code) => held.has(code)),
    };
  }

  function swipe(el, signal, onSwipe, threshold = 24) {
    let start = null;
    el.style.touchAction = 'none';
    el.addEventListener(
      'pointerdown',
      (event) => {
        if (event.pointerType !== 'mouse') start = { x: event.clientX, y: event.clientY };
      },
      { signal },
    );
    el.addEventListener(
      'pointerup',
      (event) => {
        if (!start) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        start = null;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return;
        onSwipe(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
      },
      { signal },
    );
    el.addEventListener('pointercancel', () => (start = null), { signal });
  }

  function onHide(signal, fn) {
    window.addEventListener('blur', fn, { signal });
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) fn();
      },
      { signal },
    );
  }

  // ---------------------------------------------------------------- UI
  /**
   * Modal panel inside the game area.
   *   overlay.show({
   *     kicker, title, text,                  // all optional
   *     stats: [['Score', 12], ['Best', 30]],
   *     options: [{ id: 'mode', label: 'Mode', value: 'cpu',
   *                 choices: [{ value: 'cpu', label: 'vs Computer' }, { value: '2p', label: '2 Players' }] }],
   *     buttons: [{ label: 'Play', primary: true, onClick(values) {} }, { label: 'Menu', onClick: ctx.exit }],
   *   })
   * onClick receives the chosen option values, e.g. { mode: 'cpu' }. The primary button is
   * focused, so Enter starts the game.
   */
  function overlay(root) {
    const panel = h('div', { class: 'kit-panel', role: 'dialog', 'aria-modal': 'false' });
    const el = h('div', { class: 'kit-overlay', hidden: true }, panel);
    root.append(el);

    function optionGroup({ id, label, choices, value }, values) {
      values[id] = choices.some((choice) => choice.value === value) ? value : choices[0].value;
      const group = h('div', { class: 'kit-seg', role: 'radiogroup', 'aria-label': label });
      for (const choice of choices) {
        const button = h(
          'button',
          {
            class: 'kit-seg__btn',
            type: 'button',
            role: 'radio',
            'aria-checked': String(choice.value === values[id]),
            onclick: () => {
              values[id] = choice.value;
              for (const other of group.children) other.setAttribute('aria-checked', String(other === button));
            },
          },
          choice.label,
        );
        group.append(button);
      }
      return h('div', { class: 'kit-option' }, h('span', { class: 'kit-option__label' }, label), group);
    }

    const api = {
      el,
      get visible() {
        return !el.hidden;
      },
      show({ kicker, title, text, stats, options, buttons = [] }) {
        const values = {};
        const parts = [
          kicker && h('p', { class: 'kit-kicker' }, kicker),
          title && h('h2', { class: 'kit-title' }, title),
          text && h('p', { class: 'kit-text' }, text),
          stats &&
            stats.length > 0 &&
            h(
              'dl',
              { class: 'kit-stats' },
              stats.map(([label, value]) => h('div', { class: 'kit-stat' }, h('dt', {}, label), h('dd', {}, value))),
            ),
          options && options.length > 0 && h('div', { class: 'kit-options' }, options.map((option) => optionGroup(option, values))),
          buttons.length > 0 &&
            h(
              'div',
              { class: 'kit-buttons' },
              buttons.map((button) =>
                h(
                  'button',
                  {
                    class: `btn ${button.primary ? 'btn--primary' : 'btn--secondary'} kit-btn`,
                    type: 'button',
                    onclick: () => button.onClick && button.onClick({ ...values }),
                  },
                  button.label,
                ),
              ),
            ),
        ];
        panel.replaceChildren(...parts.filter((part) => part instanceof Node));
        el.hidden = false;
        const focusTarget = panel.querySelector('.btn--primary') || panel.querySelector('button');
        if (focusTarget) focusTarget.focus({ preventScroll: true });
      },
      hide() {
        if (el.hidden) return;
        el.hidden = true;
        if (el.contains(document.activeElement) || document.activeElement === document.body) {
          root.focus({ preventScroll: true });
        }
      },
    };
    return api;
  }

  /** Readouts in the top-right corner: hud(root, [{ id: 'score', label: 'Score' }]).set('score', 5) */
  function hud(root, items) {
    const values = {};
    const el = h(
      'div',
      { class: 'kit-hud', 'aria-live': 'off' },
      items.map(({ id, label, value = '0' }) => {
        values[id] = h('span', { class: 'kit-hud__value' }, value);
        return h('div', { class: 'kit-hud__item' }, h('span', { class: 'kit-hud__label' }, label), values[id]);
      }),
    );
    root.append(el);
    return {
      el,
      set(id, value) {
        if (values[id]) values[id].textContent = String(value);
      },
    };
  }

  function toast(root, text, ms = 1400) {
    const el = h('div', { class: 'kit-toast', role: 'status' }, text);
    root.append(el);
    setTimeout(() => el.classList.add('is-leaving'), ms);
    setTimeout(() => el.remove(), ms + 300);
  }

  // ---------------------------------------------------------------- helpers
  /** Save value under key if it beats the stored one. Returns { best, isNew }. */
  function best(storage, key, value, { lowerIsBetter = false } = {}) {
    const previous = storage.get(key, null);
    const isNew = previous == null || (lowerIsBetter ? value < previous : value > previous);
    if (isNew) storage.set(key, value);
    return { best: isNew ? value : previous, isNew };
  }

  function formatTime(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    const m = Math.floor(total / 60);
    const s = String(total % 60).padStart(2, '0');
    return `${m}:${s}`;
  }

  function randInt(n) {
    return Math.floor(Math.random() * n);
  }

  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  WG.kit = { css, screen, viewport, loop, keyboard, swipe, onHide, overlay, hud, toast, best, formatTime, randInt, shuffle };
})(window.WorkGames);
