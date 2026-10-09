'use strict';

// ---------- Hilfsfunktionen ----------
const $ = (s, el = document) => el.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const WD_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const fmtDate = (d) => { d = new Date(d); return `${WD[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`; };
const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? null : n; };
const fmtNum = (n) => (n == null ? '' : String(Math.round(n * 100) / 100).replace('.', ','));

// ---------- Speicher ----------
const KEY = 'trainingsplan.v1';
const EMPTY = () => ({ v: 1, profile: null, customExercises: [], plans: [], activePlanId: null, logs: [], workout: null, body: [],
  reminder: { days: [], time: '18:00', duration: 60, alarm: 15 } });
let db = load();
function load() {
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.v === 1) return Object.assign(EMPTY(), d); } catch (e) {}
  return EMPTY();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { toast('Speichern fehlgeschlagen'); }
}

// ---------- Übungen ----------
const allExercises = () => EXERCISES.concat(db.customExercises);
const exById = (id) => allExercises().find((e) => e.id === id) || { id, name: 'Unbekannte Übung', group: 'Sonstiges', steps: [], mistakes: [], equip: [], avoid: [] };
const videoUrl = (ex) => ex.video || `https://www.youtube.com/results?search_query=${encodeURIComponent(ex.name + ' richtige Ausführung')}`;
const PATTERN_NAMES = { squat: 'Kniebeuge-Muster', hinge: 'Hüftstreckung', push_h: 'Drücken (Brust)', push_v: 'Drücken (über Kopf)', pull_v: 'Ziehen (von oben)', pull_h: 'Rudern', core: 'Rumpf', arms_bi: 'Bizeps', arms_tri: 'Trizeps', calves: 'Waden', shoulder_iso: 'Schulter-Isolation', chest_iso: 'Brust-Isolation' };
const alternatives = (ex) => allExercises().filter((e) => e.id !== ex.id && (ex.pattern ? e.pattern === ex.pattern : e.group === ex.group));

// ---------- Plan-Generator ----------
const SCHEME = {
  fit: { sets: 3, main: '10–12', acc: '12–15' },
  muskel: { sets: 4, main: '8–12', acc: '10–15' },
  kraft: { sets: 4, main: '5–6', acc: '8–10' },
  abnehmen: { sets: 3, main: '12–15', acc: '15' },
  ausdauer: { sets: 3, main: '15–20', acc: '15–20' },
};
const MAIN_PATTERNS = ['squat', 'hinge', 'push_h', 'push_v', 'pull_v', 'pull_h'];
const TEMPLATES = {
  full: { name: 'Ganzkörper', slots: ['squat', 'push_h', 'pull_v', 'hinge', 'push_v', 'pull_h', 'core', 'arms_bi', 'arms_tri', 'calves'] },
  upper: { name: 'Oberkörper', slots: ['push_h', 'pull_v', 'push_v', 'pull_h', 'shoulder_iso', 'arms_bi', 'arms_tri', 'core'] },
  lower: { name: 'Unterkörper', slots: ['squat', 'hinge', 'squat', 'hinge', 'calves', 'core', 'core'] },
  push: { name: 'Drücken', slots: ['push_h', 'push_v', 'push_h', 'shoulder_iso', 'arms_tri', 'chest_iso', 'core'] },
  pull: { name: 'Ziehen', slots: ['pull_v', 'pull_h', 'pull_h', 'shoulder_iso', 'arms_bi', 'pull_v', 'core'] },
  legs: { name: 'Beine', slots: ['squat', 'hinge', 'squat', 'hinge', 'calves', 'core'] },
};
const COUNT_BY_DURATION = { 30: 4, 45: 5, 60: 7, 75: 8 };
const DEFAULT_PROFILE = { goal: 'fit', level: 'fortgeschritten', days: 2, duration: 60, runs: 1, equip: ['kh', 'bank', 'stange', 'dip'], pullups: 2, avoid: [] };

function splitFor(days) {
  if (days <= 3) return Array(days).fill('full');
  if (days === 4) return ['upper', 'lower', 'upper', 'lower'];
  return ['push', 'pull', 'legs', 'upper', 'lower'].slice(0, days);
}
function candidates(pattern, p) {
  const list = EXERCISES.filter((e) => e.pattern === pattern
    && e.equip.every((q) => p.equip.includes(q))
    && !e.avoid.some((a) => p.avoid.includes(a))
    && (!e.minPullups || p.pullups >= e.minPullups));
  // Unter 5 Klimmzügen sind Negative die beste Vorübung, deshalb in jeder Einheit
  if (pattern === 'pull_v' && p.pullups < 5 && list.some((e) => e.id === 'negativ-klimmzug')) return list.filter((e) => e.id === 'negativ-klimmzug');
  // Fortgeschrittene bekommen Anfängerübungen nur, wenn nichts anderes passt
  if (p.level !== 'anfaenger') list.sort((a, b) => (a.level === 1) - (b.level === 1));
  return list;
}
function generatePlan(p) {
  const scheme = SCHEME[p.goal] || SCHEME.fit;
  const count = COUNT_BY_DURATION[p.duration] || 5;
  const seen = {};
  const sessions = splitFor(p.days).map((tpl) => {
    const t = TEMPLATES[tpl];
    const k = (seen[tpl] = (seen[tpl] ?? -1) + 1);
    const used = new Set();
    const items = [];
    const patternUse = {};
    for (const pattern of t.slots) {
      if (items.length >= count) break;
      const cands = candidates(pattern, p);
      if (!cands.length) continue;
      const rep = (patternUse[pattern] = (patternUse[pattern] ?? -1) + 1);
      let ex = null;
      for (let j = 0; j < cands.length; j++) {
        const c = cands[(k + rep + j) % cands.length];
        if (!used.has(c.id)) { ex = c; break; }
      }
      if (!ex) continue;
      used.add(ex.id);
      const main = MAIN_PATTERNS.includes(pattern);
      let sets = main ? scheme.sets : Math.min(scheme.sets, 3);
      if (p.level === 'anfaenger') sets = Math.max(2, sets - 1);
      items.push({ exId: ex.id, sets, reps: ex.reps || (main ? scheme.main : scheme.acc), weight: '' });
    }
    return { id: uid(), name: `${t.name} ${String.fromCharCode(65 + k)}`, type: 'kraft', items, warmup: WARMUP.slice(), cooldown: COOLDOWN.slice() };
  });
  const runTargets = {
    fit: ['30–40 Min locker, du kannst dich dabei noch unterhalten', '5 Min einlaufen, 6× 1 Min zügig + 2 Min locker, 5 Min auslaufen', '20–30 Min locker'],
    ausdauer: ['40–50 Min locker', '10 Min einlaufen, 4× 4 Min zügig + 3 Min locker, 5 Min auslaufen', '30 Min im mittleren Tempo'],
  };
  const rt = runTargets[p.goal] || runTargets.fit;
  for (let i = 0; i < p.runs; i++) {
    sessions.push({ id: uid(), name: p.runs > 1 ? `Laufen ${i + 1}` : 'Laufen', type: 'lauf', items: [], runTarget: rt[i % rt.length] });
  }
  const goalName = { fit: 'Fit & gesund', muskel: 'Muskelaufbau', kraft: 'Kraft', abnehmen: 'Abnehmen', ausdauer: 'Ausdauer' }[p.goal];
  return { id: uid(), name: `${goalName}: ${p.days}× Kraft${p.runs ? ` + ${p.runs}× Laufen` : ''}`, created: new Date().toISOString(), generated: true, sessions };
}

// ---------- Auswertungen ----------
function weekStart(d = new Date()) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
function logsThisWeek() { const s = weekStart(); return db.logs.filter((l) => new Date(l.date) >= s); }
const activePlan = () => db.plans.find((p) => p.id === db.activePlanId) || null;
function nextSession(plan) {
  if (!plan || !plan.sessions.length) return null;
  const last = db.logs.filter((l) => l.planId === plan.id).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!last) return plan.sessions[0];
  const i = plan.sessions.findIndex((s) => s.id === last.sessionId);
  return plan.sessions[(i + 1) % plan.sessions.length];
}
function lastSetsFor(exId) {
  const sorted = db.logs.slice().sort((a, b) => b.date.localeCompare(a.date));
  for (const l of sorted) { const it = (l.items || []).find((i) => i.exId === exId && i.sets.length); if (it) return it.sets; }
  return null;
}
function pace(km, min) { km = num(km); min = num(min); if (!km || !min) return ''; const p = min / km; return `${Math.floor(p)}:${pad(Math.round((p % 1) * 60))} min/km`; }

