// Plain 2-D geometry in original-image pixel coordinates (x right, y down).

export const deg = (rad) => (rad * 180) / Math.PI;
export const rad = (d) => (d * Math.PI) / 180;
export const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
export const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/** Signed perpendicular distance from p to the infinite line a→b (positive = left of a→b). */
export function lineDistance(p, a, b) {
  const L = dist(a, b);
  if (L === 0) return dist(p, a);
  return ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / L;
}

/** Shortest distance from p to a polyline (segments, not extended). */
export function polylineDistance(p, pts) {
  if (pts.length === 1) return dist(p, pts[0]);
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L2 = dx * dx + dy * dy;
    const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
    best = Math.min(best, dist(p, [a[0] + t * dx, a[1] + t * dy]));
  }
  return best;
}

/** Signed distance from p to a polyline, measured perpendicular to the nearest segment. */
export function polylineSignedDistance(p, pts) {
  let best = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = lineDistance(p, pts[i], pts[i + 1]);
    const u = polylineDistance(p, [pts[i], pts[i + 1]]);
    if (!best || u < best.u) best = { d, u };
  }
  return best ? best.d : 0;
}

/** Smallest angle between two line directions in degrees (0–90). */
export function lineAngleDiff(a1, b1, a2, b2) {
  const t1 = Math.atan2(b1[1] - a1[1], b1[0] - a1[0]);
  const t2 = Math.atan2(b2[1] - a2[1], b2[0] - a2[0]);
  let d = Math.abs(deg(t1 - t2)) % 180;
  if (d > 90) d = 180 - d;
  return d;
}

/** Normalise an angle to (-90, 90]: a box rotated 180° is the same box. */
export function normAxisAngle(d) {
  let a = ((d % 180) + 180) % 180;
  if (a > 90) a -= 180;
  return a;
}

/**
 * Rotated box: centre (cx, cy), width w along the box's own x-axis, height h,
 * angle_deg = rotation of the box x-axis from the image x-axis (clockwise on screen).
 * For teeth: w is mesiodistal, h is occluso-cervical (facial views) or buccolingual (occlusal views).
 */
export function boxAxes(box) {
  const t = rad(box.angle_deg);
  return { u: [Math.cos(t), Math.sin(t)], v: [-Math.sin(t), Math.cos(t)] };
}

export function boxCorners(box) {
  const { u, v } = boxAxes(box);
  const hw = box.w / 2, hh = box.h / 2;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([su, sv]) => [
    box.cx + su * hw * u[0] + sv * hh * v[0],
    box.cy + su * hw * u[1] + sv * hh * v[1],
  ]);
}

/** Half the length of the box's shadow on a unit direction d. */
export function halfExtent(box, d) {
  const { u, v } = boxAxes(box);
  return (box.w / 2) * Math.abs(u[0] * d[0] + u[1] * d[1]) + (box.h / 2) * Math.abs(v[0] * d[0] + v[1] * d[1]);
}

/**
 * Gap between two neighbouring tooth boxes, measured along their shared
 * mesiodistal direction at crown-centre level. Positive = space, negative = overlap.
 * Using only the width axis means a tilted or shorter tooth is not mistaken for an overlap.
 */
export function boxGap(a, b) {
  const ua = boxAxes(a).u, ub = boxAxes(b).u;
  const c = [b.cx - a.cx, b.cy - a.cy];
  // Average the two width directions after making them point the same way.
  const sb = ua[0] * ub[0] + ua[1] * ub[1] < 0 ? -1 : 1;
  let d = [ua[0] + sb * ub[0], ua[1] + sb * ub[1]];
  const L = Math.hypot(d[0], d[1]) || 1;
  d = [d[0] / L, d[1] / L];
  if (c[0] * d[0] + c[1] * d[1] < 0) d = [-d[0], -d[1]];
  const along = c[0] * d[0] + c[1] * d[1];
  const ha = (a.w / 2) * Math.abs(ua[0] * d[0] + ua[1] * d[1]);
  const hb = (b.w / 2) * Math.abs(ub[0] * d[0] + ub[1] * d[1]);
  return along - ha - hb;
}

/**
 * Build a rotated box from three taps.
 * p1, p2: ends of the box's width edge (facial views: the incisal/occlusal edge;
 * occlusal views: mesial and distal contact points). p3: a point on the far side
 * (cervical margin) — or, with `centred`, the buccal surface, giving a box centred on p1–p2.
 */
export function boxFromTaps(p1, p2, p3, centred = false) {
  const w = dist(p1, p2);
  const angle = deg(Math.atan2(p2[1] - p1[1], p2[0] - p1[0]));
  const signed = lineDistance(p3, p1, p2);
  const h = Math.abs(signed) * (centred ? 2 : 1);
  const m = mid(p1, p2);
  const { v } = boxAxes({ angle_deg: angle });
  // lineDistance > 0 means p3 lies on the +v side for screen coordinates.
  const s = Math.sign(signed) || 1;
  const off = centred ? 0 : (h / 2) * s;
  const box = { cx: m[0] + v[0] * off, cy: m[1] + v[1] * off, w, h, angle_deg: normAxisAngle(angle) };
  return { box, occlusalEdgeMid: m, cervicalSide: s };
}

/** Least-squares fit y = a x² + b x + c. Returns null if under-determined. */
export function fitQuadratic(pts) {
  if (pts.length < 3) return null;
  let s = [0, 0, 0, 0, 0], t = [0, 0, 0];
  for (const [x, y] of pts) {
    const x2 = x * x;
    s[0] += 1; s[1] += x; s[2] += x2; s[3] += x2 * x; s[4] += x2 * x2;
    t[0] += y; t[1] += x * y; t[2] += x2 * y;
  }
  const M = [[s[4], s[3], s[2]], [s[3], s[2], s[1]], [s[2], s[1], s[0]]];
  const r = [t[2], t[1], t[0]];
  const det = (m) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(M);
  if (Math.abs(D) < 1e-9 * Math.max(1, Math.abs(s[4] * s[2] * s[0]))) return null;
  const col = (i) => M.map((row, k) => row.map((v, j) => (j === i ? r[k] : v)));
  const [a, b, c] = [0, 1, 2].map((i) => det(col(i)) / D);
  return { a, b, c, at: (x) => a * x * x + b * x + c };
}

/** Express points in a frame whose y-axis runs along the arch midline (a→b). */
export function toMidlineFrame(pts, a, b) {
  const L = dist(a, b) || 1;
  const ey = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  const ex = [ey[1], -ey[0]];
  return pts.map((p) => {
    const d = [p[0] - a[0], p[1] - a[1]];
    return [d[0] * ex[0] + d[1] * ex[1], d[0] * ey[0] + d[1] * ey[1]];
  });
}

/** Distance from a point to the parabola y = f(x): coarse sampling, then a precise local search. */
export function curveDistance(p, fit, xmin, xmax) {
  const n = 400;
  const span = (xmax - xmin) || 1, lo = xmin - span * 0.25, hi = xmax + span * 0.25;
  const step = (hi - lo) / n;
  const d = (x) => dist(p, [x, fit.at(x)]);
  let bx = lo;
  for (let i = 0; i <= n; i++) {
    const x = lo + step * i;
    if (d(x) < d(bx)) bx = x;
  }
  let a = bx - step, b = bx + step;
  for (let i = 0; i < 80; i++) {
    const m1 = a + (b - a) / 3, m2 = b - (b - a) / 3;
    if (d(m1) < d(m2)) b = m2; else a = m1;
  }
  return d((a + b) / 2);
}
