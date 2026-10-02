import { api } from './api.js';
import { brand, el, fmtDate, fmtDateTime, fmtMin, money, pill, skeleton, timeAgo, toast } from './ui.js';

let timer = null;
let timerRemaining = 0;
let timerTotal = 0;

// ── Shell ────────────────────────────────────────────────────────────────────

function shell(content, opts = {}) {
  const tabs = opts.tabs !== false;
  const planLabel = opts.state.view.isPro
    ? opts.state.view.grants['focus.unlimited'].isTrial ? 'Pro trial' : 'Pro'
    : 'Free';

  const header = el('header', { class: 'topbar' }, [
    brand(),
    el('div', { class: 'topbar-right' }, [
      pill(planLabel, opts.state.view.isPro ? 'pro' : 'neutral'),
      el('button', { class: 'avatar', onclick: () => opts.navigate('#/account') }, 'A'),
    ]),
  ]);

  const main = el('main', { class: 'main' }, content);

  let tabbar = null;
  if (tabs) {
    const items = [
      ['#/dashboard', 'Dashboard', '▦'],
      ['#/insights', 'Insights', '◧'],
      ['#/account', 'Account', '⚙'],
    ];
    tabbar = el('nav', { class: 'tabbar' }, items.map(([hash, label, icon]) =>
      el('button', { class: `tab ${opts.route === hash ? 'tab--active' : ''}`, onclick: () => opts.navigate(hash) }, [
        el('span', { class: 'tab-icon' }, icon),
        el('span', { class: 'tab-label' }, label),
      ]),
    ));
  }

  return el('div', { class: 'screen' }, [header, main, tabbar]);
}

function lockedCard({ state, navigate }) {
  return el('div', { class: 'locked', role: 'group' }, [
    el('div', { class: 'locked-icon' }, '★'),
    el('h3', {}, 'A Pro feature'),
    el('p', {}, 'This area is locked on the free plan. Upgrade to Pro to unlock insights, unlimited sessions and more.'),
    el('button', { class: 'btn btn--primary', onclick: () => navigate('#/paywall') }, 'See Pro plans'),
  ]);
}

// ── Onboarding ────────────────────────────────────────────────────────────────

function onboardingView(ctx) {
  return el('div', { class: 'onboard' }, [
    el('div', { class: 'onboard-bg' }),
    el('div', { class: 'onboard-inner' }, [
      el('div', { class: 'onboard-brand' }, [brand('xl')]),
      el('h1', { class: 'onboard-title' }, 'Focus on what\nactually matters.'),
      el('p', { class: 'onboard-sub' }, 'Lumen is a calm focus companion that turns your day into a series of intentional, uninterrupted sessions.'),
      el('div', { class: 'onboard-feats' }, [
        ['◈', 'Structured focus sessions'],
        ['◈', 'A weekly rhythm you can see'],
        ['◈', 'Free forever · Pro when you need depth'],
      ].map(([ic, label]) => el('div', { class: 'onboard-feat' }, [el('span', { class: 'of-ic' }, ic), label]))),
      el('div', { class: 'onboard-cta' }, [
        el('button', { class: 'btn btn--primary btn--lg', onclick: () => ctx.navigate('#/dashboard') }, 'Continue as Ada'),
        el('button', { class: 'btn btn--ghost btn--lg', onclick: () => ctx.navigate('#/paywall') }, 'Start 7-day free trial'),
      ]),
      el('p', { class: 'onboard-legal' }, 'Subscriptions are powered by a local, deterministic store inside this project. No real payments occur.'),
    ]),
  ]);
}

// ── Dashboard ────────────────────────────────────────────────────────────────

