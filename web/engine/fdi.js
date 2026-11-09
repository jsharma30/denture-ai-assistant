// FDI tooth numbering and Kennedy classification.

export const TOOTH_NAMES = {
  1: 'central incisor', 2: 'lateral incisor', 3: 'canine', 4: 'first premolar',
  5: 'second premolar', 6: 'first molar', 7: 'second molar', 8: 'third molar',
};

export const quadrant = (fdi) => Math.floor(fdi / 10);
export const position = (fdi) => fdi % 10;
export const isUpper = (fdi) => quadrant(fdi) === 1 || quadrant(fdi) === 2;
export const isAnterior = (fdi) => position(fdi) <= 3;
export const isValidFdi = (fdi) =>
  Number.isInteger(fdi) && [1, 2, 3, 4].includes(quadrant(fdi)) && position(fdi) >= 1 && position(fdi) <= 8;

export function toothName(fdi) {
  const side = [1, 4].includes(quadrant(fdi)) ? 'right' : 'left';
  const jaw = isUpper(fdi) ? 'upper' : 'lower';
  return `${fdi} (${jaw} ${side} ${TOOTH_NAMES[position(fdi)]})`;
}

/** Same tooth on the other side of the arch: 14 ↔ 24, 33 ↔ 43. */
export function contralateral(fdi) {
  const q = quadrant(fdi);
  const other = { 1: 2, 2: 1, 3: 4, 4: 3 }[q];
  return other * 10 + position(fdi);
}

/** Teeth that touch this one in a full arch (12 → 11, 13; 11 → 12, 21). */
export function neighbours(fdi) {
  const q = quadrant(fdi), p = position(fdi);
  const out = [];
  if (p < 8) out.push(q * 10 + p + 1);
  if (p > 1) out.push(q * 10 + p - 1);
  else out.push(contralateral(fdi));
  return out;
}

/** Arch order from the patient's right to left: 18..11, 21..28 (or 48..41, 31..38). */
export function archOrder(upper, includeThirdMolars = true) {
  const max = includeThirdMolars ? 8 : 7;
  const [r, l] = upper ? [1, 2] : [4, 3];
  const right = [], left = [];
  for (let p = max; p >= 1; p--) right.push(r * 10 + p);
  for (let p = 1; p <= max; p++) left.push(l * 10 + p);
  return right.concat(left);
}

/**
 * Kennedy classification with Applegate's rules relevant to a photo-based tool:
 * missing third molars are ignored, the most posterior space decides the class,
 * other spaces are modifications, and Class IV (a single bilateral anterior space)
 * has no modifications.
 * @param {number[]} missing FDI numbers of missing (replaced) teeth in ONE arch
 */
export function kennedy(missing) {
  const teeth = missing.filter(isValidFdi).filter((t) => position(t) !== 8);
  if (teeth.length === 0) return null;
  const upper = isUpper(teeth[0]);
  if (teeth.some((t) => isUpper(t) !== upper)) {
    throw new Error('Kennedy classification is per arch: give teeth from one arch only.');
  }
  const order = archOrder(upper, false);
  const gone = new Set(teeth);
  if (gone.size === order.length) return { cls: 'Edentulous', modifications: 0, arch: upper ? 'maxillary' : 'mandibular' };
  const runs = [];
  let start = -1;
  order.forEach((t, i) => {
    if (gone.has(t) && start < 0) start = i;
    if ((!gone.has(t) || i === order.length - 1) && start >= 0) {
      runs.push([start, gone.has(t) ? i : i - 1]);
      start = -1;
    }
  });
  const rightFree = gone.has(order[0]);
  const leftFree = gone.has(order[order.length - 1]);
  const mid = order.length / 2; // index of first left-side tooth
  const crossesMidline = (r) => r[0] < mid && r[1] >= mid;
  let cls, base;
  if (rightFree && leftFree) { cls = 'I'; base = 2; }
  else if (rightFree || leftFree) { cls = 'II'; base = 1; }
  else if (runs.length === 1 && crossesMidline(runs[0])) { cls = 'IV'; base = 1; }
  else { cls = 'III'; base = 1; }
  return { cls, modifications: Math.max(0, runs.length - base), arch: upper ? 'maxillary' : 'mandibular' };
}

export const KENNEDY_EXPLANATION = {
  I: 'Class I: edentulous areas behind the remaining teeth on both sides (bilateral distal extension). The saddles are tissue-supported at the back, so base extension and ridge relation matter most.',
  II: 'Class II: an edentulous area behind the remaining teeth on one side only (unilateral distal extension).',
  III: 'Class III: an edentulous area with natural teeth in front of and behind it (bounded saddle), so the denture is tooth-supported at both ends.',
  IV: 'Class IV: a single edentulous area in front of the remaining teeth that crosses the midline. Appearance, midline and lip support are the priorities.',
  Edentulous: 'No natural teeth remain in this arch: this is a complete denture case, not an RPD.',
};
