'use strict';
// Rekorde, Körperwerte, Serien und Abzeichen. Alles wird aus db.logs und db.body berechnet, nichts doppelt gespeichert.

// ---------- Symbole ----------
const ICONS = {
  dumbbell: '<path d="M6 8v8M3 10v4M18 8v8M21 10v4M6 12h12"/>',
  run: '<circle cx="14" cy="4.5" r="1.8"/><path d="M8 21l3-6 3 2v5M6 12l3-4 4 1 3 4 3 1M11 15l-1-5"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M9 17h6"/>',
  scale: '<rect x="3" y="4" width="18" height="16" rx="4"/><path d="M9 9a4 4 0 0 1 6 0M12 11l1.5-2"/>',
  flame: '<path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-8.5z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  medal: '<circle cx="12" cy="15" r="5"/><path d="M8.5 11 6 3h4l2 5 2-5h4l-2.5 8"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2zM10 21h4"/>',
  cloud: '<path d="M7 18a4 4 0 0 1-.5-8 6 6 0 0 1 11.5 1.5A3.5 3.5 0 0 1 17.5 18H7zM12 11v5M9.5 13.5 12 11l2.5 2.5"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="3"/><path d="M11 18.5h2"/>',
  data: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>',
  plan: '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/>',
};
const ico = (name, cls = '') => `<span class="ico ${cls}"><svg viewBox="0 0 24 24">${ICONS[name] || ''}</svg></span>`;
const cardHead = (icon, title, right = '', cls = '') => `<div class="card-head">${ico(icon, cls)}<h2>${title}</h2>${right}</div>`;

// ---------- Rekorde ----------
function setMetric(ex, sets) {
  let best = null;
  for (const s of sets) {
    const w = num(s.weight) || 0, r = num(s.reps) || 0;
    if (!r && !w) continue;
    const v = w > 0 ? w * 1000 + r : r;
    if (!best || v > best.v) best = { v, w, r };
  }
  if (!best) return null;
  const unit = ex.unit === 'sek' ? 'Sek' : 'Wdh';
  best.label = best.w > 0 ? `${fmtNum(best.w)} kg × ${fmtNum(best.r)}` : `${fmtNum(best.r)} ${unit}`;
  return best;
}
function recordsReplay() {
  const best = {}, events = [];
  const logs = db.logs.slice().sort((a, b) => a.date.localeCompare(b.date));
  const consider = (log, key, name, cand, lowerIsBetter = false) => {
    if (!cand) return;
    const prev = best[key];
    const better = !prev || (lowerIsBetter ? cand.v < prev.v : cand.v > prev.v);
    if (!better) return;
    if (prev) events.push({ logId: log.id, key, name, label: cand.label, prev: prev.label, date: log.date });
    best[key] = { ...cand, name, date: log.date, logId: log.id };
  };
  for (const l of logs) {
    if (l.type === 'lauf' && l.run) {
      const km = l.run.km || 0, min = l.run.min || 0;
      if (km) consider(l, 'run:dist', 'Längster Lauf', { v: km, label: `${fmtNum(km)} km` });
      if (km >= 2 && min) { const p = min / km; consider(l, 'run:pace', 'Schnellstes Tempo (ab 2 km)', { v: p, label: `${Math.floor(p)}:${pad(Math.round((p % 1) * 60) % 60)} min/km` }, true); }
    } else {
      for (const it of l.items || []) { const ex = exById(it.exId); consider(l, `ex:${it.exId}`, ex.name, setMetric(ex, it.sets)); }
    }
  }
  return { best, events };
}
function recordFor(exId) { return recordsReplay().best[`ex:${exId}`] || null; }

// ---------- Serien ----------
function weeklyGoal() {
  const plan = activePlan();
  const n = plan ? plan.sessions.reduce((a, s) => a + (s.perWeek || 1), 0) : 0;
  return n || 2;
}
function weekKey(d) { return dayKey(weekStart(new Date(d))); }
function streakInfo() {
  const goal = weeklyGoal();
  const perWeek = {};
  db.logs.forEach((l) => { const k = weekKey(l.date); perWeek[k] = (perWeek[k] || 0) + 1; });
  const hit = (d) => (perWeek[dayKey(d)] || 0) >= goal;
  const cur = weekStart();
  let d = new Date(cur);
  if (!hit(d)) d.setDate(d.getDate() - 7); // laufende Woche bricht die Serie noch nicht
  let current = 0;
  while (hit(d)) { current++; d.setDate(d.getDate() - 7); }
  const keys = Object.keys(perWeek).sort();
  let best = 0, run = 0, weeksHit = 0;
  if (keys.length) {
    const [y, mo, da] = keys[0].split('-').map(Number);
    for (let w = new Date(y, mo - 1, da); w <= cur; w.setDate(w.getDate() + 7)) {
      if (hit(w)) { run++; weeksHit++; best = Math.max(best, run); } else run = 0;
    }
  }
  return { goal, current, best, weeksHit, thisWeek: perWeek[dayKey(cur)] || 0 };
}