function timerCard(ctx) {
  const card = el('section', { class: 'card timer' }, [skeleton()]);

  const presets = [25, 45, 60];
  const presetBtns = [];

  function renderPresets() {
    presetBtns.forEach((b, i) => b.classList.toggle('seg--active', presets[i] === timerTotal));
  }

  const timeLabel = el('div', { class: 'timer-time' }, '25:00');
  const ring = el('div', { class: 'timer-ring' }, [timeLabel]);
  const tagInput = el('input', { class: 'input', placeholder: 'Tag this session (e.g. Deep work)', maxlength: 40 });
  const startBtn = el('button', { class: 'btn btn--primary', onclick: start });
  const resetBtn = el('button', { class: 'btn btn--ghost', onclick: () => { stop(); timerRemaining = timerTotal; paint(); } }, 'Reset');
  const statusLine = el('p', { class: 'timer-status' }, '');

  function paint() {
    const m = Math.floor(timerRemaining / 60);
    const s = timerRemaining % 60;
    timeLabel.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    const pct = timerTotal ? timerRemaining / timerTotal : 0;
    ring.style.background = `conic-gradient(var(--accent) ${(1 - pct) * 360}deg, var(--line) 0deg)`;
    startBtn.textContent = timer ? 'Pause' : timerRemaining === timerTotal ? 'Start' : 'Resume';
  }

  function start() {
    if (timer) { stop(); paint(); return; }
    if (timerRemaining <= 0) timerRemaining = timerTotal;
    statusLine.textContent = 'In a flow state. Silence on.';
    statusLine.classList.add('timer-status--live');
    timer = setInterval(() => {
      timerRemaining--;
      if (timerRemaining <= 0) { complete(); return; }
      paint();
    }, 1000);
    paint();
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    statusLine.classList.remove('timer-status--live');
    statusLine.textContent = '';
    paint();
  }

  async function complete() {
    stop();
    timerRemaining = timerTotal;
    paint();
    startBtn.textContent = 'Saving…';
    startBtn.disabled = true;
    try {
      await api('/api/sessions', { method: 'POST', body: JSON.stringify({ durationSec: timerTotal * 60, tag: tagInput.value }) });
      ctx.refresh();
      toast(ctx.app, 'Session saved. Nice work.', 'success');
    } catch (err) {
      if (err.status === 403) {
        toast(ctx.app, err.message, 'error');
        ctx.navigate('#/paywall');
      } else {
        toast(ctx.app, err.message, 'error');
      }
    } finally {
      startBtn.disabled = false;
      startBtn.textContent = 'Start';
    }
  }

  function render() {
    timerTotal = 25;
    timerRemaining = 25 * 60;
    for (const min of presets) {
      const b = el('button', { class: 'seg', type: 'button', onclick: () => { if (!timer) { timerTotal = min * 60; timerRemaining = min * 60; paint(); renderPresets(); } } }, `${min}m`);
      presetBtns.push(b);
    }
    card.replaceChildren(
      el('div', { class: 'card-head' }, [el('h2', {}, 'Focus session'), pill('Free & Pro', 'neutral')]),
      ring,
      el('div', { class: 'seg-wrap' }, presetBtns),
      tagInput,
      el('div', { class: 'row gap' }, [startBtn, resetBtn]),
      statusLine,
    );
    paint();
    renderPresets();
  }

  render();
  return card;
}

function summaryGrid(metrics) {
  return el('div', { class: 'stat-grid' }, [
    ['Today', `${metrics.todayMinutes}m`, `${metrics.todayCount} sessions`],
    ['This week', `${metrics.weekMinutes}m`, `${metrics.weekCount} sessions`],
    ['Avg session', `${metrics.avgSessionMin}m`, 'across the week'],
    ['Streak', `${metrics.streakDays}d`, 'days in a row'],
  ].map(([label, value, sub]) =>
    el('div', { class: 'stat' }, [
      el('span', { class: 'stat-label' }, label),
      el('span', { class: 'stat-value' }, value),
      el('span', { class: 'stat-sub' }, sub),
    ]),
  ));
}

