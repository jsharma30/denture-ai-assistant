// Browser app. Photos never leave the device unless the student sends them to a
// configured model server, and the original photo file is never modified:
// it is shown as-is and every mark is drawn on a separate overlay layer.

import * as E from './engine/index.js';

const { VIEW, CASE_TYPE, SOURCE, STATUS } = E;
const app = document.getElementById('app');
document.getElementById('disclaimer').textContent = '⚠️ ' + E.DISCLAIMER + ' This app does not make clinical diagnoses.';

// ------------------------------------------------------------------ state
const state = {
  case: null,          // { caseType, replacedTeeth, arch, kennedy }
  photos: {},          // view -> { file, url, sha256, width, height, quality }
  ann: {},             // view -> { view, items, notVisible, noContact }
  report: null,
  reportViews: null,
  reportPhotos: null,
};

const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode: progress just isn't kept */ } },
};

// ---------------------------------------------------------------- helpers
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = app) => root.querySelector(sel);
const $$ = (sel, root = app) => [...root.querySelectorAll(sel)];
function render(html) { app.innerHTML = html; window.scrollTo(0, 0); }
const sourceBadge = (s) => `<span class="src src-${s}">${esc(E.SOURCE_LABEL[s])}</span>`;
const statusChip = (s) => `<span class="chip s-${s}">${esc(E.STATUS_LABEL[s])}</span>`;

export async function sha256Hex(file) {
  const buf = await file.arrayBuffer();
  const d = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Photo statistics from a temporary, downscaled analysis copy. The original file is untouched. */
async function photoStats(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 512 / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h);
  const stats = E.measurePhoto(ctx.getImageData(0, 0, w, h).data, w, h, bmp.width, bmp.height);
  bmp.close?.();
  return stats;
}

// --------------------------------------------------------------- drawing
const COLORS = {
  TOOTH: '#2f80ed', ARCH_MIDLINE: '#27ae60', DENTAL_MIDLINE: '#eb5757', MANDIBULAR_DENTAL_MIDLINE: '#9b51e0',
  REFERENCE_MIDLINE: '#00b8c4', OCCLUSAL_PLANE: '#d4a100', CALIBRATION_MARKER: '#111111', INCISIVE_PAPILLA: '#ff7aa8',
  CANINE_TIP: '#56ccf2', EDENTULOUS_RIDGE: '#a0522d', OCCLUSAL_CONTACT: '#bb6bd9', TAP: '#ff3b30',
};

function drawItems(ctx, items, k, highlight = null) {
  ctx.lineWidth = Math.max(2, 2.5 * (window.devicePixelRatio || 1));
  ctx.font = `${Math.round(13 * (window.devicePixelRatio || 1))}px -apple-system, Arial, sans-serif`;
  for (const it of items) {
    const col = COLORS[it.label] || '#2f80ed';
    const hi = highlight && it.attributes?.fdi === highlight;
    ctx.strokeStyle = hi ? '#ff3b30' : col;
    ctx.fillStyle = hi ? '#ff3b30' : col;
    ctx.lineWidth = (hi ? 2 : 1) * Math.max(2, 2.5 * (window.devicePixelRatio || 1));
    if (it.box) {
      const c = E.boxCorners(it.box).map(([x, y]) => [x * k, y * k]);
      ctx.beginPath(); c.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.stroke();
      if (it.attributes?.fdi) {
        const label = `${it.attributes.fdi}${it.attributes.kind === 'artificial' ? '*' : ''}`;
        const x = it.box.cx * k, y = it.box.cy * k;
        const tw = ctx.measureText(label).width + 8;
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(x - tw / 2, y - 10 * (window.devicePixelRatio || 1), tw, 18 * (window.devicePixelRatio || 1));
        ctx.fillStyle = hi ? '#ff3b30' : col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, x, y);
      }
    } else if (it.points?.length === 1) {
      const [x, y] = it.points[0];
      ctx.beginPath(); ctx.arc(x * k, y * k, 6 * (window.devicePixelRatio || 1), 0, Math.PI * 2); ctx.fill();
    } else if (it.points) {
      ctx.beginPath(); it.points.forEach(([x, y], i) => (i ? ctx.lineTo(x * k, y * k) : ctx.moveTo(x * k, y * k))); ctx.stroke();
      for (const [x, y] of it.points) { ctx.beginPath(); ctx.arc(x * k, y * k, 4 * (window.devicePixelRatio || 1), 0, Math.PI * 2); ctx.fill(); }
    }
  }
}

