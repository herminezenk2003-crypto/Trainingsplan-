'use strict';
// Schematische Übungs-Animationen: menschliche Figur in Seitenansicht (Blick nach rechts).
// Jede Übung hat zwei Posen (a = Start, b = Endposition), dazwischen wird weich überblendet.
// Pose: hip [x,y] Hüfte, t Rumpfwinkel in Grad (0 = rechts, 90 = unten, -90 = oben),
// h1/h2 Handziel (Welt), hr1/hr2 Handziel relativ zur Schulter [entlang Rumpf, nach vorn],
// ua1/fa1 (ua2/fa2) feste Winkel für Ober- und Unterarm statt Handziel,
// f1/f2 Fußgelenk (Welt), fd1/fd2 Fußrichtung, es/ks Beugerichtung Ellbogen/Knie.
// Ellbogen und Knie werden per Zwei-Gelenk-IK berechnet, dadurch bleiben Hände und Füße fest.
// Boden liegt bei y = 180, ein stehender Körper hat die Hüfte bei etwa y = 90.

const BODY = { torso: 52, neck: 10, head: 9, upper: 30, fore: 28, thigh: 44, shin: 44, foot: 11 };

const STAND = { hip: [160, 90], t: -90, h1: [164, 94], h2: [157, 94], f1: [163, 176], f2: [157, 176] };
const LIE_BENCH = { type: 'bench', x: 66, w: 130, y: 150 };
const HIGH_BAR = { type: 'bar', x1: 130, x2: 215, y: 20 };
const DIP_BAR = { type: 'bar', x1: 140, x2: 225, y: 80, posts: true };
const FLOOR_LIE = { hip: [150, 172], t: 180 };