function weekChart(metrics) {
  const max = Math.max(1, ...metrics.byDay.map((d) => d.minutes));
  return el('section', { class: 'card chart-card' }, [
    el('div', { class: 'card-head' }, [el('h2', {}, 'Last 7 days')]),
    el('div', { class: 'chart', role: 'img', 'aria-label': 'Focus minutes by day' },
      metrics.byDay.map((d) => {
        const h = Math.round((d.minutes / max) * 100);
        return el('div', { class: 'chart-col', title: `${d.label}: ${d.minutes} min` }, [
          el('div', { class: 'chart-bar-wrap' }, [el('div', { class: `chart-bar ${d.minutes ? 'chart-bar--hot' : ''}`, style: `height:${Math.max(h, d.minutes ? 6 : 2)}%` })]),
          el('span', { class: 'chart-label' }, d.label),
        ]);
      }),
    ),
  ]);
}

function recentSessions(metrics, sessions) {
  const recent = [...sessions].reverse().slice(0, 6);
  return el('section', { class: 'card' }, [
    el('div', { class: 'card-head' }, [el('h2', {}, 'Recent sessions')]),
    recent.length === 0
      ? el('div', { class: 'empty' }, [
          el('div', { class: 'empty-ic' }, '◷'),
          el('p', {}, 'No sessions yet. Start your first focus block above.'),
        ])
      : el('ul', { class: 'list' }, recent.map((s) =>
          el('li', { class: 'list-row' }, [
            el('div', {}, [
              el('div', { class: 'list-title' }, s.tag),
              el('div', { class: 'list-sub' }, `${fmtDateTime(s.startedAt)} · ${timeAgo(s.startedAt)}`),
            ]),
            el('span', { class: 'list-value' }, fmtMin(s.durationSec / 60)),
          ]),
        )),
  ]);
}

function insightsTeaser({ state, navigate }) {
  const locked = !state.view.grants['stats.insights'];
  if (locked) {
    return el('section', { class: 'card' }, [
      el('div', { class: 'card-head' }, [el('h2', {}, 'Focus insights'), pill('Pro', 'pro')]),
      lockedCard({ state, navigate }),
    ]);
  }
  const i = state.metrics.insights;
  return el('section', { class: 'card' }, [
    el('div', { class: 'card-head' }, [el('h2', {}, 'Focus insights'), pill('Pro', 'pro')]),
    el('ul', { class: 'insights' }, i.map((line) => el('li', { class: 'insight' }, [el('span', { class: 'insight-dot' }), line]))),
  ]);
}

function dashboardView(ctx) {
  const { state, navigate } = ctx;
  const name = state.account.displayName.split(' ')[0] || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return shell([
    el('section', { class: 'hero-row' }, [
      el('div', {}, [
        el('h1', { class: 'hero-title' }, `${greeting}, ${name}.`),
        el('p', { class: 'hero-sub' }, today),
      ]),
    ]),
    summaryGrid(state.metrics),
    timerCard(ctx),
    weekChart(state.metrics),
    recentSessions(state.metrics, state.recentSessions ?? []),
    insightsTeaser({ state, navigate }),
  ], { ...ctx, route: '#/dashboard' });
}

// ── Paywall ──────────────────────────────────────────────────────────────────

