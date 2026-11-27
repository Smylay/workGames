// Browse page: nav, featured billboard, rows of games, search results.
(function (WG) {
  'use strict';
  const { h } = WG;

  let savedScroll = 0;

  function renderHome(outlet) {
    const { catalog, store } = WG;
    document.title = 'WorkGames';

    if (!catalog.allGames.length) {
      outlet.append(h('p', { class: 'empty-catalog' }, 'No games registered. Add entries to games/registry.js.'));
      return null;
    }

    const preview = WG.createPreviewController();
    const rows = catalog
      .buildRows({ recentIds: store.recent.ids(), listIds: store.myList.ids() })
      .map((def) => WG.createRow(def, preview));
    const listRow = rows.find((row) => row.id === 'my-list');

    const browse = h(
      'main',
      { class: 'browse' },
      WG.createHero(catalog.featuredGame()),
      h('div', { class: 'rows' }, rows.map((row) => row.el)),
    );
    const results = h('main', { class: 'search-results', hidden: true, 'aria-live': 'polite' });
    const nav = WG.createNav({ onSearch: showSearch, onJump: jump });
    nav.setListVisible(store.myList.ids().length > 0);

    function showSearch(query) {
      preview.close(true);
      if (!query) {
        results.hidden = true;
        browse.hidden = false;
        return;
      }
      const matches = catalog.searchGames(query);
      results.replaceChildren(
        matches.length
          ? h('ul', { class: 'search-results__grid' }, matches.map((game) => h('li', {}, WG.createTile(game, preview))))
          : h('p', { class: 'search-results__empty' }, `No games match “${query}”.`),
      );
      browse.hidden = true;
      results.hidden = false;
      window.scrollTo(0, 0);
    }

    function jump(target) {
      nav.clearSearch();
      showSearch('');
      if (target === 'top') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      const section = document.getElementById(target);
      if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    const unsubscribe = store.subscribe((change) => {
      if (change.type !== 'list') return;
      const ids = store.myList.ids();
      if (listRow) listRow.setGames(catalog.gamesByIds(ids));
      nav.setListVisible(ids.length > 0);
    });

    const onScroll = () => nav.setSolid(window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });

    const footer = h(
      'footer',
      { class: 'footer' },
      h('p', {}, `${catalog.allGames.length} games · Runs offline in your browser`),
      h(
        'p',
        {},
        'Add a game: copy ',
        h('code', {}, 'games/_template'),
        ' and register it in ',
        h('code', {}, 'games/registry.js'),
        '.',
      ),
    );

    outlet.append(nav.el, browse, results, footer);
    window.scrollTo(0, savedScroll);
    onScroll();

    return () => {
      savedScroll = window.scrollY;
      window.removeEventListener('scroll', onScroll);
      unsubscribe();
      preview.destroy();
      WG.details.close();
      rows.forEach((row) => row.destroy());
    };
  }

  WG.renderHome = renderHome;
})(window.WorkGames);
