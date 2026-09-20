import '@briwa.dev/sandbox/styles';
import './demo.css';
import { mountFigures } from '@briwa.dev/sandbox/client';

const TABS = {
  figures: () => import('./figures.js'),
  controls: () => import('./controls.js'),
  editor: () => import('./editor.jsx'),
};

// One host for every tab: mountFigures resolves its frames lazily, so figures a tab
// renders later are picked up without mounting a second set of global listeners.
mountFigures();

const DEFAULT_TAB = 'figures';

const links = [...document.querySelectorAll('nav [data-tab]')];
const loaded = new Set();

async function show(name) {
  const tab = name in TABS ? name : DEFAULT_TAB;

  for (const link of links) {
    if (link.dataset.tab === tab) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }

  for (const key of Object.keys(TABS)) {
    document.querySelector(`#panel-${key}`).hidden = key !== tab;
  }

  if (loaded.has(tab)) return;
  loaded.add(tab);

  // The panel is visible before the import so module-scope setup measures a laid-out DOM.
  try {
    await TABS[tab]();
  } catch (err) {
    loaded.delete(tab);
    document.querySelector(`#panel-${tab}`).append(
      Object.assign(document.createElement('p'), {
        className: 'note',
        textContent: `Failed to load: ${err.message || err}`,
      }),
    );
  }
}

const current = () => location.hash.slice(1);

window.addEventListener('hashchange', () => show(current()));
show(current());
