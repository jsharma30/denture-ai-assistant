import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../engine/index.js';

const { STATUS, VIEW, CASE_TYPE } = E;

test('RPD workflow needs exactly the five agreed photos', () => {
  const v = E.requiredViews(CASE_TYPE.RPD);
  assert.deepEqual(v.map((g) => g.title), [
    'Maxillary arch', 'Mandibular arch', 'Anterior view',
    'Edentulous / replacement-tooth region', 'Replacement-tooth region in occlusion',
  ]);
  for (const g of v) assert.equal(g.referenceNote, E.REFERENCE_NOTE);
});

test('photo checks are advisory unless the photo is unusable', () => {
  const ok = { width: 3000, height: 2000, meanLuma: 130, overexposedFraction: 0.01, sharpness: 200, subjectFill: 0.4, centreOffset: 0.05 };
  assert.equal(E.evaluateQuality(ok, VIEW.FRONTAL).verdict, 'GOOD');
  const glare = E.evaluateQuality({ ...ok, overexposedFraction: 0.12, meanLuma: 60, sharpness: 20, centreOffset: 0.4 }, VIEW.FRONTAL);
  assert.equal(glare.verdict, 'USABLE');
  assert.equal(glare.canContinue, true);
  assert.equal(glare.warnings.length, 4);
  assert.match(glare.warnings.join(' '), /glare/);
  for (const bad of [{ meanLuma: 5 }, { meanLuma: 252 }, { sharpness: 2 }, { width: 300, height: 200 }]) {
    const q = E.evaluateQuality({ ...ok, ...bad }, VIEW.FRONTAL);
    assert.equal(q.verdict, 'RETAKE', JSON.stringify(bad));
    assert.equal(q.canContinue, false);
  }
  // occlusal views tolerate a smaller fill
  assert.equal(E.evaluateQuality({ ...ok, subjectFill: 0.15 }, VIEW.OCCLUSAL_MANDIBULAR).verdict, 'GOOD');
  assert.equal(E.evaluateQuality({ ...ok, subjectFill: 0.15 }, VIEW.FRONTAL).verdict, 'USABLE');
});

test('measurePhoto separates sharp from blurred and dark from normal', () => {
  const w = 64, h = 64;
  const img = (f) => { const a = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) { const v = f(i % w, Math.floor(i / w)); a.set([v, v, v, 255], i * 4); } return a; };
  const sharp = E.measurePhoto(img((x, y) => ((x >> 2) + (y >> 2)) % 2 ? 230 : 40), w, h);
  const flat = E.measurePhoto(img(() => 130), w, h);
  const dark = E.measurePhoto(img(() => 8), w, h);
  assert.ok(sharp.sharpness > 1000);
  assert.ok(flat.sharpness < 1);
  assert.ok(dark.meanLuma < 10);
});

test('FDI helpers', () => {
  assert.equal(E.contralateral(14), 24);
  assert.equal(E.contralateral(43), 33);
  assert.deepEqual(E.neighbours(11).sort(), [12, 21]);
  assert.deepEqual(E.neighbours(15).sort(), [14, 16]);
  assert.equal(E.isValidFdi(19), false);
});

test('Kennedy classification', () => {
  assert.deepEqual(E.kennedy([16, 17, 26, 27]), { cls: 'I', modifications: 0, arch: 'maxillary' });
  assert.equal(E.kennedy([36, 37]).cls, 'II');
  assert.deepEqual(E.kennedy([14, 15]), { cls: 'III', modifications: 0, arch: 'maxillary' });
  assert.deepEqual(E.kennedy([11, 21, 12]), { cls: 'IV', modifications: 0, arch: 'maxillary' });
  assert.deepEqual(E.kennedy([11, 21, 15]), { cls: 'III', modifications: 1, arch: 'maxillary' });
  assert.deepEqual(E.kennedy([46, 47, 34]), { cls: 'II', modifications: 1, arch: 'mandibular' });
  assert.equal(E.kennedy([18, 28]), null, 'third molars alone do not make a class');
  assert.equal(E.kennedy([17, 18]).cls, 'II', 'missing 8 is ignored, 7 makes a free end');
  assert.throws(() => E.kennedy([14, 36]));
});