/** Size an overlay canvas to the displayed photo and return natural→canvas scale. */
function fitCanvas(img, canvas) {
  const dpr = window.devicePixelRatio || 1;
  const r = img.getBoundingClientRect();
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  return canvas.width / img.naturalWidth;
}

/** Photo with an overlay layer. The <img> shows the untouched original file. */
function photoStage(url, id) {
  return `<div class="stage" id="${id}"><img src="${url}" alt="Your original photo" draggable="false"><canvas></canvas></div>`;
}

function showOriginal(photo) {
  const v = document.createElement('div');
  v.className = 'viewer';
  v.innerHTML = `<div class="bar"><span>Original photo — unchanged · ${photo.width}×${photo.height}px · SHA-256 ${photo.sha256.slice(0, 12)}…</span>
    <span class="row"><button id="zoom">100%</button><button id="close">Close</button></span></div>
    <div class="scroll"><img src="${photo.url}" alt="Original photo"></div>`;
  document.body.appendChild(v);
  const img = v.querySelector('img');
  v.querySelector('#zoom').onclick = (e) => { img.classList.toggle('full'); e.target.textContent = img.classList.contains('full') ? 'Fit' : '100%'; };
  v.querySelector('#close').onclick = () => v.remove();
}

/** Simple line drawing used when no reference photo is available for a view. */
function exampleSvg(view) {
  const tooth = (x, y, w, h, r = 0) => `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="6" transform="rotate(${r} ${x} ${y})" fill="#fff" stroke="#8a94a6"/>`;
  let body = '';
  if (view === VIEW.OCCLUSAL_MAXILLARY || view === VIEW.OCCLUSAL_MANDIBULAR) {
    const up = view === VIEW.OCCLUSAL_MAXILLARY;
    for (let i = -7; i <= 7; i++) {
      if (!i) continue;
      const x = 200 + Math.sign(i) * (Math.abs(i) - 0.5) * 22;
      const dx = x - 200;
      const y = up ? 50 + 0.0045 * dx * dx * 1.6 : 250 - 0.0045 * dx * dx * 1.6;
      const r = Math.atan(0.009 * 1.6 * dx) * 57.3 * (up ? 1 : -1);
      body += tooth(x, y, 20, Math.abs(i) > 3 ? 26 : 16, r);
    }
    body += `<line x1="200" y1="${up ? 30 : 270}" x2="200" y2="${up ? 260 : 40}" stroke="#27ae60" stroke-dasharray="6 5"/>`;
  } else if (view === VIEW.FRONTAL) {
    [[-3, 34], [-2, 28], [-1, 38], [1, 38], [2, 28], [3, 34]].forEach(([i, w]) => {
      const x = 200 + Math.sign(i) * (Math.abs(i) - 0.5) * 36;
      body += tooth(x, 120, w, 70) + tooth(x, 192, w * 0.7, 56);
    });
    body += `<line x1="200" y1="60" x2="200" y2="240" stroke="#eb5757" stroke-dasharray="6 5"/><line x1="70" y1="156" x2="330" y2="156" stroke="#d4a100" stroke-dasharray="6 5"/>`;
  } else {
    const occ = view === VIEW.OPPOSING_OCCLUSION;
    [90, 150, 210, 270, 330].forEach((x, i) => {
      body += `<g opacity="${i === 1 || i === 2 ? 1 : 0.7}">${tooth(x, 110, 56, 80)}</g>`;
      if (occ) body += tooth(x + 10, 196, 56, 80);
    });
    body += `<rect x="120" y="60" width="120" height="20" fill="#f4b6c2" opacity="0.6"/><text x="180" y="${occ ? 260 : 200}" text-anchor="middle" font-size="13" fill="#5d6677">replacement teeth${occ ? ' in occlusion' : ''}</text>`;
  }
  return `<svg viewBox="0 0 400 280" role="img" aria-label="Example drawing"><rect width="400" height="280" fill="#f2efe9"/>${body}</svg>`;
}

// Real reference photos live in web/reference/<VIEW>.jpg and are listed in
// reference/available.json; any view without one shows a simple drawing instead.
let availableRefs = [];
fetch('reference/available.json').then((r) => (r.ok ? r.json() : [])).then((a) => { availableRefs = a; }).catch(() => {});

