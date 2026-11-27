// Memory Match: flip two cards at a time and find every pair.
WorkGames.registerGame('memory-match', {
  async mount(root, { signal, storage, exit }) {
    const kit = WorkGames.kit;
    const { h } = WorkGames;
    await kit.css('games/memory-match/style.css');

    const SIZES = {
      small: { cols: 4, rows: 3, label: 'Small · 6 pairs' },
      medium: { cols: 4, rows: 4, label: 'Medium · 8 pairs' },
      large: { cols: 6, rows: 4, label: 'Large · 12 pairs' },
    };
    const MISMATCH_MS = 850;

    // 12 original icons (24×24 viewBox).
    const ICONS = {
      star: ['#ffd60a', '<path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z"/>'],
      heart: ['#ff4d6d', '<path d="M12 21s-7.6-4.6-9.6-9.4C.9 8 3.2 4 7 4c2.1 0 3.6 1.2 5 3 1.4-1.8 2.9-3 5-3 3.8 0 6.1 4 4.6 7.6C19.6 16.4 12 21 12 21z"/>'],
      moon: ['#6c63ff', '<path d="M20.5 14.5A9 9 0 0 1 9.5 3.5a9 9 0 1 0 11 11z"/>'],
      bolt: ['#ffb703', '<path d="M13.5 2L4 14h7l-1.5 8L19 10h-7z"/>'],
      gem: ['#4cc9f0', '<path d="M7 3h10l4 6-9 12L3 9z"/><path d="M3 9h18M12 21L8.5 9 12 3l3.5 6z" fill="none" stroke="#0b3a4a" stroke-width="1" opacity=".5"/>'],
      drop: ['#3a86ff', '<path d="M12 2.5c3.6 5 7 8.4 7 12a7 7 0 0 1-14 0c0-3.6 3.4-7 7-12z"/>'],
      leaf: ['#52b788', '<path d="M20.5 3.5C9.5 3.5 4 8.5 4 15.5c0 1.6.3 3 .9 4.2C6.5 14 10.5 10.5 16 8.5c-5 3-8.5 7.2-9.6 12.4 1 .4 2.1.6 3.1.6 7 0 11-6 11-18z"/>'],
      sun: ['#ff9e00', '<circle cx="12" cy="12" r="5"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1" stroke="#ff9e00" stroke-width="2.2" stroke-linecap="round"/>'],
      note: ['#f72585', '<path d="M9 18.2a3.2 3.2 0 1 1-2-3V5.2L20 3v12.2a3.2 3.2 0 1 1-2-3V7.5l-9 1.6z"/>'],
      crown: ['#d4a017', '<path d="M3 17.5L2 7l5.5 4.5L12 4l4.5 7.5L22 7l-1 10.5z"/><rect x="3" y="19" width="18" height="2.5" rx="1"/>'],
      cloud: ['#64748b', '<path d="M7 19a5 5 0 0 1-.7-9.95A6.2 6.2 0 0 1 18.2 8.6 5.2 5.2 0 0 1 17.5 19z"/>'],
      flame: ['#ff6b35', '<path d="M12 2c1.2 4.2 6.5 6.4 6.5 12.3a6.5 6.5 0 0 1-13 0c0-3.2 1.6-5.4 3.3-7 .3 2.2 1.3 3.5 2.8 3.9C11 8 10.8 5 12 2z"/>'],
    };
    const ICON_IDS = Object.keys(ICONS);

    let prefs = { size: 'medium', ...storage.get('prefs', {}) };
    let deck = []; // [{ icon, el, matched, up }]
    let open = []; // indexes of face-up unmatched cards (max 2)
    let moves = 0;
    let pairsFound = 0;
    let elapsed = 0;
    let timing = false;
    let playing = false;
    let flipBackTimer = 0;

    const hud = kit.hud(root, [
      { id: 'pairs', label: 'Pairs', value: '0/0' },
      { id: 'moves', label: 'Moves' },
      { id: 'time', label: 'Time', value: '0:00' },
    ]);
    const board = h('div', { class: 'mm-board', role: 'grid', 'aria-label': 'Cards' });
    kit.screen(root, board);
    const overlay = kit.overlay(root);

    function iconSvg(id) {
      const [color, body] = ICONS[id];
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('fill', color);
      svg.innerHTML = body;
      return svg;
    }

    function deal(options) {
      if (options) {
        prefs = { ...prefs, ...options };
        storage.set('prefs', prefs);
      }
      clearTimeout(flipBackTimer);
      const { cols, rows } = SIZES[prefs.size];
      const pairs = (cols * rows) / 2;
      const icons = kit.shuffle(ICON_IDS.slice()).slice(0, pairs);
      const faces = kit.shuffle([...icons, ...icons]);

      board.style.setProperty('--cols', cols);
      board.style.setProperty('--rows', rows);
      deck = faces.map((icon, index) => {
        const el = h(
          'button',
          { class: 'mm-card', type: 'button', 'data-index': index, onclick: () => flip(index) },
          h(
            'span',
            { class: 'mm-card__inner' },
            h('span', { class: 'mm-card__face mm-card__back' }),
            h('span', { class: 'mm-card__face mm-card__front', 'data-icon': icon }, iconSvg(icon)),
          ),
        );
        return { icon, el, matched: false, up: false };
      });
      board.replaceChildren(...deck.map((card) => card.el));
      deck.forEach((card, i) => {
        card.el.tabIndex = i === 0 ? 0 : -1; // roving focus: arrow keys move between cards
        label(card, i);
      });

      open = [];
      moves = 0;
      pairsFound = 0;
      elapsed = 0;
      timing = false;
      playing = true;
      updateHud();
      overlay.hide();
      deck[0].el.focus({ preventScroll: true });
    }

    function label(card, index) {
      const state = card.matched ? `${card.icon}, matched` : card.up ? card.icon : 'face down';
      card.el.setAttribute('aria-label', `Card ${index + 1}: ${state}`);
    }

    function setUp(index, up) {
      const card = deck[index];
      card.up = up;
      card.el.classList.toggle('is-up', up);
      label(card, index);
    }

    function flip(index) {
      const card = deck[index];
      if (!playing || card.matched || card.up) return;
      // Clicking a third card while a wrong pair is showing flips that pair back immediately.
      if (open.length === 2) flipBack();
      timing = true;
      setUp(index, true);
      open.push(index);
      if (open.length < 2) return;

      moves += 1;
      const [a, b] = open;
      if (deck[a].icon === deck[b].icon) {
        for (const i of open) {
          deck[i].matched = true;
          deck[i].el.classList.add('is-matched');
          label(deck[i], i);
        }
        open = [];
        pairsFound += 1;
        if (pairsFound === deck.length / 2) finish();
      } else {
        for (const i of open) deck[i].el.classList.add('is-wrong');
        flipBackTimer = setTimeout(flipBack, MISMATCH_MS);
      }
      updateHud();
    }

    function flipBack() {
      clearTimeout(flipBackTimer);
      for (const i of open) {
        deck[i].el.classList.remove('is-wrong');
        setUp(i, false);
      }
      open = [];
    }

    function updateHud() {
      hud.set('pairs', `${pairsFound}/${deck.length / 2}`);
      hud.set('moves', moves);
      hud.set('time', kit.formatTime(elapsed));
    }

    function finish() {
      playing = false;
      timing = false;
      const fewest = kit.best(storage, `moves:${prefs.size}`, moves, { lowerIsBetter: true });
      const fastest = kit.best(storage, `time:${prefs.size}`, Math.floor(elapsed), { lowerIsBetter: true });
      setTimeout(() => {
        overlay.show({
          kicker: fewest.isNew || fastest.isNew ? 'New best!' : 'All pairs found',
          title: `${moves} moves`,
          stats: [
            ['Time', kit.formatTime(elapsed)],
            ['Fewest moves', fewest.best],
            ['Fastest', kit.formatTime(fastest.best)],
          ],
          options: sizeOption(),
          buttons: [
            { label: 'Play again', primary: true, onClick: deal },
            { label: 'Menu', onClick: exit },
          ],
        });
      }, 700);
    }

    function sizeOption() {
      return [
        {
          id: 'size',
          label: 'Board',
          value: prefs.size,
          choices: Object.entries(SIZES).map(([value, size]) => ({ value, label: size.label })),
        },
      ];
    }

    function pause() {
      if (!playing) return;
      const wasTiming = timing;
      timing = false;
      overlay.show({
        title: 'Paused',
        stats: [
          ['Moves', moves],
          ['Time', kit.formatTime(elapsed)],
        ],
        buttons: [
          {
            label: 'Resume',
            primary: true,
            onClick: () => {
              timing = wasTiming;
              overlay.hide();
            },
          },
          { label: 'New game', onClick: showStart },
          { label: 'Menu', onClick: exit },
        ],
      });
    }

    function showStart() {
      playing = false;
      timing = false;
      overlay.show({
        title: 'Memory Match',
        text: 'Flip two cards at a time to find matching pairs. Fewer moves is better. Click, or use the arrow keys and Enter.',
        options: sizeOption(),
        buttons: [
          { label: 'Play', primary: true, onClick: deal },
          { label: 'Menu', onClick: exit },
        ],
      });
    }

    // Arrow keys move focus around the grid.
    kit.keyboard(signal, (event) => {
      if (event.code === 'Escape') {
        if (!overlay.visible) pause();
        return;
      }
      if (overlay.visible || !deck.length) return;
      const moveBy = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.code];
      if (!moveBy) return;
      const { cols, rows } = SIZES[prefs.size];
      const current = Math.max(0, deck.findIndex((card) => card.el === document.activeElement));
      const col = Math.min(cols - 1, Math.max(0, (current % cols) + moveBy[0]));
      const row = Math.min(rows - 1, Math.max(0, Math.floor(current / cols) + moveBy[1]));
      const target = deck[row * cols + col];
      deck.forEach((card) => (card.el.tabIndex = card === target ? 0 : -1));
      target.el.focus({ preventScroll: true });
    });
    kit.onHide(signal, () => playing && !overlay.visible && pause());

    kit.loop(signal, (dt) => {
      if (!timing) return;
      elapsed += dt;
      hud.set('time', kit.formatTime(elapsed));
    }).start();

    deal(); // show a face-down board behind the start panel
    showStart();
    return () => clearTimeout(flipBackTimer);
  },
});
