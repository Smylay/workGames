// Tic-Tac-Toe: vs the computer (easy or unbeatable) or two players on one screen.
WorkGames.registerGame('tic-tac-toe', {
  async mount(root, { signal, storage, exit }) {
    const kit = WorkGames.kit;
    const { h } = WorkGames;
    await kit.css('games/tic-tac-toe/style.css');

    const LINES = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6],
    ];
    const CPU_DELAY = 450;
    const EASY_SMART_CHANCE = 0.35; // how often the easy computer plays the best move

    let prefs = { mode: 'cpu', level: 'hard', ...storage.get('prefs', {}) };
    let board = Array(9).fill(null);
    let turn = 'X';
    let starter = 'X';
    let result = null; // null while playing, then { player: 'X' | 'O' | null, line }
    let tally = { X: 0, O: 0, draw: 0 };
    let cpuTimer = 0;
    let active = false;

    const isCpu = (player) => prefs.mode === 'cpu' && player === 'O';
    const nameOf = (player) => (prefs.mode === 'cpu' ? (player === 'X' ? 'You' : 'Computer') : `Player ${player}`);

    // ---------------------------------------------------------------- DOM
    const markSvg = (player) => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 100 100');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('class', `ttt-mark ttt-mark--${player}`);
      svg.innerHTML = player === 'X' ? '<path pathLength="1" d="M26 26L74 74M74 26L26 74"/>' : '<circle pathLength="1" cx="50" cy="50" r="25"/>';
      return svg;
    };

    const cells = Array.from({ length: 9 }, (_, index) =>
      h('button', {
        class: 'ttt-cell',
        type: 'button',
        'data-index': index,
        onclick: () => humanMove(index),
      }),
    );
    const winLine = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    winLine.setAttribute('viewBox', '0 0 300 300');
    winLine.setAttribute('class', 'ttt-winline');
    winLine.setAttribute('aria-hidden', 'true');

    const boardEl = h('div', { class: 'ttt-board', role: 'group', 'aria-label': 'Board' }, cells, winLine);
    const scoreValue = () => h('span', { class: 'ttt-score__value' }, '0');
    const scoreValues = { X: scoreValue(), draw: scoreValue(), O: scoreValue() };
    const scoreLabels = { X: h('span', { class: 'ttt-score__label' }), O: h('span', { class: 'ttt-score__label' }) };
    const scoreBlocks = {
      X: h('div', { class: 'ttt-score ttt-score--X' }, scoreLabels.X, scoreValues.X),
      draw: h('div', { class: 'ttt-score' }, h('span', { class: 'ttt-score__label' }, 'Draws'), scoreValues.draw),
      O: h('div', { class: 'ttt-score ttt-score--O' }, scoreLabels.O, scoreValues.O),
    };
    const status = h('p', { class: 'ttt-status', 'aria-live': 'polite' });
    const next = h('button', { class: 'btn btn--primary ttt-next', type: 'button', hidden: true, onclick: () => newRound() }, 'Next round');

    kit.screen(
      root,
      h('div', { class: 'ttt' }, h('div', { class: 'ttt-scores' }, scoreBlocks.X, scoreBlocks.draw, scoreBlocks.O), boardEl, status, next),
    );
    const overlay = kit.overlay(root);

    // ---------------------------------------------------------------- rules
    function winner(b) {
      for (const line of LINES) {
        const [a, c, d] = line;
        if (b[a] && b[a] === b[c] && b[a] === b[d]) return { player: b[a], line };
      }
      return b.every(Boolean) ? { player: null, line: null } : null;
    }

    /** Minimax: best moves for `me`, preferring faster wins and slower losses. */
    function bestMoves(b, me) {
      const opponent = me === 'X' ? 'O' : 'X';
      const score = (player, depth) => {
        const w = winner(b);
        if (w) return w.player === me ? 10 - depth : w.player === opponent ? depth - 10 : 0;
        let best = player === me ? -Infinity : Infinity;
        for (let i = 0; i < 9; i++) {
          if (b[i]) continue;
          b[i] = player;
          const s = score(player === me ? opponent : me, depth + 1);
          b[i] = null;
          best = player === me ? Math.max(best, s) : Math.min(best, s);
        }
        return best;
      };
      let top = -Infinity;
      let moves = [];
      for (let i = 0; i < 9; i++) {
        if (b[i]) continue;
        b[i] = me;
        const s = score(opponent, 1);
        b[i] = null;
        if (s > top) {
          top = s;
          moves = [i];
        } else if (s === top) moves.push(i);
      }
      return moves;
    }

    function cpuMove() {
      const empty = board.map((v, i) => (v ? null : i)).filter((i) => i !== null);
      const smart = prefs.level === 'hard' || Math.random() < EASY_SMART_CHANCE;
      const options = smart ? bestMoves(board.slice(), 'O') : empty;
      place(options[kit.randInt(options.length)]);
    }

    // ---------------------------------------------------------------- flow
    function humanMove(index) {
      if (!active || result || board[index] || isCpu(turn)) return;
      place(index);
    }

    function place(index) {
      board[index] = turn;
      const cell = cells[index];
      cell.append(markSvg(turn));
      cell.classList.add('is-filled');
      result = winner(board);
      if (result) return endRound();
      turn = turn === 'X' ? 'O' : 'X';
      render();
      if (isCpu(turn)) cpuTimer = setTimeout(cpuMove, CPU_DELAY);
    }

    function endRound() {
      if (result.player) tally[result.player] += 1;
      else tally.draw += 1;
      if (result.line) drawWinLine(result.line);
      render();
      next.hidden = false;
      next.focus({ preventScroll: true });
    }

    function drawWinLine([a, , c]) {
      const centre = (i) => [(i % 3) * 100 + 50, Math.floor(i / 3) * 100 + 50];
      const [x1, y1] = centre(a);
      const [x2, y2] = centre(c);
      const dx = Math.sign(x2 - x1) * 30;
      const dy = Math.sign(y2 - y1) * 30;
      winLine.innerHTML = `<line pathLength="1" x1="${x1 - dx}" y1="${y1 - dy}" x2="${x2 + dx}" y2="${y2 + dy}"/>`;
    }

    function newRound() {
      clearTimeout(cpuTimer);
      board = Array(9).fill(null);
      result = null;
      turn = starter;
      starter = starter === 'X' ? 'O' : 'X'; // alternate who goes first
      for (const cell of cells) {
        cell.replaceChildren();
        cell.classList.remove('is-filled');
      }
      winLine.innerHTML = '';
      next.hidden = true;
      render();
      if (isCpu(turn)) cpuTimer = setTimeout(cpuMove, CPU_DELAY);
      else root.focus({ preventScroll: true });
    }

    function newMatch(options) {
      if (options) {
        prefs = { ...prefs, ...options };
        storage.set('prefs', prefs);
      }
      tally = { X: 0, O: 0, draw: 0 };
      starter = 'X';
      active = true;
      overlay.hide();
      newRound();
    }

    function render() {
      scoreLabels.X.textContent = `${nameOf('X')} · X`;
      scoreLabels.O.textContent = `${nameOf('O')} · O`;
      scoreValues.X.textContent = tally.X;
      scoreValues.O.textContent = tally.O;
      scoreValues.draw.textContent = tally.draw;
      scoreBlocks.X.classList.toggle('is-turn', !result && turn === 'X');
      scoreBlocks.O.classList.toggle('is-turn', !result && turn === 'O');
      boardEl.classList.toggle('is-waiting', !result && isCpu(turn));

      if (result) {
        status.textContent = result.player
          ? prefs.mode === 'cpu'
            ? result.player === 'X' ? 'You win!' : 'The computer wins.'
            : `Player ${result.player} wins!`
          : 'Draw.';
      } else if (isCpu(turn)) {
        status.textContent = 'Computer is thinking…';
      } else {
        status.textContent = prefs.mode === 'cpu' ? 'Your turn' : `Player ${turn}’s turn`;
      }
      status.dataset.player = result ? result.player || '' : turn;

      cells.forEach((cell, i) => {
        const row = Math.floor(i / 3) + 1;
        const col = (i % 3) + 1;
        cell.setAttribute('aria-label', `Row ${row}, column ${col}: ${board[i] || 'empty'} (key ${i + 1})`);
        cell.disabled = !active || Boolean(result) || Boolean(board[i]) || isCpu(turn);
      });
    }

    function showStart() {
      clearTimeout(cpuTimer);
      active = false;
      render();
      overlay.show({
        title: 'Tic-Tac-Toe',
        text: 'Get three in a row. Click a square or press 1–9 (top-left to bottom-right). Esc for the menu.',
        options: [
          {
            id: 'mode',
            label: 'Opponent',
            value: prefs.mode,
            choices: [
              { value: 'cpu', label: 'Computer' },
              { value: '2p', label: '2 Players' },
            ],
          },
          {
            id: 'level',
            label: 'Computer',
            value: prefs.level,
            choices: [
              { value: 'easy', label: 'Easy' },
              { value: 'hard', label: 'Unbeatable' },
            ],
          },
        ],
        buttons: [
          { label: 'Play', primary: true, onClick: newMatch },
          { label: 'Menu', onClick: exit },
        ],
      });
    }

    function pause() {
      clearTimeout(cpuTimer);
      overlay.show({
        title: 'Paused',
        stats: [
          [nameOf('X'), tally.X],
          ['Draws', tally.draw],
          [nameOf('O'), tally.O],
        ],
        buttons: [
          {
            label: 'Resume',
            primary: true,
            onClick: () => {
              overlay.hide();
              if (!result && isCpu(turn)) cpuTimer = setTimeout(cpuMove, CPU_DELAY);
            },
          },
          { label: 'New match', onClick: showStart },
          { label: 'Menu', onClick: exit },
        ],
      });
    }

    kit.keyboard(signal, (event) => {
      if (event.code === 'Escape') {
        if (overlay.visible) return;
        pause();
        return;
      }
      if (overlay.visible) return;
      const digit = /^(Digit|Numpad)([1-9])$/.exec(event.code);
      if (digit) humanMove(Number(digit[2]) - 1);
      else if ((event.code === 'Enter' || event.code === 'Space') && result) newRound();
    });

    showStart();
    return () => clearTimeout(cpuTimer);
  },
});