function paywallView(ctx) {
  const { state, navigate } = ctx;
  const hasTrial = !state.view.customer.allReceipts.some((r) => r.isTrial);
  const monthly = state.catalog.products.find((p) => p.id === 'pro.monthly');
  const yearly = state.catalog.products.find((p) => p.id === 'pro.yearly');
  let interval = 'year';

  const planCards = el('div', { class: 'plan-cards' });
  const errorPanel = el('div', { class: 'pay-error', hidden: true });
  const buyBtn = el('button', { class: 'btn btn--primary btn--lg btn--block' });
  const priceLine = el('p', { class: 'pay-price' });

  function selected() { return interval === 'year' ? yearly : monthly; }

  function renderPlans() {
    planCards.replaceChildren(
      planCard(monthly, interval === 'month', () => { interval = 'month'; renderPlans(); }),
      planCard(yearly, interval === 'year', () => { interval = 'year'; renderPlans(); }, yearly),
    );
    const sel = selected();
    priceLine.textContent = `${money(sel.price)} / ${sel.period}`;
    buyBtn.textContent = hasTrial && sel.introOffer ? `Start 7-day free trial` : `Subscribe · ${money(sel.price)} / ${sel.period}`;
  }

  function planCard(product, active, onSelect, highlight) {
    return el('button', { class: `plan-card ${active ? 'plan-card--active' : ''} ${highlight ? 'plan-card--best' : ''}`, onclick: onSelect }, [
      highlight && el('span', { class: 'plan-badge' }, 'BEST VALUE'),
      el('span', { class: 'plan-name' }, product.title.replace('Lumen Pro', 'Pro')),
      el('span', { class: 'plan-price' }, money(product.price)),
      el('span', { class: 'plan-per' }, `per ${product.period}`),
      product.introOffer && el('span', { class: 'plan-trial' }, `${product.introOffer.durationDays} days free`),
    ]);
  }

  async function buy() {
    errorPanel.hidden = true;
    buyBtn.disabled = true;
    buyBtn.textContent = 'Contacting the store…';
    try {
      const out = await api('/api/purchase', { method: 'POST', body: JSON.stringify({ packageId: selected().id }) });
      toast(ctx.app, out.receipt.isTrial ? 'Trial started. Welcome to Pro.' : 'Welcome to Pro.', 'success');
      ctx.setState(out);
      navigate('#/dashboard');
    } catch (err) {
      buyBtn.disabled = false;
      if (err.status === 402) {
        errorPanel.hidden = false;
        errorPanel.textContent = err.message;
      } else {
        toast(ctx.app, err.message, 'error');
      }
    } finally {
      buyBtn.textContent = selected().introOffer && hasTrial ? 'Start 7-day free trial' : `Subscribe`;
      buyBtn.disabled = false;
    }
  }

  async function restore() {
    const label = el('button', { class: 'link restore-link', onclick: restore }, 'Restore purchases');
    label.textContent = 'Restoring…';
    try {
      const out = await api('/api/restore', { method: 'POST' });
      toast(ctx.app, out.restored > 0 ? `Restored ${out.restored} purchase${out.restored > 1 ? 's' : ''}.` : 'No purchases found to restore.', out.restored > 0 ? 'success' : 'info');
      ctx.setState(out);
      if (out.view.isPro) navigate('#/dashboard');
    } catch (err) {
      toast(ctx.app, err.message, 'error');
    } finally {
      label.textContent = 'Restore purchases';
    }
  }

  renderPlans();

  return el('div', { class: 'paywall' }, [
    el('header', { class: 'pay-head' }, [
      el('button', { class: 'icon-btn', onclick: () => navigate('#/dashboard') }, '‹'),
      pill('Pro', 'pro'),
    ]),
    el('div', { class: 'pay-inner' }, [
      el('h1', { class: 'pay-title' }, 'Go deeper with Lumen Pro'),
      el('p', { class: 'pay-sub' }, 'Unlimited sessions, focus insights, cross-device sync and ambient themes.'),
      planCards,
      priceLine,
      errorPanel,
      buyBtn,
      el('button', { class: 'link', onclick: restore }, 'Restore purchases'),
      el('ul', { class: 'pay-feats' }, [
        ['◈', 'Unlimited daily focus sessions'],
        ['◈', 'Weekly insights & streak analytics'],
        ['◈', 'Cross-device sync'],
        ['◈', 'Premium ambient themes'],
      ].map(([ic, label]) => el('li', {}, [el('span', { class: 'pay-feat-ic' }, ic), label]))),
      el('p', { class: 'pay-legal' }, 'This is a showcase: purchases run against a deterministic local store. No real charges, no real subscriptions. Cancel any time from Settings.'),
    ]),
  ]);
}

// ── Insights ─────────────────────────────────────────────────────────────────