// ---------- Abzeichen ----------
function badgeStats() {
  const runs = db.logs.filter((l) => l.type === 'lauf');
  const hours = db.logs.map((l) => new Date(l.date).getHours());
  return {
    total: db.logs.length,
    kraft: db.logs.filter((l) => l.type === 'kraft').length,
    runs: runs.length,
    km: runs.reduce((a, l) => a + (l.run?.km || 0), 0),
    longest: Math.max(0, ...runs.map((l) => l.run?.km || 0)),
    records: recordsReplay().events.length,
    streak: streakInfo(),
    early: hours.some((h) => h < 8),
    late: hours.some((h) => h >= 21),
    body: (db.body || []).length,
  };
}
const BADGES = [
  { id: 'first', e: '🌱', name: 'Der Anfang', desc: 'Erstes Training', p: (s) => [s.total, 1] },
  { id: 't10', e: '💪', name: 'Dranbleiber', desc: '10 Trainings', p: (s) => [s.total, 10] },
  { id: 't25', e: '🔥', name: 'Feuer gefangen', desc: '25 Trainings', p: (s) => [s.total, 25] },
  { id: 't50', e: '⚡', name: 'Halbe Hundert', desc: '50 Trainings', p: (s) => [s.total, 50] },
  { id: 't100', e: '👑', name: 'Hundert', desc: '100 Trainings', p: (s) => [s.total, 100] },
  { id: 'w1', e: '✅', name: 'Wochenziel', desc: 'Ein Wochenziel geschafft', p: (s) => [s.streak.weeksHit, 1] },
  { id: 's4', e: '📅', name: '4 Wochen am Stück', desc: '4 Wochen Serie', p: (s) => [s.streak.best, 4] },
  { id: 's8', e: '🗓️', name: '8 Wochen am Stück', desc: '8 Wochen Serie', p: (s) => [s.streak.best, 8] },
  { id: 's12', e: '🏅', name: 'Ein Quartal', desc: '12 Wochen Serie', p: (s) => [s.streak.best, 12] },
  { id: 'r1', e: '🏆', name: 'Erster Rekord', desc: 'Einen Bestwert verbessert', p: (s) => [s.records, 1] },
  { id: 'r10', e: '🥇', name: 'Rekordjagd', desc: '10 Rekorde', p: (s) => [s.records, 10] },
  { id: 'run1', e: '👟', name: 'Losgelaufen', desc: 'Erster Lauf', p: (s) => [s.runs, 1] },
  { id: 'run5', e: '🏃', name: '5 km am Stück', desc: 'Ein Lauf ab 5 km', p: (s) => [s.longest, 5] },
  { id: 'run10', e: '🚀', name: '10 km am Stück', desc: 'Ein Lauf ab 10 km', p: (s) => [s.longest, 10] },
  { id: 'km50', e: '🛣️', name: '50 km gesamt', desc: '50 km gelaufen', p: (s) => [s.km, 50] },
  { id: 'km100', e: '🌍', name: '100 km gesamt', desc: '100 km gelaufen', p: (s) => [s.km, 100] },
  { id: 'early', e: '🌅', name: 'Früher Vogel', desc: 'Training vor 8 Uhr', p: (s) => [s.early ? 1 : 0, 1] },
  { id: 'late', e: '🌙', name: 'Nachteule', desc: 'Training ab 21 Uhr', p: (s) => [s.late ? 1 : 0, 1] },
  { id: 'body', e: '📏', name: 'Vermessen', desc: 'Körperwerte eingetragen', p: (s) => [s.body, 1] },
];
function earnedBadges(stats = badgeStats()) { return BADGES.filter((b) => { const [have, need] = b.p(stats); return have >= need; }).map((b) => b.id); }

