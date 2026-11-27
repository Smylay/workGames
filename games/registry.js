// The game catalogue. This file is the only place a game needs to be listed.
//
// To add a game:
//   1. Copy games/_template to games/<id> and change the id in its game.js
//      (WorkGames.registerGame('<id>', ...)).
//   2. Add games/<id>/cover.svg (16:9 art, keep the subject centred), or set `cover`
//      to another image path.
//   3. Add an entry below. Problems with an entry are reported in the browser console (F12).
//
// Fields:
//   id          url-safe id, must match the folder name (a-z, 0-9, -)
//   title       display name
//   description one or two sentences, shown in the hero / details modal
//   genre       one of the `genres` ids below; decides which row the game appears in
//   tags        short extra labels shown in previews and details
//   players     e.g. "1 Player", "1–2 Players"
//   playtime    typical session length, e.g. "2–5 min"
//   controls    how to play, shown in the details modal
//   isNew       shows a "New" badge
//   featured    the first featured game fills the big billboard at the top
//   trending    appears in the "Trending Now" row
//   rank        1–5, appears in the "Top 5" row in that position
//   cover       optional; defaults to games/<id>/cover.svg

window.WorkGames = window.WorkGames || {};

WorkGames.genres = [
  { id: 'arcade', label: 'Arcade', title: 'Arcade Classics' },
  { id: 'puzzle', label: 'Puzzle', title: 'Puzzles & Brain Teasers' },
  { id: 'board', label: 'Board', title: 'Board Games' },
  { id: 'word', label: 'Word', title: 'Word Games' },
];

WorkGames.games = [
  {
    id: 'apex-circuit',
    title: 'Apex Circuit',
    description:
      'Strap in for a six-car race around a hilly 2.7 km circuit. Brake late, hit the apex and drift the hairpin, from the cockpit, the hood or behind the car.',
    genre: 'arcade',
    tags: ['Racing', '3D'],
    players: '1 Player',
    playtime: '3–8 min',
    controls: 'Arrow keys or WASD, Space handbrake, C camera, R reset',
    isNew: true,
    featured: true,
    trending: true,
  },
  {
    id: 'space-rocks',
    title: 'Space Rocks',
    description:
      'A lone ship in a field of drifting asteroids. Thrust, turn and blast big rocks into smaller ones before they smash into you. How long can you survive?',
    genre: 'arcade',
    tags: ['Shooter', 'Survival'],
    players: '1 Player',
    playtime: '3–10 min',
    controls: 'Arrow keys to fly, Space to fire',
    isNew: true,
    trending: true,
  },
  {
    id: 'snake',
    title: 'Snake',
    description:
      'Guide a hungry snake around the grid and eat everything in sight. Every bite makes you longer, so try not to run into your own tail.',
    genre: 'arcade',
    tags: ['Retro', 'Fast-paced'],
    players: '1 Player',
    playtime: '2–5 min',
    controls: 'Arrow keys or WASD',
    trending: true,
    rank: 1,
  },
  {
    id: 'number-merge',
    title: 'Number Merge',
    description:
      'Slide numbered tiles across a 4×4 board. Matching tiles merge and double. Plan ahead, because the board fills up fast.',
    genre: 'puzzle',
    tags: ['Strategy', 'Relaxing'],
    players: '1 Player',
    playtime: '5–15 min',
    controls: 'Arrow keys or swipe',
    trending: true,
    rank: 2,
  },
  {
    id: 'brick-breaker',
    title: 'Brick Breaker',
    description:
      'Bounce the ball off your paddle and smash through every row of bricks. Keep it in the air: one miss costs a life.',
    genre: 'arcade',
    tags: ['Retro', 'Action'],
    players: '1 Player',
    playtime: '3–8 min',
    controls: 'Mouse or ← →',
    trending: true,
    rank: 3,
  },
  {
    id: 'word-guess',
    title: 'Word Guess',
    description:
      'Find the hidden five-letter word in six tries. Each guess shows which letters are in the right spot and which are in the word somewhere else.',
    genre: 'word',
    tags: ['Daily', 'Vocabulary'],
    players: '1 Player',
    playtime: '3–5 min',
    controls: 'Keyboard',
    isNew: true,
    trending: true,
    rank: 4,
  },
  {
    id: 'mine-field',
    title: 'Mine Field',
    description:
      'Clear the grid without setting off a single mine. Every number tells you how many mines touch that square, so read them carefully.',
    genre: 'puzzle',
    tags: ['Logic', 'Classic'],
    players: '1 Player',
    playtime: '2–10 min',
    controls: 'Click to reveal, right-click to flag',
    trending: true,
    rank: 5,
  },
  {
    id: 'memory-match',
    title: 'Memory Match',
    description: 'Flip two cards at a time and find every matching pair. Fewer flips means a better score.',
    genre: 'puzzle',
    tags: ['Memory', 'Casual'],
    players: '1 Player',
    playtime: '2–4 min',
    controls: 'Mouse or touch',
    trending: true,
  },
  {
    id: 'four-in-a-row',
    title: 'Four in a Row',
    description: 'Drop discs into the grid and be the first to line up four: across, down or diagonally.',
    genre: 'board',
    tags: ['Strategy', 'Versus'],
    players: '1–2 Players',
    playtime: '3–5 min',
    controls: 'Mouse or 1–7 keys',
    trending: true,
  },
  {
    id: 'paddle-ball',
    title: 'Paddle Ball',
    description:
      'The original head-to-head. Keep the ball in play and sneak it past your opponent, either the computer or a friend on the same keyboard.',
    genre: 'arcade',
    tags: ['Retro', 'Versus'],
    players: '1–2 Players',
    playtime: '2–5 min',
    controls: 'W / S and ↑ / ↓',
  },
  {
    id: 'sliding-puzzle',
    title: 'Sliding Puzzle',
    description: 'Fifteen tiles, one gap. Slide them back into order in as few moves as you can.',
    genre: 'puzzle',
    tags: ['Logic', 'Relaxing'],
    players: '1 Player',
    playtime: '2–6 min',
    controls: 'Click or arrow keys',
  },
  {
    id: 'sudoku',
    title: 'Sudoku',
    description:
      'Fill the grid so every row, column and 3×3 box contains the digits 1 to 9. Pure logic, no guessing required.',
    genre: 'puzzle',
    tags: ['Logic', 'Numbers'],
    players: '1 Player',
    playtime: '10–30 min',
    controls: 'Mouse and number keys',
    isNew: true,
  },
  {
    id: 'tic-tac-toe',
    title: 'Tic-Tac-Toe',
    description: 'Three in a row wins. Play a friend on the same screen or take on the computer.',
    genre: 'board',
    tags: ['Quick', 'Versus'],
    players: '1–2 Players',
    playtime: '1 min',
    controls: 'Mouse or 1–9 keys',
  },
  {
    id: 'word-scramble',
    title: 'Word Scramble',
    description: 'Unscramble the letters to find as many words as you can before the clock runs out.',
    genre: 'word',
    tags: ['Vocabulary', 'Timed'],
    players: '1 Player',
    playtime: '2 min',
    controls: 'Keyboard',
  },
];
