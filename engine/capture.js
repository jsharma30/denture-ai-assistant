// Which photos to take, how to take them, and flexible photo checks.

import { CAPTURE_QUALITY } from './config.js';

export const CASE_TYPE = Object.freeze({ RPD: 'RPD', CD: 'CD' });

export const VIEW = Object.freeze({
  OCCLUSAL_MAXILLARY: 'OCCLUSAL_MAXILLARY',
  OCCLUSAL_MANDIBULAR: 'OCCLUSAL_MANDIBULAR',
  FRONTAL: 'FRONTAL',
  RPD_REPLACEMENT_CLOSEUP: 'RPD_REPLACEMENT_CLOSEUP',
  OPPOSING_OCCLUSION: 'OPPOSING_OCCLUSION',
});

export const OCCLUSAL_VIEWS = new Set([VIEW.OCCLUSAL_MAXILLARY, VIEW.OCCLUSAL_MANDIBULAR]);

export const REFERENCE_NOTE = 'Use this image as a guide. Your photograph does not need to look identical.';

const GUIDES = {
  OCCLUSAL_MAXILLARY: {
    title: 'Maxillary arch',
    purpose: 'Shows the arch form, the midline of the palate and where each replacement tooth sits in the arch.',
    instructions: [
      'Upper arch seen from directly below (a mirror is fine).',
      'Include every tooth from the last molar on one side to the last molar on the other.',
      'Keep the palate midline roughly vertical in the frame.',
      'If you have a small ruler, place it next to the teeth.',
    ],
    overlay: 'arch-up',
  },
  OCCLUSAL_MANDIBULAR: {
    title: 'Mandibular arch',
    purpose: 'Shows the lower arch form and the ridge under the replacement teeth.',
    instructions: [
      'Lower arch seen from directly above.',
      'Include every tooth from the last molar on one side to the last molar on the other.',
      'If you have a small ruler, place it next to the teeth.',
    ],
    overlay: 'arch-down',
  },
  FRONTAL: {
    title: 'Anterior view',
    purpose: 'Shows the midlines, the occlusal plane and the front teeth.',
    instructions: [
      'Front view with the teeth together.',
      'Hold the camera level with the biting surfaces.',
      'Include at least canine to canine. Keep faces out of the photo.',
    ],
    overlay: 'frontal',
  },
  RPD_REPLACEMENT_CLOSEUP: {
    title: 'Edentulous / replacement-tooth region',
    purpose: 'Shows how each replacement tooth fills its space, its inclination and its level.',
    instructions: [
      'Close-up of the replacement teeth.',
      'Include at least one natural tooth on each side of the space (or the last natural tooth for a free-end saddle).',
      'Camera at right angles to the teeth, from the side the teeth face.',
    ],
    overlay: 'closeup',
  },
  OPPOSING_OCCLUSION: {
    title: 'Replacement-tooth region in occlusion',
    purpose: 'Shows whether the replacement teeth touch the opposing teeth.',
    instructions: [
      'Same region from the side, with the jaws (or articulator) closed.',
      'Make sure the contact between upper and lower teeth is visible.',
    ],
    overlay: 'occlusion',
  },
};

/** The photos a case needs, in the order the student takes them. */
export function requiredViews(caseType) {
  const order = caseType === CASE_TYPE.RPD
    ? [VIEW.OCCLUSAL_MAXILLARY, VIEW.OCCLUSAL_MANDIBULAR, VIEW.FRONTAL, VIEW.RPD_REPLACEMENT_CLOSEUP, VIEW.OPPOSING_OCCLUSION]
    : [VIEW.FRONTAL, VIEW.OCCLUSAL_MAXILLARY, VIEW.OCCLUSAL_MANDIBULAR];
  return order.map((v) => guide(v, caseType));
}

export function guide(view, caseType) {
  const g = GUIDES[view];
  if (!g) throw new Error(`Unknown view ${view}`);
  return { view, required: true, caseType, ...g, referenceNote: REFERENCE_NOTE };
}

export const VERDICT = Object.freeze({ GOOD: 'GOOD', USABLE: 'USABLE', RETAKE: 'RETAKE' });

export const VERDICT_TEXT = {
  GOOD: '🟢 Good photo',
  USABLE: '🟡 Usable — you can continue',
  RETAKE: '🔴 Please retake this photo',
};