function badgesCard() {
  const s = badgeStats(), earned = new Set(earnedBadges(s));
  const st = s.streak;
  return `<section class="card">${cardHead('medal', 'Abzeichen', `<span class="muted small">${earned.size}/${BADGES.length}</span>`, 'gold')}
    <div class="streak"><span class="streak-flame">🔥</span><div><b>${st.current} ${st.current === 1 ? 'Woche' : 'Wochen'} in Folge</b><div class="muted small">Wochenziel: ${st.goal} Trainings · diese Woche ${st.thisWeek}/${st.goal}${st.best > st.current ? ` · Bestwert ${st.best}` : ''}</div></div></div>
    <div class="badges">${BADGES.map((b) => {
      const [have, need] = b.p(s), on = earned.has(b.id);
      const prog = on ? '' : `<i class="bprog"><i style="width:${Math.min(100, Math.round((have / need) * 100))}%"></i></i>`;
      return `<button type="button" class="badge ${on ? 'on' : ''}" data-a="showBadge" data-id="${b.id}"><span class="bem">${b.e}</span><span class="bname">${esc(b.name)}</span>${prog}</button>`;
    }).join('')}</div></section>`;
}

function recordsCard() {
  const { best, events } = recordsReplay();
  const recent = events.slice(-4).reverse();
  const count = Object.keys(best).length;
  if (!count) return '';
  return `<section class="card">${cardHead('trophy', 'Rekorde', `<button type="button" class="link" data-a="allRecords">Alle</button>`, 'gold')}
    ${recent.length ? `<div class="list">${recent.map((e) => `<div class="row"><div><b>${esc(e.name)}</b><div class="muted small">${fmtDate(e.date)} · vorher ${esc(e.prev)}</div></div><span class="rec">${esc(e.label)}</span></div>`).join('')}</div>`
      : '<p class="muted small">Sobald du einen Bestwert verbesserst, erscheint er hier.</p>'}</section>`;
}
function allRecordsHTML() {
  const { best } = recordsReplay();
  const rows = Object.values(best).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return `<h2>Deine Bestwerte</h2><div class="list">${rows.map((r) => `<div class="row"><div><b>${esc(r.name)}</b><div class="muted small">${fmtDate(r.date)}</div></div><span class="rec">${esc(r.label)}</span></div>`).join('')}</div>`;
}

// ---------- Feiern nach dem Speichern ----------
function celebrateAfter(logId, badgesBefore) {
  const evs = recordsReplay().events.filter((e) => e.logId === logId);
  const before = new Set(badgesBefore);
  const fresh = BADGES.filter((b) => earnedBadges().includes(b.id) && !before.has(b.id));
  if (!evs.length && !fresh.length) return;
  const confetti = Array.from({ length: 28 }, (_, i) => `<i style="left:${(i * 37) % 100}%;animation-delay:${(i % 7) * 0.12}s;background:${['#e5484d', '#f5a524', '#2a8a75', '#4f7cff', '#c86bd8'][i % 5]}"></i>`).join('');
  modal(`<div class="confetti" aria-hidden="true">${confetti}</div><div class="celebrate">
    <div class="cel-big">${evs.length ? '🏆' : fresh[0].e}</div>
    <h2>${evs.length ? (evs.length === 1 ? 'Neuer Rekord!' : `${evs.length} neue Rekorde!`) : 'Neues Abzeichen!'}</h2>
    ${evs.length ? `<div class="list">${evs.map((e) => `<div class="row"><div><b>${esc(e.name)}</b><div class="muted small">vorher ${esc(e.prev)}</div></div><span class="rec">${esc(e.label)}</span></div>`).join('')}</div>` : ''}
    ${fresh.length ? `<div class="cel-badges">${fresh.map((b) => `<div class="badge on"><span class="bem">${b.e}</span><span class="bname">${esc(b.name)}</span></div>`).join('')}</div>` : ''}
    <button type="button" class="btn primary" data-a="closeModal">Weiter so!</button></div>`);
}