const ANIM = {
  // ---------- Beine ----------
  'goblet-squat': { db: 'center',
    a: { hip: [160, 90], t: -88, h1: [178, 62], f1: [168, 176], f2: [162, 176] },
    b: { hip: [132, 140], t: -60, h1: [176, 112] } },
  'kniebeuge': {
    a: { hip: [160, 90], t: -88, hr1: [-4, 56], f1: [168, 176], f2: [162, 176] },
    b: { hip: [132, 140], t: -60, hr1: [-30, 52] } },
  'bulgarian-split-squat': { db: 'both', props: [{ type: 'bench', x: 60, w: 50, y: 150 }],
    a: { hip: [152, 100], t: -85, h1: [160, 104], f1: [190, 176], f2: [96, 146], fd2: 160 },
    b: { hip: [140, 134], t: -76, h1: [154, 140] } },
  'ausfallschritte': { db: 'both',
    a: { hip: [156, 100], t: -88, h1: [160, 104], f1: [195, 176], f2: [118, 176], fd2: 40 },
    b: { hip: [152, 134], t: -88, h1: [157, 138] } },
  'step-ups': { db: 'both', props: [{ type: 'bench', x: 170, w: 70, y: 150 }],
    a: { hip: [150, 94], t: -88, h1: [154, 98], f1: [195, 146], f2: [150, 176] },
    b: { hip: [190, 62], t: -88, h1: [194, 66], f2: [176, 138], fd2: 40 } },
  'wadenheben': { db: 'one',
    a: { ...STAND },
    b: { ...STAND, hip: [160, 80], h1: [164, 84], h2: [157, 84], f1: [163, 166], f2: [157, 166], fd1: 50, fd2: 50 } },

  // ---------- Po & Beinrückseite ----------
  'rdl': { db: 'both',
    a: { hip: [160, 90], t: -90, h1: [166, 112], f1: [162, 176], f2: [158, 176] },
    b: { hip: [140, 94], t: -15, h1: [188, 136] } },
  'hip-thrust': { db: 'center', props: [{ type: 'bench', x: 50, w: 60, y: 146 }],
    a: { hip: [150, 168], t: -148, h1: [150, 160], f1: [195, 176], f2: [190, 176] },
    b: { hip: [157, 140], t: 180, h1: [157, 132] } },
  'einbeiniges-kreuzheben': { db: 'one',
    a: { hip: [160, 90], t: -90, h1: [164, 94], h2: [157, 94], f1: [162, 176], f2: [156, 172] },
    b: { hip: [158, 92], t: -8, h1: [208, 136], h2: [204, 136], f2: [74, 82], fd2: 90 } },
  'glute-bridge': {
    a: { hip: [148, 172], t: 180, h1: [154, 176], f1: [185, 176], f2: [181, 176] },
    b: { hip: [140, 140], t: 141 } },

  // ---------- Brust ----------
  'kh-bankdruecken': { db: 'both', props: [LIE_BENCH],
    a: { hip: [147, 144], t: 180, h1: [104, 142], f1: [190, 176], f2: [186, 176] },
    b: { h1: [100, 88] } },
  'schraegbankdruecken': { db: 'both', props: [{ type: 'poly', pts: [[178, 150], [150, 150], [98, 116]] }, { type: 'poly', pts: [[160, 150], [160, 180]], w: 4 }],
    a: { hip: [150, 142], t: -145, h1: [116, 108], f1: [195, 176], f2: [191, 176] },
    b: { h1: [114, 54] } },
  'liegestuetze': {
    a: { hip: [153, 134], t: -25, h1: [200, 174], f1: [70, 172], f2: [74, 172], fd1: 100, fd2: 100 },
    b: { hip: [155, 158], t: -9 } },
  'dips': { props: [DIP_BAR],
    a: { hip: [161, 73], t: -80, h1: [170, 80], f1: [130, 130], f2: [126, 134], fd1: 150, fd2: 150 },
    b: { hip: [156, 101], t: -70, f1: [126, 158], f2: [122, 162] } },
  'kh-flys': { db: 'both', props: [LIE_BENCH],
    a: { hip: [147, 144], t: 180, h1: [100, 88], f1: [190, 176], f2: [186, 176] },
    b: { h1: [122, 132] } },

  // ---------- Schultern ----------
  'schulterdruecken': { db: 'both', props: [{ type: 'bench', x: 128, w: 46, y: 140 }, { type: 'poly', pts: [[134, 140], [134, 70]] }],
    a: { hip: [150, 136], t: -90, h1: [156, 82], f1: [195, 176], f2: [191, 176] },
    b: { h1: [152, 28] } },
  'arnold-press': { db: 'both',
    a: { ...STAND, h1: [174, 38], h2: [170, 38] },
    b: { h1: [162, -18], h2: [158, -18] } },
  'pike-pushups': {
    a: { hip: [148, 84], t: 52, h1: [200, 174], f1: [112, 172], f2: [116, 172], fd1: 100, fd2: 100 },
    b: { hip: [154, 96], t: 60 } },
  'seitheben': { db: 'both',
    a: { ...STAND },
    b: { h1: [216, 42], h2: [212, 42] } },
  'reverse-flys': { db: 'both',
    a: { hip: [140, 94], t: -12, h1: [190, 140], h2: [186, 140], f1: [160, 176], f2: [156, 176] },
    b: { h1: [184, 108], h2: [180, 108] } },

  // ---------- Rücken ----------
  'klimmzug': { props: [HIGH_BAR], floor: 236,
    a: { hip: [170, 130], t: -90, h1: [175, 20], f1: [170, 216], f2: [166, 216], fd1: 80, fd2: 80 },
    b: { hip: [169, 87], t: -100, f1: [166, 172], f2: [162, 172] } },
  'negativ-klimmzug': { props: [HIGH_BAR], floor: 236, tempo: [0.6, 3.5, 0.5, 0.9],
    a: { hip: [169, 87], t: -100, h1: [175, 20], f1: [166, 172], f2: [162, 172], fd1: 80, fd2: 80 },
    b: { hip: [170, 130], t: -90, f1: [170, 216], f2: [166, 216] } },
  'scapula-pullup': { props: [HIGH_BAR], floor: 236,
    a: { hip: [172, 136], t: -90, h1: [175, 20], f1: [172, 222], f2: [168, 222], fd1: 80, fd2: 80 },
    b: { hip: [172, 126], f1: [172, 212], f2: [168, 212] } },
  'kh-rudern': { db: 'one', props: [{ type: 'bench', x: 56, w: 140, y: 140 }],
    a: { hip: [110, 96], t: -3, h1: [164, 150], h2: [172, 138], f1: [120, 176], f2: [64, 136], fd2: 180 },
    b: { h1: [132, 104] } },
  'vorgebeugtes-rudern': { db: 'both',
    a: { hip: [140, 94], t: -20, h1: [190, 134], f1: [160, 176], f2: [156, 176] },
    b: { h1: [170, 96] } },
  'australian-pullup': { props: [{ type: 'bar', x1: 150, x2: 235, y: 110, posts: true }],
    a: { hip: [146, 168], t: -3, h1: [200, 110], f1: [60, 172], f2: [64, 172], fd1: -80, fd2: -80 },
    b: { hip: [141, 142], t: -20 } },
  'kh-rudern-schraeg': { db: 'both', props: [{ type: 'poly', pts: [[96, 156], [170, 116]] }, { type: 'poly', pts: [[120, 144], [120, 180]], w: 4 }],
    a: { hip: [110, 140], t: -35, h1: [154, 166], f1: [80, 176], f2: [76, 176] },
    b: { h1: [128, 128] } },

  // ---------- Arme ----------
  // Curls: Oberarm bleibt am Körper, nur der Unterarm klappt hoch (Gelenkwinkel statt Handziel)
  'bizepscurls': { db: 'both', a: { ...STAND, ua1: 92, fa1: 88 }, b: { ua1: 98, fa1: -62 } },
  'hammercurls': { db: 'both', a: { ...STAND, ua1: 92, fa1: 88 }, b: { ua1: 98, fa1: -62 } },
  'trizeps-ueberkopf': { db: 'center',
    a: { ...STAND, h1: [148, 30], h2: [146, 30] },
    b: { h1: [160, -20], h2: [158, -20] } },
  'skull-crusher': { db: 'both', props: [LIE_BENCH],
    a: { hip: [147, 144], t: 180, h1: [100, 88], f1: [190, 176], f2: [186, 176] },
    b: { h1: [76, 124] } },
  'bank-dips': { props: [{ type: 'bench', x: 60, w: 70, y: 140 }],
    a: { hip: [130, 134], t: -90, h1: [128, 138], f1: [205, 176], f2: [201, 176] },
    b: { hip: [132, 162], t: -90 } },

  // ---------- Bauch & Rumpf ----------
  'plank': { tempo: [1.2, 1.6, 1.2, 1.6],
    a: { hip: [139, 156], t: -11, h1: [215, 176], f1: [50, 172], f2: [54, 172], fd1: 100, fd2: 100 },
    b: { hip: [139, 158] } },
  'seitstuetz': { tempo: [0.6, 1.4, 1.2, 1.4],
    a: { hip: [139, 172], t: -18, h1: [215, 176], f1: [50, 172], f2: [54, 172], fd1: 100, fd2: 100 },
    b: { hip: [139, 156], t: -11 } },
  'haengendes-knieheben': { props: [HIGH_BAR], floor: 236,
    a: { hip: [168, 130], t: -90, h1: [170, 20], f1: [168, 216], f2: [164, 216], fd1: 80, fd2: 80 },
    b: { f1: [192, 150], f2: [188, 150], fd1: 60, fd2: 60 } },
  'beinheben-dip': { props: [DIP_BAR],
    a: { hip: [170, 74], t: -90, h1: [172, 80], f1: [168, 158], f2: [164, 158], fd1: 80, fd2: 80 },
    b: { f1: [196, 92], f2: [192, 92], fd1: 60, fd2: 60 } },
  'dead-bug': {
    a: { ...FLOOR_LIE, h1: [104, 116], h2: [100, 116], f1: [196, 128], f2: [192, 128] },
    b: { h1: [44, 166], f1: [238, 162] } },
  'russian-twist': { db: 'center',
    a: { hip: [150, 160], t: -122, hr1: [-12, 26], f1: [200, 150], f2: [196, 150] },
    b: { hr1: [-12, 10] } },
  'situps': {
    a: { ...FLOOR_LIE, hr1: [-14, 12], hr2: [-14, 12], f1: [190, 176], f2: [186, 176] },
    b: { t: -80 } },
  'crunches': {
    a: { ...FLOOR_LIE, hr1: [8, 6], hr2: [8, 6], f1: [190, 176], f2: [186, 176] },
    b: { t: -150 } },
  'fahrrad-crunches': {
    a: { ...FLOOR_LIE, t: 162, hr1: [8, 6], hr2: [8, 6], f1: [236, 152], f2: [176, 126] },
    b: { t: 158, f1: [176, 126], f2: [236, 152] } },
  'beinheben-liegend': {
    a: { ...FLOOR_LIE, h1: [160, 176], f1: [237, 166], f2: [233, 166] },
    b: { f1: [156, 86], f2: [152, 86], fd1: -90, fd2: -90 } },
  'reverse-crunch': {
    a: { ...FLOOR_LIE, h1: [160, 176], f1: [196, 128], f2: [192, 128] },
    b: { hip: [148, 164], t: 176, f1: [152, 110], f2: [148, 110] } },
  'mountain-climbers': { tempo: [0.1, 0.35, 0.1, 0.35],
    a: { hip: [153, 134], t: -25, h1: [200, 174], f1: [168, 166], f2: [70, 172], fd1: 60, fd2: 100 },
    b: { f1: [70, 172], f2: [168, 166], fd1: 100, fd2: 60 } },
  'hollow-hold': { tempo: [1.2, 1.6, 1.2, 1.6],
    a: { ...FLOOR_LIE, t: 188, hr1: [56, 0], hr2: [56, 0], f1: [235, 158], f2: [231, 158] },
    b: { t: 193, f1: [234, 151], f2: [230, 151] } },
  'toes-to-bar': { props: [HIGH_BAR], floor: 236,
    a: { hip: [168, 130], t: -90, h1: [170, 20], f1: [168, 216], f2: [164, 216], fd1: 80, fd2: 80 },
    b: { t: -98, f1: [190, 136], f2: [186, 136], fd1: 70, fd2: 70 } },
};
ANIM.chinup = ANIM.klimmzug;

