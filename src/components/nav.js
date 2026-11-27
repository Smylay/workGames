// Fixed top bar: logo, section links and an expanding search box.
(function (WG) {
  'use strict';
  const { h, icon } = WG;

  /**
   *   onSearch(query) fires on every keystroke ('' when cleared)
   *   onJump(target)  fires for link clicks; target is 'top' or a row element id
   */
  function createNav({ onSearch, onJump }) {
    const links = [
      { label: 'Home', target: 'top' },
      ...WG.catalog.genres.map((genre) => ({ label: genre.label, target: `row-${genre.id}` })),
      { label: 'My List', target: 'row-my-list' },
    ];

    const linkItems = links.map(({ label, target }, index) =>
      h(
        'li',
        { 'data-target': target },
        h(
          'button',
          { class: `nav__link${index === 0 ? ' is-active' : ''}`, type: 'button', onclick: () => onJump(target) },
          label,
        ),
      ),
    );
    const listLink = linkItems.find((item) => item.dataset.target === 'row-my-list');

    const input = h('input', {
      class: 'search__input',
      type: 'search',
      placeholder: 'Titles, genres, tags',
      'aria-label': 'Search games',
      autocomplete: 'off',
      spellcheck: 'false',
    });
    const toggle = h('button', { class: 'search__toggle', type: 'button', 'aria-label': 'Search' }, icon('search'));
    const search = h('div', { class: 'search', role: 'search' }, toggle, input);

    function openSearch() {
      search.classList.add('search--open');
      input.focus();
    }
    function clearSearch() {
      input.value = '';
      search.classList.remove('search--open');
    }

    toggle.addEventListener('click', () => {
      if (search.classList.contains('search--open') && !input.value) clearSearch();
      else openSearch();
    });
    input.addEventListener('input', () => onSearch(input.value.trim()));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        clearSearch();
        onSearch('');
        input.blur();
      }
    });
    input.addEventListener('blur', () => {
      if (!input.value) search.classList.remove('search--open');
    });

    const logo = h(
      'a',
      {
        class: 'nav__logo',
        href: '#/',
        'aria-label': 'WorkGames home',
        onclick: (event) => {
          event.preventDefault();
          onJump('top');
        },
      },
      'WorkGames',
    );

    const el = h(
      'header',
      { class: 'nav' },
      logo,
      h('nav', { 'aria-label': 'Sections' }, h('ul', { class: 'nav__links' }, linkItems)),
      h('div', { class: 'nav__right' }, search),
    );

    return {
      el,
      clearSearch,
      setSolid(solid) {
        el.classList.toggle('nav--solid', solid);
      },
      setListVisible(visible) {
        if (listLink) listLink.hidden = !visible;
      },
    };
  }

  WG.createNav = createNav;
})(window.WorkGames);