// ---------- UI-Zustand ----------
const ui = { tab: 'start', view: null, cal: new Date(), calDay: null, exGroup: '', exSearch: '', picker: null, muscle: '', mmAngle: 0, bodyMetric: 'weight' };
const TABS = [['start', 'Heute', '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>'],
  ['plaene', 'Pläne', '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'],
  ['uebungen', 'Übungen', '<path d="M6 8v8M3 10v4M18 8v8M21 10v4M6 12h12"/>'],
  ['verlauf', 'Verlauf', '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'],
  ['mehr', 'Mehr', '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>']];

function go(tab, view = null) { ui.tab = tab; ui.view = view; render(); window.scrollTo(0, 0); }

function render() {
  const v = ui.view;
  let html;
  if (v?.name === 'workout') html = viewWorkout();
  else if (v?.name === 'planEdit') html = viewPlanEdit(v.id);
  else if (v?.name === 'generator') html = viewGenerator();
  else if (v?.name === 'exForm') html = viewExForm(v.id);
  else html = { start: viewStart, plaene: viewPlans, uebungen: viewExercises, verlauf: viewHistory, mehr: viewMore }[ui.tab]();
  $('#app').innerHTML = html;
  $('#nav').innerHTML = TABS.map(([id, label, icon]) => `<button type="button" data-a="tab" data-tab="${id}" class="${ui.tab === id ? 'on' : ''}" aria-label="${label}"><svg viewBox="0 0 24 24">${icon}</svg><span>${label}</span></button>`).join('');
  $('#nav').hidden = v?.name === 'workout';
}

const timerBtn = '<button type="button" class="icon" data-a="openTimer" aria-label="Timer und Stoppuhr">⏱</button>';
const header = (title, back, right = '') => `<header class="top">${back ? `<button type="button" class="back" data-a="${back}" aria-label="Zurück">‹</button>` : ''}<h1>${esc(title)}</h1>${right}</header>`;

const INSTALL_HELP = `<p class="small"><b>iPhone:</b> In Safari auf <b>Teilen</b> (Quadrat mit Pfeil) und dann <b>Zum Home-Bildschirm</b> tippen.</p>
  <p class="small"><b>Android / Samsung:</b> Die Seite in <b>Chrome</b> öffnen, Menü (⋮) und <b>App installieren</b> wählen. Samsung Internet zeigt dabei oft eine Play-Protect-Warnung, weil der Browser die App in einem veralteten Format verpackt. Mit Chrome passiert das nicht.</p>
  <p class="muted small">Danach startet die App wie eine normale App und funktioniert auch offline. Jedes Handy hat seine eigenen Daten.</p>`;
let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; if (ui.tab === 'mehr' && !ui.view) render(); });

// ---------- Ansicht: Heute ----------
function weekCard() {
  const plan = activePlan();
  const w = logsThisWeek();
  const k = w.filter((l) => l.type === 'kraft').length, r = w.filter((l) => l.type === 'lauf').length;
  const perWeek = (type) => (plan ? plan.sessions.filter((s) => s.type === type).reduce((a, s) => a + (s.perWeek || 1), 0) : 0);
  const tk = perWeek('kraft'), tr = perWeek('lauf');
  const pill = (label, have, want, cls) => `<div class="pill ${cls} ${want && have >= want ? 'done' : ''}"><b>${have}${want ? `/${want}` : ''}</b><span>${label}</span></div>`;
  const days = [];
  const s = weekStart();
  for (let i = 0; i < 7; i++) {
    const d = new Date(s); d.setDate(s.getDate() + i);
    const dl = db.logs.filter((l) => dayKey(l.date) === dayKey(d));
    days.push(`<div class="wd ${dayKey(d) === dayKey(new Date()) ? 'today' : ''}"><span>${WD[d.getDay()]}</span><i class="${dl.some((l) => l.type === 'kraft') ? 'k' : ''} ${dl.some((l) => l.type === 'lauf') ? 'r' : ''}"></i></div>`);
  }
  return `<section class="card">${cardHead('flame', 'Diese Woche', '', 'orange')}<div class="pills">${pill('Kraft', k, tk, 'kraft')}${pill('Laufen', r, tr, 'lauf')}</div><div class="week">${days.join('')}</div></section>`;
}
function viewStart() {
  const plan = activePlan();
  let html = header('Heute', null, timerBtn);
  if (db.workout) {
    html += `<section class="card hl"><h2>Training läuft</h2><p>${esc(db.workout.name)}, gestartet um ${new Date(db.workout.started).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</p><button type="button" class="btn primary" data-a="openWorkout">Fortsetzen</button></section>`;
  }
  if (!db.plans.length) {
    return html + `<section class="card welcome"><h2>Willkommen!</h2><p>Leg los, indem du dir einen Plan erstellen lässt oder deinen eigenen baust.</p>
      <button type="button" class="btn primary" data-a="openGenerator">Plan erstellen lassen</button>
      <button type="button" class="btn" data-a="newPlan">Eigenen Plan bauen</button></section>
      <section class="card"><h2>Tipp</h2>${INSTALL_HELP}</section>`;
  }
  html += heroCard();
  if (!plan) {
    html += `<section class="card"><p>Kein aktiver Plan ausgewählt.</p><button type="button" class="btn" data-a="tab" data-tab="plaene">Plan auswählen</button></section>`;
  } else {
    const next = nextSession(plan);
    if (next) {
      html += `<section class="card next">${cardHead(next.type === 'lauf' ? 'run' : 'dumbbell', `<small>Als Nächstes · ${esc(plan.name)}</small>${esc(next.name)}`, '', next.type === 'lauf' ? 'orange' : '')}${sessionPreview(next)}
        <button type="button" class="btn primary" data-a="start" data-plan="${plan.id}" data-session="${next.id}" ${db.workout ? 'disabled' : ''}>Training starten</button></section>`;
    }
    const others = plan.sessions.filter((s) => s !== next);
    if (others.length) {
      html += `<section class="card">${cardHead('list', 'Andere Einheiten')}<div class="list">${others.map((s) => `<div class="row">${ico(s.type === 'lauf' ? 'run' : 'dumbbell', `sm ${s.type === 'lauf' ? 'orange' : ''}`)}<div class="grow"><b>${esc(s.name)}</b><div class="muted small">${s.type === 'lauf' ? esc(s.runTarget || 'Laufen') : `${s.items.length} Übungen`}</div></div><button type="button" class="btn small" data-a="start" data-plan="${plan.id}" data-session="${s.id}" ${db.workout ? 'disabled' : ''}>Starten</button></div>`).join('')}</div></section>`;
    }
  }
  html += `<div class="btnrow"><button type="button" class="btn" data-a="quickRun" ${db.workout ? 'disabled' : ''}>🏃 Laufen</button><button type="button" class="btn" data-a="freeWorkout" ${db.workout ? 'disabled' : ''}>Freies Training</button></div>`;
  return html;
}
function sessionPreview(s) {
  if (s.type === 'lauf') return `<p class="run-target">🏃 ${esc(s.runTarget || 'Laufen')}</p>`;
  return `<ol class="preview">${s.items.map((it) => `<li><span>${esc(exById(it.exId).name)}</span><span class="muted">${it.sets}× ${esc(it.reps)}${it.weight ? ` · ${esc(it.weight)} kg` : ''}</span></li>`).join('')}</ol>`;
}