// ---------- Geometrie ----------
const rad = (d) => (d * Math.PI) / 180;
const dirv = (deg, len) => [Math.cos(rad(deg)) * len, Math.sin(rad(deg)) * len];
const add = (p, v) => [p[0] + v[0], p[1] + v[1]];
const lerp = (a, b, k) => a + (b - a) * k;
const lerpAng = (a, b, k) => { let d = ((b - a + 540) % 360) - 180; return a + d * k; };

// Zwei-Gelenk-IK: liefert Mittelgelenk und (ggf. gekürzten) Endpunkt
function ik(root, target, l1, l2, sign) {
  const dx = target[0] - root[0], dy = target[1] - root[1];
  let d = Math.hypot(dx, dy);
  const base = Math.atan2(dy, dx);
  d = Math.max(Math.abs(l1 - l2) + 0.5, Math.min(l1 + l2 - 0.01, d));
  const a = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  const ang = base - sign * a;
  const mid = [root[0] + Math.cos(ang) * l1, root[1] + Math.sin(ang) * l1];
  const end = [root[0] + Math.cos(base) * d, root[1] + Math.sin(base) * d];
  return [mid, end];
}

function fullPose(p) {
  // Fehlende Werte ergänzen: zweite Hand/Fuß folgt der ersten
  const q = { ...p };
  if (!q.h2 && q.h1) q.h2 = [q.h1[0] - 4, q.h1[1]];
  if (!q.hr2 && q.hr1) q.hr2 = q.hr1;
  if (!q.f2 && q.f1) q.f2 = [q.f1[0] - 4, q.f1[1]];
  if (q.ua2 == null && q.ua1 != null) { q.ua2 = q.ua1 - 3; q.fa2 = q.fa1 - 3; }
  return q;
}
function mixPose(a, b, k) {
  const out = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const va = a[key] ?? b[key], vb = b[key] ?? a[key];
    if (key === 't' || key.startsWith('fd') || key.startsWith('ua') || key.startsWith('fa')) out[key] = lerpAng(va ?? 0, vb ?? 0, k);
    else if (Array.isArray(va)) out[key] = [lerp(va[0], vb[0], k), lerp(va[1], vb[1], k)];
    else out[key] = k < 0.5 ? va : vb;
  }
  return out;
}
function solve(p) {
  const hip = p.hip;
  const shoulder = add(hip, dirv(p.t, BODY.torso));
  const head = add(shoulder, dirv(p.t, BODY.neck + BODY.head));
  const front = p.t + 90;
  const hand = (h, hr) => h || (hr ? add(add(shoulder, dirv(p.t, hr[0])), dirv(front, hr[1])) : add(shoulder, [4, 56]));
  const es = p.es ?? -1, ks = p.ks ?? 1;
  const arm = (h, hr, ua, fa) => {
    if (ua != null) { const elbow = add(shoulder, dirv(ua, BODY.upper)); return { elbow, hand: add(elbow, dirv(fa, BODY.fore)) }; }
    const [elbow, end] = ik(shoulder, hand(h, hr), BODY.upper, BODY.fore, es); return { elbow, hand: end };
  };
  const leg = (f, fd) => { const [knee, ankle] = ik(hip, f || add(hip, [0, 86]), BODY.thigh, BODY.shin, ks); return { knee, ankle, toe: add(ankle, dirv(fd ?? 0, BODY.foot)) }; };
  return { hip, shoulder, head, a1: arm(p.h1, p.hr1, p.ua1, p.fa1), a2: arm(p.h2, p.hr2, p.ua2, p.fa2), l1: leg(p.f1, p.fd1), l2: leg(p.f2, p.fd2) };
}