// ---------- Körper ----------
const BODY_FIELDS = [['weight', 'Gewicht', 'kg'], ['waist', 'Taille', 'cm'], ['hips', 'Hüfte', 'cm'], ['chest', 'Brust', 'cm'], ['arm', 'Oberarm', 'cm'], ['thigh', 'Oberschenkel', 'cm']];
function bodyEntries() { return (db.body || []).slice().sort((a, b) => a.date.localeCompare(b.date)); }
function lineChart(pts, unit) {
  if (pts.length < 2) return `<p class="muted small chart-empty">${pts.length ? 'Ab dem zweiten Eintrag siehst du hier deinen Verlauf.' : 'Noch keine Einträge.'}</p>`;
  const W = 320, H = 140, L = 34, R = 8, T = 12, B = 22;
  const t0 = new Date(pts[0].date).getTime(), t1 = new Date(pts[pts.length - 1].date).getTime() || t0 + 1;
  const vs = pts.map((p) => p.v); let lo = Math.min(...vs), hi = Math.max(...vs);
  if (hi - lo < 1) { lo -= 0.5; hi += 0.5; }
  const x = (d) => L + ((new Date(d).getTime() - t0) / (t1 - t0 || 1)) * (W - L - R);
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const line = pts.map((p) => `${x(p.date).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const area = `${L},${H - B} ${line} ${x(pts[pts.length - 1].date).toFixed(1)},${H - B}`;
  const short = (d) => { d = new Date(d); return `${d.getDate()}.${d.getMonth() + 1}.`; };
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Verlauf ${unit}">
    <defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".28"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
    <line class="grid" x1="${L}" x2="${W - R}" y1="${y(hi)}" y2="${y(hi)}"/><line class="grid" x1="${L}" x2="${W - R}" y1="${y(lo)}" y2="${y(lo)}"/>
    <text x="${L - 6}" y="${y(hi) + 4}" text-anchor="end">${fmtNum(Math.round(hi * 10) / 10)}</text><text x="${L - 6}" y="${y(lo) + 4}" text-anchor="end">${fmtNum(Math.round(lo * 10) / 10)}</text>
    <polygon points="${area}" fill="url(#chartFill)"/><polyline points="${line}"/>
    ${pts.map((p) => `<circle cx="${x(p.date).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="3.2"/>`).join('')}
    <text x="${L}" y="${H - 5}">${short(pts[0].date)}</text><text x="${W - R}" y="${H - 5}" text-anchor="end">${short(pts[pts.length - 1].date)}</text>
  </svg>`;
}
function bodyCard() {
  const all = bodyEntries();
  const m = ui.bodyMetric || 'weight';
  const [, label, unit] = BODY_FIELDS.find((f) => f[0] === m);
  const pts = all.filter((e) => e[m] != null).map((e) => ({ date: e.date, v: e[m] }));
  const used = BODY_FIELDS.filter(([k]) => k === 'weight' || all.some((e) => e[k] != null));
  const last = pts[pts.length - 1], first = pts[0];
  const diff = last && first && pts.length > 1 ? Math.round((last.v - first.v) * 10) / 10 : null;
  return `<section class="card">${cardHead('scale', 'Körper', `<button type="button" class="link" data-a="bodyForm">+ Eintragen</button>`, 'blue')}
    ${used.length > 1 ? `<div class="chips seg">${used.map(([k, l]) => `<button type="button" class="chip-btn ${k === m ? 'on' : ''}" data-a="bodyMetric" data-m="${k}">${l}</button>`).join('')}</div>` : ''}
    ${last ? `<div class="body-now"><b>${fmtNum(last.v)}</b> <span>${unit}</span>${diff != null ? `<span class="delta ${diff < 0 ? 'down' : diff > 0 ? 'up' : ''}">${diff > 0 ? '+' : ''}${fmtNum(diff)} ${unit} seit ${fmtDate(first.date)}</span>` : ''}</div>` : ''}
    ${lineChart(pts, label)}
    ${all.length ? `<button type="button" class="link" data-a="bodyList">Alle Einträge (${all.length})</button>` : ''}</section>`;
}
function bodyFormHTML() {
  const last = bodyEntries().slice(-1)[0] || {};
  return `<h2>Körperwerte eintragen</h2><p class="muted small">Nur ausfüllen, was du gemessen hast. Am besten morgens vor dem Frühstück.</p>
    <form id="bodyForm" class="form"><label class="field"><span>Datum</span><input type="date" name="date" value="${dayKey(new Date())}"></label>
    <div class="grid2">${BODY_FIELDS.map(([k, l, u]) => `<label class="field"><span>${l} (${u})</span><input name="${k}" inputmode="decimal" placeholder="${last[k] != null ? fmtNum(last[k]) : ''}"></label>`).join('')}</div>
    <button type="button" class="btn primary" data-a="saveBody">Speichern</button></form>`;
}
function bodyListHTML() {
  const all = bodyEntries().reverse();
  return `<h2>Alle Einträge</h2><div class="list">${all.map((e) => `<div class="row"><div><b>${fmtDate(e.date)}</b><div class="muted small">${BODY_FIELDS.filter(([k]) => e[k] != null).map(([k, l, u]) => `${l} ${fmtNum(e[k])} ${u}`).join(' · ')}</div></div><button type="button" class="icon sm" data-a="delBody" data-id="${e.id}" aria-label="Eintrag löschen">✕</button></div>`).join('')}</div>`;
}

// ---------- Heute: Kopfkarte ----------
function ring(have, want) {
  const r = 34, c = 2 * Math.PI * r, f = Math.min(1, want ? have / want : 0);
  return `<svg class="ring" viewBox="0 0 80 80"><circle class="bg" cx="40" cy="40" r="${r}"/><circle class="fg" cx="40" cy="40" r="${r}" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 40 40)"/></svg>`;
}
function heroCard() {
  const h = new Date().getHours();
  const greet = h < 11 ? 'Guten Morgen' : h < 17 ? 'Hallo' : 'Guten Abend';
  const st = streakInfo();
  const s = weekStart();
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(s); d.setDate(s.getDate() + i);
    const dl = db.logs.filter((l) => dayKey(l.date) === dayKey(d));
    const cls = dl.some((l) => l.type === 'kraft') && dl.some((l) => l.type === 'lauf') ? 'kr' : dl.some((l) => l.type === 'kraft') ? 'k' : dl.some((l) => l.type === 'lauf') ? 'r' : '';
    days.push(`<div class="hd ${dayKey(d) === dayKey(new Date()) ? 'today' : ''}"><span>${WD[d.getDay()]}</span><i class="${cls}">${cls ? '✓' : ''}</i></div>`);
  }
  const left = Math.max(0, st.goal - st.thisWeek);
  return `<section class="hero">
    <div class="hero-top"><div><div class="hero-date">${WD_LONG[new Date().getDay()]}, ${new Date().getDate()}. ${MONTHS[new Date().getMonth()]}</div><h2>${greet}!</h2>
      <p>${left ? `Noch ${left} ${left === 1 ? 'Training' : 'Trainings'} bis zum Wochenziel.` : 'Wochenziel geschafft. Stark!'}</p>
      ${st.current ? `<span class="hero-streak">🔥 ${st.current} ${st.current === 1 ? 'Woche' : 'Wochen'} in Folge</span>` : ''}</div>
      <div class="hero-ring">${ring(st.thisWeek, st.goal)}<div><b>${st.thisWeek}</b><span>von ${st.goal}</span></div></div></div>
    <div class="hero-week">${days.join('')}</div></section>`;
}

