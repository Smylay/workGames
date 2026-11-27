// Four in a Row: drop discs, line up four across, down or diagonally.
WorkGames.registerGame('four-in-a-row', {
  async mount(root, { signal, storage, exit }) {
    const kit = WorkGames.kit;
    const { h } = WorkGames;
    await kit.css('games/four-in-a-row/style.css');

    const COLS = 7;
    const ROWS = 6;
    const ORDER = [3, 2, 4, 1, 5, 0, 6]; // centre-first search order
    const LEVELS = {
      easy: { depth: 2, random: 0.35, label: 'Easy' },
      normal: { depth: 4, random: 0, label: 'Normal' },
      hard: { depth: 7, random: 0, label: 'Hard' },
    };
    const WIN = 1_000_000;
    const CPU_DELAY = 350;

    let prefs = { mode: 'cpu', level: 'normal', ...storage.get('prefs', {}) };
    let board = []; // board[c][r], r = 0 is the bottom row; 0 empty, 1 red, 2 yellow
    let heights = [];
    let turn = 1;
    let starter = 1;
    let result = null; // { player, line } or { player: 0 } for a draw
    let tally = { 1: 0, 2: 0, draw: 0 };
    let cursor = 3;
    let active = false;
    let busy = false; // a disc is falling or the computer is thinking
    let cpuTimer = 0;

    const isCpu = (p) => prefs.mode === 'cpu' && p === 2;
    const nameOf = (p) => (prefs.mode === 'cpu' ? (p === 1 ? 'You' : 'Computer') : p === 1 ? 'Red' : 'Yellow');

    // ---------------------------------------------------------------- DOM
    const slots = []; // slots[c][r]
    const columns = Array.from({ length: COLS }, (_, c) => {
      const col = h('button', {
        class: 'c4-col',
        type: 'button',
        'aria-label': `Column ${c + 1} (key ${c + 1})`,
        onclick: () => humanDrop(c),
        onmouseenter: () => setCursor(c),
      });
      slots[c] = [];
      for (let r = ROWS - 1; r >= 0; r--) {
        const slot = h('span', { class: 'c4-slot' });
        slots[c][r] = slot;
        col.append(slot);
      }
      return col;
    });
    const preview = h('div', { class: 'c4-preview', 'aria-hidden': 'true' }, h('span', { class: 'c4-disc' }));
    const grid = h('div', { class: 'c4-grid' }, columns);
    const boardEl = h('div', { class: 'c4-board' }, preview, grid);
    const scoreValue = () => h('span', { class: 'c4-score__value' }, '0');
    const values = { 1: scoreValue(), draw: scoreValue(), 2: scoreValue() };
    const labels = { 1: h('span', { class: 'c4-score__label' }), 2: h('span', { class: 'c4-score__label' }) };
    const blocks = {
      1: h('div', { class: 'c4-score c4-score--1' }, labels[1], values[1]),
      draw: h('div', { class: 'c4-score' }, h('span', { class: 'c4-score__label' }, 'Draws'), values.draw),
      2: h('div', { class: 'c4-score c4-score--2' }, labels[2], values[2]),
    };
    const status = h('p', { class: 'c4-status', 'aria-live': 'polite' });
    const next = h('button', { class: 'btn btn--primary c4-next', type: 'button', hidden: true, onclick: () => newRound() }, 'Next round');
    kit.screen(root, h('div', { class: 'c4' }, h('div', { class: 'c4-scores' }, blocks[1], blocks.draw, blocks[2]), boardEl, status, next));
    const overlay = kit.overlay(root);

    // ---------------------------------------------------------------- rules
    function winningLine(c, r, p) {
      for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
        const line = [[c, r]];
        for (const s of [1, -1]) {
          let x = c + dc * s;
          let y = r + dr * s;
          while (x >= 0 && x < COLS && y >= 0 && y < ROWS && board[x][y] === p) {
            line.push([x, y]);
            x += dc * s;
            y += dr * s;
          }
        }
        if (line.length >= 4) return line;
      }
      return null;
    }

    // Heuristic: score every window of four for `p` minus the opponent's.
    function evaluate(p) {
      const o = 3 - p;
      let score = 0;
      for (let r = 0; r < ROWS; r++) {
        if (board[3][r] === p) score += 4;
        else if (board[3][r] === o) score -= 4;
      }
      const windows = [[1, 0], [0, 1], [1, 1], [1, -1]];
      for (let c = 0; c < COLS; c++) {
        for (let r = 0; r < ROWS; r++) {
          for (const [dc, dr] of windows) {
            const ec = c + dc * 3;
            const er = r + dr * 3;
            if (ec < 0 || ec >= COLS || er < 0 || er >= ROWS) continue;
            let mine = 0;
            let theirs = 0;
            for (let k = 0; k < 4; k++) {
              const v = board[c + dc * k][r + dr * k];
              if (v === p) mine += 1;
              else if (v === o) theirs += 1;
            }
            if (mine && theirs) continue;
            if (mine === 3) score += 60;
            else if (mine === 2) score += 8;
            else if (theirs === 3) score -= 80;
            else if (theirs === 2) score -= 8;
          }
        }
      }
      return score;
    }

    function negamax(depth, alpha, beta, p) {
      let any = false;
      let best = -Infinity;
      for (const c of ORDER) {
        const r = heights[c];
        if (r >= ROWS) continue;
        any = true;
        board[c][r] = p;
        heights[c] += 1;
        let score;
        if (winningLine(c, r, p)) score = WIN + depth;
        else if (depth <= 1) score = evaluate(p);
        else score = -negamax(depth - 1, -beta, -alpha, 3 - p);
        heights[c] -= 1;
        board[c][r] = 0;
        if (score > best) best = score;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
      }
      return any ? best : 0;
    }

    function chooseMove(p) {
      const level = LEVELS[prefs.level];
      const legal = ORDER.filter((c) => heights[c] < ROWS);
      if (Math.random() < level.random) return legal[kit.randInt(legal.length)];
      let top = -Infinity;
      let picks = [];
      for (const c of legal) {
        const r = heights[c];
        board[c][r] = p;
        heights[c] += 1;
        const score = winningLine(c, r, p) ? WIN + level.depth + 1 : -negamax(level.depth - 1, -Infinity, Infinity, 3 - p);
        heights[c] -= 1;
        board[c][r] = 0;
        if (score > top) {
          top = score;
          picks = [c];
        } else if (score === top) picks.push(c);
      }
      return picks[kit.randInt(picks.length)];
    }

    // ---------------------------------------------------------------- flow
    function humanDrop(c) {
      if (!active || busy || result || isCpu(turn)) return;
      setCursor(c);
      drop(c);
    }

    function drop(c) {
      const r = heights[c];
      if (r >= ROWS) {
        columns[c].classList.remove('is-full');
        void columns[c].offsetWidth;
        columns[c].classList.add('is-full');
        return;
      }
      board[c][r] = turn;
      heights[c] += 1;
      busy = true;
      const disc = h('span', { class: `c4-disc c4-disc--${turn}` });
      disc.style.setProperty('--fall', ROWS - r); // rows to fall, for the animation
      slots[c][r].append(disc);
      render();
      setTimeout(() => {
        busy = false;
        const line = winningLine(c, r, board[c][r]);
        if (line) result = { player: board[c][r], line };
        else if (heights.every((v) => v >= ROWS)) result = { player: 0 };
        if (result) return endRound();
        turn = 3 - turn;
        render();
        if (isCpu(turn)) scheduleCpu();
      }, 150 + (ROWS - r) * 35); // matches the fall animation in style.css
    }

    function scheduleCpu() {
      busy = true;
      render();
      cpuTimer = setTimeout(() => {
        busy = false;
        if (!active || result) return;
        drop(chooseMove(turn));
      }, CPU_DELAY);
    }

    function endRound() {
      if (result.player) {
        tally[result.player] += 1;
        for (const [c, r] of result.line) slots[c][r].firstChild.classList.add('is-win');
        boardEl.classList.add('has-winner');
      } else tally.draw += 1;
      render();
      next.hidden = false;
      next.focus({ preventScroll: true });
    }

    function newRound() {
      clearTimeout(cpuTimer);
      board = Array.from({ length: COLS }, () => Array(ROWS).fill(0));
      heights = Array(COLS).fill(0);
      for (const col of slots) for (const slot of col) slot.replaceChildren();
      boardEl.classList.remove('has-winner');
      result = null;
      busy = false;
      turn = starter;
      starter = 3 - starter;
      next.hidden = true;
      render();
      if (isCpu(turn)) scheduleCpu();
      else root.focus({ preventScroll: true });
    }

    function newMatch(options) {
      if (options) {
        prefs = { ...prefs, ...options };
        storage.set('prefs', prefs);
      }
      tally = { 1: 0, 2: 0, draw: 0 };
      starter = 1;
      active = true;
      overlay.hide();
      newRound();
    }

    function setCursor(c) {
      cursor = c;
      preview.style.setProperty('--col', c);
    }

    function render() {
      labels[1].textContent = `${nameOf(1)}`;
      labels[2].textContent = `${nameOf(2)}`;
      values[1].textContent = tally[1];
      values[2].textContent = tally[2];
      values.draw.textContent = tally.draw;
      blocks[1].classList.toggle('is-turn', !result && turn === 1);
      blocks[2].classList.toggle('is-turn', !result && turn === 2);
      const humanTurn = active && !result && !busy && !isCpu(turn);
      preview.hidden = !humanTurn;
      preview.firstChild.className = `c4-disc c4-disc--${turn}`;
      boardEl.classList.toggle('is-waiting', active && !result && isCpu(turn));
      columns.forEach((col, c) => (col.disabled = !humanTurn || heights[c] >= ROWS));

      if (result) {
        status.textContent = result.player
          ? prefs.mode === 'cpu'
            ? result.player === 1 ? 'You win!' : 'The computer wins.'
            : `${nameOf(result.player)} wins!`
          : 'Draw: the board is full.';
        status.dataset.player = result.player || '';
      } else {
        status.textContent = isCpu(turn) ? 'Computer is thinking…' : prefs.mode === 'cpu' ? 'Your turn' : `${nameOf(turn)}’s turn`;
        status.dataset.player = turn;
      }
    }

    function showStart() {
      clearTimeout(cpuTimer);
      active = false;
      render();
      overlay.show({
        title: 'Four in a Row',
        text: 'Drop discs and connect four in a line. Click a column, press 1–7, or use ← → and Enter.',
        options: [
          { id: 'mode', label: 'Opponent', value: prefs.mode, choices: [{ value: 'cpu', label: 'Computer' }, { value: '2p', label: '2 Players' }] },
          { id: 'level', label: 'Computer', value: prefs.level, choices: Object.entries(LEVELS).map(([value, l]) => ({ value, label: l.label })) },
        ],
        buttons: [
          { label: 'Play', primary: true, onClick: newMatch },
          { label: 'Menu', onClick: exit },
        ],
      });
    }

    function pause() {
      clearTimeout(cpuTimer);
      const wasBusy = busy;
      overlay.show({
        title: 'Paused',
        stats: [[nameOf(1), tally[1]], ['Draws', tally.draw], [nameOf(2), tally[2]]],
        buttons: [
          {
            label: 'Resume',
            primary: true,
            onClick: () => {
              overlay.hide();
              if (wasBusy && !result && isCpu(turn)) scheduleCpu();
            },
          },
          { label: 'New match', onClick: showStart },
          { label: 'Menu', onClick: exit },
        ],
      });
    }

    kit.keyboard(signal, (event) => {
      if (event.code === 'Escape') {
        if (!overlay.visible) pause();
        return;
      }
      if (overlay.visible) return;
      const digit = /^(Digit|Numpad)([1-7])$/.exec(event.code);
      if (digit) humanDrop(Number(digit[2]) - 1);
      else if (event.code === 'ArrowLeft') setCursor(Math.max(0, cursor - 1));
      else if (event.code === 'ArrowRight') setCursor(Math.min(COLS - 1, cursor + 1));
      else if (event.code === 'ArrowDown' || event.code === 'Enter' || event.code === 'Space') {
        if (result) newRound();
        else humanDrop(cursor);
      }
    });

    board = Array.from({ length: COLS }, () => Array(ROWS).fill(0));
    heights = Array(COLS).fill(0);
    setCursor(3);
    showStart();
    return () => clearTimeout(cpuTimer);
  },
});