// ---------- Zeichnen ----------
function boundsOf(spec, A, B) {
  const pts = [];
  [0, 0.5, 1].forEach((k) => {
    const s = solve(mixPose(A, B, k));
    pts.push(s.hip, s.shoulder, s.a1.elbow, s.a1.hand, s.a2.hand, s.l1.knee, s.l1.ankle, s.l1.toe, s.l2.knee, s.l2.toe,
      [s.head[0] - BODY.head, s.head[1] - BODY.head], [s.head[0] + BODY.head, s.head[1] + BODY.head]);
  });
  (spec.props || []).forEach((pr) => {
    if (pr.type === 'bench') pts.push([pr.x, pr.y], [pr.x + pr.w, pr.y]);
    if (pr.type === 'bar') pts.push([pr.x1, pr.y], [pr.x2, pr.y]);
    if (pr.type === 'poly') pts.push(...pr.pts.filter((q) => q[1] < 200));
  });
  pts.push([pts[0][0], (spec.floor ?? 180) + 4]);
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

// Menschliche Figur: Körperteile als abgerundete, sich verjüngende Formen mit Kontur.
// Erst alle Konturen einer Ebene, dann die Füllungen, damit keine Nähte zwischen den Teilen sichtbar sind.
const SKIN = '#e7b48f', SHIRT = '#2f8f7a', SHORTS = '#3c557a', SHOE = '#f3f4f2', HAIR = '#4b3426', DB = '#4f5b66';
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
function capsulePath(ctx, p1, p2, w1, w2) {
  const ang = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
  ctx.beginPath();
  ctx.arc(p1[0], p1[1], w1 / 2, ang + Math.PI / 2, ang - Math.PI / 2);
  ctx.arc(p2[0], p2[1], w2 / 2, ang - Math.PI / 2, ang + Math.PI / 2);
  ctx.closePath();
}
const along = (p1, p2, k) => [p1[0] + (p2[0] - p1[0]) * k, p1[1] + (p2[1] - p1[1]) * k];

function drawScene(ctx, spec, s, view, col) {
  const { W, H } = view;
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.translate(view.ox, view.oy); ctx.scale(view.sc, view.sc);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const floor = spec.floor ?? 180;
  const line = (pts, w, c) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.stroke(); };
  // Boden
  line([[-view.ox / view.sc, floor + 4], [(W - view.ox) / view.sc, floor + 4]], 2.5, col.prop);
  // Geräte
  (spec.props || []).forEach((pr) => {
    if (pr.type === 'bench') {
      line([[pr.x + 12, pr.y], [pr.x + 12, floor + 4]], 4, col.prop);
      line([[pr.x + pr.w - 12, pr.y], [pr.x + pr.w - 12, floor + 4]], 4, col.prop);
      line([[pr.x, pr.y + 3], [pr.x + pr.w, pr.y + 3]], 8, col.prop);
    } else if (pr.type === 'bar') {
      if (pr.posts) { line([[pr.x1 + 6, pr.y], [pr.x1 + 6, floor + 4]], 4, col.prop); line([[pr.x2 - 6, pr.y], [pr.x2 - 6, floor + 4]], 4, col.prop); }
      else { line([[pr.x1, pr.y - 14], [pr.x1, pr.y]], 4, col.prop); line([[pr.x2, pr.y - 14], [pr.x2, pr.y]], 4, col.prop); }
      line([[pr.x1, pr.y], [pr.x2, pr.y]], 5, col.prop);
    } else if (pr.type === 'poly') line(pr.pts, pr.w || 8, col.prop);
  });

  const ow = 1.6; // Konturbreite
  // Jede Ebene ist eine Liste von Formen: ['cap', p1, p2, w1, w2, farbe] oder ['circ', p, r, farbe] oder ['head', ...]
  const leg = (l, f) => [
    ['circ', s.hip, 8.5, shade(SHORTS, f)],
    ['cap', s.hip, l.knee, 16, 11, shade(SKIN, f)],
    ['cap', s.hip, along(s.hip, l.knee, 0.62), 16.5, 13.5, shade(SHORTS, f)],
    ['cap', l.knee, l.ankle, 11, 7, shade(SKIN, f)],
    ['cap', l.ankle, l.toe, 8.5, 6, shade(SHOE, f)],
  ];
  const arm = (a, f) => [
    ['cap', s.shoulder, a.elbow, 10, 8, shade(SKIN, f)],
    ['cap', s.shoulder, along(s.shoulder, a.elbow, 0.45), 11.5, 10, shade(SHIRT, f)],
    ['cap', a.elbow, a.hand, 8, 6.5, shade(SKIN, f)],
    ['circ', a.hand, 4.4, shade(SKIN, f)],
  ];
  const tdir = Math.atan2(s.shoulder[1] - s.hip[1], s.shoulder[0] - s.hip[0]);
  const front = [Math.cos(tdir + Math.PI / 2), Math.sin(tdir + Math.PI / 2)];
  const chest = along(s.hip, s.shoulder, 0.7);
  const chestF = [chest[0] + front[0] * 2.5, chest[1] + front[1] * 2.5];
  const neckTop = along(s.shoulder, s.head, 0.55);
  const torso = [
    ['cap', s.hip, chestF, 21, 25, SHIRT],
    ['cap', chestF, s.shoulder, 25, 18, SHIRT],
    ['cap', s.hip, along(s.hip, s.shoulder, 0.12), 22, 21, SHORTS],
    ['cap', s.shoulder, neckTop, 8, 7.5, SKIN],
    ['head'],
  ];
  const drawLayer = (shapes) => {
    for (const pass of ['outline', 'fill']) {
      const grow = pass === 'outline' ? ow * 2 : 0;
      for (const sh of shapes) {
        ctx.fillStyle = pass === 'outline' ? col.outline : sh[sh.length - 1];
        if (sh[0] === 'cap') { capsulePath(ctx, sh[1], sh[2], sh[3] + grow, sh[4] + grow); ctx.fill(); }
        else if (sh[0] === 'circ') { ctx.beginPath(); ctx.arc(sh[1][0], sh[1][1], sh[2] + grow / 2, 0, Math.PI * 2); ctx.fill(); }
        else if (sh[0] === 'head') drawHead(pass, grow);
      }
    }
  };
  const drawHead = (pass, grow) => {
    const [hx, hy] = s.head, r = BODY.head;
    const nose = [hx + front[0] * r, hy + front[1] * r];
    if (pass === 'outline') {
      ctx.fillStyle = col.outline;
      ctx.beginPath(); ctx.ellipse(hx, hy, r + 0.8 + grow / 2, r + grow / 2, tdir, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(nose[0], nose[1], 2.2 + grow / 2, 0, Math.PI * 2); ctx.fill();
      return;
    }
    ctx.fillStyle = SKIN;
    ctx.beginPath(); ctx.ellipse(hx, hy, r + 0.8, r, tdir, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(nose[0], nose[1], 2.2, 0, Math.PI * 2); ctx.fill();
    // Haare: Oberkopf und Hinterkopf (vom Gesicht abgewandt)
    ctx.fillStyle = HAIR;
    ctx.beginPath(); ctx.arc(hx, hy, r + 0.6, tdir - Math.PI * 0.62, tdir + Math.PI * 0.18); ctx.closePath(); ctx.fill();
    // Auge
    const eye = [hx + front[0] * r * 0.45 + Math.cos(tdir) * 1.5, hy + front[1] * r * 0.45 + Math.sin(tdir) * 1.5];
    ctx.fillStyle = '#2a2a2a'; ctx.beginPath(); ctx.arc(eye[0], eye[1], 1.1, 0, Math.PI * 2); ctx.fill();
  };
  const dumbbell = (p) => {
    for (const pass of ['outline', 'fill']) {
      const g = pass === 'outline' ? ow : 0;
      ctx.fillStyle = pass === 'outline' ? col.outline : DB;
      ctx.fillRect(p[0] - 8 - g, p[1] - 1.8 - g, 16 + 2 * g, 3.6 + 2 * g);
      ctx.fillRect(p[0] - 12 - g, p[1] - 6.5 - g, 5 + 2 * g, 13 + 2 * g);
      ctx.fillRect(p[0] + 7 - g, p[1] - 6.5 - g, 5 + 2 * g, 13 + 2 * g);
    }
  };
  // hinten: zweites Bein und Arm etwas dunkler, dann Rumpf, dann vorderes Bein und Arm
  drawLayer(leg(s.l2, 0.72));
  drawLayer(arm(s.a2, 0.72));
  if (spec.db === 'both') dumbbell(s.a2.hand);
  drawLayer(torso);
  drawLayer(leg(s.l1, 1));
  drawLayer(arm(s.a1, 1));
  if (spec.db === 'both' || spec.db === 'one') dumbbell(s.a1.hand);
  else if (spec.db === 'center') dumbbell([(s.a1.hand[0] + s.a2.hand[0]) / 2, (s.a1.hand[1] + s.a2.hand[1]) / 2]);
  ctx.restore();
}

const ease = (x) => 0.5 - Math.cos(Math.PI * x) / 2;
let animRun = 0;
function startExerciseAnim() {
  const cv = document.querySelector('canvas.anim[data-ex]');
  const run = ++animRun;
  if (!cv) return;
  const spec = ANIM[cv.dataset.ex];
  if (!spec) return;
  const A = fullPose(spec.a), B = fullPose({ ...spec.a, ...spec.b });
  const bb = boundsOf(spec, A, B);
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth || 300, H = cv.clientHeight || 180;
  cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const m = 14, bw = bb.x1 - bb.x0, bh = bb.y1 - bb.y0;
  // Liegende Übungen nicht zu stark vergrößern, sonst werden die Linien sehr dick
  const sc = Math.min((W - 2 * m) / bw, (H - 2 * m) / bh, (H - 2 * m) / 150);
  const view = { W, H, sc, ox: (W - bw * sc) / 2 - bb.x0 * sc, oy: (H - bh * sc) / 2 - bb.y0 * sc };
  const css = getComputedStyle(document.documentElement);
  const v = (n) => css.getPropertyValue(n).trim();
  const col = { outline: v('--anim-outline'), prop: v('--anim-prop') };
  const slow = matchMedia('(prefers-reduced-motion: reduce)').matches ? 2 : 1;
  const [h0, up, h1, down] = (spec.tempo || [0.5, 1.2, 0.4, 1.2]).map((x) => x * slow);
  const total = h0 + up + h1 + down;
  const t0 = performance.now();
  const frame = (now) => {
    if (run !== animRun || !cv.isConnected) return;
    const t = ((now - t0) / 1000) % total;
    let k;
    if (t < h0) k = 0; else if (t < h0 + up) k = ease((t - h0) / up); else if (t < h0 + up + h1) k = 1; else k = 1 - ease((t - h0 - up - h1) / down);
    drawScene(ctx, spec, solve(mixPose(A, B, k)), view, col);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