function referenceBlock(view) {
  const pic = availableRefs.includes(view)
    ? `<img src="reference/${view}.jpg" alt="Reference example of the ${esc(view)} photo">`
    : exampleSvg(view);
  return `<div class="ref">${pic}<p class="muted">${esc(E.REFERENCE_NOTE)}</p></div>`;
}

// ------------------------------------------------------------------ screens
const screens = {};

screens.home = () => {
  const hist = store.get('progress', []);
  render(`
    <h1>Check your denture tooth arrangement</h1>
    <p class="muted">For BDS students: photograph a complete denture (CD) or acrylic removable partial denture (RPD), mark a few landmarks, and get feedback on the arrangement against prosthodontic principles.</p>
    <div class="notice">${esc(E.DISCLAIMER)}</div>
    <div class="grid">
      <div class="card"><h2>Acrylic RPD</h2><p>5 photos. Feedback for every replacement tooth: space fit, arch alignment, inclination, occlusal plane, contact and more.</p>
        <button class="primary" data-start="RPD">Start an RPD case</button></div>
      <div class="card"><h2>Complete denture</h2><p>3 photos. Midlines, occlusal plane, symmetry, arch form and incisor position.</p>
        <button class="primary" data-start="CD">Start a CD case</button></div>
      <div class="card"><h2>See an example report</h2><p>A <b>demo</b> report built from made-up data, so you can see what the feedback looks like.</p>
        <button data-go="demo">Open demo report</button></div>
    </div>
    ${hist.length ? `<p class="muted">You have ${hist.length} saved attempt${hist.length > 1 ? 's' : ''}. <button class="link" data-go="progress">See progress</button></p>` : ''}
  `);
  $$('[data-start]').forEach((b) => (b.onclick = () => {
    for (const p of Object.values(state.photos)) URL.revokeObjectURL(p.url);
    state.case = { caseType: b.dataset.start, replacedTeeth: [] };
    state.photos = {}; state.ann = {}; state.report = null;
    go(b.dataset.start === 'RPD' ? 'setup' : 'checklist');
  }));
};

screens.setup = () => {
  const c = state.case;
  const row = (teeth) => teeth.map((t) => t === '|' ? '<span class="gap"></span>' : `<button data-t="${t}" class="${c.replacedTeeth.includes(t) ? 'on' : ''}" aria-pressed="${c.replacedTeeth.includes(t)}">${t}</button>`).join('');
  const upper = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
  const lower = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
  let k = null, kerr = '';
  try { k = c.replacedTeeth.length ? E.kennedy(c.replacedTeeth) : null; } catch (e) { kerr = e.message; }
  c.kennedy = k;
  render(`
    <h1>Which teeth does the RPD replace?</h1>
    <p class="muted">Tap each replacement (artificial) tooth. Choose teeth from one arch; for an RPD in each arch, do one case per arch.</p>
    <div class="card">
      <h3>Upper (maxillary) — patient's right ← → left</h3><div class="teeth">${row(upper)}</div>
      <h3>Lower (mandibular)</h3><div class="teeth">${row(lower)}</div>
      ${k ? `<p><b>Kennedy Class ${esc(k.cls)}${k.modifications ? `, modification ${k.modifications}` : ''}</b> (${esc(k.arch)})</p><p class="muted">${esc(E.KENNEDY_EXPLANATION[k.cls])}</p>` : ''}
      ${kerr ? `<div class="notice bad">${esc(kerr)}</div>` : ''}
    </div>
    <div class="row"><button data-go="home">Back</button><button class="primary" id="next" ${k && k.cls !== 'Edentulous' ? '' : 'disabled'}>Next: photos</button></div>
  `);
  $$('[data-t]').forEach((b) => (b.onclick = () => {
    const t = Number(b.dataset.t);
    if (c.replacedTeeth.length && E.isUpper(c.replacedTeeth[0]) !== E.isUpper(t)) c.replacedTeeth = [];
    c.replacedTeeth = c.replacedTeeth.includes(t) ? c.replacedTeeth.filter((x) => x !== t) : [...c.replacedTeeth, t].sort((a, b) => a - b);
    screens.setup();
  }));
  $('#next').onclick = () => { c.arch = k.arch; go('checklist'); };
};

