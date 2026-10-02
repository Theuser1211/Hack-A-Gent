import { createCamera, renderScene } from './engine.js';
import { buildScene } from './scene.js';

const canvas = document.querySelector('#world');
const ctx = canvas.getContext('2d');
const scene = buildScene();
const cam = createCamera({ yaw: 0.6, pitch: -0.18, dist: 4.6 });

let dragging = false;
let lastX = 0;
let lastY = 0;

// ── Canvas sizing ───────────────────────────────────────────────────────────

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// ── Interaction ─────────────────────────────────────────────────────────────

function onPointerDown(e) {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
}

function onPointerMove(e) {
  if (!dragging) return;
  cam.applyDrag(e.clientX - lastX, e.clientY - lastY);
  lastX = e.clientX;
  lastY = e.clientY;
}

function onPointerUp() {
  dragging = false;
}

canvas.addEventListener('pointerdown', onPointerDown);
canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('pointerup', onPointerUp);
canvas.addEventListener('pointercancel', onPointerUp);

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    cam.zoom(e.deltaY);
  },
  { passive: false },
);

// ── Scroll reveals & tilt cards ─────────────────────────────────────────────

const revealObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) entry.target.classList.add('is-visible');
    }
  },
  { threshold: 0.12 },
);
document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));

document.querySelectorAll('[data-tilt]').forEach((card) => {
  card.addEventListener('pointermove', (e) => {
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    card.style.transform = `rotateY(${px * 10}deg) rotateX(${-py * 10}deg)`;
  });
  card.addEventListener('pointerleave', () => {
    card.style.transform = 'rotateY(0deg) rotateX(0deg)';
  });
});

// ── Render loop ─────────────────────────────────────────────────────────────

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  cam.update(dt);
  cam.autoOrbit();
  renderScene(ctx, canvas, scene, cam, now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
