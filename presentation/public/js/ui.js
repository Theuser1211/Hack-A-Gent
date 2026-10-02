export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'onclick') node.addEventListener('click', v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function money(usd) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(usd);
}

export function fmtMin(totalMin) {
  const h = Math.floor(totalMin / 60);
  const m = Math.round(totalMin % 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}

export function fmtDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function fmtDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function timeAgo(iso) {
  const diff = Date.now() - Date.parse(iso);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function toast(root, message, kind = 'info') {
  const existing = root.querySelector('.toast');
  if (existing) existing.remove();
  const t = el('div', { class: `toast toast--${kind}` }, message);
  root.append(t);
  requestAnimationFrame(() => t.classList.add('toast--show'));
  setTimeout(() => {
    t.classList.remove('toast--show');
    setTimeout(() => t.remove(), 300);
  }, 4200);
}

export function skeleton() {
  const s = el('div', { class: 'skeleton', 'aria-label': 'Loading' });
  s.innerHTML = '<div class="sk sk--title"></div><div class="sk"></div><div class="sk"></div>';
  return s;
}

export function brand(scope = 'lg') {
  return el('div', { class: `brand brand--${scope}` }, [
    el('span', { class: 'brand-dot' }),
    el('span', { class: 'brand-name' }, 'Lumen'),
  ]);
}

export function pill(label, kind = 'neutral') {
  return el('span', { class: `pill pill--${kind}` }, label);
}