screens.checklist = () => {
  const c = state.case;
  const views = E.requiredViews(c.caseType);
  const done = views.filter((v) => state.photos[v.view]).length;
  const marked = views.filter((v) => state.ann[v.view]).length;
  const items = views.map((v, i) => {
    const p = state.photos[v.view];
    const a = state.ann[v.view];
    const steps = E.annotationSteps(v.view, c);
    return `<li class="view-item"><div><b>${i + 1}. ${esc(v.title)}</b><br><span class="muted">${esc(v.purpose)}</span><br>
      ${p ? `<span class="chip v-${p.quality.verdict}">${esc(p.quality.headline)}</span>` : '<span class="muted">No photo yet</span>'}
      ${p && !steps.length ? '<span class="muted"> · no marks needed</span>' : a ? ' <span class="chip s-ACCEPTABLE">Marked</span>' : ''}</div>
      <div class="row"><button data-cap="${v.view}">${p ? 'Change photo' : 'Add photo'}</button>
      ${p && steps.length ? `<button data-ann="${v.view}" class="${a ? '' : 'primary'}">${a ? 'Re-mark' : 'Mark landmarks'}</button>` : ''}</div></li>`;
  }).join('');
  const needMarks = views.filter((v) => E.annotationSteps(v.view, c).length);
  const ready = done === views.length;
  render(`
    <h1>${c.caseType === 'RPD' ? `Acrylic RPD — replacing ${c.replacedTeeth.join(', ')}` : 'Complete denture'}</h1>
    ${c.kennedy ? `<p class="muted">Kennedy Class ${esc(c.kennedy.cls)}${c.kennedy.modifications ? ` mod ${c.kennedy.modifications}` : ''}</p>` : ''}
    <div class="progress-bar"><div style="width:${(done / views.length) * 100}%"></div></div>
    <p>${done} of ${views.length} photos · ${marked} of ${needMarks.length} marked</p>
    <div class="card"><ul class="plain">${items}</ul></div>
    <div class="card">
      <h3>Get feedback</h3>
      <p class="muted">Use your own landmarks (works now), or send photos to a trained model if your department has set one up.</p>
      <div class="row">
        <button class="primary" id="analyse" ${ready && marked ? '' : 'disabled'}>Analyse my landmarks</button>
        <button id="model" ${ready ? '' : 'disabled'}>Try AI model</button>
      </div>
      ${!ready ? '<p class="muted">Add all photos first. You can analyse with only some photos marked — anything not marked is shown as "Cannot assess".</p>' : ''}
      <div id="msg"></div>
    </div>
    <button data-go="home">Home</button>
  `);
  $$('[data-cap]').forEach((b) => (b.onclick = () => go('capture', b.dataset.cap)));
  $$('[data-ann]').forEach((b) => (b.onclick = () => go('annotate', b.dataset.ann)));
  $('#analyse').onclick = () => analyse(SOURCE.STUDENT_ANNOTATED, state.ann);
  $('#model').onclick = runModel;
};

screens.capture = async (view) => {
  const c = state.case;
  const g = E.guide(view, c.caseType);
  const existing = state.photos[view];
  render(`
    <h1>${esc(g.title)}</h1>
    <p class="muted">${esc(g.purpose)}</p>
    <div class="two-col">
      <div class="card"><h3>How to take it</h3><ul>${g.instructions.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>${referenceBlock(view)}</div>
      <div class="card">
        <h3>Your photo</h3>
        <label class="btn primary" style="display:inline-block">📷 Take or choose photo<input id="file" type="file" accept="image/*" hidden></label>
        <div id="result" style="margin-top:12px"></div>
      </div>
    </div>
    <button data-go="checklist">Back to checklist</button>
  `);
  const show = (p) => {
    const q = p.quality;
    $('#result').innerHTML = `
      ${photoStage(p.url, 'cap-stage')}
      <p><span class="chip v-${q.verdict}">${esc(q.headline)}</span></p>
      ${q.blockers.map((m) => `<div class="notice bad">${esc(m)}</div>`).join('')}
      ${q.warnings.map((m) => `<div class="notice warn">${esc(m)}</div>`).join('')}
      <p class="muted">Your original photo is kept exactly as taken (${p.width}×${p.height}px). Nothing is cropped, filtered or changed.</p>
      <div class="row"><button id="orig">View original</button>
      <button class="primary" id="use" ${q.canContinue ? '' : 'disabled'}>${q.canContinue ? 'Use this photo' : 'Retake needed'}</button></div>`;
    $('#orig').onclick = () => showOriginal(p);
    $('#use').onclick = () => {
      if (state.photos[view] && state.photos[view] !== p) URL.revokeObjectURL(state.photos[view].url);
      state.photos[view] = p;
      delete state.ann[view];
      go(E.annotationSteps(view, c).length ? 'annotate' : 'checklist', view);
    };
  };
  if (existing) show(existing);
  $('#file').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    $('#result').innerHTML = '<p class="muted">Checking photo…</p>';
    try {
      const [stats, sha] = await Promise.all([photoStats(file), sha256Hex(file)]);
      const quality = E.evaluateQuality(stats, view);
      show({ file, url: URL.createObjectURL(file), sha256: sha, width: stats.width, height: stats.height, quality, view });
    } catch (err) {
      $('#result').innerHTML = `<div class="notice bad">This file could not be opened as a photo (${esc(err.message)}). Please choose a JPEG or PNG photo.</div>`;
    }
  };
};