const EXTRA_ACTIONS = {
  bodyForm: () => modal(bodyFormHTML()),
  bodyList: () => modal(bodyListHTML()),
  bodyMetric: (d) => { ui.bodyMetric = d.m; render(); },
  saveBody: () => {
    const f = $('#bodyForm'); const e = { id: uid(), date: f.date.value || dayKey(new Date()) };
    let any = false;
    for (const [k] of BODY_FIELDS) { const v = num(f[k].value); if (v != null) { e[k] = v; any = true; } }
    if (!any) { toast('Bitte mindestens einen Wert eintragen'); return; }
    const before = earnedBadges();
    db.body = (db.body || []).concat(e); save(); closeModal();
    if (e.weight == null && (ui.bodyMetric || 'weight') === 'weight') ui.bodyMetric = BODY_FIELDS.find(([k]) => e[k] != null)[0];
    render(); toast('Gespeichert');
    if (!before.includes('body')) celebrateAfter(null, before);
  },
  delBody: async (d) => { if (!(await ask('Eintrag löschen?'))) return; db.body = db.body.filter((e) => e.id !== d.id); save(); render(); modal(bodyListHTML()); },
  allRecords: () => modal(allRecordsHTML()),
  showBadge: (d) => {
    const b = BADGES.find((x) => x.id === d.id), [have, need] = b.p(badgeStats()), on = have >= need;
    const fmt = (v) => fmtNum(Math.round(v * 10) / 10);
    modal(`<div class="celebrate"><div class="cel-big ${on ? '' : 'locked'}">${b.e}</div><h2>${esc(b.name)}</h2><p>${esc(b.desc)}</p><p class="muted">${on ? 'Geschafft ✓' : `Fortschritt: ${fmt(Math.min(have, need))} von ${fmt(need)}`}</p></div>`);
  },
};
