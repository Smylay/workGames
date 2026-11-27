// Game template: a tiny but complete game showing the whole contract and the shared kit.
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
//   ctx.signal   AbortSignal aborted when the game closes. Pass it to addEventListener (and
//                to the kit helpers) and the listener is removed for you.
//   ctx.storage  get(key, fallback) / set(key, value) / remove(key), saved per game
//
// WorkGames.kit (games/_shared/kit.js) has the shared pieces: overlay panels, HUD, canvas
// viewport, game loop, keyboard and swipe input, best-score storage.
//
// Rules:
//   - Keep all state inside mount(); the file is loaded once but mount runs on every play.
//   - Everything must work offline: no CDN scripts, web fonts or remote images. Put any
//     images/sounds in the game's folder and reference them as 'games/my-game/file.png'.
//   - Plain script, no import/export (ES modules do not load from file://), no fetch().
//
// This demo: move the square with the arrow keys / WASD and collect 10 dots, fast.

WorkGames.registerGame('_template', {
  mount(root, { game, signal, storage, exit }) {
    const kit = WorkGames.kit;
    const WORLD = { width: 960, height: 540 };
    const GOAL = 10;

    const view = kit.viewport(root, signal, { ...WORLD, background: '#000' });
    const hud = kit.hud(root, [
      { id: 'dots', label: 'Dots', value: `0/${GOAL}` },
      { id: 'time', label: 'Time', value: '0:00' },
    ]);
    const overlay = kit.overlay(root);
    const keys = kit.keyboard(signal, (event) => {
      if ((event.code === 'Escape' || event.code === 'KeyP') && state === 'playing') pause();
    });
    kit.onHide(signal, () => state === 'playing' && pause());

    let state = 'menu'; // menu | playing | paused | over
    let player;
    let dot;
    let collected;
    let elapsed;

    function randomDot() {
      return { x: 60 + Math.random() * (WORLD.width - 120), y: 60 + Math.random() * (WORLD.height - 120) };
    }

    function start() {
      player = { x: WORLD.width / 2, y: WORLD.height / 2 };
      dot = randomDot();
      collected = 0;
      elapsed = 0;
      state = 'playing';
      overlay.hide();
    }

    function pause() {
      state = 'paused';
      overlay.show({
        title: 'Paused',
        buttons: [
          { label: 'Resume', primary: true, onClick: () => { state = 'playing'; overlay.hide(); } },
          { label: 'Restart', onClick: start },
          { label: 'Menu', onClick: exit },
        ],
      });
    }

    function finish() {
      state = 'over';
      const record = kit.best(storage, 'bestTime', elapsed, { lowerIsBetter: true });
      overlay.show({
        kicker: record.isNew ? 'New best!' : 'Done',
        title: kit.formatTime(elapsed),
        stats: [['Best', kit.formatTime(record.best)]],
        buttons: [
          { label: 'Play again', primary: true, onClick: start },
          { label: 'Menu', onClick: exit },
        ],
      });
    }

    function update(dt) {
      if (state !== 'playing') return;
      elapsed += dt;
      const speed = 420;
      const dx = keys.isDown('ArrowRight', 'KeyD') - keys.isDown('ArrowLeft', 'KeyA');
      const dy = keys.isDown('ArrowDown', 'KeyS') - keys.isDown('ArrowUp', 'KeyW');
      player.x = Math.min(WORLD.width - 20, Math.max(20, player.x + dx * speed * dt));
      player.y = Math.min(WORLD.height - 20, Math.max(20, player.y + dy * speed * dt));
      if (Math.hypot(player.x - dot.x, player.y - dot.y) < 30) {
        collected += 1;
        dot = randomDot();
        if (collected >= GOAL) finish();
      }
      hud.set('dots', `${collected}/${GOAL}`);
      hud.set('time', kit.formatTime(elapsed));
    }

    function draw() {
      const g = view.ctx;
      view.begin();
      g.fillStyle = '#101018';
      g.fillRect(0, 0, WORLD.width, WORLD.height);
      if (!player) return;
      g.fillStyle = '#ffd166';
      g.beginPath();
      g.arc(dot.x, dot.y, 10, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#e50914';
      g.fillRect(player.x - 20, player.y - 20, 40, 40);
    }

    kit.loop(signal, (dt) => {
      update(dt);
      draw();
    }).start();

    overlay.show({
      kicker: 'Template',
      title: game.title || 'Dot Dash',
      text: `Collect ${GOAL} dots as fast as you can. Arrow keys or WASD to move, Esc to pause.`,
      buttons: [
        { label: 'Play', primary: true, onClick: start },
        { label: 'Menu', onClick: exit },
      ],
    });
  },
});