screens.annotate = (view) => {
  const c = state.case;
  const p = state.photos[view];
  const steps = E.annotationSteps(view, c);
  const g = E.guide(view, c.caseType);
  const ann = { view, items: [], notVisible: [], noContact: [] };
  let i = 0, taps = [];
  render(`
    <h1>Mark: ${esc(g.title)}</h1>
    <div class="progress-bar"><div id="bar"></div></div>
    <p class="prompt" id="prompt"></p>
    <p class="muted" id="sub"></p>
    <div class="row" style="margin:8px 0">
      <button id="undo">Undo tap</button>
      <button id="skip">Not visible</button>
      <button id="nocontact" hidden>No contact</button>
      <button id="done" class="primary" hidden>Done</button>
      <button id="orig">View original</button>
    </div>
    ${photoStage(p.url, 'ann-stage')}
    <p class="muted">Pinch to zoom if you need to. Marks are drawn on a separate layer — your photo is not changed.</p>
    <button data-go="checklist">Cancel</button>
  `);
  const stage = $('#ann-stage'); stage.classList.add('tappable');
  const img = $('img', stage), canvas = $('canvas', stage);
  const need = (s) => ({ box3: 3, boxCentred: 3, line2: 2, point: 1, polyline: Infinity }[s.shape]);
  const redraw = () => {
    if (!img.naturalWidth) return;
    const k = fitCanvas(img, canvas);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawItems(ctx, ann.items, k);
    if (taps.length) drawItems(ctx, [{ label: 'TAP', points: taps }], k);
  };
  const finish = () => { state.ann[view] = ann; go('checklist'); };
  const update = () => {
    if (i >= steps.length) return finish();
    const s = steps[i];
    $('#bar').style.width = `${(i / steps.length) * 100}%`;
    $('#prompt').textContent = `Step ${i + 1} of ${steps.length}: ${s.prompt}`;
    $('#sub').textContent = s.shape === 'polyline' ? `${taps.length} point(s) so far.` : `${taps.length} of ${need(s)} taps.`;
    $('#done').hidden = !(s.shape === 'polyline' && taps.length >= 2);
    $('#nocontact').hidden = !s.allowNoContact;
    $('#undo').disabled = !taps.length;
    redraw();
  };
  const complete = () => {
    const s = steps[i];
    const item = { label: s.label, attributes: s.attributes ? { ...s.attributes } : undefined };
    if (s.shape === 'box3' || s.shape === 'boxCentred') {
      item.shape = 'rotated_box';
      item.box = E.boxFromTaps(taps[0], taps[1], taps[2], s.shape === 'boxCentred').box;
    } else {
      item.shape = s.shape === 'point' ? 'point' : 'polyline';
      item.points = taps.slice();
    }
    ann.items.push(item);
    taps = []; i++; update();
  };
  canvas.addEventListener('click', (e) => {
    const r = img.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * img.naturalWidth;
    const y = ((e.clientY - r.top) / r.height) * img.naturalHeight;
    taps.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
    if (taps.length >= need(steps[i])) complete(); else update();
  });
  $('#undo').onclick = () => { taps.pop(); update(); };
  $('#skip').onclick = () => { ann.notVisible.push(steps[i].id); taps = []; i++; update(); };
  $('#nocontact').onclick = () => { ann.noContact.push(steps[i].attributes.fdi); taps = []; i++; update(); };
  $('#done').onclick = complete;
  $('#orig').onclick = () => showOriginal(p);
  if (img.complete) update(); else img.onload = update;
  window.onresize = redraw;
};