function insightsView(ctx) {
  const { state, navigate } = ctx;
  const locked = !state.view.grants['stats.insights'];

  if (locked) {
    return shell([
      el('section', { class: 'card' }, [
        el('div', { class: 'card-head' }, [el('h2', {}, 'Focus insights'), pill('Pro', 'pro')]),
        lockedCard({ state, navigate }),
      ]),
    ], { ...ctx, route: '#/insights' });
  }

  const m = state.metrics;
  const max = Math.max(1, ...m.byDay.map((d) => d.minutes));

  return shell([
    el('section', { class: 'hero-row' }, [el('h1', { class: 'hero-title' }, 'Insights'), el('p', { class: 'hero-sub' }, 'Where your attention actually goes.')]),
    el('div', { class: 'stat-grid' }, [
      ['Total week', `${m.weekMinutes}m`, 'focused time'],
      ['Sessions', `${m.weekCount}`, 'completed'],
      ['Streak', `${m.streakDays}d`, 'personal best?'],
      ['Best day', m.topDay ? m.topDay.label : '—', m.topDay ? `${m.topDay.minutes} min` : ''],
    ].map(([label, value, sub]) => el('div', { class: 'stat' }, [el('span', { class: 'stat-label' }, label), el('span', { class: 'stat-value' }, value), el('span', { class: 'stat-sub' }, sub)]))),
    el('section', { class: 'card' }, [
      el('div', { class: 'card-head' }, [el('h2', {}, 'Weekly pattern')]),
      el('div', { class: 'chart chart--tall', role: 'img' },
        m.byDay.map((d) => el('div', { class: 'chart-col', title: `${d.label}: ${d.minutes} min` }, [
          el('div', { class: 'chart-bar-wrap' }, [el('div', { class: 'chart-bar chart-bar--tall', style: `height:${Math.max((d.minutes / max) * 100, d.minutes ? 6 : 2)}%` })]),
          el('span', { class: 'chart-label' }, d.label),
        ])),
      ),
    ]),
    el('section', { class: 'card' }, [
      el('div', { class: 'card-head' }, [el('h2', {}, 'What the data says'), pill('Live', 'success')]),
      m.insights.length === 0
        ? el('div', { class: 'empty' }, [el('p', {}, 'Not enough sessions yet — insights will appear once you have a few days of data.')])
        : el('ul', { class: 'insights' }, m.insights.map((line) => el('li', { class: 'insight' }, [el('span', { class: 'insight-dot' }), line]))),
    ]),
  ], { ...ctx, route: '#/insights' });
}

// ── Account ──────────────────────────────────────────────────────────────────