// ---------- Ansicht: Training ----------
function startWorkout(planId, sessionId) {
  const plan = db.plans.find((p) => p.id === planId);
  const s = plan?.sessions.find((x) => x.id === sessionId);
  if (!s) return;
  db.workout = { planId, sessionId, name: s.name, type: s.type, started: new Date().toISOString(), runTarget: s.runTarget || '',
    warmup: s.warmup || [], cooldown: s.cooldown || [], items: s.items.map(makeWorkoutItem), run: { km: '', min: '' }, note: '' };
  save(); go('start', { name: 'workout' });
}
function makeWorkoutItem(it) {
  const last = lastSetsFor(it.exId);
  const n = Math.max(1, parseInt(it.sets) || 3);
  const sets = [];
  for (let i = 0; i < n; i++) {
    const l = last?.[i] || last?.[last.length - 1];
    sets.push({ reps: l ? l.reps : '', weight: l ? l.weight : (it.weight || ''), done: false });
  }
  return { exId: it.exId, target: it.reps || '', targetWeight: it.weight || '', sets, last: last ? last.map((x) => `${x.reps}${x.weight ? `×${x.weight}` : ''}`).join(', ') : '' };
}
function viewWorkout() {
  const w = db.workout;
  if (!w) { ui.view = null; return viewStart(); }
  let html = header(w.name, 'leaveWorkout', timerBtn);
  if (w.type === 'lauf') {
    if (w.runTarget) html += `<p class="run-target card">🏃 ${esc(w.runTarget)}</p>`;
    html += gpsCard(w);
    html += `<section class="card" ${w.gps?.state === 'running' ? 'hidden' : ''}>${w.gps ? '' : '<p class="muted small">Oder nach dem Lauf von Hand eintragen:</p>'}
      <label class="field"><span>Strecke (km)</span><input inputmode="decimal" data-c="run" data-k="km" value="${esc(w.run.km)}" placeholder="z. B. 5,2"></label>
      <label class="field"><span>Zeit (Minuten)</span><input inputmode="decimal" data-c="run" data-k="min" value="${esc(w.run.min)}" placeholder="z. B. 32"></label>
      <div class="pace" id="pace">${pace(w.run.km, w.run.min) || '&nbsp;'}</div></section>`;
  } else {
    if (w.warmup?.length) html += `<details class="card"><summary><b>Aufwärmen</b> <span class="muted small">ca. 5–8 Min</span></summary><ul class="tick">${w.warmup.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>`;
    html += w.items.map((it, i) => {
      const ex = exById(it.exId);
      const unit = ex.unit === 'sek' ? 'Sek' : 'Wdh';
      const allDone = it.sets.every((s) => s.done);
      return `<section class="card ex ${allDone ? 'complete' : ''}">
        <div class="exhead"><div><h3>${esc(ex.name)}</h3><div class="muted small">Ziel: ${it.sets.length}× ${esc(it.target)} ${unit}${it.targetWeight ? ` · ${esc(it.targetWeight)} kg` : ''}${it.last ? `<br>Letztes Mal: ${esc(it.last)}` : ''}</div></div>
        <div class="exbtns"><button type="button" class="icon" data-a="showEx" data-id="${ex.id}" aria-label="Erklärung">?</button><button type="button" class="icon" data-a="menuWorkoutEx" data-i="${i}" aria-label="Optionen">⋯</button></div></div>
        <div class="sets">${it.sets.map((s, j) => `<div class="set ${s.done ? 'done' : ''}"><span class="n">${j + 1}</span>
          <label><input inputmode="decimal" data-c="setField" data-i="${i}" data-j="${j}" data-k="weight" value="${esc(s.weight)}" placeholder="–"><span>kg</span></label>
          <label><input inputmode="numeric" data-c="setField" data-i="${i}" data-j="${j}" data-k="reps" value="${esc(s.reps)}" placeholder="${esc(String(it.target).split(/[–\- ]/)[0])}"><span>${unit}</span></label>
          ${unit === 'Sek' ? `<button type="button" class="play ${timer.target?.i === i && timer.target?.j === j ? 'on' : ''}" data-a="setTimer" data-i="${i}" data-j="${j}" aria-label="Timer für diesen Satz starten">▶</button>` : ''}
          <button type="button" class="check" data-a="toggleSet" data-i="${i}" data-j="${j}" aria-label="Satz erledigt">✓</button></div>`).join('')}</div>
        <div class="setbtns"><button type="button" class="link" data-a="addSet" data-i="${i}">+ Satz</button>${it.sets.length > 1 ? `<button type="button" class="link" data-a="removeSet" data-i="${i}">− Satz</button>` : ''}</div>
      </section>`;
    }).join('');
    html += `<button type="button" class="btn" data-a="pickForWorkout">+ Übung hinzufügen</button>`;
    if (w.cooldown?.length) html += `<details class="card"><summary><b>Dehnen zum Schluss</b></summary><ul class="tick">${w.cooldown.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>`;
  }
  html += `<section class="card"><label class="field"><span>Notiz</span><textarea data-c="note" rows="2" placeholder="Wie lief's?">${esc(w.note)}</textarea></label></section>
    <div class="btnrow"><button type="button" class="btn danger" data-a="cancelWorkout">Verwerfen</button><button type="button" class="btn primary" data-a="finishWorkout">Training beenden</button></div>`;
  return html;
}
function runForLog(w) {
  const r = { km: num(w.run.km), min: num(w.run.min) };
  const route = gpsRouteForLog(w.gps);
  if (route) r.route = route;
  if (w.gps?.splits?.length) r.splits = w.gps.splits.map((ms, i) => Math.round((ms - (w.gps.splits[i - 1] || 0)) / 1000));
  return r;
}
async function finishWorkout() {
  const w = db.workout;
  const items = w.items.map((it) => ({ exId: it.exId, sets: it.sets.filter((s) => s.done).map((s) => ({ reps: s.reps, weight: s.weight })) })).filter((it) => it.sets.length);
  if (w.type === 'kraft' && !items.length && !(await ask('Du hast noch keinen Satz abgehakt. Trotzdem beenden?'))) return;
  if (w.gps?.state === 'running' || w.gps?.state === 'paused') { if (!(await ask('GPS-Aufzeichnung beenden und Lauf speichern?'))) return; gpsStop(); }
  if (w.type === 'lauf' && !num(w.run.km) && !num(w.run.min) && !(await ask('Keine Strecke oder Zeit eingetragen. Trotzdem speichern?'))) return;
  const badgesBefore = earnedBadges();
  const logId = uid();
  db.logs.push({ id: logId, date: w.started, end: new Date().toISOString(), planId: w.planId, sessionId: w.sessionId, name: w.name, type: w.type,
    items, run: w.type === 'lauf' ? runForLog(w) : null, note: w.note });
  gpsCleanup();
  if (timer.target) clearTimer();
  db.workout = null; save();
  toast(w.type === 'lauf' ? 'Lauf gespeichert 🏃' : 'Training gespeichert 💪');
  go('start');
  celebrateAfter(logId, badgesBefore);
}

