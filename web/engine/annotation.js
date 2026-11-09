// What the student marks on each photo, and helpers to read those marks back.
//
// A view's annotation: { view, items: [{ label, shape, box?, points?, attributes? }],
//                        notVisible: [stepId], noContact: [fdi] }
// All coordinates are in ORIGINAL-photo pixels.

import { CASE_TYPE, VIEW } from './capture.js';
import { archOrder, contralateral, isAnterior, isUpper, position, toothName } from './fdi.js';

/** Typical mesiodistal crown widths (mm) — used only to ESTIMATE scale when no ruler is present. */
export const TYPICAL_WIDTH_MM = {
  upper: { 1: 8.5, 2: 6.5, 3: 7.5, 4: 7.0, 5: 6.5, 6: 10.0, 7: 9.0, 8: 8.5 },
  lower: { 1: 5.0, 2: 5.5, 3: 7.0, 4: 7.0, 5: 7.0, 6: 11.0, 7: 10.5, 8: 10.0 },
};

const step = (id, label, shape, prompt, extra = {}) => ({ id, label, shape, prompt, optional: false, ...extra });

const RULER = step('ruler', 'CALIBRATION_MARKER', 'line2',
  'If a ruler is in the photo, tap two marks exactly 10 mm apart. No ruler? Tap "Not visible".',
  { optional: true, attributes: { length_mm: 10 } });

function toothStep(fdi, kind, facial) {
  const prompt = facial
    ? `Tooth ${toothName(fdi)}: tap the two corners of its biting edge (mesial, then distal), then a point on its gum/cervical margin.`
    : `Tooth ${toothName(fdi)}: tap its mesial contact, then its distal contact, then the most cheek-side (buccal/labial) point of the crown.`;
  return step(`tooth-${fdi}`, 'TOOTH', facial ? 'box3' : 'boxCentred', prompt,
    { attributes: { fdi, kind, visibility: 'full' } });
}

/** Natural teeth either side of each replaced tooth, up to `reach` teeth away. */
function contextTeeth(replaced, upper, reach = 2) {
  const order = archOrder(upper, false);
  const out = new Set();
  for (const t of replaced) {
    const i = order.indexOf(t);
    for (const dir of [-1, 1]) {
      let found = 0;
      for (let j = i + dir; j >= 0 && j < order.length && found < reach; j += dir) {
        if (!replaced.includes(order[j])) { out.add(order[j]); found++; }
      }
    }
  }
  return out;
}

/**
 * Ordered marking steps for one photo.
 * @param {object} c case: { caseType, replacedTeeth: number[] }
 */
export function annotationSteps(view, c) {
  const replaced = (c.replacedTeeth || []).slice();
  if (c.caseType === CASE_TYPE.CD) return cdSteps(view);
  const upper = replaced.length ? isUpper(replaced[0]) : true;
  const workingOcclusal = upper ? VIEW.OCCLUSAL_MAXILLARY : VIEW.OCCLUSAL_MANDIBULAR;
  const ctx = contextTeeth(replaced, upper);
  const order = archOrder(upper, false);
  const sorted = (set) => order.filter((t) => set.has(t));
  const toothSteps = (facial, reach) => {
    const nat = sorted(reach === 'arch' ? new Set(order.filter((t) => !replaced.includes(t))) : ctx);
    const all = new Set([...replaced, ...nat]);
    return sorted(all).map((t) => toothStep(t, replaced.includes(t) ? 'artificial' : 'natural', facial));
  };

  if (view === workingOcclusal) {
    return [
      RULER,
      step('arch-midline', 'ARCH_MIDLINE', 'line2', upper
        ? 'Arch midline: tap the front end of the palate midline (near the incisive papilla), then the back end.'
        : 'Arch midline: tap between the lower central incisors (or the lingual frenum), then the midpoint between the retromolar pads.'),
      ...toothSteps(false, 'arch').map((s) => ({ ...s, optional: s.attributes.kind === 'natural' })),
      step('ridge', 'EDENTULOUS_RIDGE', 'polyline',
        'If the ridge crest under the replacement teeth is visible, tap along it from front to back, then tap "Done". Otherwise tap "Not visible".',
        { optional: true }),
    ];
  }
  if (view === VIEW.OCCLUSAL_MAXILLARY || view === VIEW.OCCLUSAL_MANDIBULAR) {
    return []; // opposing arch: photo is kept for the instructor and the dataset; no marks needed
  }
  if (view === VIEW.FRONTAL) {
    const ant = replaced.filter(isAnterior);
    const teeth = new Set(ant);
    for (const t of ant) teeth.add(contralateral(t));
    return [
      RULER,
      step('dental-midline', 'DENTAL_MIDLINE', 'line2', 'Upper dental midline: tap the incisal end of the contact between the upper central incisors, then its gum end.'),
      step('reference-midline', 'REFERENCE_MIDLINE', 'line2', 'Reference midline: tap the upper labial frenum (or the philtrum), then a second point straight below it along the face/arch midline.', { optional: true }),
      step('occlusal-plane', 'OCCLUSAL_PLANE', 'line2', 'Occlusal plane: tap the cusp tip/incisal edge furthest to the patient\'s right, then furthest to the left.', { optional: true }),
      ...sorted(teeth).map((t) => toothStep(t, replaced.includes(t) ? 'artificial' : 'natural', true)),
    ];
  }
  if (view === VIEW.RPD_REPLACEMENT_CLOSEUP) {
    return [
      RULER,
      ...toothSteps(true, 'context'),
      step('occlusal-plane', 'OCCLUSAL_PLANE', 'line2',
        'Occlusal plane: tap the cusp tip of the natural tooth on one side of the space, then on the other side.', { optional: true }),
    ];
  }
  if (view === VIEW.OPPOSING_OCCLUSION) {
    return replaced.map((t) => step(`contact-${t}`, 'OCCLUSAL_CONTACT', 'point',
      `Where does tooth ${toothName(t)} touch the opposing tooth? Tap the contact. If it does not touch, tap "No contact".`,
      { optional: true, allowNoContact: true, attributes: { fdi: t } }));
  }
  return [];
}

