'use strict';
// Drehbare Muskelkarte (Vorder- und Rückseite). Linke Körperhälfte wird gezeichnet und gespiegelt.
// Koordinaten: viewBox 0 0 200 410, Körpermitte bei x = 100.

const MM_SIL_CENTER = `
  <ellipse cx="100" cy="34" rx="17" ry="21"/>
  <rect x="90" y="50" width="20" height="20" rx="6"/>
  <path d="M62 74 Q100 62 138 74 L144 120 Q134 160 129 196 L71 196 Q66 160 56 120 Z"/>
  <path d="M71 190 L129 190 L136 230 L64 230 Z"/>`;
const MM_SIL_LEFT = `
  <path d="M64 76 Q46 80 44 104 L38 150 L56 153 L67 110 Z"/>
  <path d="M38 147 L28 200 L43 205 L56 152 Z"/>
  <ellipse cx="34" cy="214" rx="7" ry="11"/>
  <path d="M65 222 L61 302 L95 304 L100 228 Z"/>
  <path d="M63 300 L66 382 L87 384 L95 302 Z"/>
  <ellipse cx="76" cy="393" rx="12" ry="6"/>`;

// [Muskel-ID, Pfad] für die linke Hälfte, und Formen in der Mitte (nicht gespiegelt)
const MM_FRONT_LEFT = [
  ['traps', 'M91 64 Q78 69 68 76 Q82 77 91 72 Z'],
  ['delts', 'M64 76 Q47 80 46 100 Q55 105 66 97 Q71 84 64 76 Z'],
  ['chest', 'M98 80 Q80 75 68 88 Q66 104 76 114 Q90 120 98 116 Z'],
  ['biceps', 'M49 105 Q45 124 47 141 Q55 143 60 129 Q63 111 58 102 Z'],
  ['forearms', 'M43 153 Q35 172 33 196 Q39 201 44 197 Q52 176 55 157 Z'],
  ['obliques', 'M75 122 Q83 120 87 124 L87 186 Q79 184 75 177 Q71 150 75 122 Z'],
  ['quads', 'M70 232 Q63 262 67 296 Q80 303 93 296 Q99 262 96 236 Q84 227 70 232 Z'],
  ['calves', 'M68 312 Q65 340 70 370 Q76 375 81 370 Q85 340 83 312 Q75 307 68 312 Z'],
];
const MM_FRONT_CENTER = [['abs', 'M88 120 L112 120 L113 186 Q100 195 87 186 Z']];
const MM_BACK_LEFT = [
  ['delts', 'M64 76 Q47 80 46 100 Q55 105 66 97 Q71 84 64 76 Z'],
  ['lats', 'M72 96 Q65 122 76 160 Q88 170 98 172 L98 128 Q88 104 72 96 Z'],
  ['triceps', 'M49 105 Q44 124 47 142 Q55 144 59 130 Q63 111 58 102 Z'],
  ['forearms', 'M43 153 Q35 172 33 196 Q39 201 44 197 Q52 176 55 157 Z'],
  ['glutes', 'M70 196 Q65 222 74 236 Q90 243 99 232 L99 200 Q84 191 70 196 Z'],
  ['hamstrings', 'M68 244 Q64 270 68 298 Q80 305 92 298 Q97 270 96 246 Q82 238 68 244 Z'],
  ['calves', 'M66 306 Q60 330 68 358 Q76 365 84 358 Q90 330 86 306 Q76 299 66 306 Z'],
];
const MM_BACK_CENTER = [
  ['traps', 'M100 58 Q84 65 69 76 Q86 85 100 124 Q114 85 131 76 Q116 65 100 58 Z'],
  ['lowerback', 'M88 160 L112 160 L114 192 L86 192 Z'],
];

