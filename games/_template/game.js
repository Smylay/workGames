// Game template: a tiny but complete game showing the whole contract.
//
// To start a new game:
//   1. Copy this folder to games/my-game/ and change '_template' below to 'my-game'.
//   2. Add { id: 'my-game', title: ..., genre: ... } to games/registry.js.
//   3. Add games/my-game/cover.svg (16:9). Refresh the page.
//
// Contract: WorkGames.registerGame(id, { mount(root, ctx) }) and optionally return a
// cleanup function from mount.
//   root         empty element filling the screen; render your game into it
//   ctx.game     this game's registry entry (title, description, ...)
//   ctx.exit()   return to the main menu
//   ctx.signal   AbortSignal aborted when the game closes. Pass it to addEventListener and
//                the listener is removed for you.
//   ctx.storage  get(key, fallback) / set(key, value) / remove(key), saved per game
//
// Rules:
//   - Keep all state inside mount(); the file is loaded once but mount runs on every play.
//   - Stop anything that keeps running on its own (requestAnimationFrame, setInterval,
//     audio) in the returned cleanup function.
//   - Everything must work offline: no CDN scripts, web fonts or remote images. Put any
//     images/sounds in the game's folder and reference them as 'games/my-game/file.png'.
//   - Plain script, no import/export (ES modules do not load from file://).
//
// This demo: move the square with the arrow keys / WASD and collect the dots.

WorkGames.registerGame('_template', {
  mount(root, { signal, storage }) {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
    root.append(canvas);
    const g = canvas.getContext('2d');

    const keys = new Set();
    const player = { x: 0.5, y: 0.5 }; // positions are fractions of the play area
    const SIZE = 0.05;
    const SPEED = 0.45; // play-area widths per second
    let dot = randomDot();
    let score = 0;
    let best = storage.get('best', 0);

    function randomDot() {
      return { x: 0.1 + Math.random() * 0.8, y: 0.15 + Math.random() * 0.75 };
    }

    function resize() {
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(root.clientWidth * ratio);
      canvas.height = Math.round(root.clientHeight * ratio);
      g.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    window.addEventListener('resize', resize, { signal });
    window.addEventListener('keydown', (event) => keys.add(event.key.toLowerCase()), { signal });
    window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()), { signal });
    window.addEventListener('blur', () => keys.clear(), { signal });

    function update(dt) {
      const dx = (keys.has('arrowright') || keys.has('d')) - (keys.has('arrowleft') || keys.has('a'));
      const dy = (keys.has('arrowdown') || keys.has('s')) - (keys.has('arrowup') || keys.has('w'));
      player.x = Math.min(1 - SIZE / 2, Math.max(SIZE / 2, player.x + dx * SPEED * dt));
      player.y = Math.min(1 - SIZE / 2, Math.max(SIZE / 2, player.y + dy * SPEED * dt));

      if (Math.hypot(player.x - dot.x, player.y - dot.y) < SIZE) {
        score += 1;
        dot = randomDot();
        if (score > best) {
          best = score;
          storage.set('best', best);
        }
      }
    }

    function draw() {
      const w = root.clientWidth;
      const h = root.clientHeight;
      const unit = Math.min(w, h);
      g.fillStyle = '#101018';
      g.fillRect(0, 0, w, h);

      g.fillStyle = '#ffd166';
      g.beginPath();
      g.arc(dot.x * w, dot.y * h, unit * 0.015, 0, Math.PI * 2);
      g.fill();

      const size = unit * SIZE;
      g.fillStyle = '#e50914';
      g.fillRect(player.x * w - size / 2, player.y * h - size / 2, size, size);

      g.fillStyle = '#fff';
      g.font = '600 20px system-ui, sans-serif';
      g.textAlign = 'right';
      g.fillText(`Score ${score}   Best ${best}`, w - 24, 40);
    }

    let frame = 0;
    let last = performance.now();
    function tick(now) {
      update(Math.min(0.05, (now - last) / 1000));
      last = now;
      draw();
      frame = requestAnimationFrame(tick);
    }

    resize();
    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  },
});