async function analyse(source, views) {
  // Integrity check: the photos analysed are byte-identical to the ones taken.
  for (const p of Object.values(state.photos)) {
    if ((await sha256Hex(p.file)) !== p.sha256) {
      $('#msg').innerHTML = '<div class="notice bad">A photo changed after it was taken. Please add it again.</div>';
      return;
    }
  }
  state.report = E.evaluateCase(state.case, views, source);
  state.reportViews = views;
  state.reportPhotos = state.photos;
  saveProgress(state.report);
  go('results');
}

async function runModel() {
  const msg = $('#msg');
  const url = store.get('settings', {}).serverUrl;
  if (!url) {
    msg.innerHTML = '<div class="notice warn">No trained AI model is connected yet, so there is no AI result to show. Use “Analyse my landmarks”, or open the demo report. (A model server can be added in Settings once one has been trained.)</div>';
    return;
  }
  msg.innerHTML = '<p class="muted">Sending photos to the model server…</p>';
  try {
    const views = {};
    for (const [view, p] of Object.entries(state.photos)) {
      const fd = new FormData();
      fd.append('photo', p.file, p.file.name || `${view}.jpg`);
      fd.append('view', view);
      fd.append('case', JSON.stringify(state.case));
      const res = await fetch(`${url.replace(/\/$/, '')}/v1/analyze`, { method: 'POST', body: fd });
      const body = await res.json().catch(() => ({}));
      if (res.status === 503 || body.model_loaded === false) throw new Error(body.detail || 'The server is running but no trained model is installed.');
      if (!res.ok) throw new Error(body.detail || `Server error ${res.status}`);
      if (body.source !== SOURCE.REAL_MODEL) throw new Error('The server did not return a real model result.');
      views[view] = { view, items: body.items || [], notVisible: [], noContact: body.no_contact || [] };
    }
    await analyse(SOURCE.REAL_MODEL, views);
  } catch (e) {
    msg.innerHTML = `<div class="notice bad">AI model not available: ${esc(e.message)} No result was produced. You can still analyse your own landmarks.</div>`;
  }
}

function saveProgress(r) {
  if (r.source === SOURCE.DEMO_MOCK) return;
  const hist = store.get('progress', []);
  hist.push({
    date: new Date().toISOString().slice(0, 10), caseType: r.caseType, replacedTeeth: r.replacedTeeth,
    kennedy: state.case.kennedy ? state.case.kennedy.cls : null, source: r.source, counts: r.counts, score: r.score,
    weak: r.parameters.filter((p) => p.status === STATUS.SIGNIFICANT || p.status === STATUS.MINOR).map((p) => p.learnId),
  });
  store.set('progress', hist.slice(-200));
}

/** Synthetic drawing for the demo, sized to fit its own marks (origin kept at 0,0). */
function demoStage(items) {
  const pts = items.flatMap((it) => (it.box ? E.boxCorners(it.box) : it.points || []));
  const w = Math.ceil(Math.max(400, ...pts.map((p) => p[0])) + 60);
  const h = Math.ceil(Math.max(300, ...pts.map((p) => p[1])) + 60);
  state.demoSize = { w, h };
  return `<div class="stage"><svg viewBox="0 0 ${w} ${h}" width="${w}" style="max-width:100%;height:auto;background:#f2efe9;border-radius:8px">
    <text x="20" y="40" font-size="26" fill="#6b3fa0">Synthetic demo drawing — not a photo</text></svg><canvas></canvas></div>`;
}