function accountView(ctx) {
  const { state, navigate } = ctx;
  const g = state.view.grants;
  const sub = state.view.customer.activeSubscriptions[0];

  const planCard = el('section', { class: 'card' }, [
    el('div', { class: 'card-head' }, [el('h2', {}, 'Subscription'), pill(state.view.isPro ? (sub?.isTrial ? 'Trial' : 'Pro') : 'Free', state.view.isPro ? 'pro' : 'neutral')]),
    state.view.isPro
      ? el('div', { class: 'sub-block' }, [
          el('p', { class: 'sub-line' }, sub?.isTrial ? 'Free trial active.' : 'Lumen Pro is active.'),
          sub?.expiresDate && el('p', { class: 'sub-muted' }, `Renews ${fmtDate(sub.expiresDate)}${sub?.canceled ? ' · cancel scheduled' : ''}.`),
          el('p', { class: 'sub-muted' }, sub ? `${sub.productId} · ${sub.store}` : ''),
          !sub?.canceled && el('button', { class: 'btn btn--danger', onclick: cancel }, 'Cancel subscription'),
        ])
      : el('div', { class: 'sub-block' }, [
          el('p', { class: 'sub-line' }, 'You are on the free plan.'),
          el('p', { class: 'sub-muted' }, 'Unlimited sessions, insights and sync unlock with Pro.'),
          el('button', { class: 'btn btn--primary', onclick: () => navigate('#/paywall') }, 'See Pro plans'),
        ]),
    el('div', { class: 'row gap' }, [
      el('button', { class: 'btn btn--ghost', onclick: restore }, 'Restore purchases'),
      el('button', { class: 'btn btn--ghost', onclick: failToggle }, 'Simulate payment failure'),
    ]),
  ]);

  async function cancel() {
    const out = await api('/api/cancel', { method: 'POST' });
    ctx.setState(out);
    toast(ctx.app, 'Cancellation scheduled for the end of this period.', 'info');
    ctx.refresh();
  }

  async function restore() {
    toast(ctx.app, 'Restoring purchases…', 'info');
    try {
      const out = await api('/api/restore', { method: 'POST' });
      toast(ctx.app, out.restored > 0 ? `Restored ${out.restored} purchase${out.restored > 1 ? 's' : ''}.` : 'No purchases found to restore.', out.restored > 0 ? 'success' : 'info');
      ctx.setState(out);
      ctx.refresh();
    } catch (err) {
      toast(ctx.app, err.message, 'error');
    }
  }

  async function failToggle() {
    try {
      await api('/api/fail-next', { method: 'POST', body: JSON.stringify({ on: true }) });
      toast(ctx.app, 'The next purchase will be declined by the store — good for testing error states.', 'info');
    } catch (err) {
      toast(ctx.app, err.message, 'error');
    }
  }

  async function resetAll() {
    const out = await api('/api/reset', { method: 'POST' });
    ctx.setState(out);
    toast(ctx.app, 'Demo store reset to its factory state.', 'success');
  }

  return shell([
    el('section', { class: 'card' }, [
      el('div', { class: 'profile' }, [
        el('div', { class: 'avatar avatar--lg' }, state.account.displayName[0]),
        el('div', {}, [
          el('div', { class: 'profile-name' }, state.account.displayName),
          el('div', { class: 'profile-mail' }, state.account.email),
          el('div', { class: 'profile-mail' }, `Member since ${fmtDate(state.account.since)}`),
        ]),
      ]),
    ]),
    planCard,
    el('section', { class: 'card' }, [
      el('div', { class: 'card-head' }, [el('h2', {}, 'Payment method')]),
      el('div', { class: 'pay-method' }, [
        el('span', { class: 'card-chip' }, state.account.paymentMethod.brand[0]),
        el('div', {}, [
          el('div', { class: 'list-title' }, `${state.account.paymentMethod.brand} •••• ${state.account.paymentMethod.last4}`),
          el('div', { class: 'list-sub' }, `Expires ${state.account.paymentMethod.expiry}`),
        ]),
      ]),
    ]),
    el('section', { class: 'card' }, [
      el('div', { class: 'card-head' }, [el('h2', {}, 'Invoices')]),
      el('ul', { class: 'list' }, state.account.invoices.map((inv) =>
        el('li', { class: 'list-row' }, [
          el('div', {}, [
            el('div', { class: 'list-title' }, inv.description),
            el('div', { class: 'list-sub' }, `${inv.date} · ${inv.id}`),
          ]),
          el('span', { class: 'list-value' }, `${money(inv.amountUsd)} ${inv.status === 'paid' ? '✓' : ''}`),
        ]),
      )),
    ]),
    el('section', { class: 'card' }, [
      el('div', { class: 'card-head' }, [el('h2', {}, 'Demo controls')]),
      el('p', { class: 'sub-muted' }, 'Everything here is local and deterministic — reset returns the project to its seeded state.'),
      el('button', { class: 'btn btn--ghost', onclick: resetAll }, 'Reset demo store'),
    ]),
    el('section', { class: 'card' }, [
      el('button', { class: 'btn btn--ghost btn--block', onclick: () => navigate('#/onboarding') }, 'Sign out'),
    ]),
  ], { ...ctx, route: '#/account' });
}

// ── Router ───────────────────────────────────────────────────────────────────

export function renderRoute(ctx) {
  const route = ctx.route;
  const app = ctx.app;
  app.querySelector('#boot')?.remove();
  let node;
  if (route === '#/onboarding') node = onboardingView(ctx);
  else if (route === '#/paywall') node = paywallView(ctx);
  else if (route === '#/insights') node = insightsView(ctx);
  else if (route === '#/account') node = accountView(ctx);
  else node = dashboardView(ctx);

  const prev = app.querySelector('.screen');
  if (prev) {
    app.replaceChild(node, prev);
    requestAnimationFrame(() => node.classList.add('screen--in'));
  } else {
    app.append(node);
    requestAnimationFrame(() => node.classList.add('screen--in'));
  }
}