test('geometry: box from taps, gaps and arch fit', () => {
  const { box } = E.boxFromTaps([0, 100], [80, 100], [40, 0]);
  assert.equal(Math.round(box.w), 80); assert.equal(Math.round(box.h), 100);
  assert.equal(Math.round(box.cy), 50);
  const centred = E.boxFromTaps([0, 0], [80, 0], [40, 30], true).box;
  assert.equal(Math.round(centred.h), 60); assert.equal(Math.round(centred.cy), 0);
  const a = { cx: 0, cy: 0, w: 10, h: 10, angle_deg: 0 };
  assert.equal(E.boxGap(a, { ...a, cx: 12 }), 2);
  assert.equal(E.boxGap(a, { ...a, cx: 9 }), -1);
  // a tilted, shorter neighbour is NOT an overlap
  assert.ok(Math.abs(E.boxGap(a, { cx: 10, cy: 3, w: 10, h: 6, angle_deg: 8 })) < 0.3);
  const fit = E.fitQuadratic([[-2, 4], [-1, 1], [0, 0], [1, 1], [2, 4]]);
  assert.ok(Math.abs(fit.a - 1) < 1e-9 && Math.abs(fit.c) < 1e-9);
  assert.equal(E.fitQuadratic([[0, 0], [1, 1]]), null);
});

test('scale: ruler beats estimate, estimate is flagged', () => {
  const t = (fdi, w) => ({ label: 'TOOTH', box: { cx: 0, cy: 0, w, h: 50, angle_deg: 0 }, attributes: { fdi, kind: 'natural' } });
  const ruler = { label: 'CALIBRATION_MARKER', points: [[0, 0], [120, 0]], attributes: { length_mm: 10 } };
  assert.deepEqual(E.scaleOf({ items: [ruler, t(11, 85)] }), { pxPerMm: 12, estimated: false, source: 'ruler' });
  const est = E.scaleOf({ items: [t(11, 85)] });
  assert.equal(est.estimated, true); assert.equal(est.pxPerMm, 10);
  assert.equal(E.scaleOf({ items: [] }), null);
});

test('demo case is graded, labelled DEMO and matches its built-in errors', () => {
  const d = E.demoCase();
  const r = E.evaluateCase(d.case, d.views, E.SOURCE.DEMO_MOCK);
  assert.equal(r.source, 'DEMO_MOCK');
  const by = Object.fromEntries(r.parameters.map((p) => [p.id, p]));
  assert.equal(by.space_fit_14.status, STATUS.ACCEPTABLE);
  assert.ok(Math.abs(by.space_fit_14.value - 0.3) < 0.05);
  assert.equal(by.arch_alignment_15.status, STATUS.MINOR);
  assert.ok(Math.abs(by.arch_alignment_15.value - 1.4) < 0.15);
  assert.match(by.arch_alignment_15.explanation, /outside/);
  assert.equal(by.inclination_15.status, STATUS.MINOR);
  assert.equal(Math.round(by.inclination_15.value), 8);
  assert.ok(Math.abs(by.occlusal_plane_15.value - 0.8) < 0.05);
  assert.equal(by.occlusal_contact_15.status, STATUS.SIGNIFICANT);
  assert.equal(by.occlusal_contact_14.status, STATUS.ACCEPTABLE);
  assert.equal(by.ridge_relation_14.status, STATUS.INSUFFICIENT);
});

test('missing marks give INSUFFICIENT, never an invented value', () => {
  const r = E.evaluateCase({ caseType: CASE_TYPE.RPD, replacedTeeth: [11, 36] }, {});
  assert.ok(r.parameters.length > 0);
  for (const p of r.parameters) {
    assert.equal(p.status, STATUS.INSUFFICIENT, p.id);
    assert.equal(p.value, null);
  }
  assert.equal(r.score, null);
  assert.ok(r.parameters.some((p) => p.id === 'midline_symmetry_11'));
  assert.ok(!r.parameters.some((p) => p.id === 'ridge_relation_11'), 'ridge relation is for posterior teeth');
  assert.throws(() => E.evaluateCase({ caseType: 'RPD', replacedTeeth: [] }, {}, 'MADE_UP'));
});

