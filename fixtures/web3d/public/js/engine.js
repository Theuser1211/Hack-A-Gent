// ── Orbital 3D engine ───────────────────────────────────────────────────────
// A dependency-free canvas renderer: seeded scene generation, an orbiting
// camera with inertia, perspective projection and depth-aware shading.
// No WebGL, no Three.js, no runtime libraries.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Evenly-distributed points on a unit sphere (fibonacci lattice). */
export function fibonacciSphere(count, radius, seed) {
  const rnd = mulberry32(seed);
  const points = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const theta = golden * i;
    const r = Math.sqrt(1 - y * y) * (0.94 + rnd() * 0.06);
    points.push({
      x: Math.cos(theta) * r * radius,
      y: y * radius,
      z: Math.sin(theta) * r * radius,
    });
  }
  return points;
}

/** A ring (closed loop) in a tilted plane around the origin. */
export function ringPoints(radius, tiltDegX, tiltDegY, segments, seed, spread) {
  const rnd = mulberry32(seed);
  const pts = [];
  const radX = (tiltDegX * Math.PI) / 180;
  const radY = (tiltDegY * Math.PI) / 180;
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const r = radius * (1 + (rnd() - 0.5) * spread);
    let x = Math.cos(a) * r;
    let y = 0;
    let z = Math.sin(a) * r;
    const y1 = y * Math.cos(radX) - z * Math.sin(radX);
    const z1 = y * Math.sin(radX) + z * Math.cos(radX);
    const x2 = x * Math.cos(radY) + z1 * Math.sin(radY);
    const z2 = -x * Math.sin(radY) + z1 * Math.cos(radY);
    pts.push({ x: x2, y: y1, z: z2 });
  }
  return pts;
}

/** Distant star shell. */
export function starShell(count, radius, seed) {
  const rnd = mulberry32(seed);
  const stars = [];
  for (let i = 0; i < count; i++) {
    const y = rnd() * 2 - 1;
    const theta = rnd() * Math.PI * 2;
    const r = Math.sqrt(1 - y * y);
    stars.push({
      x: Math.cos(theta) * r * radius,
      y: y * radius,
      z: Math.sin(theta) * r * radius,
      size: 0.6 + rnd() * 1.7,
      tw: rnd() * Math.PI * 2,
      speed: 0.5 + rnd() * 1.5,
    });
  }
  return stars;
}

