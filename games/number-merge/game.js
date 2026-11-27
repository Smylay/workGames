// Number Merge: slide the tiles, merge equal numbers, reach 2048. The game in progress is
// saved after every move, so you can leave and pick it up later.
WorkGames.registerGame('number-merge', {
  async mount(root, { signal, storage, exit }) {
    const kit = WorkGames.kit;
    const { h } = WorkGames;
    await kit.css('games/number-merge/style.css');

    const GOAL = 2048;
    const MOVE_MS = 110;
    const DIRS = {
      left: [0, -1],
      right: [0, 1],
      up: [-1, 0],
      down: [1, 0],
    };
    const KEYS = {
      ArrowLeft: 'left', KeyA: 'left',
      ArrowRight: 'right', KeyD: 'right',
      ArrowUp: 'up', KeyW: 'up',
      ArrowDown: 'down', KeyS: 'down',
    };

    let prefs = { size: '4', ...storage.get('prefs', {}) };
    let n = 4;
    let grid = []; // grid[r][c] = tile | null
    let tiles = new Map(); // id → tile { id, value, r, c, el }
    let nextId = 1;
    let score = 0;
    let won = false; // reached GOAL this game (keep playing allowed)
    let over = false;
    let undoState = null;
    let pending = []; // work to finish when a slide animation ends
    let pendingTimer = 0;

    const hud = kit.hud(root, [
      { id: 'score', label: 'Score' },
      { id: 'best', label: 'Best' },
    ]);
    const board = h('div', { class: 'nm-board', role: 'grid', 'aria-label': 'Board' });
    const cells = h('div', { class: 'nm-cells', 'aria-hidden': 'true' });
    const layer = h('div', { class: 'nm-tiles' });
    board.append(cells, layer);
    const undoBtn = h('button', { class: 'btn btn--secondary nm-btn', type: 'button', onclick: () => undo() }, 'Undo');
    const newBtn = h('button', { class: 'btn btn--secondary nm-btn', type: 'button', onclick: () => confirmNew() }, 'New game');
    const status = h('p', { class: 'nm-status', 'aria-live': 'polite' });
    kit.screen(
      root,
      h('div', { class: 'nm' }, board, h('div', { class: 'nm-actions' }, undoBtn, newBtn), status),
    );
    const overlay = kit.overlay(root);

    // ---------------------------------------------------------------- tiles
    function makeTile(value, r, c, appear = 'new') {
      const tile = { id: nextId++, value, r, c, el: h('div', { class: 'nm-tile' }, h('span', {})) };
      tiles.set(tile.id, tile);
      grid[r][c] = tile;
      paint(tile);
      place(tile);
      if (appear) tile.el.classList.add(`is-${appear}`);
      layer.append(tile.el);
      return tile;
    }

    function paint(tile) {
      tile.el.dataset.value = tile.value > 4096 ? 'big' : tile.value;
      tile.el.dataset.digits = String(tile.value).length;
      tile.el.firstChild.textContent = tile.value;
    }

    function place(tile) {
      tile.el.style.setProperty('--r', tile.r);
      tile.el.style.setProperty('--c', tile.c);
    }

    function emptyCells() {
      const out = [];
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!grid[r][c]) out.push([r, c]);
      return out;
    }

    function spawn() {
      const free = emptyCells();
      if (!free.length) return;
      const [r, c] = free[kit.randInt(free.length)];
      makeTile(Math.random() < 0.9 ? 2 : 4, r, c);
    }

    function canMove() {
      if (emptyCells().length) return true;
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          const v = grid[r][c].value;
          if ((c + 1 < n && grid[r][c + 1].value === v) || (r + 1 < n && grid[r + 1][c].value === v)) return true;
        }
      }
      return false;
    }

    // ---------------------------------------------------------------- state
    const snapshot = () => ({ size: n, score, won, cells: grid.map((row) => row.map((t) => (t ? t.value : 0))) });

    function load(saved, animate) {
      finishPending();
      n = saved.size;
      grid = Array.from({ length: n }, () => Array(n).fill(null));
      tiles = new Map();
      layer.replaceChildren();
      cells.replaceChildren(...Array.from({ length: n * n }, () => h('span')));
      board.style.setProperty('--n', n);
      saved.cells.forEach((row, r) => row.forEach((v, c) => v && makeTile(v, r, c, animate ? 'new' : null)));
      score = saved.score;
      won = saved.won;
      over = false;
      updateHud();
    }

    function save() {
      if (over) storage.remove('game');
      else storage.set('game', snapshot());
    }

    function newGame(options) {
      if (options) {
        prefs = { ...prefs, ...options };
        storage.set('prefs', prefs);
      }
      const size = Number(prefs.size);
      load({ size, score: 0, won: false, cells: Array.from({ length: size }, () => Array(size).fill(0)) }, false);
      spawn();
      spawn();
      undoState = null;
      overlay.hide();
      save();
      updateHud();
    }

    function updateHud() {
      hud.set('score', score);
      hud.set('best', Math.max(score, storage.get(`best:${n}`, 0)));
      undoBtn.disabled = !undoState || over;
    }

    // ---------------------------------------------------------------- moves
    function finishPending() {
      clearTimeout(pendingTimer);
      for (const job of pending) job();
      pending = [];
    }

    function move(direction) {
      if (over || overlay.visible) return;
      finishPending();
      const [dr, dc] = DIRS[direction];
      const before = snapshot();
      const rows = [...Array(n).keys()];
      const cols = [...Array(n).keys()];
      if (dr > 0) rows.reverse();
      if (dc > 0) cols.reverse();
      const mergedInto = new Set();
      let moved = false;
      let gained = 0;

      for (const r of rows) {
        for (const c of cols) {
          const tile = grid[r][c];
          if (!tile) continue;
          let nr = r;
          let nc = c;
          while (nr + dr >= 0 && nr + dr < n && nc + dc >= 0 && nc + dc < n && !grid[nr + dr][nc + dc]) {
            nr += dr;
            nc += dc;
          }
          const ahead = nr + dr >= 0 && nr + dr < n && nc + dc >= 0 && nc + dc < n ? grid[nr + dr][nc + dc] : null;
          if (ahead && ahead.value === tile.value && !mergedInto.has(ahead)) {
            // Slide into the neighbour, then disappear; the neighbour doubles.
            grid[r][c] = null;
            tiles.delete(tile.id);
            tile.r = ahead.r;
            tile.c = ahead.c;
            place(tile);
            tile.el.classList.add('is-leaving');
            ahead.value *= 2;
            mergedInto.add(ahead);
            gained += ahead.value;
            pending.push(() => {
              tile.el.remove();
              paint(ahead);
              ahead.el.classList.remove('is-merged', 'is-new');
              void ahead.el.offsetWidth;
              ahead.el.classList.add('is-merged');
            });
            moved = true;
          } else if (nr !== r || nc !== c) {
            grid[r][c] = null;
            grid[nr][nc] = tile;
            tile.r = nr;
            tile.c = nc;
            place(tile);
            moved = true;
          }
        }
      }

      if (!moved) {
        board.classList.remove('is-bump');
        void board.offsetWidth;
        board.classList.add('is-bump');
        return;
      }

      undoState = before;
      score += gained;
      pendingTimer = setTimeout(finishPending, MOVE_MS);
      spawn();
      const best = kit.best(storage, `best:${n}`, score);
      updateHud();
      hud.set('best', best.best);

      const reachedGoal = !won && [...tiles.values()].some((t) => t.value >= GOAL);
      if (reachedGoal) {
        won = true;
        save();
        setTimeout(() => {
          overlay.show({
            kicker: 'You did it!',
            title: `${GOAL}!`,
            stats: [
              ['Score', score],
              ['Best', best.best],
            ],
            buttons: [
              { label: 'Keep going', primary: true, onClick: () => overlay.hide() },
              { label: 'New game', onClick: () => newGame() },
              { label: 'Menu', onClick: exit },
            ],
          });
        }, MOVE_MS + 150);
      } else if (!canMove()) {
        over = true;
        save();
        updateHud();
        setTimeout(() => {
          overlay.show({
            kicker: best.isNew && score > 0 ? 'New best!' : 'No moves left',
            title: `${score} points`,
            stats: [
              ['Best', best.best],
              ['Top tile', Math.max(...[...tiles.values()].map((t) => t.value))],
            ],
            options: sizeOption(),
            buttons: [
              { label: 'Play again', primary: true, onClick: newGame },
              { label: 'Undo last move', onClick: () => { overlay.hide(); undo(); } },
              { label: 'Menu', onClick: exit },
            ],
          });
        }, MOVE_MS + 350);
      } else {
        save();
      }
    }

    function undo() {
      if (!undoState) return;
      load(undoState, false);
      undoState = null;
      over = false;
      save();
      updateHud();
      root.focus({ preventScroll: true });
    }

    function confirmNew() {
      if (score === 0) return newGame();
      overlay.show({
        title: 'Start a new game?',
        text: `Your current game (${score} points) will be lost.`,
        options: sizeOption(),
        buttons: [
          { label: 'New game', primary: true, onClick: newGame },
          { label: 'Cancel', onClick: () => overlay.hide() },
        ],
      });
    }

    function sizeOption() {
      return [
        {
          id: 'size',
          label: 'Board',
          value: prefs.size,
          choices: [
            { value: '4', label: 'Classic 4 × 4' },
            { value: '5', label: 'Roomy 5 × 5' },
          ],
        },
      ];
    }

    // ---------------------------------------------------------------- input
    kit.keyboard(signal, (event) => {
      if (event.code === 'Escape') {
        if (overlay.visible && !over) overlay.hide();
        else if (!overlay.visible) {
          overlay.show({
            title: 'Number Merge',
            stats: [['Score', score]],
            buttons: [
              { label: 'Resume', primary: true, onClick: () => overlay.hide() },
              { label: 'New game', onClick: confirmNew },
              { label: 'Menu', onClick: exit },
            ],
          });
        }
        return;
      }
      if (overlay.visible) return;
      if (KEYS[event.code]) move(KEYS[event.code]);
      else if (event.code === 'KeyU' || (event.code === 'KeyZ' && (event.ctrlKey || event.metaKey))) undo();
    });
    kit.swipe(board, signal, move);

    // ---------------------------------------------------------------- start
    const saved = storage.get('game', null);
    if (saved && saved.cells && saved.cells.length === saved.size) {
      load(saved, true);
      status.textContent = 'Welcome back: your last game was restored.';
      setTimeout(() => (status.textContent = ''), 3500);
    } else {
      newGame();
      overlay.show({
        title: 'Number Merge',
        text: 'Slide the tiles with the arrow keys, WASD or a swipe. Equal numbers merge. Reach 2048! U undoes your last move.',
        options: sizeOption(),
        buttons: [
          { label: 'Play', primary: true, onClick: newGame },
          { label: 'Menu', onClick: exit },
        ],
      });
    }

    return () => {
      finishPending();
      save();
    };
  },
});
