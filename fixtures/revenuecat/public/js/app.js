import { api } from './api.js';
import { el } from './ui.js';
import { renderRoute } from './views.js';

const app = document.querySelector('#app');

let state = null;

function currentRoute() {
  const h = location.hash || '';
  if (h === '' || h === '#/') return '#/onboarding';
  return h;
}

async function load() {
  const data = await api('/api/bootstrap');
  state = {
    ...data,
    recentSessions: data.sessions ?? [],
  };
  return state;
}

function setState(patch) {
  if (!patch) return state;
  if (patch.view) state.view = patch.view;
  if (patch.catalog) state.catalog = patch.catalog;
  if (patch.metrics) state.metrics = patch.metrics;
  if (patch.sessions) state.recentSessions = patch.sessions;
  return state;
}

async function refresh() {
  const data = await api('/api/bootstrap');
  state.metrics = data.metrics;
  state.view = data.view;
  state.recentSessions = data.sessions ?? [];
  renderRoute(ctx());
}

function ctx() {
  return {
    app,
    state,
    route: currentRoute(),
    navigate(route) {
      location.hash = route;
    },
    refresh,
    setState,
  };
}

window.addEventListener('hashchange', () => {
  if (!state) return;
  renderRoute(ctx());
});

async function boot() {
  try {
    await load();
    renderRoute(ctx());
  } catch (err) {
    app.append(
      el('div', { class: 'fatal' }, [
        el('p', { class: 'fatal-title' }, 'Could not reach the Lumen server'),
        el('p', {}, err.message),
        el('p', { class: 'fatal-sub' }, 'Run `npm start` in the project directory, then reload.'),
      ]),
    );
  }
}

boot();