function muscleMapSVG(face, sel) {
  const left = face === 'front' ? MM_FRONT_LEFT : MM_BACK_LEFT;
  const center = face === 'front' ? MM_FRONT_CENTER : MM_BACK_CENTER;
  const shape = ([id, d]) => `<path class="m${sel === id ? ' sel' : ''}" data-a="pickMuscle" data-m="${id}" d="${d}"><title>${MUSCLES[id]}</title></path>`;
  const half = left.map(shape).join('');
  const details = face === 'front'
    ? '<path class="mm-detail" d="M100 122 L100 188 M89 141 L111 141 M89 162 L111 162"/>'
    : '<path class="mm-detail" d="M100 126 L100 196"/>';
  return `<svg viewBox="0 0 200 410" class="mm-svg" role="group" aria-label="Muskelkarte ${face === 'front' ? 'Vorderseite' : 'Rückseite'}">
    <ellipse class="mm-shadow" cx="100" cy="402" rx="62" ry="6"/>
    <g class="mm-sil">${MM_SIL_CENTER}${MM_SIL_LEFT}<g transform="translate(200,0) scale(-1,1)">${MM_SIL_LEFT}</g></g>
    <g class="mm-muscles">${half}<g transform="translate(200,0) scale(-1,1)">${half}</g>${center.map(shape).join('')}</g>
    ${details}
  </svg>`;
}

function muscleMapCard(sel, angle) {
  const showFront = Math.cos((angle * Math.PI) / 180) >= 0;
  return `<section class="card mm">
    <div class="mm-head"><h2>Muskelkarte</h2><button type="button" class="link" data-a="mmFlip">↻ ${showFront ? 'Rückseite' : 'Vorderseite'}</button></div>
    <p class="muted small">Muskel antippen, um passende Übungen zu sehen. Zum Drehen seitlich wischen.</p>
    <div class="mm-stage" id="mmStage">
      <div class="mm-rot" id="mmRot" style="transform: rotateY(${angle}deg)">
        <div class="mm-face front ${showFront ? '' : 'hidden-face'}">${muscleMapSVG('front', sel)}<span class="mm-label">Vorne</span></div>
        <div class="mm-face back ${showFront ? 'hidden-face' : ''}">${muscleMapSVG('back', sel)}<span class="mm-label">Hinten</span></div>
      </div>
    </div>
  </section>`;
}

// Wischen zum Drehen. Ein echter Wisch unterdrückt den folgenden Klick, damit kein Muskel ausgewählt wird.
let mmDrag = null;
let mmSuppressClick = false;
function mmSetAngle(angle, animate) {
  const rot = document.getElementById('mmRot');
  if (!rot) return;
  rot.style.transition = animate ? 'transform .45s cubic-bezier(.2,.8,.2,1)' : 'none';
  rot.style.transform = `rotateY(${angle}deg)`;
  const front = Math.cos((angle * Math.PI) / 180) >= 0;
  rot.querySelector('.front').classList.toggle('hidden-face', !front);
  rot.querySelector('.back').classList.toggle('hidden-face', front);
  const btn = document.querySelector('[data-a="mmFlip"]');
  if (btn) btn.textContent = `↻ ${front ? 'Rückseite' : 'Vorderseite'}`;
}
document.addEventListener('pointerdown', (e) => {
  const stage = e.target.closest('#mmStage');
  if (!stage) return;
  mmDrag = { x: e.clientX, y: e.clientY, start: ui.mmAngle, moved: false, id: e.pointerId };
});
document.addEventListener('pointermove', (e) => {
  if (!mmDrag || e.pointerId !== mmDrag.id) return;
  const dx = e.clientX - mmDrag.x;
  if (!mmDrag.moved && Math.abs(dx) < 8) return;
  if (!mmDrag.moved && Math.abs(e.clientY - mmDrag.y) > Math.abs(dx)) { mmDrag = null; return; } // senkrecht: Seite scrollen
  mmDrag.moved = true;
  mmSetAngle(mmDrag.start + dx * 0.9, false);
});
const mmEnd = (e) => {
  if (!mmDrag || e.pointerId !== mmDrag.id) return;
  if (mmDrag.moved) {
    const raw = mmDrag.start + (e.clientX - mmDrag.x) * 0.9;
    ui.mmAngle = Math.round(raw / 180) * 180;
    mmSetAngle(ui.mmAngle, true);
    mmSuppressClick = true;
    setTimeout(() => { mmSuppressClick = false; }, 300);
  }
  mmDrag = null;
};
document.addEventListener('pointerup', mmEnd);
document.addEventListener('pointercancel', mmEnd);
document.addEventListener('click', (e) => {
  if (mmSuppressClick && e.target.closest('#mmStage')) { e.stopImmediatePropagation(); e.preventDefault(); mmSuppressClick = false; }
}, true);
