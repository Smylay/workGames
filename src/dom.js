// Shared namespace + tiny DOM helpers.
//
// Every script in this app is a plain (non-module) script that adds itself to
// window.WorkGames. That is deliberate: ES modules refuse to load from file://, and this app
// must work by simply opening index.html from disk, with no server, no Node and no network.
// Scripts are loaded in order by index.html.
(function (WG) {
  'use strict';

  /**
   * Create an element.
   *   h('button', { class: 'btn', onclick: fn, 'aria-label': 'Play' }, icon('play'), 'Play')
   * Props: `class`, `on<event>` listeners (lowercase, e.g. onclick), everything else becomes an
   * attribute (true → present, false/null/undefined → omitted).
   * Children: nodes, strings, numbers or nested arrays; null/false/true are skipped.
   */
  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    if (props) {
      for (const [key, value] of Object.entries(props)) {
        if (value == null || value === false) continue;
        if (key === 'class') el.className = value;
        else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
        else el.setAttribute(key, value === true ? '' : String(value));
      }
    }
    appendChildren(el, children);
    return el;
  }

  function appendChildren(parent, children) {
    for (const child of children) {
      if (child == null || child === false || child === true) continue;
      if (Array.isArray(child)) appendChildren(parent, child);
      else parent.append(child instanceof Node ? child : String(child));
    }
  }

  /** Cover image that hides itself if the file is missing (the tile title still shows). */
  function coverImg(game, attrs) {
    return h('img', {
      src: game.cover,
      alt: '',
      draggable: 'false',
      decoding: 'async',
      onerror: (event) => event.target.classList.add('is-missing'),
      ...attrs,
    });
  }

  const STROKE = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

  const ICONS = {
    play: '<path fill="currentColor" d="M7 4.6v14.8a1 1 0 0 0 1.52.85l12.2-7.4a1 1 0 0 0 0-1.7L8.52 3.75A1 1 0 0 0 7 4.6z"/>',
    info: `<circle cx="12" cy="12" r="9.5" ${STROKE}/><path ${STROKE} stroke-width="2.4" d="M12 11v5.5M12 7.6v.01"/>`,
    plus: `<path ${STROKE} d="M12 5v14M5 12h14"/>`,
    check: `<path ${STROKE} d="M5 12.5l4.5 4.5L19 7.5"/>`,
    chevronDown: `<path ${STROKE} d="M6 9.5l6 6 6-6"/>`,
    chevronLeft: `<path ${STROKE} d="M15 5l-7 7 7 7"/>`,
    chevronRight: `<path ${STROKE} d="M9 5l7 7-7 7"/>`,
    close: `<path ${STROKE} d="M6 6l12 12M18 6L6 18"/>`,
    search: `<circle cx="10.5" cy="10.5" r="6.5" ${STROKE}/><path ${STROKE} d="M15.5 15.5L21 21"/>`,
    back: `<path ${STROKE} d="M20 12H5M11 5l-7 7 7 7"/>`,
  };

  /** Inline SVG icon sized to 1em and coloured with currentColor. */
  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('class', 'icon');
    svg.innerHTML = ICONS[name] || '';
    return svg;
  }

  WG.h = h;
  WG.icon = icon;
  WG.coverImg = coverImg;
})((window.WorkGames = window.WorkGames || {}));