/** Connect each point to its nearest neighbours (deterministic mesh). */
export function edgeMesh(points, neighbors, maxDist) {
  const edges = [];
  const seen = new Set();
  for (let i = 0; i < points.length; i++) {
    const dists = [];
    for (let j = 0; j < points.length; j++) {
      if (i === j) continue;
      const dx = points[i].x - points[j].x;
      const dy = points[i].y - points[j].y;
      const dz = points[i].z - points[j].z;
      dists.push({ j, d2: dx * dx + dy * dy + dz * dz });
    }
    dists.sort((a, b) => a.d2 - b.d2);
    for (let k = 0; k < Math.min(neighbors, dists.length); k++) {
      const e = dists[k];
      if (e.d2 > maxDist * maxDist) continue;
      const key = i < e.j ? `${i}-${e.j}` : `${e.j}-${i}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push([i, e.j]);
      }
    }
  }
  return edges;
}

export function createCamera(init) {
  const cam = {
    yaw: init.yaw,
    pitch: init.pitch,
    dist: init.dist,
    targetYaw: init.yaw,
    targetPitch: init.pitch,
    targetDist: init.dist,
    focal: init.focal || 640,
    lastInteraction: 0,
  };

  // Rotate a world point into camera space (z points toward the camera).
  cam.rotate = (p) => {
    const cy = Math.cos(cam.yaw);
    const sy = Math.sin(cam.yaw);
    const cx = Math.cos(cam.pitch);
    const sx = Math.sin(cam.pitch);
    let x = p.x * cy + p.z * sy;
    let z = -p.x * sy + p.z * cy;
    const y = p.y * cx - z * sx;
    z = p.y * sx + z * cx;
    return { x, y, z };
  };

  cam.project = (p) => {
    const c = cam.rotate(p);
    const depth = cam.dist - c.z;
    if (depth <= 0.06) return null;
    return { x: (c.x * cam.focal) / depth, y: (-c.y * cam.focal) / depth, depth, z: c.z, scale: cam.focal / depth };
  };

  cam.update = (dt) => {
    const ease = Math.min(1, dt * 6);
    cam.yaw += (cam.targetYaw - cam.yaw) * ease;
    cam.pitch += (cam.targetPitch - cam.pitch) * ease;
    cam.dist += (cam.targetDist - cam.dist) * ease;
    cam.pitch = Math.max(-1.2, Math.min(1.2, cam.pitch));
    cam.dist = Math.max(2.4, Math.min(7, cam.dist));
  };

  cam.applyDrag = (dx, dy) => {
    cam.targetYaw += dx * 0.0045;
    cam.targetPitch += dy * 0.004;
    cam.lastInteraction = performance.now();
  };

  cam.zoom = (delta) => {
    cam.targetDist += delta * 0.008;
    cam.targetDist = Math.max(2.4, Math.min(7, cam.targetDist));
    cam.lastInteraction = performance.now();
  };

  cam.autoOrbit = () => {
    if (performance.now() - cam.lastInteraction > 2200) {
      cam.targetYaw += 0.0011;
    }
  };

  return cam;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const mixC = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function renderScene(ctx, canvas, scene, cam, time) {
  const w = canvas.clientWidth || canvas.width;
  const h = canvas.clientHeight || canvas.height;
  cam.focal = h * 1.15;
  const cx = w / 2;
  const cy = h / 2;

  const near = hexToRgb('#5cf2ff');
  const far = hexToRgb('#3d4f8a');

  const spin = time * 0.00012;
  const wob = Math.sin(time * 0.00007) * 0.16;
  const cosS = Math.cos(spin);
  const sinS = Math.sin(spin);
  const cosW = Math.cos(wob);
  const sinW = Math.sin(wob);

  const objTransform = (p) => {
    let x = p.x * cosS + p.z * sinS;
    let z = -p.x * sinS + p.z * cosS;
    const y = p.y * cosW - z * sinW;
    z = p.y * sinW + z * cosW;
    return { x, y, z };
  };

  ctx.clearRect(0, 0, w, h);

  // Vignette
  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.8);
  bg.addColorStop(0, 'rgba(18, 27, 60, 0.5)');
  bg.addColorStop(1, 'rgba(4, 6, 13, 0)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Stars (parallax)
  for (const s of scene.stars) {
    const p = cam.project(s);
    if (!p) continue;
    const twinkle = 0.5 + 0.5 * Math.sin(time * 0.001 * s.speed + s.tw);
    ctx.globalAlpha = (0.2 + 0.6 * twinkle) * clamp(1 - p.depth / 28, 0, 1);
    ctx.fillStyle = '#cfe3ff';
    ctx.fillRect(cx + p.x, cy + p.y, s.size, s.size);
  }
  ctx.globalAlpha = 1;

  // Split ring segments into back/front around the sphere.
  const backSegs = [];
  const frontSegs = [];
  for (const ring of scene.rings) {
    for (let i = 0; i < ring.points.length; i++) {
      const a = objTransform(ring.points[i]);
      const b = objTransform(ring.points[(i + 1) % ring.points.length]);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
      const pa = cam.project(a);
      const pb = cam.project(b);
      if (!pa || !pb) continue;
      const cm = cam.rotate(mid);
      const seg = { pa, pb, color: ring.color };
      if (cm.z > 0) frontSegs.push(seg);
      else backSegs.push(seg);
    }
  }

  // Draw back segments behind everything.
  drawSegments(ctx, cx, cy, backSegs);

  // Core glow.
  const coreProj = cam.project({ x: 0, y: 0, z: 0 });
  if (coreProj) {
    const coreR = 0.62 * coreProj.scale;
    const g = ctx.createRadialGradient(cx + coreProj.x, cy + coreProj.y, 0, cx + coreProj.x, cy + coreProj.y, coreR);
    g.addColorStop(0, 'rgba(92, 242, 255, 0.5)');
    g.addColorStop(0.45, 'rgba(92, 242, 255, 0.12)');
    g.addColorStop(1, 'rgba(92, 242, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx + coreProj.x - coreR, cy + coreProj.y - coreR, coreR * 2, coreR * 2);
  }

  // Edge mesh (front hemisphere only).
  ctx.strokeStyle = 'rgba(127, 179, 255, 0.16)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const [ia, ib] of scene.edges) {
    const a = objTransform(scene.points[ia]);
    const b = objTransform(scene.points[ib]);
    const ca = cam.rotate(a);
    const cb = cam.rotate(b);
    if (ca.z <= 0.05 && cb.z <= 0.05) {
      const pa = cam.project(a);
      const pb = cam.project(b);
      if (pa && pb) {
        ctx.moveTo(cx + pa.x, cy + pa.y);
        ctx.lineTo(cx + pb.x, cy + pb.y);
      }
    }
  }
  ctx.stroke();

  // Particles.
  for (const p of scene.points) {
    const o = objTransform(p);
    const proj = cam.project(o);
    if (!proj) continue;
    const depthT = clamp((proj.depth - 1.4) / 5.4, 0, 1);
    const [r, g, b] = mixC(near, far, depthT);
    const bright = 1 - depthT * 0.55;
    const size = clamp(1.1 + proj.scale * 0.32, 1, 5.5);
    ctx.globalAlpha = clamp(0.35 + (1 - depthT) * 0.65, 0, 1);
    ctx.fillStyle = `rgb(${Math.round(r * bright)},${Math.round(g * bright)},${Math.round(b * bright)})`;
    ctx.fillRect(cx + proj.x - size / 2, cy + proj.y - size / 2, size, size);
  }
  ctx.globalAlpha = 1;

  // Front ring segments.
  drawSegments(ctx, cx, cy, frontSegs);
}

function drawSegments(ctx, cx, cy, segs) {
  for (const seg of segs) {
    const depthT = clamp((seg.pa.depth + seg.pb.depth) / 2 - 1.2, 0, 1);
    const alpha = 0.55 - depthT * 0.45;
    ctx.globalAlpha = Math.max(0.05, alpha);
    ctx.strokeStyle = seg.color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx + seg.pa.x, cy + seg.pa.y);
    ctx.lineTo(cx + seg.pb.x, cy + seg.pb.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
