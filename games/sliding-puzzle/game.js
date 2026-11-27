// Sliding Puzzle: put the numbered tiles back in order by sliding them into the gap.
WorkGames.registerGame('sliding-puzzle', {
  async mount(root, { signal, storage, exit }) {
    const kit = WorkGames.kit;
    const { h } = WorkGames;
    await kit.css('games/sliding-puzzle/style.css');

    const SIZES = { 3: '3 × 3', 4: '4 × 4', 5: '5 × 5' };

    let prefs = { size: '4', ...storage.get('prefs', {}) };
    let n = 4;
    let tiles = []; // tiles[position] = number, 0 is the gap
    let els = new Map(); // number → tile element
    let moves = 0;
    let elapsed = 0;
    let timing = false;
    let playing = false;

    const hud = kit.hud(root, [
      { id: 'moves', label: 'Moves' },
      { id: 'time', label: 'Time', value: '0:00' },
    ]);
    const board = h('div', { class: 'sp-board', role: 'group', 'aria-label': 'Puzzle' });
    const hint = h('p', { class: 'sp-hint' }, 'Click a tile in the gap’s row or column, or use the arrow keys.');
    kit.screen(root, h('div', { class: 'sp' }, board, hint));
    const overlay = kit.overlay(root);

    const solved = () => tiles.every((value, i) => (i === tiles.length - 1 ? value === 0 : value === i + 1));

    function neighbours(pos) {
      const row = Math.floor(pos / n);
      const col = pos % n;
      const out = [];
      if (row > 0) out.push(pos - n);
      if (row < n - 1) out.push(pos + n);
      if (col > 0) out.push(pos - 1);
      if (col < n - 1) out.push(pos + 1);
      return out;
    }

    /** Random walk of legal moves from the solved state, so the result is always solvable. */
    function shuffle() {
      tiles = Array.from({ length: n * n }, (_, i) => (i === n * n - 1 ? 0 : i + 1));
      let gap = n * n - 1;
      let previous = -1;
      const steps = n * n * 25;
      for (let i = 0; i < steps || solved(); i++) {
        const options = neighbours(gap).filter((p) => p !== previous);
        const next = options[kit.randInt(options.length)];
        tiles[gap] = tiles[next];
        tiles[next] = 0;
        previous = gap;
        gap = next;
      }
    }

    function newGame(options) {
      if (options) {
        prefs = { ...prefs, ...options };
        storage.set('prefs', prefs);
      }
      n = Number(prefs.size);
      shuffle();
      board.style.setProperty('--n', n);
      els = new Map();
      const tileEls = [];
      for (let value = 1; value < n * n; value++) {
        const el = h(
          'button',
          { class: 'sp-tile', type: 'button', 'aria-label': `Tile ${value}`, onclick: () => clickTile(value) },
          h('span', {}, value),
        );
        els.set(value, el);
        tileEls.push(el);
      }
      board.replaceChildren(...tileEls);
      board.classList.add('no-anim');
      layout();
      board.getBoundingClientRect();
      board.classList.remove('no-anim');
      moves = 0;
      elapsed = 0;
      timing = false;
      playing = true;
      updateHud();
      overlay.hide();
    }

    function layout() {
      tiles.forEach((value, pos) => {
        if (!value) return;
        const el = els.get(value);
        el.style.setProperty('--row', Math.floor(pos / n));
        el.style.setProperty('--col', pos % n);
        el.classList.toggle('is-home', value === pos + 1);
      });
    }

    /** Slide every tile between `pos` and the gap one step toward the gap. */
    function slideFrom(pos) {
      let gap = tiles.indexOf(0);
      const sameRow = Math.floor(pos / n) === Math.floor(gap / n);
      const sameCol = pos % n === gap % n;
      if (!playing || pos === gap || (!sameRow && !sameCol)) return false;
      const step = sameRow ? Math.sign(pos - gap) : Math.sign(pos - gap) * n;
      while (gap !== pos) {
        const next = gap + step;
        tiles[gap] = tiles[next];
        tiles[next] = 0;
        gap = next;
        moves += 1;
      }
      timing = true;
      layout();
      updateHud();
      if (solved()) finish();
      return true;
    }

    function clickTile(value) {
      if (!slideFrom(tiles.indexOf(value))) {
        const el = els.get(value);
        el.classList.remove('is-stuck');
        void el.offsetWidth;
        el.classList.add('is-stuck');
      }
    }

    function updateHud() {
      hud.set('moves', moves);
      hud.set('time', kit.formatTime(elapsed));
    }

    function finish() {
      playing = false;
      timing = false;
      board.classList.add('is-solved');
      const fewest = kit.best(storage, `moves:${n}`, moves, { lowerIsBetter: true });
      const fastest = kit.best(storage, `time:${n}`, Math.floor(elapsed), { lowerIsBetter: true });
      setTimeout(() => {
        board.classList.remove('is-solved');
        overlay.show({
          kicker: fewest.isNew || fastest.isNew ? 'New best!' : 'Solved',
          title: `${moves} moves`,
          stats: [
            ['Time', kit.formatTime(elapsed)],
            ['Fewest moves', fewest.best],
            ['Fastest', kit.formatTime(fastest.best)],
          ],
          options: sizeOption(),
          buttons: [
            { label: 'Play again', primary: true, onClick: newGame },
            { label: 'Menu', onClick: exit },
          ],
        });
      }, 900);
    }

    function sizeOption() {
      return [
        {
          id: 'size',
          label: 'Size',
          value: prefs.size,
          choices: Object.entries(SIZES).map(([value, label]) => ({ value, label })),
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
          { label: 'New puzzle', onClick: showStart },
          { label: 'Menu', onClick: exit },
        ],
      });
    }

    function showStart() {
      playing = false;
      timing = false;
      overlay.show({
        title: 'Sliding Puzzle',
        text: 'Put the tiles back in order, 1 to the last, with the gap in the bottom-right corner.',
        options: sizeOption(),
        buttons: [
          { label: 'Play', primary: true, onClick: newGame },
          { label: 'Menu', onClick: exit },
        ],
      });
    }

    // A direction moves the tile next to the gap that way: 'left' slides a tile left into the gap.
    function moveDirection(direction) {
      if (overlay.visible || !playing) return;
      const gap = tiles.indexOf(0);
      const row = Math.floor(gap / n);
      const col = gap % n;
      const from = {
        left: col < n - 1 ? gap + 1 : -1,
        right: col > 0 ? gap - 1 : -1,
        up: row < n - 1 ? gap + n : -1,
        down: row > 0 ? gap - n : -1,
      }[direction];
      if (from >= 0) slideFrom(from);
    }

    const KEY_DIRECTIONS = {
      ArrowLeft: 'left', KeyA: 'left',
      ArrowRight: 'right', KeyD: 'right',
      ArrowUp: 'up', KeyW: 'up',
      ArrowDown: 'down', KeyS: 'down',
    };
    kit.keyboard(signal, (event) => {
      if (event.code === 'Escape') {
        if (!overlay.visible) pause();
        return;
      }
      if (KEY_DIRECTIONS[event.code]) moveDirection(KEY_DIRECTIONS[event.code]);
    });
    kit.swipe(board, signal, moveDirection);
    kit.onHide(signal, () => playing && !overlay.visible && pause());

    kit.loop(signal, (dt) => {
      if (!timing) return;
      elapsed += dt;
      hud.set('time', kit.formatTime(elapsed));
    }).start();

    newGame();
    showStart();
  },
});