test('complete denture rules', () => {
  const T = (fdi, cx, cy, ang = 0, w = 85) => ({ label: 'TOOTH', box: { cx, cy, w, h: 100, angle_deg: ang }, attributes: { fdi, kind: 'artificial' } });
  const line = (label, a, b) => ({ label, points: [a, b] });
  const ruler = { label: 'CALIBRATION_MARKER', points: [[0, 900], [100, 900]], attributes: { length_mm: 10 } };
  const frontal = { items: [ruler,
    line('DENTAL_MIDLINE', [505, 400], [505, 300]), line('REFERENCE_MIDLINE', [500, 100], [500, 300]),
    line('MANDIBULAR_DENTAL_MIDLINE', [530, 410], [530, 500]), line('OCCLUSAL_PLANE', [200, 400], [800, 400]),
    T(12, 400, 350, 3), T(22, 600, 350, -3)] };
  // Upper occlusal: parabola y = 150 + 0.0064 x², papilla 9 mm behind the incisors' labial edge.
  const arch = [[11, -42], [12, -115], [13, -185], [14, -250], [15, -310], [16, -390], [21, 42], [22, 115], [23, 185], [24, 250], [25, 310], [26, 390]]
    .map(([f, x]) => T(f, 500 + x, 150 + 0.0064 * x * x));
  const occl = { items: [ruler, line('ARCH_MIDLINE', [500, 100], [500, 700]),
    { label: 'INCISIVE_PAPILLA', points: [[500, 150 + 0.0064 * 42 * 42 - 50 + 90]] },
    { label: 'CANINE_TIP', points: [[315, 370]], attributes: { fdi: 13 } }, { label: 'CANINE_TIP', points: [[685, 370]], attributes: { fdi: 23 } },
    ...arch] };
  const r = E.evaluateCase({ caseType: CASE_TYPE.CD }, { FRONTAL: frontal, OCCLUSAL_MAXILLARY: occl });
  const by = Object.fromEntries(r.parameters.map((p) => [p.id, p]));
  assert.ok(Math.abs(by.cd_midline.value - 0.5) < 1e-6);
  assert.equal(by.cd_midline.status, STATUS.ACCEPTABLE);
  assert.ok(Math.abs(by.cd_upper_lower_midline.value - 2.5) < 1e-6);
  assert.equal(by.cd_upper_lower_midline.status, STATUS.SIGNIFICANT);
  assert.equal(by.cd_occlusal_plane_cant.value, 0);
  assert.equal(by.cd_inclination_symmetry.value, 0);
  assert.equal(by.cd_canine_symmetry_upper.value, 0);
  assert.ok(by.cd_arch_form_upper.value < 0.3, String(by.cd_arch_form_upper.value));
  assert.equal(by.cd_papilla_incisor.status, STATUS.ACCEPTABLE);
  assert.equal(by.cd_canine_symmetry_lower.status, STATUS.INSUFFICIENT);
});

test('annotation steps: RPD close-up asks for replaced teeth and natural neighbours', () => {
  const steps = E.annotationSteps(VIEW.RPD_REPLACEMENT_CLOSEUP, { caseType: CASE_TYPE.RPD, replacedTeeth: [14, 15] });
  const fdis = steps.filter((s) => s.label === 'TOOTH').map((s) => s.attributes.fdi);
  assert.deepEqual(fdis, [17, 16, 15, 14, 13, 12]);
  assert.equal(E.annotationSteps(VIEW.OCCLUSAL_MANDIBULAR, { caseType: CASE_TYPE.RPD, replacedTeeth: [14] }).length, 0);
  const occ = E.annotationSteps(VIEW.OPPOSING_OCCLUSION, { caseType: CASE_TYPE.RPD, replacedTeeth: [14, 15] });
  assert.ok(occ.every((s) => s.allowNoContact));
  for (const v of E.requiredViews(CASE_TYPE.CD)) assert.ok(E.annotationSteps(v.view, { caseType: CASE_TYPE.CD }).length > 3);
});

test('every graded parameter has teaching content', () => {
  const d = E.demoCase();
  const ids = new Set([
    ...E.evaluateCase(d.case, d.views).parameters.map((p) => p.learnId),
    ...E.evaluateCase({ caseType: 'RPD', replacedTeeth: [11] }, {}).parameters.map((p) => p.learnId),
    ...E.evaluateCase({ caseType: 'CD' }, {}).parameters.map((p) => p.learnId)]);
  for (const id of ids) assert.ok(E.LEARNING[id], id);
  assert.equal(E.CLINICAL_EXAM_ITEMS.length, 10);
});