function cdSteps(view) {
  if (view === VIEW.FRONTAL) {
    return [
      RULER,
      step('dental-midline', 'DENTAL_MIDLINE', 'line2', 'Upper dental midline: tap the incisal end of the contact between 11 and 21, then its gum end.'),
      step('lower-midline', 'MANDIBULAR_DENTAL_MIDLINE', 'line2', 'Lower dental midline: tap the incisal end of the contact between 31 and 41, then its gum end.', { optional: true }),
      step('reference-midline', 'REFERENCE_MIDLINE', 'line2', 'Reference midline: tap the upper labial frenum (or the philtrum), then a second point straight below it.', { optional: true }),
      step('occlusal-plane', 'OCCLUSAL_PLANE', 'line2', 'Occlusal plane: tap the cusp tip furthest to the patient\'s right, then furthest to the left.'),
      ...[13, 12, 11, 21, 22, 23].map((t) => ({ ...toothStep(t, 'artificial', true), optional: ![11, 21].includes(t) })),
    ];
  }
  const upper = view === VIEW.OCCLUSAL_MAXILLARY;
  const canines = upper ? [13, 23] : [43, 33];
  return [
    RULER,
    ...(upper ? [step('papilla', 'INCISIVE_PAPILLA', 'point', 'Tap the centre of the incisive papilla (if the base covers it, tap "Not visible").', { optional: true })] : []),
    step('arch-midline', 'ARCH_MIDLINE', 'line2', upper
      ? 'Arch midline: tap the front end of the palate midline, then the back end.'
      : 'Arch midline: tap between the lower central incisors, then the midpoint between the retromolar pads.'),
    ...canines.map((t) => step(`canine-${t}`, 'CANINE_TIP', 'point', `Tap the cusp tip of canine ${t}.`, { attributes: { fdi: t } })),
    ...archOrder(upper, false).map((t) => ({ ...toothStep(t, 'artificial', false), optional: true })),
  ];
}

// ---------------------------------------------------------------- reading back

export const itemsOf = (ann, label) => (ann?.items || []).filter((i) => i.label === label);
export const firstPoints = (ann, label) => itemsOf(ann, label)[0]?.points || null;
export const tooth = (ann, fdi) => itemsOf(ann, 'TOOTH').find((i) => i.attributes?.fdi === fdi) || null;
export const teeth = (ann) => itemsOf(ann, 'TOOTH');

/**
 * Pixels per millimetre for a view: from the ruler if marked (exact), otherwise
 * estimated from natural tooth widths (marked as estimated), otherwise null.
 */
export function scaleOf(ann) {
  const ruler = itemsOf(ann, 'CALIBRATION_MARKER')[0];
  if (ruler?.points?.length >= 2) {
    const [a, b] = ruler.points;
    const px = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const mm = ruler.attributes?.length_mm || 10;
    if (px > 0) return { pxPerMm: px / mm, estimated: false, source: 'ruler' };
  }
  const ts = teeth(ann);
  const natural = ts.filter((t) => t.attributes?.kind === 'natural');
  const use = natural.length ? natural : ts;
  const ratios = use.map((t) => {
    const f = t.attributes.fdi;
    const mm = TYPICAL_WIDTH_MM[isUpper(f) ? 'upper' : 'lower'][position(f)];
    return t.box.w / mm;
  }).filter((r) => r > 0).sort((a, b) => a - b);
  if (!ratios.length) return null;
  const median = ratios[Math.floor(ratios.length / 2)];
  return { pxPerMm: median, estimated: true, source: 'typical tooth widths' };
}