/**
 * Advisory photo check. Only a genuinely unusable photo (almost black, completely
 * washed out, completely blurred or tiny) blocks; everything else is a friendly warning.
 * Tilt is never an error.
 *
 * @param {object} s stats measured on a temporary analysis copy (never the original):
 *   width, height, meanLuma (0–255), overexposedFraction, sharpness (Laplacian variance),
 *   subjectFill (0–1), centreOffset (0–~0.7, distance of subject centre from frame centre)
 */
export function evaluateQuality(s, view, cfg = CAPTURE_QUALITY) {
  const warnings = [], blockers = [];
  const short = Math.min(s.width, s.height);
  if (short < cfg.minShortSidePx) blockers.push(`This photo is very small (${s.width}×${s.height} pixels). Please use the camera's normal photo size.`);
  if (s.meanLuma < cfg.retakeMinLuma) blockers.push('This photo is almost completely dark, so the teeth cannot be seen. Please retake it with more light.');
  else if (s.meanLuma < cfg.minLuma) warnings.push('The photo is a little dark. You can continue; more light would make details easier to see.');
  if (s.meanLuma > cfg.retakeMaxLuma) blockers.push('This photo is almost completely white (washed out). Please retake it with less light or without the flash.');
  else if (s.meanLuma > cfg.maxLuma) warnings.push('The photo is quite bright. You can continue.');
  if (s.sharpness < cfg.retakeMinSharpness) blockers.push('This photo is too blurred to see tooth edges. Please hold the camera still and retake it.');
  else if (s.sharpness < cfg.minSharpness) warnings.push('The photo is slightly soft (a little blurred). You can continue; a sharper photo gives more reliable landmarks.');
  if (s.overexposedFraction > cfg.maxOverexposedFraction) {
    warnings.push('There is some glare (shiny reflections) on the teeth. That\'s OK — you can continue. If you can, tilt the light or camera slightly and retake for a clearer result.');
  }
  const fillMin = OCCLUSAL_VIEWS.has(view) ? cfg.minSubjectFill / 2 : cfg.minSubjectFill;
  if (s.subjectFill !== undefined && s.subjectFill < fillMin) {
    warnings.push('The teeth fill only a small part of the photo. You can continue, or move a little closer.');
  }
  if (s.centreOffset !== undefined && s.centreOffset > cfg.maxCentreOffset) {
    warnings.push('The teeth are off-centre. That\'s fine — just make sure the whole region is in the photo.');
  }
  const verdict = blockers.length ? VERDICT.RETAKE : warnings.length ? VERDICT.USABLE : VERDICT.GOOD;
  return {
    verdict,
    canContinue: verdict !== VERDICT.RETAKE,
    headline: VERDICT_TEXT[verdict],
    warnings,
    blockers,
  };
}

/**
 * Measure photo statistics from greyscale + saturation arrays of a downscaled
 * analysis copy (the original photo is never changed).
 * @param {Uint8ClampedArray} rgba ImageData.data of the analysis copy
 */
export function measurePhoto(rgba, w, h, originalWidth, originalHeight) {
  const n = w * h;
  const luma = new Float32Array(n);
  let sum = 0, over = 0, subj = 0, sx = 0, sy = 0;
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    luma[i] = y;
    sum += y;
    if (r > 250 && g > 250 && b > 250) over++;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const sat = mx === 0 ? 0 : (mx - mn) / mx;
    // Teeth and acrylic teeth: fairly bright and low-saturation (not pure glare).
    if (y > 120 && y < 250 && sat < 0.35) {
      subj++;
      sx += i % w;
      sy += Math.floor(i / w);
    }
  }
  let lap = 0, lapSq = 0, m = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = 4 * luma[i] - luma[i - 1] - luma[i + 1] - luma[i - w] - luma[i + w];
      lap += v; lapSq += v * v; m++;
    }
  }
  const mean = m ? lap / m : 0;
  const centre = subj
    ? Math.hypot(sx / subj / w - 0.5, sy / subj / h - 0.5)
    : 0;
  return {
    width: originalWidth ?? w,
    height: originalHeight ?? h,
    meanLuma: sum / n,
    overexposedFraction: over / n,
    sharpness: m ? lapSq / m - mean * mean : 0,
    subjectFill: subj / n,
    centreOffset: centre,
  };
}
