'use strict';
// GPS-Lauf: zeichnet Strecke, Zeit und Tempo live auf, solange die App offen ist.
// Zustand liegt in db.workout.gps, damit ein Neuladen der Seite nichts verliert.
// Web-Apps bekommen bei gesperrtem Bildschirm keine Positionen, deshalb hält ein Wake Lock den Bildschirm an.

let gpsWatch = null, gpsTick = null, gpsWake = null, gpsMsg = '';

function gpsState() { return db.workout?.gps || null; }
function gpsElapsed(g) { return g.elapsed + (g.state === 'running' ? Date.now() - g.since : 0); }
function gpsDist(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function fmtClock(ms) {
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}
function fmtPace(ms, meters) {
  if (meters < 50) return '–:–';
  const p = ms / 60000 / (meters / 1000);
  if (p > 30) return '–:–';
  return `${Math.floor(p)}:${pad(Math.round((p % 1) * 60) % 60)}`;
}

async function gpsKeepAwake(on) {
  try {
    if (on && !gpsWake && navigator.wakeLock) { gpsWake = await navigator.wakeLock.request('screen'); gpsWake.addEventListener('release', () => { gpsWake = null; }); }
    if (!on && gpsWake) { await gpsWake.release(); gpsWake = null; }
  } catch (e) { gpsWake = null; }
}

function gpsOnPosition(pos) {
  const g = gpsState();
  if (!g || g.state !== 'running') return;
  const { latitude, longitude, accuracy } = pos.coords;
  g.acc = Math.round(accuracy);
  gpsMsg = '';
  if (accuracy > 35) { gpsPaint(); return; } // zu ungenau, z. B. kurz nach dem Start
  const p = [+latitude.toFixed(6), +longitude.toFixed(6), pos.timestamp];
  const last = g.pts[g.pts.length - 1];
  if (!last || g.gap === 'skip') { g.pts.push(p); g.gap = false; gpsPaint(); return; }
  const d = gpsDist(last, p), dt = (p[2] - last[2]) / 1000;
  if (g.gap === 'bridge') { g.gap = false; g.m += d; g.pts.push(p); gpsAfterMove(g); return; } // Bildschirm war aus: Luftlinie zählen
  if (d < Math.max(8, accuracy * 0.5)) { gpsPaint(); return; } // Zittern im Stand ignorieren
  if (dt < 30 && d / Math.max(dt, 1) > 9) { // Sprung: schneller als ein Sprinter
    g.bad = (g.bad || 0) + 1;
    if (g.bad >= 3) { g.pts.push(p); g.bad = 0; } // Signal bleibt dort: neu ansetzen, ohne den Sprung zu zählen
    return;
  }
  g.bad = 0;
  g.m += d;
  g.pts.push(p);
  gpsAfterMove(g);
}
function gpsAfterMove(g) {
  while (g.m >= (g.splits.length + 1) * 1000) g.splits.push(gpsElapsed(g)); // Kilometerzeiten (ungefähr)
  gpsSync(); save(); gpsPaint();
}
function gpsOnError(err) {
  const g = gpsState();
  if (err.code !== 1 && g?.pts.length) return; // kurze Aussetzer während des Laufs nicht melden
  gpsMsg = err.code === 1
    ? 'Kein Zugriff auf den Standort. Erlaube ihn in den Einstellungen für Safari bzw. Chrome und starte dann neu.'
    : 'Noch kein GPS-Signal. Am besten draußen mit freier Sicht zum Himmel.';
  gpsPaint();
}
function gpsWatchStart() {
  if (gpsWatch !== null || !navigator.geolocation) return;
  gpsWatch = navigator.geolocation.watchPosition(gpsOnPosition, gpsOnError, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
}
function gpsWatchStop() { if (gpsWatch !== null) navigator.geolocation.clearWatch(gpsWatch); gpsWatch = null; }
function gpsLoop(on) {
  clearInterval(gpsTick); gpsTick = null;
  if (on) gpsTick = setInterval(() => { gpsSync(); gpsPaint(); }, 1000);
}

// Strecke und Zeit in die normalen Felder übernehmen, damit Speichern wie bisher funktioniert.
function gpsSync() {
  const g = gpsState(); if (!g) return;
  db.workout.run.km = g.m ? fmtNum(Math.round(g.m / 10) / 100) : '';
  db.workout.run.min = fmtNum(Math.round(gpsElapsed(g) / 6000) / 10);
}

function gpsStart() {
  if (!navigator.geolocation) { toast('Dieses Handy bietet kein GPS im Browser an'); return; }
  gpsMsg = '';
  db.workout.gps = { state: 'running', since: Date.now(), elapsed: 0, m: 0, pts: [], splits: [], gap: false, acc: null };
  save(); gpsWatchStart(); gpsLoop(true); gpsKeepAwake(true); render();
}
function gpsPause() {
  const g = gpsState(); if (!g) return;
  g.elapsed = gpsElapsed(g); g.state = 'paused'; g.gap = 'skip';
  gpsSync(); save(); gpsWatchStop(); gpsLoop(false); gpsKeepAwake(false); render();
}
function gpsResume() {
  const g = gpsState(); if (!g) return;
  g.state = 'running'; g.since = Date.now(); g.gap = 'skip';
  save(); gpsWatchStart(); gpsLoop(true); gpsKeepAwake(true); render();
}
function gpsStop() {
  const g = gpsState(); if (!g) return;
  if (g.state === 'running') { g.elapsed = gpsElapsed(g); }
  g.state = 'done';
  gpsSync(); save(); gpsWatchStop(); gpsLoop(false); gpsKeepAwake(false); render();
}
function gpsCleanup() { gpsWatchStop(); gpsLoop(false); gpsKeepAwake(false); gpsMsg = ''; }

// Für den Verlauf: Strecke ausdünnen (jeder Punkt ≥ 15 m vom vorigen), Zeitstempel weglassen.
function gpsRouteForLog(g) {
  if (!g || g.pts.length < 2) return null;
  const out = [g.pts[0]];
  for (const p of g.pts) if (gpsDist(out[out.length - 1], p) >= 15) out.push(p);
  return out.map((p) => [p[0], p[1]]);
}

function gpsCard(w) {
  const g = w.gps;
  if (!g) {
    return `<section class="card gps">
      <button type="button" class="btn primary" data-a="gpsStart">📍 Lauf mit GPS aufzeichnen</button>
      <p class="muted small">Die App misst Strecke und Zeit selbst. Der Bildschirm bleibt dabei an. Nicht sperren, sonst fehlen Teile der Strecke.</p>
    </section>`;
  }
  const t = gpsElapsed(g);
  const btns = g.state === 'running'
    ? `<button type="button" class="btn" data-a="gpsPause">⏸ Pause</button><button type="button" class="btn danger" data-a="gpsStop">■ Stopp</button>`
    : g.state === 'paused'
      ? `<button type="button" class="btn primary" data-a="gpsResume">▶ Weiter</button><button type="button" class="btn danger" data-a="gpsStop">■ Stopp</button>`
      : '';
  return `<section class="card gps ${g.state}">
    <div class="gps-status" id="gpsStatus">${gpsStatusText(g)}</div>
    <div class="gps-big"><b id="gpsKm">${(g.m / 1000).toFixed(2).replace('.', ',')}</b><span>km</span></div>
    <div class="stats"><div><b id="gpsTime">${fmtClock(t)}</b><span>Zeit</span></div><div><b id="gpsPace">${fmtPace(t, g.m)}</b><span>min/km</span></div></div>
    ${btns ? `<div class="btnrow">${btns}</div>` : ''}
    ${g.state === 'done' ? '<p class="muted small">Aufzeichnung beendet. Strecke und Zeit stehen unten und lassen sich noch korrigieren.</p>' : ''}
  </section>`;
}
function gpsStatusText(g) {
  if (gpsMsg && g.state === 'running') return `⚠️ ${esc(gpsMsg)}`;
  if (g.state === 'paused') return '⏸ Pausiert';
  if (g.state === 'done') return '✓ Fertig';
  if (!g.pts.length) return '<i class="gps-dot wait"></i> Suche GPS-Signal …';
  return `<i class="gps-dot"></i> Aufzeichnung läuft${g.acc ? ` · Genauigkeit ±${g.acc} m` : ''}`;
}
// Nur die Zahlen austauschen, damit Eingabefelder beim Tippen nicht neu gezeichnet werden.
function gpsPaint() {
  const g = gpsState(); if (!g) return;
  const t = gpsElapsed(g);
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.innerHTML = v; };
  set('gpsKm', (g.m / 1000).toFixed(2).replace('.', ','));
  set('gpsTime', fmtClock(t));
  set('gpsPace', fmtPace(t, g.m));
  set('gpsStatus', gpsStatusText(g));
  const km = document.querySelector('[data-c="run"][data-k="km"]'), min = document.querySelector('[data-c="run"][data-k="min"]');
  if (km && document.activeElement !== km) km.value = db.workout.run.km;
  if (min && document.activeElement !== min) min.value = db.workout.run.min;
  const p = document.getElementById('pace'); if (p) p.innerHTML = pace(db.workout.run.km, db.workout.run.min) || '&nbsp;';
}

// Kleine Streckenkarte (ohne Hintergrundkarte) für den Verlauf.
function routeSVG(route) {
  if (!route || route.length < 2) return '';
  const c = Math.cos(route[0][0] * Math.PI / 180);
  const xy = route.map(([la, ln]) => [ln * c, -la]);
  const xs = xy.map((p) => p[0]), ys = xy.map((p) => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0 || 1e-9, h = Math.max(...ys) - y0 || 1e-9;
  const W = 300, H = 200, m = 16, k = Math.min((W - 2 * m) / w, (H - 2 * m) / h);
  const ox = (W - w * k) / 2, oy = (H - h * k) / 2;
  const P = xy.map(([x, y]) => [(ox + (x - x0) * k).toFixed(1), (oy + (y - y0) * k).toFixed(1)]);
  const a = P[0], e = P[P.length - 1];
  return `<svg class="route" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gelaufene Strecke">
    <polyline points="${P.map((p) => p.join(',')).join(' ')}"/>
    <circle class="s" cx="${a[0]}" cy="${a[1]}" r="5"/><circle class="e" cx="${e[0]}" cy="${e[1]}" r="5"/>
  </svg>`;
}

// Nach dem Neuladen oder Zurückkehren in die App weiter aufzeichnen.
function gpsResumeIfRunning() {
  const g = gpsState();
  if (g?.state === 'running') { if (g.pts.length) g.gap = 'bridge'; gpsWatchStop(); gpsWatchStart(); gpsLoop(true); gpsKeepAwake(true); }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') gpsResumeIfRunning(); });
