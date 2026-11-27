// Read-only view over games/registry.js: validated, normalised entries plus the queries the UI
// needs. Problems in the registry are reported in the browser console (F12).
(function (WG) {
  'use strict';

  const genres = WG.genres || [];
  const genreById = new Map(genres.map((genre) => [genre.id, genre]));

  function validate(entries) {
    const seen = new Set();
    return entries.filter((game, index) => {
      const where = `games/registry.js entry #${index + 1}${game && game.id ? ` ("${game.id}")` : ''}`;
      if (!game || typeof game.id !== 'string' || !/^[a-z0-9-]+$/.test(game.id)) {
        console.warn(`[WorkGames] ${where}: "id" must use only a-z, 0-9 and "-". Entry skipped.`);
        return false;
      }
      if (seen.has(game.id)) {
        console.warn(`[WorkGames] ${where}: duplicate id. Entry skipped.`);
        return false;
      }
      seen.add(game.id);
      if (!game.title) console.warn(`[WorkGames] ${where}: missing "title".`);
      if (!genreById.has(game.genre)) {
        console.warn(`[WorkGames] ${where}: unknown genre "${game.genre}". Use one of: ${genres.map((g) => g.id).join(', ')}.`);
      }
      return true;
    });
  }

  const allGames = validate(WG.games || []).map((game) =>
    Object.freeze({
      ...game,
      title: game.title || game.id,
      cover: game.cover || `games/${game.id}/cover.svg`,
      tags: game.tags || [],
    }),
  );
  const byId = new Map(allGames.map((game) => [game.id, game]));

  function getGame(id) {
    return byId.get(id) || null;
  }

  function gamesByIds(ids) {
    return ids.map(getGame).filter(Boolean);
  }

  function genreOf(game) {
    return genreById.get(game.genre) || null;
  }

  function featuredGame() {
    return allGames.find((game) => game.featured) || allGames[0] || null;
  }

  /** Row definitions for the browse page, in display order. Empty rows are hidden by the UI. */
  function buildRows({ recentIds = [], listIds = [] } = {}) {
    return [
      { id: 'continue', title: 'Continue Playing', games: gamesByIds(recentIds) },
      { id: 'trending', title: 'Trending Now', games: allGames.filter((game) => game.trending) },
      {
        id: 'top',
        title: 'Top 5 Games',
        variant: 'ranked',
        games: allGames
          .filter((game) => game.rank)
          .sort((a, b) => a.rank - b.rank)
          .slice(0, 5),
      },
      { id: 'my-list', title: 'My List', games: gamesByIds(listIds) },
      ...genres.map((genre) => ({
        id: genre.id,
        title: genre.title,
        games: allGames.filter((game) => game.genre === genre.id),
      })),
    ];
  }

  /** Every whitespace-separated term must appear in the title, genre, tags or description. */
  function searchGames(query) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return allGames.filter((game) => {
      const genre = genreOf(game);
      const haystack = [game.title, genre && genre.label, ...game.tags, game.description].join(' ').toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }

  /** Same-genre games first, then the rest, excluding the game itself. */
  function similarTo(game, limit = 6) {
    const others = allGames.filter((other) => other.id !== game.id);
    const sameGenre = others.filter((other) => other.genre === game.genre);
    const rest = others.filter((other) => other.genre !== game.genre);
    return [...sameGenre, ...rest].slice(0, limit);
  }

  WG.catalog = { genres, allGames, getGame, gamesByIds, genreOf, featuredGame, buildRows, searchGames, similarTo };
})(window.WorkGames);