screens.results = () => {
  const r = state.report;
  const isDemo = r.source === SOURCE.DEMO_MOCK;
  const groups = new Map();
  for (const p of r.parameters) {
    const key = p.tooth ? `Tooth ${E.toothName(p.tooth)}` : 'Whole denture';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const viewTitle = (v) => E.guide(v, r.caseType).title;
  const card = (p) => {
    const L = E.LEARNING[p.learnId] || {};
    return `<div class="card param s-${p.status}">
      <div class="row" style="justify-content:space-between"><b>${esc(p.title.replace(/ — .*/, ''))}</b>${statusChip(p.status)}</div>
      <div class="value">${esc(p.display)}</div>
      <p>${esc(p.explanation)}</p>
      ${p.tolerance ? `<p class="muted">${esc(p.tolerance)}${p.scaleEstimated ? ' · size estimated from typical tooth widths (no ruler), so treat mm values as approximate' : ''}</p>` : ''}
      <details><summary>Why it matters & how to improve</summary><p>${esc(L.why)}</p><p><b>Tip:</b> ${esc(L.fix)}</p></details>
      ${p.view ? `<button class="link" data-show="${p.view}" data-tooth="${p.tooth || ''}">Show on ${isDemo ? 'demo drawing' : 'photo'} (${esc(viewTitle(p.view))})</button>` : ''}
    </div>`;
  };
  render(`
    <h1>Feedback report</h1>
    <p>${sourceBadge(r.source)}</p>
    ${isDemo ? '<div class="notice demo"><b>This is a DEMO report built from made-up data.</b> It is not an analysis of any photo. Use it to see what the feedback looks like.</div>' : ''}
    ${r.source === SOURCE.STUDENT_ANNOTATED ? '<div class="notice">These results are calculated from the landmarks <b>you</b> marked. If a mark is off, the result will be off too.</div>' : ''}
    <div class="notice">${esc(E.DISCLAIMER)}</div>
    <div class="card"><div class="stats">
      ${Object.entries(r.counts).map(([s, n]) => `<span class="chip s-${s}">${n} ${esc(E.STATUS_LABEL[s])}</span>`).join('')}
    </div>${r.score !== null ? `<p>Overall: <b>${r.score}%</b> of assessable checks acceptable (minor counts as half).</p>` : '<p>Nothing could be assessed yet — mark more landmarks.</p>'}</div>
    <div id="viewer"></div>
    ${[...groups].map(([k, ps]) => `<h2>${esc(k)}</h2>${ps.map(card).join('')}`).join('')}
    <div class="card"><h2>Check clinically with your instructor</h2><p class="muted">A photo cannot show these. Tick them off during the clinical check.</p>
      <ul class="plain">${E.CLINICAL_EXAM_ITEMS.map((t, i) => `<li><label><input type="checkbox" id="cx${i}"> ${esc(t)}</label></li>`).join('')}</ul></div>
    <div class="row">${isDemo ? '' : '<button data-go="checklist">Back to case</button>'}<button data-go="home">Home</button></div>
  `);
  $$('[data-show]').forEach((b) => (b.onclick = () => showOnPhoto(b.dataset.show, Number(b.dataset.tooth) || null)));
};

function showOnPhoto(view, toothId) {
  const r = state.report;
  const items = state.reportViews[view]?.items || [];
  const holder = $('#viewer');
  const isDemo = r.source === SOURCE.DEMO_MOCK;
  const photo = state.reportPhotos?.[view];
  holder.innerHTML = `<div class="card"><h3>${esc(E.guide(view, r.caseType).title)}${toothId ? ` — tooth ${toothId} highlighted` : ''}</h3>
    ${isDemo || !photo ? demoStage(items) : photoStage(photo.url, 'res-stage')}
    <div class="row">${photo && !isDemo ? '<button id="res-orig">View original</button>' : ''}<button id="res-close">Close</button></div></div>`;
  const stage = $('.stage', holder);
  const base = $('img, svg', stage), canvas = $('canvas', stage);
  const draw = () => {
    const dpr = window.devicePixelRatio || 1;
    const rect = base.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
    const naturalW = base.naturalWidth || state.demoSize.w;
    drawItems(canvas.getContext('2d'), items, canvas.width / naturalW, toothId);
  };
  if (base.tagName === 'IMG' && !base.complete) base.onload = draw; else draw();
  $('#res-close', holder).onclick = () => (holder.innerHTML = '');
  const o = $('#res-orig', holder); if (o) o.onclick = () => showOriginal(photo);
  holder.scrollIntoView({ behavior: 'smooth' });
}

screens.demo = () => {
  const d = E.demoCase();
  state.report = E.evaluateCase(d.case, d.views, SOURCE.DEMO_MOCK);
  state.reportViews = d.views;
  state.reportPhotos = null;
  screens.results();
};

screens.learn = () => {
  render(`<h1>Learn</h1>
    <p class="muted">What each check means, why it matters and how to improve it.</p>
    ${Object.values(E.LEARNING).map((L) => `<div class="card"><h3>${esc(L.title)}</h3><p>${esc(L.why)}</p><p><b>Tip:</b> ${esc(L.fix)}</p></div>`).join('')}
    <div class="card"><h3>Kennedy classification</h3>${Object.entries(E.KENNEDY_EXPLANATION).map(([k, t]) => `<p>${esc(t)}</p>`).join('')}</div>
    <div class="card"><h3>Grades</h3><p>${statusChip('ACCEPTABLE')} within the tolerance. ${statusChip('MINOR')} slightly outside — worth correcting. ${statusChip('SIGNIFICANT')} clearly outside — correct before the try-in. ${statusChip('INSUFFICIENT')} not enough marks or a landmark was not visible — never guessed.</p></div>
    <button data-go="home">Home</button>`);
};

screens.progress = () => {
  const hist = store.get('progress', []);
  const weak = {};
  for (const h of hist) for (const w of h.weak || []) weak[w] = (weak[w] || 0) + 1;
  const top = Object.entries(weak).sort((a, b) => b[1] - a[1]).slice(0, 3);
  render(`<h1>Your progress</h1>
    <p class="muted">Saved on this device only. Photos are not saved — only the scores.</p>
    ${hist.length ? `
      ${top.length ? `<div class="card"><h3>Areas to practise</h3><ul>${top.map(([k, n]) => `<li>${esc(E.LEARNING[k]?.title || k)} — flagged ${n} time${n > 1 ? 's' : ''}</li>`).join('')}</ul></div>` : ''}
      <div class="card"><table><thead><tr><th>Date</th><th>Case</th><th>Source</th><th>Score</th><th>Acc / Minor / Sig / N/A</th></tr></thead><tbody>
      ${hist.slice().reverse().map((h) => `<tr><td>${esc(h.date)}</td><td>${esc(h.caseType)} ${esc((h.replacedTeeth || []).join(','))}${h.kennedy ? ` (K${esc(h.kennedy)})` : ''}</td>
        <td>${esc(E.SOURCE_LABEL[h.source] || h.source)}</td><td>${h.score ?? '—'}${h.score !== null ? '%' : ''}</td>
        <td>${h.counts.ACCEPTABLE} / ${h.counts.MINOR} / ${h.counts.SIGNIFICANT} / ${h.counts.INSUFFICIENT}</td></tr>`).join('')}
      </tbody></table></div>
      <button id="clear">Clear progress</button>` : '<p>No attempts yet.</p>'}
    <button data-go="home">Home</button>`);
  const c = $('#clear'); if (c) c.onclick = () => { if (confirm('Delete all saved progress on this device?')) { store.set('progress', []); screens.progress(); } };
};

screens.settings = () => {
  const s = store.get('settings', {});
  render(`<h1>Settings</h1>
    <div class="card"><h3>AI model server (optional)</h3>
      <p class="muted">Only needed once a model has been trained. Leave empty to use your own landmarks. Photos are sent to this address only when you press “Try AI model”.</p>
      <input type="url" id="url" placeholder="https://your-department-server.example" value="${esc(s.serverUrl || '')}">
      <div class="row" style="margin-top:8px"><button class="primary" id="save">Save</button><span id="saved" class="muted"></span></div></div>
    <div class="card"><h3>About</h3><p>${esc(E.DISCLAIMER)}</p>
      <p class="muted">Results are always labelled: ${sourceBadge('REAL_MODEL')} ${sourceBadge('DEMO_MOCK')} ${sourceBadge('STUDENT_ANNOTATED')}</p></div>
    <button data-go="home">Home</button>`);
  $('#save').onclick = () => { store.set('settings', { ...s, serverUrl: $('#url').value.trim() }); $('#saved').textContent = 'Saved.'; };
};

// ------------------------------------------------------------------ routing
function go(name, arg) {
  window.onresize = null;
  if (['setup', 'checklist', 'capture', 'annotate'].includes(name) && !state.case) name = 'home';
  if (name === 'results' && !state.report) name = 'home';
  screens[name](arg);
}
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-go]');
  if (t) go(t.dataset.go);
});
document.getElementById('nav-home').onclick = () => go('home');
window.__app = { state, go }; // used by automated tests
go('home');
