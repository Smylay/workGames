// Mine Field: reveal every safe square without touching a mine. Numbers count the mines
// in the eight squares around them.
WorkGames.registerGame('mine-field', {
  async mount(root, { signal, storage, exit }) {
    const kit = WorkGames.kit;
    const { h } = WorkGames;
    await kit.css('games/mine-field/style.css');

    const LEVELS = {
      easy: { cols: 9, rows: 9, mines: 10, label: 'Easy · 9×9' },
      medium: { cols: 16, rows: 16, mines: 40, label: 'Medium · 16×16' },
      hard: { cols: 30, rows: 16, mines: 99, label: 'Hard · 30×16' },
    };
    const LONG_PRESS_MS = 420;
    const FLAG_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v18" stroke="#e8eef5" stroke-width="2.2" stroke-linecap="round"/><path d="M8 3.5l10 4.5-10 4.5z" fill="#ff3b30"/><path d="M4.5 21h7" stroke="#e8eef5" stroke-width="2.2" stroke-linecap="round"/></svg>';
    const MINE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><g stroke="#0b0f14" stroke-width="2.2" stroke-linecap="round"><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/></g><circle cx="12" cy="12" r="6" fill="#0b0f14"/><circle cx="10" cy="10" r="1.8" fill="#fff" opacity=".8"/></svg>';

    let prefs = { level: 'easy', ...storage.get('prefs', {}) };
    let level = LEVELS.easy;
    let cells = []; // { mine, adj, open, flag, wrong, el }
    let started = false;
    let finished = false;
    let flags = 0;
    let opened = 0;
    let elapsed = 0;
    let timing = false;
    let flagMode = false;
    let focusIndex = 0;

    const hud = kit.hud(root, [
      { id: 'mines', label: 'Mines left' },
      { id: 'time', label: 'Time', value: '0:00' },
    ]);
    const board = h('div', { class: 'mf-board', role: 'grid', 'aria-label': 'Mine field' });
    const modeBtn = h('button', { class: 'btn btn--secondary mf-mode', type: 'button', 'aria-pressed': 'false', onclick: () => setFlagMode(!flagMode) });
    const newBtn = h('button', { class: 'btn btn--secondary mf-mode', type: 'button', onclick: () => showStart() }, 'New game');
    const hint = h('p', { class: 'mf-hint' }, 'Click to dig · right-click (or long-press) to flag · click a number to clear around it · arrows + Enter / F');
    kit.screen(root, h('div', { class: 'mf' }, board, h('div', { class: 'mf-actions' }, modeBtn, newBtn), hint));
    const overlay = kit.overlay(root);

    // ---------------------------------------------------------------- board
    const rc = (i) => [Math.floor(i / level.cols), i % level.cols];
    function neighbours(i) {
      const [r, c] = rc(i);
      const out = [];
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < level.rows && nc >= 0 && nc < level.cols) out.push(nr * level.cols + nc);
        }
      }
      return out;
    }

    function build(options) {
      if (options) {
        prefs = { ...prefs, ...options };
        storage.set('prefs', prefs);
      }
      level = LEVELS[prefs.level];
      board.style.setProperty('--cols', level.cols);
      board.style.setProperty('--rows', level.rows);
      cells = Array.from({ length: level.cols * level.rows }, (_, i) => ({
        mine: false,
        adj: 0,
        open: false,
        flag: false,
        el: h('button', { class: 'mf-cell', type: 'button', 'data-i': i, tabindex: i === 0 ? '0' : '-1' }),
      }));
      board.replaceChildren(...cells.map((cell) => cell.el));
      cells.forEach((_, i) => label(i));
      started = false;
      finished = false;
      flags = 0;
      opened = 0;
      elapsed = 0;
      timing = false;
      focusIndex = 0;
      board.classList.remove('is-lost', 'is-won');
      setFlagMode(false);
      updateHud();
      overlay.hide();
    }

    /** Mines are placed after the first click so it (and its neighbours) are always safe. */
    function placeMines(safe) {
      const forbidden = new Set([safe, ...neighbours(safe)]);
      const spots = kit.shuffle(cells.map((_, i) => i).filter((i) => !forbidden.has(i)));
      for (const i of spots.slice(0, level.mines)) cells[i].mine = true;
      cells.forEach((cell, i) => (cell.adj = neighbours(i).filter((j) => cells[j].mine).length));
      started = true;
      timing = true;
    }

    function label(i) {
      const cell = cells[i];
      const [r, c] = rc(i);
      let state = 'hidden';
      if (cell.flag) state = 'flagged';
      else if (cell.open) state = cell.mine ? 'mine' : cell.adj ? `${cell.adj} mine${cell.adj > 1 ? 's' : ''} nearby` : 'empty';
      cell.el.setAttribute('aria-label', `Row ${r + 1}, column ${c + 1}: ${state}`);
    }

    function render(i) {
      const cell = cells[i];
      const el = cell.el;
      el.classList.toggle('is-open', cell.open);
      el.classList.toggle('is-flag', cell.flag && !cell.open);
      if (cell.open && cell.mine) el.innerHTML = MINE_SVG;
      else if (cell.flag && !cell.open) el.innerHTML = FLAG_SVG;
      else if (cell.open && cell.adj) {
        el.textContent = cell.adj;
        el.dataset.n = cell.adj;
      } else el.textContent = '';
      label(i);
    }

    // ---------------------------------------------------------------- actions
    function reveal(i) {
      if (finished) return;
      const cell = cells[i];
      if (cell.open) return chord(i);
      if (cell.flag) return;
      if (!started) placeMines(i);
      if (cell.mine) return lose(i);
      // Flood-fill empty areas.
      const stack = [i];
      while (stack.length) {
        const j = stack.pop();
        const c = cells[j];
        if (c.open || c.flag) continue;
        c.open = true;
        opened += 1;
        render(j);
        if (c.adj === 0) for (const k of neighbours(j)) if (!cells[k].open && !cells[k].mine) stack.push(k);
      }
      checkWin();
    }

    /** Clicking an open number whose flags are all placed reveals the rest of its neighbours. */
    function chord(i) {
      const cell = cells[i];
      if (!cell.open || !cell.adj) return;
      const around = neighbours(i);
      const flagged = around.filter((j) => cells[j].flag).length;
      if (flagged !== cell.adj) {
        for (const j of around) if (!cells[j].open && !cells[j].flag) pulse(j);
        return;
      }
      for (const j of around) {
        if (finished) return;
        if (!cells[j].open && !cells[j].flag) reveal(j);
      }
    }

    function pulse(i) {
      const el = cells[i].el;
      el.classList.remove('is-pulse');
      void el.offsetWidth;
      el.classList.add('is-pulse');
    }

    function toggleFlag(i) {
      if (finished) return;
      const cell = cells[i];
      if (cell.open) return;
      cell.flag = !cell.flag;
      flags += cell.flag ? 1 : -1;
      render(i);
      updateHud();
    }

    function act(i, flagging) {
      focus(i);
      if (flagging) toggleFlag(i);
      else reveal(i);
    }

    function setFlagMode(on) {
      flagMode = on;
      modeBtn.setAttribute('aria-pressed', String(on));
      modeBtn.replaceChildren(on ? 'Mode: Flag' : 'Mode: Dig');
      modeBtn.classList.toggle('is-flag', on);
    }

    function lose(i) {
      finished = true;
      timing = false;
      cells[i].open = true;
      cells[i].el.classList.add('is-boom');
      cells.forEach((cell, j) => {
        if (cell.mine && !cell.flag) {
          cell.open = true;
          render(j);
        } else if (cell.flag && !cell.mine) {
          cell.el.classList.add('is-wrong');
        }
      });
      board.classList.add('is-lost');
      setTimeout(() => {
        overlay.show({
          kicker: 'Boom',
          title: 'You hit a mine',
          stats: [
            ['Time', kit.formatTime(elapsed)],
            ['Cleared', `${Math.round((opened / (cells.length - level.mines)) * 100)}%`],
          ],
          options: levelOption(),
          buttons: [
            { label: 'Try again', primary: true, onClick: build },
            { label: 'Look at the board', onClick: () => overlay.hide() },
            { label: 'Menu', onClick: exit },
          ],
        });
      }, 1100);
    }

    function checkWin() {
      if (opened !== cells.length - level.mines) return;
      finished = true;
      timing = false;
      cells.forEach((cell, j) => {
        if (cell.mine && !cell.flag) {
          cell.flag = true;
          render(j);
        }
      });
      flags = level.mines;
      updateHud();
      board.classList.add('is-won');
      const record = kit.best(storage, `time:${prefs.level}`, Math.floor(elapsed), { lowerIsBetter: true });
      setTimeout(() => {
        overlay.show({
          kicker: record.isNew ? 'New best!' : 'Cleared',
          title: kit.formatTime(elapsed),
          stats: [['Best', kit.formatTime(record.best)]],
          options: levelOption(),
          buttons: [
            { label: 'Play again', primary: true, onClick: build },
            { label: 'Menu', onClick: exit },
          ],
        });
      }, 700);
    }

    function updateHud() {
      hud.set('mines', level.mines - flags);
      hud.set('time', kit.formatTime(elapsed));
    }

    function focus(i) {
      cells[focusIndex].el.tabIndex = -1;
      focusIndex = i;
      cells[i].el.tabIndex = 0;
      if (document.activeElement !== cells[i].el) cells[i].el.focus({ preventScroll: true });
    }

    function levelOption() {
      return [
        {
          id: 'level',
          label: 'Difficulty',
          value: prefs.level,
          choices: Object.entries(LEVELS).map(([value, l]) => ({ value, label: l.label })),
        },
      ];
    }

    function showStart() {
      timing = false;
      overlay.show({
        title: 'Mine Field',
        text: 'Clear every safe square. Numbers show how many mines touch that square. Your first click is always safe.',
        options: levelOption(),
        buttons: [
          { label: 'Play', primary: true, onClick: build },
          { label: 'Menu', onClick: exit },
        ],
      });
    }

    // ---------------------------------------------------------------- input
    const indexOf = (target) => {
      const el = target.closest && target.closest('.mf-cell');
      return el ? Number(el.dataset.i) : -1;
    };
    let pressTimer = 0;
    let longPressed = false;
    board.addEventListener(
      'click',
      (event) => {
        const i = indexOf(event.target);
        if (i < 0) return;
        if (longPressed) {
          longPressed = false;
          return;
        }
        act(i, flagMode);
      },
      { signal },
    );
    board.addEventListener(
      'contextmenu',
      (event) => {
        event.preventDefault();
        const i = indexOf(event.target);
        if (i >= 0 && !longPressed) act(i, true);
      },
      { signal },
    );
    board.addEventListener(
      'auxclick',
      (event) => {
        const i = indexOf(event.target);
        if (event.button === 1 && i >= 0) chord(i);
      },
      { signal },
    );
    // Long-press flags on touch screens.
    board.addEventListener(
      'pointerdown',
      (event) => {
        if (event.pointerType === 'mouse') return;
        const i = indexOf(event.target);
        if (i < 0) return;
        longPressed = false;
        pressTimer = setTimeout(() => {
          longPressed = true;
          act(i, !flagMode);
          if (navigator.vibrate) navigator.vibrate(20);
        }, LONG_PRESS_MS);
      },
      { signal },
    );
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
      board.addEventListener(type, () => clearTimeout(pressTimer), { signal });
    }

    function pause() {
      if (overlay.visible) return;
      const wasTiming = timing;
      timing = false;
      overlay.show({
        title: 'Paused',
        stats: [['Time', kit.formatTime(elapsed)]],
        buttons: [
          { label: 'Resume', primary: true, onClick: () => { timing = wasTiming; overlay.hide(); } },
          { label: 'New game', onClick: showStart },
          { label: 'Menu', onClick: exit },
        ],
      });
    }

    kit.keyboard(signal, (event) => {
      if (event.code === 'Escape') {
        pause();
        return;
      }
      if (overlay.visible || !cells.length) return;
      const step = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[event.code];
      if (step) {
        const [r, c] = rc(focusIndex);
        const nr = Math.min(level.rows - 1, Math.max(0, r + step[0]));
        const nc = Math.min(level.cols - 1, Math.max(0, c + step[1]));
        focus(nr * level.cols + nc);
      } else if (event.code === 'KeyF') {
        act(focusIndex, true);
      } else if (event.code === 'KeyD') {
        act(focusIndex, false);
      }
    });
    kit.onHide(signal, () => timing && pause());

    kit.loop(signal, (dt) => {
      if (!timing) return;
      elapsed += dt;
      hud.set('time', kit.formatTime(elapsed));
    }).start();

    build();
    showStart();
    return () => clearTimeout(pressTimer);
  },
});