// ---------- Ansicht: Pläne ----------
function viewPlans() {
  let html = header('Pläne');
  html += `<div class="btnrow"><button type="button" class="btn primary" data-a="openGenerator">Plan erstellen lassen</button><button type="button" class="btn" data-a="newPlan">Eigener Plan</button></div>`;
  if (!db.plans.length) return html + `<p class="empty">Noch keine Pläne.</p>`;
  html += db.plans.map((p) => `<section class="card"><div class="row"><div><h2>${esc(p.name)}</h2><div class="muted small">${p.sessions.length} Einheiten${p.id === db.activePlanId ? ' · <b class="accent">aktiv</b>' : ''}</div></div>
    <button type="button" class="btn small" data-a="editPlan" data-id="${p.id}">Bearbeiten</button></div>
    ${p.sessions.map((s) => `<details><summary>${esc(s.name)} <span class="muted small">${s.type === 'lauf' ? 'Laufen' : `${s.items.length} Übungen`} · ${s.perWeek || 1}× pro Woche</span></summary>${sessionPreview(s)}</details>`).join('')}
    ${p.id !== db.activePlanId ? `<button type="button" class="btn small" data-a="activatePlan" data-id="${p.id}">Als aktiven Plan nutzen</button>` : ''}</section>`).join('');
  return html;
}
function viewPlanEdit(id) {
  const p = db.plans.find((x) => x.id === id);
  if (!p) { ui.view = null; return viewPlans(); }
  let html = header('Plan bearbeiten', 'closeView');
  html += `<section class="card"><label class="field"><span>Name des Plans</span><input data-c="planName" data-id="${p.id}" value="${esc(p.name)}"></label>
    ${p.id !== db.activePlanId ? `<button type="button" class="btn small" data-a="activatePlan" data-id="${p.id}">Als aktiven Plan nutzen</button>` : '<div class="muted small">Das ist dein aktiver Plan.</div>'}</section>`;
  html += p.sessions.map((s, si) => `<section class="card session">
    <div class="row"><input class="title-input" data-c="sessionName" data-p="${p.id}" data-s="${si}" value="${esc(s.name)}" aria-label="Name der Einheit">
      <select data-c="sessionType" data-p="${p.id}" data-s="${si}" aria-label="Art"><option value="kraft" ${s.type === 'kraft' ? 'selected' : ''}>Kraft</option><option value="lauf" ${s.type === 'lauf' ? 'selected' : ''}>Laufen</option></select></div>
    <label class="perweek"><span>Wie oft pro Woche?</span><select data-c="perWeek" data-p="${p.id}" data-s="${si}">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<option value="${n}" ${(s.perWeek || 1) === n ? 'selected' : ''}>${n}×</option>`).join('')}</select></label>
    ${s.type === 'lauf'
      ? `<label class="field"><span>Ziel (z. B. 30 Min locker)</span><input data-c="runTarget" data-p="${p.id}" data-s="${si}" value="${esc(s.runTarget || '')}"></label>`
      : `<div class="items">${s.items.map((it, ii) => `<div class="item">
          <div class="item-top"><button type="button" class="link name" data-a="showEx" data-id="${it.exId}">${esc(exById(it.exId).name)}</button>
          <span class="move"><button type="button" class="icon sm" data-a="moveItem" data-p="${p.id}" data-s="${si}" data-i="${ii}" data-d="-1" aria-label="Nach oben">↑</button><button type="button" class="icon sm" data-a="moveItem" data-p="${p.id}" data-s="${si}" data-i="${ii}" data-d="1" aria-label="Nach unten">↓</button><button type="button" class="icon sm" data-a="swapItem" data-p="${p.id}" data-s="${si}" data-i="${ii}" aria-label="Tauschen">⇄</button><button type="button" class="icon sm" data-a="delItem" data-p="${p.id}" data-s="${si}" data-i="${ii}" aria-label="Entfernen">✕</button></span></div>
          <div class="item-fields"><label><input inputmode="numeric" data-c="itemField" data-k="sets" data-p="${p.id}" data-s="${si}" data-i="${ii}" value="${esc(it.sets)}"><span>Sätze</span></label>
          <label><input data-c="itemField" data-k="reps" data-p="${p.id}" data-s="${si}" data-i="${ii}" value="${esc(it.reps)}"><span>${exById(it.exId).unit === 'sek' ? 'Sek' : 'Wdh'}</span></label>
          <label><input inputmode="decimal" data-c="itemField" data-k="weight" data-p="${p.id}" data-s="${si}" data-i="${ii}" value="${esc(it.weight)}" placeholder="–"><span>kg</span></label></div></div>`).join('')}</div>
        <button type="button" class="btn small" data-a="pickForPlan" data-p="${p.id}" data-s="${si}">+ Übung</button>`}
    <div class="row end"><button type="button" class="link" data-a="dupSession" data-p="${p.id}" data-s="${si}">Kopieren</button><button type="button" class="link danger" data-a="delSession" data-p="${p.id}" data-s="${si}">Einheit löschen</button></div></section>`).join('');
  html += `<button type="button" class="btn" data-a="addSession" data-p="${p.id}">+ Einheit hinzufügen</button>
    <button type="button" class="btn danger" data-a="delPlan" data-id="${p.id}">Plan löschen</button>`;
  return html;
}

// ---------- Ansicht: Generator ----------
function viewGenerator() {
  const p = Object.assign({}, DEFAULT_PROFILE, db.profile || {});
  const radio = (name, val, label) => `<label class="chip"><input type="radio" name="${name}" value="${val}" ${String(p[name]) === String(val) ? 'checked' : ''}><span>${label}</span></label>`;
  const check = (name, val, label) => `<label class="chip"><input type="checkbox" name="${name}" value="${val}" ${p[name].includes(val) ? 'checked' : ''}><span>${label}</span></label>`;
  return header('Plan erstellen lassen', 'closeView') + `<form id="genForm" class="card form">
    <fieldset><legend>Was ist dein Ziel?</legend><div class="chips">${radio('goal', 'fit', 'Fit & gesund')}${radio('goal', 'muskel', 'Muskelaufbau')}${radio('goal', 'kraft', 'Kraft')}${radio('goal', 'abnehmen', 'Abnehmen')}${radio('goal', 'ausdauer', 'Ausdauer')}</div></fieldset>
    <fieldset><legend>Wie erfahren bist du?</legend><div class="chips">${radio('level', 'anfaenger', 'Einsteiger')}${radio('level', 'fortgeschritten', 'Fortgeschritten')}${radio('level', 'erfahren', 'Sehr erfahren')}</div></fieldset>
    <fieldset><legend>Krafttraining pro Woche</legend><div class="chips">${[1, 2, 3, 4, 5].map((n) => radio('days', n, `${n}×`)).join('')}</div></fieldset>
    <fieldset><legend>Dauer pro Einheit</legend><div class="chips">${[30, 45, 60, 75].map((n) => radio('duration', n, `${n} Min`)).join('')}</div></fieldset>
    <fieldset><legend>Joggen pro Woche</legend><div class="chips">${[0, 1, 2, 3].map((n) => radio('runs', n, `${n}×`)).join('')}</div></fieldset>
    <fieldset><legend>Deine Ausrüstung</legend><div class="chips">${check('equip', 'kh', 'Kurzhanteln')}${check('equip', 'bank', 'Hantelbank')}${check('equip', 'stange', 'Klimmzugstange')}${check('equip', 'dip', 'Dipstange')}</div></fieldset>
    <fieldset><legend>Wie viele Klimmzüge schaffst du am Stück?</legend><input type="number" name="pullups" min="0" max="50" inputmode="numeric" value="${p.pullups}"></fieldset>
    <fieldset><legend>Bereiche schonen</legend><div class="chips">${check('avoid', 'knie', 'Knie')}${check('avoid', 'ruecken', 'Unterer Rücken')}${check('avoid', 'schulter', 'Schulter')}${check('avoid', 'handgelenk', 'Handgelenk')}</div></fieldset>
    <button type="button" class="btn primary" data-a="generate">Plan erstellen</button></form>`;
}
function readGenForm() {
  const f = $('#genForm');
  const val = (n) => f.querySelector(`input[name="${n}"]:checked`)?.value;
  const vals = (n) => [...f.querySelectorAll(`input[name="${n}"]:checked`)].map((x) => x.value);
  return { goal: val('goal'), level: val('level'), days: +val('days'), duration: +val('duration'), runs: +val('runs'),
    equip: vals('equip'), avoid: vals('avoid'), pullups: parseInt(f.querySelector('input[name="pullups"]').value) || 0 };
}

// ---------- Ansicht: Übungen ----------
function exFiltered() {
  const q = ui.exSearch.trim().toLowerCase();
  const m = ui.muscle;
  let list = allExercises().filter((e) => !q || e.name.toLowerCase().includes(q) || (e.muscles || '').toLowerCase().includes(q));
  if (m) {
    list = list.filter((e) => { const mu = musclesOf(e); return mu.p.includes(m) || mu.s.includes(m) || (m === 'obliques' && mu.p.includes('abs')); });
    const rank = (e) => (musclesOf(e).p.includes(m) ? 0 : 1);
    list.sort((a, b) => rank(a) - rank(b));
  }
  return list;
}
function exMuscleTag(e) {
  if (!ui.muscle) return '';
  return musclesOf(e).p.includes(ui.muscle) ? '<span class="tag hl">Hauptmuskel</span>' : '<span class="tag">unterstützend</span>';
}
function exResultsHTML() {
  const list = exFiltered();
  const bar = ui.muscle ? `<div class="mm-sel"><span>Übungen für <b>${esc(MUSCLES[ui.muscle])}</b> · ${list.length}</span><button type="button" class="link" data-a="mmClear">Alle zeigen</button></div>` : '';
  return bar + exList(list, 'showEx', exMuscleTag);
}
function viewExercises() {
  return header('Übungen') + `<div class="search"><input type="search" placeholder="Übung oder Muskel suchen" data-c="exSearch" value="${esc(ui.exSearch)}"></div>
    ${muscleMapCard(ui.muscle, ui.mmAngle)}
    <div id="exList">${exResultsHTML()}</div>
    <button type="button" class="btn" data-a="newEx">+ Eigene Übung anlegen</button>`;
}
function exList(list, action = 'showEx', tag = () => '') {
  if (!list.length) return '<p class="empty">Keine Übung gefunden.</p>';
  return `<div class="card list">${list.map((e) => `<button type="button" class="row ex-row" data-a="${action}" data-id="${e.id}"><div><b>${esc(e.name)}</b>${e.custom ? ' <span class="tag">eigene</span>' : ''} ${tag(e)}<div class="muted small">${esc(e.muscles || e.group)}</div></div><span class="chev">›</span></button>`).join('')}</div>`;
}
function exDetail(id) {
  const ex = exById(id);
  const alts = alternatives(ex).slice(0, 6);
  const equipNames = { kh: 'Kurzhanteln', bank: 'Hantelbank', stange: 'Klimmzugstange', dip: 'Dipstange' };
  return `<h2>${esc(ex.name)}</h2>
    <div class="muted">${esc(ex.muscles || ex.group)}${ex.equip?.length ? ` · ${ex.equip.map((q) => equipNames[q] || q).join(', ')}` : ' · ohne Geräte'}</div>
    ${trainedChips(ex)}
    ${(() => { const r = recordFor(ex.id); return r ? `<div class="pr">🏆 Dein Rekord: <b>${esc(r.label)}</b> <span class="muted small">(${fmtDate(r.date)})</span></div>` : ''; })()}
    ${typeof ANIM !== 'undefined' && ANIM[ex.id] ? `<canvas class="anim" data-ex="${ex.id}" role="img" aria-label="Animation: ${esc(ex.name)}"></canvas>` : ''}
    ${ex.steps?.length ? `<h3>So geht's</h3><ol>${ex.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
    ${ex.mistakes?.length ? `<h3>Typische Fehler</h3><ul class="warn">${ex.mistakes.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
    <a class="btn" href="${esc(videoUrl(ex))}" target="_blank" rel="noopener">▶ Video ansehen</a>
    ${alts.length ? `<h3>Alternativen</h3><div class="alts">${alts.map((a) => `<button type="button" class="chip-btn" data-a="showEx" data-id="${a.id}">${esc(a.name)}</button>`).join('')}</div>` : ''}
    ${ex.custom ? `<div class="btnrow"><button type="button" class="btn" data-a="editEx" data-id="${ex.id}">Bearbeiten</button><button type="button" class="btn danger" data-a="delEx" data-id="${ex.id}">Löschen</button></div>` : ''}`;
}
function trainedChips(ex) {
  const mu = musclesOf(ex);
  if (!mu.p.length && !mu.s.length) return '';
  const chip = (m, main) => `<button type="button" class="mchip ${main ? 'main' : ''}" data-a="muscleFromDetail" data-m="${m}"><i></i>${esc(MUSCLES[m])}</button>`;
  return `<div class="trained"><span class="muted small">Trainiert:</span>${mu.p.map((m) => chip(m, true)).join('')}${mu.s.map((m) => chip(m, false)).join('')}</div>`;
}
function viewExForm(id) {
  const ex = id ? db.customExercises.find((e) => e.id === id) : null;
  const e = ex || { name: '', group: 'Sonstiges', muscles: '', steps: [], mistakes: [], video: '', unit: 'wdh' };
  return header(ex ? 'Übung bearbeiten' : 'Eigene Übung', 'closeView') + `<form id="exForm" class="card form">
    <label class="field"><span>Name</span><input name="name" value="${esc(e.name)}" required></label>
    <label class="field"><span>Muskelgruppe</span><select name="group">${GROUPS.map((g) => `<option ${g === e.group ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></label>
    <label class="field"><span>Zielmuskeln (optional)</span><input name="muscles" value="${esc(e.muscles)}"></label>
    <label class="field"><span>Gemessen in</span><select name="unit"><option value="wdh" ${e.unit !== 'sek' ? 'selected' : ''}>Wiederholungen</option><option value="sek" ${e.unit === 'sek' ? 'selected' : ''}>Sekunden</option></select></label>
    <label class="field"><span>Ausführung (ein Schritt pro Zeile)</span><textarea name="steps" rows="4">${esc(e.steps.join('\n'))}</textarea></label>
    <label class="field"><span>Typische Fehler (einer pro Zeile)</span><textarea name="mistakes" rows="3">${esc(e.mistakes.join('\n'))}</textarea></label>
    <label class="field"><span>Videolink (optional)</span><input name="video" type="url" value="${esc(e.video)}" placeholder="https://…"></label>
    <button type="button" class="btn primary" data-a="saveEx" data-id="${ex ? ex.id : ''}">Speichern</button></form>`;
}

// ---------- Ansicht: Verlauf ----------
function viewHistory() {
  const m = ui.cal;
  const first = new Date(m.getFullYear(), m.getMonth(), 1);
  const startOffset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  const byDay = {};
  db.logs.forEach((l) => { (byDay[dayKey(l.date)] ||= []).push(l); });
  let cells = '';
  for (let i = 0; i < startOffset; i++) cells += '<div></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const k = dayKey(new Date(m.getFullYear(), m.getMonth(), d));
    const ls = byDay[k] || [];
    cells += `<button type="button" class="day ${k === dayKey(new Date()) ? 'today' : ''} ${ui.calDay === k ? 'sel' : ''}" data-a="calDay" data-k="${k}"><span>${d}</span><i>${ls.some((l) => l.type === 'kraft') ? '<b class="k"></b>' : ''}${ls.some((l) => l.type === 'lauf') ? '<b class="r"></b>' : ''}</i></button>`;
  }
  const monthLogs = db.logs.filter((l) => { const d = new Date(l.date); return d.getMonth() === m.getMonth() && d.getFullYear() === m.getFullYear(); });
  const km = monthLogs.reduce((a, l) => a + (l.run?.km || 0), 0);
  const shown = (ui.calDay ? db.logs.filter((l) => dayKey(l.date) === ui.calDay) : db.logs).slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, ui.calDay ? 20 : 15);
  return header('Verlauf') + weekCard() + gpxButton('btn gpx') + `<section class="card">
    <div class="calhead"><button type="button" class="icon" data-a="calMove" data-d="-1" aria-label="Voriger Monat">‹</button><h2>${MONTHS[m.getMonth()]} ${m.getFullYear()}</h2><button type="button" class="icon" data-a="calMove" data-d="1" aria-label="Nächster Monat">›</button></div>
    <div class="cal">${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => `<div class="dow">${d}</div>`).join('')}${cells}</div>
    <div class="legend"><span><b class="k"></b>Kraft</span><span><b class="r"></b>Laufen</span></div>
    <div class="stats"><div><b>${monthLogs.filter((l) => l.type === 'kraft').length}</b><span>Krafttrainings</span></div><div><b>${monthLogs.filter((l) => l.type === 'lauf').length}</b><span>Läufe</span></div><div><b>${fmtNum(km) || 0}</b><span>km gelaufen</span></div></div></section>
    <section class="card">${cardHead('calendar', ui.calDay ? fmtDate(ui.calDay) : 'Letzte Trainings')}${shown.length ? `<div class="list">${shown.map((l) => `<button type="button" class="row ex-row" data-a="showLog" data-id="${l.id}"><div><b>${esc(l.name)}</b><div class="muted small">${fmtDate(l.date)} · ${l.type === 'lauf' ? `${fmtNum(l.run?.km) || '–'} km · ${fmtNum(l.run?.min) || '–'} Min` : `${l.items.length} Übungen · ${l.items.reduce((a, i) => a + i.sets.length, 0)} Sätze`}</div></div><span class="dot ${l.type === 'lauf' ? 'r' : 'k'}"></span></button>`).join('')}</div>` : '<p class="empty">Keine Trainings.</p>'}</section>`
    + recordsCard() + bodyCard() + badgesCard();
}
function logDetail(id) {
  const l = db.logs.find((x) => x.id === id);
  if (!l) return '';
  const dur = l.end ? Math.round((new Date(l.end) - new Date(l.date)) / 60000) : null;
  return `<h2>${esc(l.name)}</h2><div class="muted">${fmtDate(l.date)}${dur && l.type === 'kraft' ? ` · ${dur} Min` : ''}</div>
    ${l.type === 'lauf' ? `<div class="stats"><div><b>${fmtNum(l.run?.km) || '–'}</b><span>km</span></div><div><b>${fmtNum(l.run?.min) || '–'}</b><span>Minuten</span></div><div><b>${pace(l.run?.km, l.run?.min).replace(' min/km', '') || '–'}</b><span>min/km</span></div></div>${l.run?.route ? routeSVG(l.run.route) : ''}${l.run?.splits?.length ? `<h3>Kilometerzeiten</h3><div class="splits">${l.run.splits.map((sec, i) => `<div><span>km ${i + 1}</span><b>${Math.floor(sec / 60)}:${pad(sec % 60)}</b></div>`).join('')}</div>` : ''}`
      : l.items.map((it) => `<h3>${esc(exById(it.exId).name)}</h3><div class="muted">${it.sets.map((s) => `${esc(s.reps || '?')}${s.weight ? ` × ${esc(s.weight)} kg` : ''}`).join(' · ')}</div>`).join('')}
    ${l.note ? `<h3>Notiz</h3><p>${esc(l.note)}</p>` : ''}
    <div class="btnrow"><button type="button" class="btn danger" data-a="delLog" data-id="${l.id}">Löschen</button></div>`;
}

// ---------- Ansicht: Mehr ----------
function viewMore() {
  const r = db.reminder;
  return header('Mehr') + `<section class="card"><h2>Erinnerungen</h2>
    <p class="muted small">Wähle deine Trainingstage. Die App erstellt daraus wiederkehrende Termine mit Erinnerung für deinen Handy-Kalender.</p>
    <div class="chips">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<label class="chip"><input type="checkbox" data-c="remDay" value="${d}" ${r.days.includes(d) ? 'checked' : ''}><span>${WD[d]}</span></label>`).join('')}</div>
    <div class="grid2"><label class="field"><span>Uhrzeit</span><input type="time" data-c="remField" data-k="time" value="${esc(r.time)}"></label>
    <label class="field"><span>Erinnern</span><select data-c="remField" data-k="alarm">${[[0, 'zur Startzeit'], [15, '15 Min vorher'], [30, '30 Min vorher'], [60, '1 Std vorher']].map(([v, l]) => `<option value="${v}" ${+r.alarm === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
    <button type="button" class="btn primary" data-a="exportIcs">Zum Kalender hinzufügen</button>
    <p class="muted small">Je nach Handy fragt der Kalender direkt, ob du die Termine hinzufügen möchtest. Sonst wird eine Datei geladen: diese antippen und mit dem Kalender öffnen. Ändern oder löschen kannst du die Termine später direkt im Kalender.</p></section>
    <section class="card"><h2>Backup</h2><p class="muted small">Deine Daten liegen nur auf diesem Handy. Sichere sie ab und zu, z. B. in iCloud Drive.</p>
    <div class="btnrow"><button type="button" class="btn" data-a="exportJson">Daten sichern</button><label class="btn">Wiederherstellen<input type="file" accept=".json,application/json" data-c="importJson" hidden></label></div>
    ${db.lastBackup ? `<p class="muted small">Letzte Sicherung: ${fmtDate(db.lastBackup)}</p>` : ''}</section>
    <section class="card"><h2>Installieren</h2>${installEvt ? '<button type="button" class="btn primary" data-a="install">App installieren</button>' : ''}${INSTALL_HELP}</section>
    <section class="card"><h2>Daten</h2><p class="muted small">${db.plans.length} Pläne · ${db.logs.length} Trainings · ${db.customExercises.length} eigene Übungen</p>
    <button type="button" class="btn danger" data-a="wipe">Alle Daten löschen</button></section>`;
}
function buildIcs() {
  const r = db.reminder;
  const [hh, mm] = r.time.split(':').map(Number);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const BY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const fmt = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const plan = activePlan();
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Trainingsplan//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  r.days.forEach((d) => {
    const start = new Date(); start.setHours(hh, mm, 0, 0);
    while (start.getDay() !== d || start < new Date()) start.setDate(start.getDate() + 1);
    const end = new Date(start.getTime() + (r.duration || 60) * 60000);
    lines.push('BEGIN:VEVENT', `UID:trainingsplan-${d}-${uid()}@trainingsplan`, `DTSTAMP:${stamp}`, `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${BY[d]}`, 'SUMMARY:💪 Training', `DESCRIPTION:${plan ? `Plan: ${plan.name.replace(/[,;]/g, ' ')}` : 'Zeit fürs Training'}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Zeit fürs Training', `TRIGGER:-PT${+r.alarm || 0}M`, 'END:VALARM', 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ---------- Timer & Stoppuhr ----------
// Zeit wird aus Zeitstempeln berechnet, damit sie auch stimmt, wenn das Handy kurz gesperrt war.
const timer = { mode: null, dur: 0, start: 0, acc: 0, running: false, label: '', target: null, beeped: 0 };
let audioCtx = null, tickHandle = null, wakeLock = null;
function unlockAudio() { try { audioCtx ||= new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); } catch (e) {} }
function beep(freq = 880, ms = 150) {
  try {
    unlockAudio();
    const t = audioCtx.currentTime, o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = freq; o.connect(g); g.connect(audioCtx.destination);
    g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000);
    o.start(t); o.stop(t + ms / 1000);
  } catch (e) {}
}
const timerElapsed = () => timer.acc + (timer.running ? Date.now() - timer.start : 0);
function fmtClock(ms, up) {
  const total = up ? Math.floor(ms / 1000) : Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${pad(total % 60)}`;
}
async function keepAwake(on) {
  try {
    if (on && !wakeLock && navigator.wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); }
    if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (e) { wakeLock = null; }
}
function startTimer(mode, seconds = 0, label = '', target = null) {
  unlockAudio();
  Object.assign(timer, { mode, dur: seconds * 1000, start: Date.now(), acc: 0, running: true, label, target, beeped: 0 });
  clearInterval(tickHandle); tickHandle = setInterval(tick, 200);
  keepAwake(true); tick(); render();
}
function clearTimer() {
  clearInterval(tickHandle); tickHandle = null;
  Object.assign(timer, { mode: null, running: false, target: null, label: '' });
  keepAwake(false); renderTimerBar(); render();
}
function tick() {
  if (timer.mode === 'down') {
    const rem = timer.dur - timerElapsed();
    const sec = Math.ceil(rem / 1000);
    if (timer.running && sec <= 3 && sec > 0 && timer.beeped !== sec) { timer.beeped = sec; beep(660, 120); }
    if (rem <= 0) return timerDone();
  }
  renderTimerBar();
}
function timerDone() {
  beep(990, 700);
  try { navigator.vibrate?.([300, 120, 300]); } catch (e) {}
  recordTimer(Math.round(timer.dur / 1000));
  toast('Zeit um! ✓');
  clearTimer();
}
// Trägt die gemessene Zeit in den Satz bzw. als Laufzeit ein
function recordTimer(seconds) {
  const t = timer.target, w = db.workout;
  if (!t || !w || seconds <= 0) return;
  if (t.run) { w.run.min = fmtNum(Math.round(seconds / 6) / 10); }
  else { const s = w.items[t.i]?.sets[t.j]; if (!s) return; s.reps = String(seconds); s.done = true; }
  save();
}
function renderTimerBar() {
  const bar = $('#timerbar');
  document.body.classList.toggle('timer-on', !!timer.mode);
  if (!timer.mode) { bar.hidden = true; bar.innerHTML = ''; return; }
  const up = timer.mode === 'up';
  const ms = up ? timerElapsed() : timer.dur - timerElapsed();
  const pct = up ? 0 : Math.min(100, (timerElapsed() / timer.dur) * 100);
  const html = `<div class="tb-progress" style="width:${pct}%"></div>
    <div class="tb-info"><span class="tb-label">${esc(timer.label || (up ? 'Stoppuhr' : 'Timer'))}</span><span class="tb-time">${fmtClock(ms, up)}</span></div>
    <div class="tb-btns"><button type="button" class="icon" data-a="timerToggle" aria-label="${timer.running ? 'Pause' : 'Weiter'}">${timer.running ? '❚❚' : '▶'}</button>
    ${timer.target ? '<button type="button" class="btn small primary" data-a="timerStop">Fertig</button>' : ''}
    <button type="button" class="icon" data-a="timerCancel" aria-label="Timer beenden">✕</button></div>`;
  // Nur die Zeit aktualisieren, solange sich sonst nichts ändert (sonst flackern die Knöpfe)
  const key = `${timer.mode}|${timer.running}|${!!timer.target}|${timer.label}`;
  if (bar.dataset.key === key && !bar.hidden) {
    bar.querySelector('.tb-time').textContent = fmtClock(ms, up);
    bar.querySelector('.tb-progress').style.width = pct + '%';
  } else { bar.innerHTML = html; bar.dataset.key = key; bar.hidden = false; }
}
function timerSheet() {
  const w = db.workout;
  const presets = [30, 45, 60, 90, 120, 180, 300];
  return `<h2>Timer & Stoppuhr</h2>
    <h3>Timer</h3><div class="chips">${presets.map((s) => `<button type="button" class="chip-btn" data-a="timerPreset" data-s="${s}">${fmtClock(s * 1000)}</button>`).join('')}</div>
    <div class="custom-timer"><label><input type="number" id="tMin" min="0" max="99" inputmode="numeric" placeholder="0"><span>Min</span></label><label><input type="number" id="tSec" min="0" max="59" inputmode="numeric" placeholder="0"><span>Sek</span></label>
    <button type="button" class="btn small primary" data-a="timerCustom">Start</button></div>
    <h3>Stoppuhr</h3><p class="muted small">${w?.type === 'lauf' ? 'Mit „Fertig“ wird die gestoppte Zeit als Laufzeit eingetragen.' : 'Zählt hoch, z. B. für „so lange wie möglich halten“.'}</p>
    <button type="button" class="btn" data-a="stopwatch">Stoppuhr starten</button>
    <p class="muted small">Bei Zeitübungen wie Plank startest du den Timer auch direkt mit ▶ neben dem Satz.</p>`;
}

// ---------- Modal, Toast ----------
function modal(html) { $('#modal').innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><button type="button" class="close" data-a="closeModal" aria-label="Schließen">✕</button>${html}</div>`; $('#modal').hidden = false; document.body.classList.add('noscroll'); if (typeof startExerciseAnim === 'function') startExerciseAnim(); }
function closeModal() { const r = ui.ask; ui.ask = null; r?.(false); $('#modal').hidden = true; $('#modal').innerHTML = ''; document.body.classList.remove('noscroll'); ui.picker = null; }
// Eigene Rückfrage statt confirm(), funktioniert überall gleich
function ask(msg, ok = 'Ja') {
  return new Promise((resolve) => {
    modal(`<p class="ask">${esc(msg)}</p><div class="btnrow"><button type="button" class="btn" data-a="askNo">Abbrechen</button><button type="button" class="btn primary" data-a="askYes">${esc(ok)}</button></div>`);
    ui.ask = resolve;
  });
}
let toastTimer;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2200); }

function openPicker(onPick, pattern) {
  ui.picker = { onPick, q: '' };
  const list = allExercises();
  const sorted = pattern ? list.filter((e) => e.pattern === pattern).concat(list.filter((e) => e.pattern !== pattern)) : list;
  ui.picker.list = sorted;
  modal(`<h2>Übung wählen</h2><div class="search"><input type="search" placeholder="Suchen" data-c="pickSearch"></div><div id="pickList">${exList(sorted, 'pick')}</div>`);
}

// ---------- Aktionen ----------
const planOf = (d) => db.plans.find((p) => p.id === d.p);
const A = {
  ...EXTRA_ACTIONS,
  tab: (d) => go(d.tab),
  closeView: () => { ui.view = null; render(); window.scrollTo(0, 0); },
  closeModal,
  askYes: () => { const r = ui.ask; ui.ask = null; closeModal(); r?.(true); },
  askNo: () => closeModal(),
  openGenerator: () => go('plaene', { name: 'generator' }),
  generate: () => {
    const p = readGenForm();
    if (!p.goal || !p.days) return toast('Bitte Ziel und Trainingstage wählen');
    db.profile = p;
    const plan = generatePlan(p);
    db.plans.push(plan); db.activePlanId = plan.id; save();
    toast('Plan erstellt ✨');
    go('plaene', { name: 'planEdit', id: plan.id });
  },
  newPlan: () => {
    const plan = { id: uid(), name: 'Mein Plan', created: new Date().toISOString(), sessions: [{ id: uid(), name: 'Training A', type: 'kraft', items: [], warmup: WARMUP.slice(), cooldown: COOLDOWN.slice() }] };
    db.plans.push(plan); if (!db.activePlanId) db.activePlanId = plan.id; save();
    go('plaene', { name: 'planEdit', id: plan.id });
  },
  editPlan: (d) => go('plaene', { name: 'planEdit', id: d.id }),
  activatePlan: (d) => { db.activePlanId = d.id; save(); render(); toast('Aktiver Plan geändert'); },
  delPlan: async (d) => {
    if (!(await ask('Plan wirklich löschen? Deine bisherigen Trainings bleiben im Verlauf.'))) return;
    db.plans = db.plans.filter((p) => p.id !== d.id);
    if (db.activePlanId === d.id) db.activePlanId = db.plans[0]?.id || null;
    save(); go('plaene');
  },
  addSession: (d) => { const p = planOf(d); p.sessions.push({ id: uid(), name: `Training ${String.fromCharCode(65 + p.sessions.length)}`, type: 'kraft', items: [], warmup: WARMUP.slice(), cooldown: COOLDOWN.slice() }); save(); render(); },
  dupSession: (d) => {
    const p = planOf(d), src = p.sessions[+d.s];
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = uid(); copy.name = `${src.name} (Kopie)`; copy.perWeek = 1;
    p.sessions.splice(+d.s + 1, 0, copy); save(); render(); toast('Einheit kopiert');
  },
  delSession: async (d) => { if (!(await ask('Einheit löschen?'))) return; planOf(d).sessions.splice(+d.s, 1); save(); render(); },
  moveItem: (d) => { const items = planOf(d).sessions[+d.s].items; const i = +d.i, j = i + +d.d; if (j < 0 || j >= items.length) return; [items[i], items[j]] = [items[j], items[i]]; save(); render(); },
  delItem: (d) => { planOf(d).sessions[+d.s].items.splice(+d.i, 1); save(); render(); },
  swapItem: (d) => { const it = planOf(d).sessions[+d.s].items[+d.i]; openPicker((id) => { it.exId = id; save(); render(); }, exById(it.exId).pattern); },
  pickForPlan: (d) => { const s = planOf(d).sessions[+d.s]; openPicker((id) => { const ex = exById(id); s.items.push({ exId: id, sets: 3, reps: ex.reps || '10–12', weight: '' }); save(); render(); }); },
  pick: (d) => { const cb = ui.picker?.onPick; closeModal(); cb?.(d.id); },
  showEx: (d) => modal(exDetail(d.id)),
  newEx: () => go('uebungen', { name: 'exForm' }),
  editEx: (d) => { closeModal(); go('uebungen', { name: 'exForm', id: d.id }); },
  delEx: async (d) => {
    if (!(await ask('Eigene Übung löschen?'))) return;
    db.customExercises = db.customExercises.filter((e) => e.id !== d.id);
    db.plans.forEach((p) => p.sessions.forEach((s) => { s.items = s.items.filter((i) => i.exId !== d.id); }));
    save(); closeModal(); render();
  },
  saveEx: (d) => {
    const f = $('#exForm');
    const get = (n) => f.elements[n].value.trim();
    if (!get('name')) return toast('Bitte einen Namen eingeben');
    const lines = (n) => get(n).split('\n').map((x) => x.trim()).filter(Boolean);
    const data = { name: get('name'), group: get('group'), muscles: get('muscles'), unit: get('unit'), steps: lines('steps'), mistakes: lines('mistakes'), video: get('video'), equip: [], avoid: [], custom: true };
    if (d.id) Object.assign(db.customExercises.find((e) => e.id === d.id), data);
    else db.customExercises.push({ id: 'eigen-' + uid(), ...data });
    save(); toast('Übung gespeichert'); go('uebungen');
  },
  exGroup: (d) => { ui.exGroup = d.g; render(); },
  pickMuscle: (d) => { ui.muscle = ui.muscle === d.m ? '' : d.m; render(); if (ui.muscle) $('#exList')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
  mmFlip: () => { ui.mmAngle += 180; mmSetAngle(ui.mmAngle, true); },
  mmClear: () => { ui.muscle = ''; render(); },
  muscleFromDetail: (d) => { closeModal(); ui.muscle = d.m; const back = ['lats', 'traps', 'lowerback', 'glutes', 'hamstrings', 'triceps'].includes(d.m); ui.mmAngle = back ? 180 : 0; go('uebungen'); },
  openTimer: () => modal(timerSheet()),
  timerPreset: (d) => { closeModal(); startTimer('down', +d.s); },
  timerCustom: () => {
    const sec = (parseInt($('#tMin').value) || 0) * 60 + (parseInt($('#tSec').value) || 0);
    if (sec <= 0) return toast('Bitte eine Zeit eingeben');
    closeModal(); startTimer('down', sec);
  },
  stopwatch: () => { closeModal(); startTimer('up', 0, 'Stoppuhr', db.workout?.type === 'lauf' ? { run: true } : null); },
  setTimer: (d) => {
    const i = +d.i, j = +d.j, it = db.workout.items[i], s = it.sets[j];
    if (timer.mode && timer.target?.i === i && timer.target?.j === j) return A.timerToggle();
    const sec = parseInt(s.reps) || parseInt(String(it.target).match(/\d+/)?.[0]);
    const label = `${exById(it.exId).name} · Satz ${j + 1}`;
    if (sec > 0) startTimer('down', sec, label, { i, j }); else startTimer('up', 0, label, { i, j });
  },
  timerToggle: () => {
    if (!timer.mode) return;
    if (timer.running) { timer.acc = timerElapsed(); timer.running = false; } else { timer.start = Date.now(); timer.running = true; unlockAudio(); }
    renderTimerBar();
  },
  timerStop: () => { recordTimer(Math.round(timerElapsed() / 1000)); toast('Zeit eingetragen ✓'); clearTimer(); },
  timerCancel: () => clearTimer(),
  install: () => { installEvt?.prompt(); installEvt = null; render(); },
  start: (d) => startWorkout(d.plan, d.session),
  openWorkout: () => go('start', { name: 'workout' }),
  leaveWorkout: () => go('start'),
  gpsStart: () => gpsStart(),
  gpsPause: () => gpsPause(),
  gpsResume: () => gpsResume(),
  gpsStop: async () => { if (await ask('Aufzeichnung beenden?')) gpsStop(); },
  quickRun: () => { db.workout = { planId: null, sessionId: null, name: 'Laufen', type: 'lauf', started: new Date().toISOString(), items: [], run: { km: '', min: '' }, note: '' }; save(); go('start', { name: 'workout' }); },
  freeWorkout: () => { db.workout = { planId: null, sessionId: null, name: 'Freies Training', type: 'kraft', started: new Date().toISOString(), items: [], warmup: WARMUP.slice(), cooldown: COOLDOWN.slice(), run: { km: '', min: '' }, note: '' }; save(); go('start', { name: 'workout' }); },
  toggleSet: (d) => {
    const it = db.workout.items[+d.i], s = it.sets[+d.j];
    s.done = !s.done;
    if (s.done && !String(s.reps).trim()) s.reps = String(it.target).match(/\d+/)?.[0] || '';
    save(); render();
  },
  addSet: (d) => { const sets = db.workout.items[+d.i].sets; const l = sets[sets.length - 1]; sets.push({ reps: l?.reps || '', weight: l?.weight || '', done: false }); save(); render(); },
  removeSet: (d) => { db.workout.items[+d.i].sets.pop(); save(); render(); },
  pickForWorkout: () => openPicker((id) => { const ex = exById(id); db.workout.items.push(makeWorkoutItem({ exId: id, sets: 3, reps: ex.reps || '10–12', weight: '' })); save(); render(); }),
  menuWorkoutEx: (d) => {
    const it = db.workout.items[+d.i];
    modal(`<h2>${esc(exById(it.exId).name)}</h2><div class="list"><button type="button" class="row ex-row" data-a="swapWorkoutEx" data-i="${d.i}"><b>Übung tauschen</b><span class="chev">›</span></button>
      <button type="button" class="row ex-row" data-a="moveWorkoutEx" data-i="${d.i}" data-d="-1"><b>Nach oben</b></button><button type="button" class="row ex-row" data-a="moveWorkoutEx" data-i="${d.i}" data-d="1"><b>Nach unten</b></button>
      <button type="button" class="row ex-row danger" data-a="removeWorkoutEx" data-i="${d.i}"><b>Heute auslassen</b></button></div>`);
  },
  swapWorkoutEx: (d) => {
    const i = +d.i, old = db.workout.items[i];
    closeModal();
    openPicker((id) => { db.workout.items[i] = makeWorkoutItem({ exId: id, sets: old.sets.length, reps: exById(id).reps || old.target, weight: '' }); save(); render(); }, exById(old.exId).pattern);
  },
  moveWorkoutEx: (d) => { const it = db.workout.items, i = +d.i, j = i + +d.d; if (j >= 0 && j < it.length) [it[i], it[j]] = [it[j], it[i]]; save(); closeModal(); render(); },
  removeWorkoutEx: (d) => { db.workout.items.splice(+d.i, 1); save(); closeModal(); render(); },
  finishWorkout,
  cancelWorkout: async () => { if (!(await ask('Training verwerfen? Eingetragene Sätze gehen verloren.'))) return; if (timer.target) clearTimer(); gpsCleanup(); db.workout = null; save(); go('start'); },
  calMove: (d) => { ui.cal = new Date(ui.cal.getFullYear(), ui.cal.getMonth() + +d.d, 1); ui.calDay = null; render(); },
  calDay: (d) => { ui.calDay = ui.calDay === d.k ? null : d.k; render(); },
  showLog: (d) => modal(logDetail(d.id)),
  delLog: async (d) => { if (!(await ask('Training aus dem Verlauf löschen?'))) return; db.logs = db.logs.filter((l) => l.id !== d.id); save(); closeModal(); render(); },
  exportIcs: () => {
    if (!db.reminder.days.length) return toast('Bitte mindestens einen Tag wählen');
    download('training-erinnerungen.ics', buildIcs(), 'text/calendar');
  },
  exportJson: () => {
    db.lastBackup = new Date().toISOString(); save();
    download(`trainingsplan-backup-${dayKey(new Date())}.json`, JSON.stringify(db, null, 1), 'application/json');
    render();
  },
  wipe: async () => {
    if (!(await ask('Wirklich ALLE Daten löschen? Das lässt sich nicht rückgängig machen. Tipp: vorher „Daten sichern“.'))) return;
    db = EMPTY(); save(); go('start');
  },
};

// Eingaben
const C = {
  run: (d, el) => { db.workout.run[d.k] = el.value; save(); const p = $('#pace'); if (p) p.innerHTML = pace(db.workout.run.km, db.workout.run.min) || '&nbsp;'; },
  note: (d, el) => { db.workout.note = el.value; save(); },
  setField: (d, el) => { db.workout.items[+d.i].sets[+d.j][d.k] = el.value.replace('.', ','); save(); },
  planName: (d, el) => { db.plans.find((p) => p.id === d.id).name = el.value; save(); },
  sessionName: (d, el) => { planOf(d).sessions[+d.s].name = el.value; save(); },
  perWeek: (d, el) => { planOf(d).sessions[+d.s].perWeek = +el.value; save(); },
  sessionType: (d, el) => { planOf(d).sessions[+d.s].type = el.value; save(); render(); },
  runTarget: (d, el) => { planOf(d).sessions[+d.s].runTarget = el.value; save(); },
  itemField: (d, el) => { const it = planOf(d).sessions[+d.s].items[+d.i]; it[d.k] = d.k === 'sets' ? (parseInt(el.value) || 1) : el.value; save(); },
  exSearch: (d, el) => { ui.exSearch = el.value; $('#exList').innerHTML = exResultsHTML(); },
  pickSearch: (d, el) => { const q = el.value.trim().toLowerCase(); $('#pickList').innerHTML = exList(ui.picker.list.filter((e) => e.name.toLowerCase().includes(q) || (e.muscles || '').toLowerCase().includes(q)), 'pick'); },
  remDay: (d, el) => { const v = +el.value; db.reminder.days = el.checked ? [...new Set([...db.reminder.days, v])] : db.reminder.days.filter((x) => x !== v); save(); },
  remField: (d, el) => { db.reminder[d.k] = d.k === 'alarm' ? +el.value : el.value; save(); },
  importGpx: (d, el) => { const f = el.files[0]; el.value = ''; if (f) importGpxFile(f); },
  importJson: (d, el) => {
    const file = el.files[0]; if (!file) return;
    file.text().then(async (t) => {
      const data = JSON.parse(t);
      if (data?.v !== 1 || !Array.isArray(data.logs)) throw new Error();
      if (!(await ask(`Backup mit ${data.plans.length} Plänen und ${data.logs.length} Trainings laden? Deine aktuellen Daten werden ersetzt.`))) return;
      db = Object.assign(EMPTY(), data); save(); toast('Daten wiederhergestellt'); go('start');
    }).catch(() => toast('Datei konnte nicht gelesen werden'));
  },
};

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-a]');
  if (t && A[t.dataset.a]) { if (t.tagName !== 'A') e.preventDefault(); A[t.dataset.a](t.dataset, t); return; }
  if (e.target.id === 'modal') closeModal();
});
const onInput = (e) => { const t = e.target.closest('[data-c]'); if (t && C[t.dataset.c]) C[t.dataset.c](t.dataset, t); };
document.addEventListener('input', (e) => { if (e.target.type !== 'checkbox' && e.target.type !== 'file' && e.target.tagName !== 'SELECT') onInput(e); });
document.addEventListener('change', (e) => { if (e.target.type === 'checkbox' || e.target.type === 'file' || e.target.tagName === 'SELECT') onInput(e); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && timer.mode) { if (timer.running) keepAwake(true); tick(); } });

// ---------- Start ----------
if (db.workout) ui.view = { name: 'workout' };
render();
gpsResumeIfRunning();
if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
