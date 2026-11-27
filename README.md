# WorkGames

A collection of simple browser games behind a streaming-service style menu: a featured billboard, horizontally scrolling rows, hover previews, a details pop-up, "My List", "Continue Playing" and search.

**Runs 100% offline from the downloaded files.** There's nothing to install: no Node, no Python, no web server, no extensions, no internet. It's plain HTML, CSS and JavaScript, so it works on locked-down PCs.

## Run it

1. Get the files: `git clone` the repo, or on GitHub use **Code → Download ZIP** and extract it.
2. Open `index.html` in Edge or Chrome. Any of these works:
   - In VS Code, right-click `index.html` → **Reveal in File Explorer**, then double-click it.
   - In the VS Code terminal (**Terminal → New Terminal**), run `start index.html` (Windows) or `open index.html` (macOS).
   - Drag `index.html` into a browser window.

After editing a file, refresh the browser (F5) to see the change.

> If your PC has the **Live Preview** or **Live Server** VS Code extension, that works too, but you don't need it.

## Project layout

```
index.html                 entry page; loads the scripts below in order
assets/                    favicon and shared images
src/
  dom.js                   h() element helper, icons, shared WorkGames namespace
  store.js                 My List, Continue Playing, per-game saved data (localStorage)
  catalog.js               reads games/registry.js, validates it, builds the rows
  router.js                #/ (menu) and #/play/<id> (game)
  components/              nav, hero billboard, rows/tiles, hover preview, details modal
  views/home.js            the menu page
  views/player.js          full-screen game host + WorkGames.registerGame()
  styles/app.css           all styling
games/
  registry.js              THE GAME LIST: titles, descriptions, genres, rows
  _template/game.js        a small working game to copy
  _shared/coming-soon.js   placeholder screen for games not built yet
  <id>/game.js             one folder per game
  <id>/cover.svg           16:9 cover art
```

## Adding a game

1. Copy `games/_template` to `games/my-game`.
2. In `games/my-game/game.js`, change `'_template'` to `'my-game'`.
3. Add an entry to `games/registry.js`:
   ```js
   {
     id: 'my-game',            // must match the folder name
     title: 'My Game',
     description: 'One or two sentences.',
     genre: 'arcade',          // arcade | puzzle | board | word (see `WorkGames.genres`)
     tags: ['Quick'],
     players: '1 Player',
     playtime: '2 min',
     controls: 'Arrow keys',
   },
   ```
   This registry entry is plain data: the menu reads it to show your game. Optional flags are `isNew`, `featured` (the big billboard), `trending` (the Trending Now row) and `rank: 1–5` (the Top 5 row).
4. Add `games/my-game/cover.svg` (or `.png`/`.jpg`, set via `cover: 'games/my-game/cover.png'`). Use 16:9 art with the subject in the centre, because the Top 5 row crops it to portrait.
5. Refresh the page. If something is wrong with the entry, the browser console (F12) says what.

The sample games already in the menu are placeholders. To build one, replace its `game.js` (e.g. `games/snake/game.js`) with a real implementation based on the template.

### Game contract

```js
WorkGames.registerGame('my-game', {
  mount(root, ctx) {
    // root: empty element that fills the screen. Render your game into it.
    // ctx.game: the registry entry. ctx.exit(): back to the menu.
    // ctx.signal: aborted when the game closes, so listeners added with { signal } clean themselves up.
    // ctx.storage.get(key, fallback) / .set(key, value): saved per game (high scores etc.)
    window.addEventListener('keydown', onKey, { signal: ctx.signal });
    const frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame); // optional cleanup when the game closes
  },
});
```

`registerGame` hands the framework your game object. The framework calls `mount` each time the player presses Play, and calls the function `mount` returns when they leave the game. Hooking listeners to `ctx.signal` and returning a cleanup means nothing keeps running in the background after they go back to the menu.

### Shared game kit

`WorkGames.kit` (`games/_shared/kit.js`) gives every game the same look and controls. Use it rather than writing your own:

| Helper | What it does |
| --- | --- |
| `kit.overlay(root)` | Start, pause and game-over panel with buttons, stats and option pickers (mode, difficulty) |
| `kit.hud(root, items)` | Score / time readouts in the top-right corner |
| `kit.viewport(root, signal, { width, height })` | Canvas with a fixed-size world scaled to fit any screen |
| `kit.loop(signal, step)` | Animation loop that calls `step(dt)` every frame and stops when the game closes |
| `kit.keyboard(signal, onKey)` / `kit.swipe(el, signal, fn)` | Keyboard and touch input |
| `kit.screen(root, ...children)` | Centred layout for board/card games built from HTML |
| `kit.css('games/my-game/style.css')` | Load a stylesheet for your game (`await` it in `mount`) |
| `kit.best(storage, key, value)` | Save best scores / times |

`games/_template/game.js` uses most of these.

The rules exist because the page runs straight from disk:

- **Plain scripts only, no `import`/`export`.** Browsers refuse to load ES modules from `file://`.
- **No network.** Don't use CDN scripts, web fonts or remote images. Put assets in the game's folder and reference them as `games/my-game/sprite.png`.
- **No `fetch()` of local files.** It is blocked on `file://`. Put data in JS instead, e.g. `const LEVELS = [...]`.
- Keep game state inside `mount()`. The script loads once, but `mount` runs on every play.

## Saved data

My List, Continue Playing and anything games store with `ctx.storage` live in the browser's localStorage. That data stays on that PC and browser only. If localStorage is blocked, everything still works, it just isn't remembered.
