// Sudoku: fill the grid so every row, column and 3×3 box has 1–9. Puzzles are generated
// here with exactly one solution. The puzzle in progress is saved, so you can come back.
WorkGames.registerGame('sudoku', {
  async mount(root, { signal, storage, exit }) {
    const kit = WorkGames.kit;
    const { h } = WorkGames;
    await kit.css('games/sudoku/style.css');

    const LEVELS = {
      easy: { givens: 40, label: 'Easy' },
      medium: { givens: 32, label: 'Medium' },
      hard: { givens: 25, label: 'Hard' },
    };

    // ---------------------------------------------------------------- solver
    const ROW = (i) => Math.floor(i / 9);
    const COL = (i) => i % 9;
    const BOX = (i) => Math.floor(ROW(i) / 3) * 3 + Math.floor(COL(i) / 3);
    const PEERS = Array.from({ length: 81 }, (_, i) => {
      const set = new Set();
      for (let j = 0; j < 81; j++) if (j !== i && (ROW(j) === ROW(i) || COL(j) === COL(i) || BOX(j) === BOX(i))) set.add(j);
      return [...set];
    });
    const bit = (v) => 1 << v;

    /** Count solutions (stopping at `limit`), filling `out` with the first one found. */
    function solve(grid, limit = 2, out = null, randomise = false) {
      const g = grid.slice();
      const rows = Array(9).fill(0);
      const cols = Array(9).fill(0);
      const boxes = Array(9).fill(0);
      for (let i = 0; i < 81; i++) {
        if (!g[i]) continue;
        const b = bit(g[i]);
        if ((rows[ROW(i)] | cols[COL(i)] | boxes[BOX(i)]) & b) return 0;
        rows[ROW(i)] |= b;
        cols[COL(i)] |= b;
        boxes[BOX(i)] |= b;
      }
      let count = 0;
      const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
      function search() {
        // Pick the empty cell with the fewest candidates.
        let best = -1;
        let bestMask = 0;
        let bestCount = 10;
        for (let i = 0; i < 81; i++) {
          if (g[i]) continue;
          const used = rows[ROW(i)] | cols[COL(i)] | boxes[BOX(i)];
          let n = 0;
          for (let v = 1; v <= 9; v++) if (!(used & bit(v))) n++;
          if (n < bestCount) {
            best = i;
            bestCount = n;
            bestMask = used;
            if (n <= 1) break;
          }
        }
        if (best < 0) {
          count += 1;
          if (out && count === 1) out.splice(0, 81, ...g);
          return count >= limit;
        }
        const order = randomise ? kit.shuffle(digits.slice()) : digits;
        for (const v of order) {
          if (bestMask & bit(v)) continue;
          const b = bit(v);
          g[best] = v;
          rows[ROW(best)] |= b;
          cols[COL(best)] |= b;
          boxes[BOX(best)] |= b;
          if (search()) return true;
          g[best] = 0;
          rows[ROW(best)] &= ~b;
          cols[COL(best)] &= ~b;
          boxes[BOX(best)] &= ~b;
        }
        return false;
      }
      search();
      return count;
    }

    function generate(levelId) {
      const solution = [];
      solve(Array(81).fill(0), 1, solution, true);
      const puzzle = solution.slice();
      let filled = 81;
      for (const i of kit.shuffle([...Array(81).keys()])) {
        if (filled <= LEVELS[levelId].givens) break;
        const keep = puzzle[i];
        puzzle[i] = 0;
        if (solve(puzzle, 2) !== 1) puzzle[i] = keep;
        else filled -= 1;
      }
      return { puzzle, solution };
    }

    // ---------------------------------------------------------------- state
    let prefs = { level: 'easy', ...storage.get('prefs', {}) };
    let game = null; // { level, puzzle, solution, values, notes, elapsed, hints, mistakes }
    let selected = 40;
    let noteMode = false;
    let history = [];
    let timing = false;
    let finished = false;

    // ---------------------------------------------------------------- DOM
    const cellEls = Array.from({ length: 81 }, (_, i) =>
      h('button', {
        class: 'sd-cell',
        type: 'button',
        'data-i': i,
        'data-row': ROW(i),
        'data-col': COL(i),
        tabindex: '-1',
        onclick: () => select(i),
      }),
    );
    const grid = h('div', { class: 'sd-grid', role: 'grid', 'aria-label': 'Sudoku grid' }, cellEls);
    const padButtons = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((v) =>
      h('button', { class: 'sd-key', type: 'button', onclick: () => enter(v) }, h('span', {}, v), h('small', { class: 'sd-left' })),
    );
    const notesBtn = h('button', { class: 'sd-tool', type: 'button', 'aria-pressed': 'false', onclick: () => setNoteMode(!noteMode) }, 'Notes');
    const eraseBtn = h('button', { class: 'sd-tool', type: 'button', onclick: () => erase() }, 'Erase');
    const undoBtn = h('button', { class: 'sd-tool', type: 'button', onclick: () => undo() }, 'Undo');
    const hintBtn = h('button', { class: 'sd-tool', type: 'button', onclick: () => hint() }, 'Hint');
    const newBtn = h('button', { class: 'sd-tool', type: 'button', onclick: () => confirmNew() }, 'New');
    kit.screen(
      root,
      h(
        'div',
        { class: 'sd' },
        grid,
        h('div', { class: 'sd-pad' }, padButtons),
        h('div', { class: 'sd-tools' }, notesBtn, eraseBtn, undoBtn, hintBtn, newBtn),
      ),
    );
    const hud = kit.hud(root, [
      { id: 'level', label: 'Level', value: '-' },
      { id: 'mistakes', label: 'Mistakes' },
      { id: 'time', label: 'Time', value: '0:00' },
    ]);
    const overlay = kit.overlay(root);

    // ---------------------------------------------------------------- rendering
    function conflicts() {
      const bad = new Set();
      for (let i = 0; i < 81; i++) {
        const v = game.values[i];
        if (!v) continue;
        for (const j of PEERS[i]) if (game.values[j] === v) bad.add(i);
      }
      return bad;
    }

    function render() {
      if (!game) return;
      const bad = conflicts();
      const selValue = game.values[selected];
      cellEls.forEach((el, i) => {
        const v = game.values[i];
        const given = game.puzzle[i] !== 0;
        el.classList.toggle('is-given', given);
        el.classList.toggle('is-user', !given && v !== 0);
        el.classList.toggle('is-selected', i === selected);
        el.classList.toggle('is-peer', i !== selected && PEERS[selected].includes(i));
        el.classList.toggle('is-same', selValue !== 0 && v === selValue && i !== selected);
        el.classList.toggle('is-conflict', bad.has(i));
        if (v) {
          el.textContent = v;
        } else if (game.notes[i]) {
          const notes = h('span', { class: 'sd-notes' });
          for (let n = 1; n <= 9; n++) notes.append(h('span', {}, game.notes[i] & bit(n) ? n : ''));
          el.replaceChildren(notes);
        } else el.textContent = '';
        el.setAttribute('aria-label', `Row ${ROW(i) + 1}, column ${COL(i) + 1}: ${v || 'empty'}${given ? ' (given)' : ''}`);
        el.tabIndex = i === selected ? 0 : -1;
      });
      // Remaining count per digit; finished digits fade out on the pad.
      const counts = Array(10).fill(0);
      game.values.forEach((v) => v && counts[v]++);
      padButtons.forEach((btn, k) => {
        const left = 9 - counts[k + 1];
        btn.lastChild.textContent = left > 0 ? left : '';
        btn.classList.toggle('is-done', left <= 0);
      });
      undoBtn.disabled = !history.length || finished;
      hud.set('level', LEVELS[game.level].label);
      hud.set('mistakes', game.mistakes);
      hud.set('time', kit.formatTime(game.elapsed));
    }

    function save() {
      if (!game || finished) storage.remove('game');
      else storage.set('game', game);
    }

    // ---------------------------------------------------------------- actions
    function select(i) {
      selected = i;
      render();
      if (document.activeElement !== cellEls[i]) cellEls[i].focus({ preventScroll: true });
    }

    function snapshot() {
      history.push({ values: game.values.slice(), notes: game.notes.slice() });
      if (history.length > 200) history.shift();
    }

    function enter(v) {
      if (!game || finished || game.puzzle[selected]) return;
      timing = true;
      if (noteMode && !game.values[selected]) {
        snapshot();
        game.notes[selected] ^= bit(v);
      } else {
        if (game.values[selected] === v) return;
        snapshot();
        game.values[selected] = v;
        game.notes[selected] = 0;
        // Placing a digit clears it from the notes of every peer.
        for (const j of PEERS[selected]) game.notes[j] &= ~bit(v);
        if (v !== game.solution[selected]) {
          game.mistakes += 1;
          cellEls[selected].classList.remove('is-wrong');
          void cellEls[selected].offsetWidth;
          cellEls[selected].classList.add('is-wrong');
        }
      }
      render();
      save();
      checkSolved();
    }

    function erase() {
      if (!game || finished || game.puzzle[selected]) return;
      if (!game.values[selected] && !game.notes[selected]) return;
      snapshot();
      game.values[selected] = 0;
      game.notes[selected] = 0;
      render();
      save();
    }

    function undo() {
      const last = history.pop();
      if (!last || finished) return;
      game.values = last.values;
      game.notes = last.notes;
      render();
      save();
    }

    function hint() {
      if (!game || finished) return;
      let target = selected;
      if (game.puzzle[target] || game.values[target] === game.solution[target]) {
        const open = [...Array(81).keys()].filter((i) => game.values[i] !== game.solution[i]);
        if (!open.length) return;
        target = open[kit.randInt(open.length)];
      }
      snapshot();
      game.values[target] = game.solution[target];
      game.notes[target] = 0;
      for (const j of PEERS[target]) game.notes[j] &= ~bit(game.solution[target]);
      game.hints += 1;
      selected = target;
      timing = true;
      render();
      cellEls[target].classList.add('is-hinted');
      setTimeout(() => cellEls[target].classList.remove('is-hinted'), 800);
      save();
      checkSolved();
    }

    function setNoteMode(on) {
      noteMode = on;
      notesBtn.setAttribute('aria-pressed', String(on));
      notesBtn.classList.toggle('is-on', on);
      grid.classList.toggle('is-noting', on);
    }

    function checkSolved() {
      if (!game.values.every((v, i) => v === game.solution[i])) return;
      finished = true;
      timing = false;
      grid.classList.add('is-solved');
      const record = game.hints === 0 ? kit.best(storage, `time:${game.level}`, Math.floor(game.elapsed), { lowerIsBetter: true }) : null;
      const best = storage.get(`time:${game.level}`, null);
      save();
      render();
      setTimeout(() => {
        overlay.show({
          kicker: record && record.isNew ? 'New best!' : 'Solved',
          title: kit.formatTime(game.elapsed),
          text: game.hints ? `Used ${game.hints} hint${game.hints > 1 ? 's' : ''}, so this time doesn’t count as a best.` : undefined,
          stats: [
            ['Mistakes', game.mistakes],
            ['Best', best == null ? '--' : kit.formatTime(best)],
          ],
          options: levelOption(),
          buttons: [
            { label: 'New puzzle', primary: true, onClick: newGame },
            { label: 'Menu', onClick: exit },
          ],
        });
      }, 800);
    }

    function newGame(options) {
      if (options) {
        prefs = { ...prefs, ...options };
        storage.set('prefs', prefs);
      }
      const { puzzle, solution } = generate(prefs.level);
      game = {
        level: prefs.level,
        puzzle,
        solution,
        values: puzzle.slice(),
        notes: Array(81).fill(0),
        elapsed: 0,
        hints: 0,
        mistakes: 0,
      };
      history = [];
      finished = false;
      timing = false;
      grid.classList.remove('is-solved');
      setNoteMode(false);
      selected = game.puzzle.findIndex((v) => v === 0);
      overlay.hide();
      save();
      select(selected);
    }

    function confirmNew() {
      timing = false;
      overlay.show({
        title: 'New puzzle?',
        text: finished || !game ? undefined : 'Your current puzzle will be lost.',
        options: levelOption(),
        buttons: [
          { label: 'New puzzle', primary: true, onClick: newGame },
          { label: 'Cancel', onClick: () => { overlay.hide(); timing = !!game && !finished && game.elapsed > 0; } },
        ],
      });
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

    function pause() {
      if (overlay.visible || finished) return;
      const wasTiming = timing;
      timing = false;
      grid.classList.add('is-hidden');
      overlay.show({
        title: 'Paused',
        stats: [['Time', kit.formatTime(game.elapsed)]],
        buttons: [
          { label: 'Resume', primary: true, onClick: () => { grid.classList.remove('is-hidden'); timing = wasTiming; overlay.hide(); } },
          { label: 'New puzzle', onClick: () => { grid.classList.remove('is-hidden'); confirmNew(); } },
          { label: 'Menu', onClick: exit },
        ],
      });
    }

    // ---------------------------------------------------------------- input
    kit.keyboard(signal, (event) => {
      if (event.code === 'Escape') return pause();
      if (overlay.visible || !game) return;
      const digit = /^(Digit|Numpad)([0-9])$/.exec(event.code);
      const move = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[event.code];
      if (digit) {
        const v = Number(digit[2]);
        if (v === 0) erase();
        else if (event.shiftKey) {
          const before = noteMode;
          setNoteMode(true);
          enter(v);
          setNoteMode(before);
        } else enter(v);
      } else if (move) {
        const r = (ROW(selected) + move[0] + 9) % 9;
        const c = (COL(selected) + move[1] + 9) % 9;
        select(r * 9 + c);
      } else if (event.code === 'Backspace' || event.code === 'Delete') erase();
      else if (event.code === 'KeyN') setNoteMode(!noteMode);
      else if (event.code === 'KeyH') hint();
      else if (event.code === 'KeyZ' || event.code === 'KeyU') undo();
    });
    kit.onHide(signal, () => timing && pause());

    let saveTimer = 0;
    kit.loop(signal, (dt) => {
      if (!timing || !game) return;
      game.elapsed += dt;
      hud.set('time', kit.formatTime(game.elapsed));
      saveTimer += dt;
      if (saveTimer > 5) {
        saveTimer = 0;
        save();
      }
    }).start();

    // ---------------------------------------------------------------- start
    const saved = storage.get('game', null);
    if (saved && Array.isArray(saved.values) && saved.values.length === 81 && LEVELS[saved.level]) {
      game = saved;
      selected = Math.max(0, game.values.findIndex((v) => v === 0));
      select(selected);
      overlay.show({
        title: 'Sudoku',
        text: 'Continue your puzzle?',
        stats: [
          ['Level', LEVELS[game.level].label],
          ['Time', kit.formatTime(game.elapsed)],
        ],
        buttons: [
          { label: 'Continue', primary: true, onClick: () => { overlay.hide(); timing = game.elapsed > 0; select(selected); } },
          { label: 'New puzzle', onClick: confirmNew },
          { label: 'Menu', onClick: exit },
        ],
      });
    } else {
      overlay.show({
        title: 'Sudoku',
        text: 'Fill every row, column and 3×3 box with 1–9. Type digits, Shift+digit or N for notes, H for a hint. Your puzzle is saved as you go.',
        options: levelOption(),
        buttons: [
          { label: 'Play', primary: true, onClick: newGame },
          { label: 'Menu', onClick: exit },
        ],
      });
    }

    return () => save();
  },
});
