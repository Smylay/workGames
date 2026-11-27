// Snake: eat, grow, don't hit yourself (or the walls, if they're on).
WorkGames.registerGame('snake', {
  mount(root, { signal, storage, exit }) {
    const kit = WorkGames.kit;

    const COLS = 28;
    const ROWS = 16;
    const CELL = 30;
    const W = COLS * CELL;
    const H = ROWS * CELL;
    const STEP = { slow: 0.15, normal: 0.11, fast: 0.075 }; // seconds per move
    const SPEED_UP = 0.985; // each meal makes the snake this much faster...
    const MAX_SPEED_UP = 0.6; // ...down to this fraction of the starting step time
    const DIRS = {
      ArrowUp: [0, -1], KeyW: [0, -1],
      ArrowDown: [0, 1], KeyS: [0, 1],
      ArrowLeft: [-1, 0], KeyA: [-1, 0],
      ArrowRight: [1, 0], KeyD: [1, 0],
    };

    const view = kit.viewport(root, signal, { width: W, height: H });
    const hud = kit.hud(root, [
      { id: 'score', label: 'Score' },
      { id: 'best', label: 'Best' },
    ]);
    const overlay = kit.overlay(root);

    let prefs = { speed: 'normal', walls: 'on', ...storage.get('prefs', {}) };
    let state = 'menu'; // menu | playing | paused | dying | over
    let snake = [];
    let previousTail = null;
    let dir = [1, 0];
    let queue = [];
    let food = null;
    let score = 0;
    let stepTime = STEP.normal;
    let acc = 0;
    let delay = 0;
    let dyingFor = 0;
    let time = 0;

    const bestKey = () => `best:${prefs.speed}:${prefs.walls}`;

    kit.keyboard(signal, (event) => {
      if (event.code === 'Escape' || event.code === 'KeyP') {
        if (state === 'playing') pause();
        else if (state === 'paused') resume();
        return;
      }
      const next = DIRS[event.code];
      if (next && state === 'playing') turn(next);
    });
    kit.swipe(root, signal, (direction) => {
      if (state !== 'playing') return;
      turn({ up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[direction]);
    });
    kit.onHide(signal, () => state === 'playing' && pause());

    // Queue turns so two quick key presses between moves both count.
    function turn(next) {
      const last = queue.length ? queue[queue.length - 1] : dir;
      if (next[0] === last[0] && next[1] === last[1]) return;
      if (next[0] === -last[0] && next[1] === -last[1]) return; // no reversing into yourself
      if (queue.length < 3) queue.push(next);
    }

    function placeFood() {
      const taken = new Set(snake.map((p) => p.x + p.y * COLS));
      const free = [];
      for (let i = 0; i < COLS * ROWS; i++) if (!taken.has(i)) free.push(i);
      if (!free.length) return null;
      const index = free[kit.randInt(free.length)];
      return { x: index % COLS, y: Math.floor(index / COLS) };
    }

    function start(options) {
      if (options) {
        prefs = { ...prefs, ...options };
        storage.set('prefs', prefs);
      }
      const y = Math.floor(ROWS / 2);
      snake = [{ x: 6, y }, { x: 5, y }, { x: 4, y }];
      previousTail = { x: 3, y };
      dir = [1, 0];
      queue = [];
      score = 0;
      stepTime = STEP[prefs.speed];
      acc = 0;
      delay = 0.5; // short beat before moving
      food = placeFood();
      hud.set('score', 0);
      hud.set('best', storage.get(bestKey(), 0));
      state = 'playing';
      overlay.hide();
    }

    function step() {
      if (queue.length) dir = queue.shift();
      let x = snake[0].x + dir[0];
      let y = snake[0].y + dir[1];
      if (prefs.walls === 'off') {
        x = (x + COLS) % COLS;
        y = (y + ROWS) % ROWS;
      } else if (x < 0 || y < 0 || x >= COLS || y >= ROWS) {
        return die();
      }
      const eating = food && x === food.x && y === food.y;
      // The tail moves out of the way this step unless we're growing.
      const body = eating ? snake : snake.slice(0, -1);
      if (body.some((p) => p.x === x && p.y === y)) return die();

      previousTail = snake[snake.length - 1];
      snake = [{ x, y }, ...body];
      if (eating) {
        score += 1;
        hud.set('score', score);
        stepTime = Math.max(STEP[prefs.speed] * MAX_SPEED_UP, stepTime * SPEED_UP);
        food = placeFood();
        if (!food) return finish(true);
      }
    }

    function die() {
      state = 'dying';
      dyingFor = 0;
    }

    function finish(won = false) {
      state = 'over';
      const record = kit.best(storage, bestKey(), score);
      hud.set('best', record.best);
      overlay.show({
        kicker: won ? 'You filled the board!' : record.isNew && score > 0 ? 'New best!' : 'Game over',
        title: `${score} ${score === 1 ? 'apple' : 'apples'}`,
        stats: [['Best', record.best]],
        options: menuOptions(),
        buttons: [
          { label: 'Play again', primary: true, onClick: start },
          { label: 'Menu', onClick: exit },
        ],
      });
    }

    function pause() {
      state = 'paused';
      overlay.show({
        title: 'Paused',
        buttons: [
          { label: 'Resume', primary: true, onClick: resume },
          { label: 'Restart', onClick: () => start() },
          { label: 'Menu', onClick: exit },
        ],
      });
    }

    function resume() {
      state = 'playing';
      overlay.hide();
    }

    function menuOptions() {
      return [
        {
          id: 'speed',
          label: 'Speed',
          value: prefs.speed,
          choices: [
            { value: 'slow', label: 'Slow' },
            { value: 'normal', label: 'Normal' },
            { value: 'fast', label: 'Fast' },
          ],
        },
        {
          id: 'walls',
          label: 'Walls',
          value: prefs.walls,
          choices: [
            { value: 'on', label: 'Solid walls' },
            { value: 'off', label: 'Wrap around' },
          ],
        },
      ];
    }

    function update(dt) {
      time += dt;
      if (state === 'dying') {
        dyingFor += dt;
        if (dyingFor > 0.7) finish();
        return;
      }
      if (state !== 'playing') return;
      if (delay > 0) {
        delay -= dt;
        return;
      }
      acc += dt;
      while (acc >= stepTime && state === 'playing') {
        acc -= stepTime;
        step();
      }
    }

    // ------------------------------------------------------------------ drawing
    const centre = (p) => ({ x: p.x * CELL + CELL / 2, y: p.y * CELL + CELL / 2 });

    function drawBoard(g) {
      const bg = g.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, W * 0.7);
      bg.addColorStop(0, '#0f3b22');
      bg.addColorStop(1, '#03110a');
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(63, 191, 116, 0.12)';
      g.lineWidth = 1;
      g.beginPath();
      for (let x = 1; x < COLS; x++) {
        g.moveTo(x * CELL + 0.5, 0);
        g.lineTo(x * CELL + 0.5, H);
      }
      for (let y = 1; y < ROWS; y++) {
        g.moveTo(0, y * CELL + 0.5);
        g.lineTo(W, y * CELL + 0.5);
      }
      g.stroke();
      if (prefs.walls === 'on') {
        g.strokeStyle = 'rgba(61, 255, 143, 0.55)';
        g.lineWidth = 3;
        g.strokeRect(1.5, 1.5, W - 3, H - 3);
      }
    }

    function drawFood(g) {
      if (!food) return;
      const { x, y } = centre(food);
      const pulse = 1 + Math.sin(time * 6) * 0.06;
      g.save();
      g.shadowColor = '#ff3b5c';
      g.shadowBlur = 18;
      g.fillStyle = '#ff3b5c';
      g.beginPath();
      g.arc(x, y + 1, CELL * 0.36 * pulse, 0, Math.PI * 2);
      g.fill();
      g.restore();
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.beginPath();
      g.arc(x - 4, y - 3, 3, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#3dff8f';
      g.beginPath();
      g.ellipse(x + 5, y - 11, 6, 3, -0.5, 0, Math.PI * 2);
      g.fill();
    }

    /** Points along the body for this frame: head and tail slide between cells for smooth motion. */
    function bodyPoints(alpha) {
      const points = snake.map(centre);
      const neck = points[1];
      const head = points[0];
      if (neck && Math.abs(head.x - neck.x) + Math.abs(head.y - neck.y) <= CELL) {
        points[0] = { x: neck.x + (head.x - neck.x) * alpha, y: neck.y + (head.y - neck.y) * alpha };
      } else if (neck) {
        // Wrapped through an edge: slide out past the edge instead of across the board.
        points[0] = { x: neck.x + dir[0] * CELL * alpha, y: neck.y + dir[1] * CELL * alpha };
      }
      if (previousTail) {
        const tail = points[points.length - 1];
        const from = centre(previousTail);
        if (Math.abs(tail.x - from.x) + Math.abs(tail.y - from.y) <= CELL) {
          points.push({ x: from.x + (tail.x - from.x) * alpha, y: from.y + (tail.y - from.y) * alpha });
        }
      }
      return points;
    }

    function tracePath(g, points) {
      g.beginPath();
      g.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > CELL * 1.5) g.moveTo(b.x, b.y);
        else g.lineTo(b.x, b.y);
      }
    }

    function drawSnake(g) {
      if (!snake.length) return;
      const moving = state === 'playing' && delay <= 0;
      const alpha = moving ? Math.min(1, acc / stepTime) : 1;
      const points = bodyPoints(alpha);
      const dead = state === 'dying' || state === 'over';
      const flash = state === 'dying' && Math.floor(dyingFor * 10) % 2 === 0;
      const color = dead ? (flash ? '#ffffff' : '#ff4d6d') : '#2ee87d';

      g.save();
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.shadowColor = color;
      g.shadowBlur = 16;
      g.strokeStyle = color;
      g.lineWidth = CELL * 0.78;
      tracePath(g, points);
      g.stroke();
      g.restore();

      g.save();
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.strokeStyle = 'rgba(255,255,255,0.28)';
      g.lineWidth = CELL * 0.18;
      g.translate(-3, -3);
      tracePath(g, points);
      g.stroke();
      g.restore();

      // Head with eyes looking where we're going.
      const head = points[0];
      g.fillStyle = dead ? color : '#7dffb3';
      g.beginPath();
      g.arc(head.x, head.y, CELL * 0.46, 0, Math.PI * 2);
      g.fill();
      const [dx, dy] = dir;
      const side = { x: -dy, y: dx };
      g.fillStyle = '#04130b';
      for (const s of [-1, 1]) {
        g.beginPath();
        g.arc(head.x + dx * 5 + side.x * 6 * s, head.y + dy * 5 + side.y * 6 * s, 3.6, 0, Math.PI * 2);
        g.fill();
      }
    }

    function draw() {
      const g = view.ctx;
      view.begin();
      g.save();
      g.beginPath();
      g.rect(0, 0, W, H);
      g.clip();
      drawBoard(g);
      drawFood(g);
      drawSnake(g);
      g.restore();
    }

    kit.loop(signal, (dt) => {
      update(dt);
      draw();
    }).start();

    // Show a board behind the menu.
    start();
    state = 'menu';
    hud.set('best', storage.get(bestKey(), 0));
    overlay.show({
      title: 'Snake',
      text: 'Eat the apples and grow. Don’t bite your own tail. Arrow keys, WASD or swipe to steer; Esc to pause.',
      options: menuOptions(),
      buttons: [
        { label: 'Play', primary: true, onClick: start },
        { label: 'Menu', onClick: exit },
      ],
    });
  },
});
