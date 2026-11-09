// Clinical rules: turn marked landmarks into graded parameters.
// No value is ever invented: if the marks needed for a parameter are missing,
// the parameter is graded INSUFFICIENT and says what is missing.

import { DEFAULT_TOLERANCES, SOURCE, STATUS } from './config.js';
import { CASE_TYPE, VIEW } from './capture.js';
import { contralateral, isAnterior, isUpper, neighbours, position, toothName } from './fdi.js';
import { firstPoints, itemsOf, scaleOf, teeth, tooth } from './annotation.js';
import {
  boxAxes, boxCorners, boxGap, curveDistance, dist, fitQuadratic, lineAngleDiff, lineDistance,
  normAxisAngle, polylineDistance, polylineSignedDistance, toMidlineFrame,
} from './geometry.js';

export function grade(value, tol) {
  const v = Math.abs(value);
  if (v <= tol.acceptable) return STATUS.ACCEPTABLE;
  if (v <= tol.minor) return STATUS.MINOR;
  return STATUS.SIGNIFICANT;
}

const fmt = (v, unit) => `${v >= 0 ? '' : '−'}${Math.abs(v).toFixed(unit === '°' ? 0 : 1)}${unit === '°' ? '°' : ` ${unit}`}`;
const tolText = (t) => `Acceptable ≤ ${t.acceptable}${t.unit === '°' ? '°' : ` ${t.unit}`}, minor ≤ ${t.minor}${t.unit === '°' ? '°' : ` ${t.unit}`}`;

function result(id, title, tolKey, tol, extra) {
  return { id, title, learnId: tolKey, tolerance: tol && tol.acceptable !== undefined ? tolText(tol) : null, ...extra };
}

function insufficient(id, title, tolKey, tol, why, extra = {}) {
  return result(id, title, tolKey, tol, { status: STATUS.INSUFFICIENT, value: null, display: '—', explanation: why, ...extra });
}

function measured(id, title, tolKey, tol, valueMm, explanation, extra = {}) {
  return result(id, title, tolKey, tol, {
    status: grade(valueMm, tol), value: valueMm, display: fmt(valueMm, tol.unit), explanation, ...extra,
  });
}

/** Occlusal-edge midpoint of a tooth box in a facial view (edge nearest the occlusal plane). */
function occlusalPoint(t) {
  const { v } = boxAxes(t.box);
  // Upper teeth: biting edge is lower on screen; lower teeth: higher on screen.
  const s = (isUpper(t.attributes.fdi) ? 1 : -1) * Math.sign(v[1] || 1);
  return [t.box.cx + (v[0] * t.box.h) / 2 * s, t.box.cy + (v[1] * t.box.h) / 2 * s];
}

// ===================================================================== RPD

function rpdSpaceFit(tid, views, tol) {
  const id = `space_fit_${tid}`, title = `Space fit — ${toothName(tid)}`;
  for (const v of [VIEW.RPD_REPLACEMENT_CLOSEUP, isUpper(tid) ? VIEW.OCCLUSAL_MAXILLARY : VIEW.OCCLUSAL_MANDIBULAR]) {
    const ann = views[v];
    const t = tooth(ann, tid);
    if (!t) continue;
    const nbs = neighbours(tid).map((n) => tooth(ann, n)).filter(Boolean);
    if (!nbs.length) continue;
    const scale = scaleOf(ann);
    if (!scale) continue;
    const gaps = nbs.map((n) => ({ fdi: n.attributes.fdi, mm: boxGap(t.box, n.box) / scale.pxPerMm }));
    const worst = gaps.reduce((a, b) => (Math.abs(b.mm) > Math.abs(a.mm) ? b : a));
    const what = worst.mm >= 0 ? `a gap of ${worst.mm.toFixed(1)} mm` : `an overlap of ${(-worst.mm).toFixed(1)} mm`;
    return measured(id, title, 'rpd_space_fit', tol, worst.mm,
      `Between ${tid} and ${worst.fdi} there is ${what}. A replacement tooth should fill its space without gaps or overlaps.`,
      { tooth: tid, view: v, scaleEstimated: scale.estimated, details: gaps });
  }
  return insufficient(id, title, 'rpd_space_fit', tol,
    `Mark tooth ${tid} and at least one neighbouring tooth in the close-up (or occlusal) photo.`, { tooth: tid });
}

function rpdArchAlignment(tid, views, tol) {
  const id = `arch_alignment_${tid}`, title = `Arch alignment — ${toothName(tid)}`;
  const v = isUpper(tid) ? VIEW.OCCLUSAL_MAXILLARY : VIEW.OCCLUSAL_MANDIBULAR;
  const ann = views[v];
  const t = tooth(ann, tid);
  const midline = firstPoints(ann, 'ARCH_MIDLINE');
  const others = teeth(ann).filter((o) => o.attributes.fdi !== tid);
  if (!t || !midline || others.length < 4) {
    return insufficient(id, title, 'rpd_arch_alignment', tol,
      `Needs the arch midline, tooth ${tid} and at least 4 other teeth marked in the ${isUpper(tid) ? 'maxillary' : 'mandibular'} arch photo.`, { tooth: tid });
  }
  const scale = scaleOf(ann);
  if (!scale) return insufficient(id, title, 'rpd_arch_alignment', tol, 'No scale available.', { tooth: tid });
  // Leave-one-out: the curve is fitted WITHOUT the tooth being judged.
  const pts = toMidlineFrame(others.map((o) => [o.box.cx, o.box.cy]), midline[0], midline[1]);
  const fit = fitQuadratic(pts);
  if (!fit) return insufficient(id, title, 'rpd_arch_alignment', tol, 'The other marked teeth do not define an arch curve.', { tooth: tid });
  const [p] = toMidlineFrame([[t.box.cx, t.box.cy]], midline[0], midline[1]);
  const xs = pts.map((q) => q[0]);
  const d = curveDistance(p, fit, Math.min(...xs), Math.max(...xs)) / scale.pxPerMm;
  // Sign: inside (towards the palate/tongue) or outside the curve.
  const inside = (p[1] > fit.at(p[0])) === (fit.a > 0);
  return measured(id, title, 'rpd_arch_alignment', tol, d,
    d < 0.05 ? `Tooth ${tid} sits on the arch curve formed by the other teeth.`
      : `Tooth ${tid} is ${d.toFixed(1)} mm ${inside ? 'inside (towards the tongue/palate)' : 'outside (towards the cheek/lip)'} the arch curve formed by the other teeth.`,
    { tooth: tid, view: v, scaleEstimated: scale.estimated });
}

function rpdRidgeRelation(tid, views, tol) {
  const id = `ridge_relation_${tid}`, title = `Ridge relation — ${toothName(tid)}`;
  const v = isUpper(tid) ? VIEW.OCCLUSAL_MAXILLARY : VIEW.OCCLUSAL_MANDIBULAR;
  const ann = views[v];
  const t = tooth(ann, tid);
  const ridge = firstPoints(ann, 'EDENTULOUS_RIDGE');
  if (!t || !ridge || ridge.length < 2) {
    return insufficient(id, title, 'rpd_ridge_relation', tol,
      'The ridge crest was not marked (it is often hidden under the denture). Check this clinically or on the cast.', { tooth: tid });
  }
  const scale = scaleOf(ann);
  if (!scale) return insufficient(id, title, 'rpd_ridge_relation', tol, 'No scale available.', { tooth: tid });
  const d = polylineDistance([t.box.cx, t.box.cy], ridge) / scale.pxPerMm;
  return measured(id, title, 'rpd_ridge_relation', tol, d,
    `The centre of tooth ${tid} is ${d.toFixed(1)} mm from the ridge crest. Posterior teeth set over the ridge give a stable denture.`,
    { tooth: tid, view: v, scaleEstimated: scale.estimated });
}

function rpdInclination(tid, views, tol) {
  const id = `inclination_${tid}`, title = `Long-axis inclination — ${toothName(tid)}`;
  const ann = views[VIEW.RPD_REPLACEMENT_CLOSEUP];
  const t = tooth(ann, tid);
  const nbs = teeth(ann).filter((o) => o.attributes.kind === 'natural');
  if (!t || !nbs.length) {
    return insufficient(id, title, 'rpd_inclination', tol,
      `Mark tooth ${tid} and at least one natural tooth in the close-up photo.`, { tooth: tid });
  }
  const ref = nbs.reduce((s, o) => s + normAxisAngle(o.box.angle_deg), 0) / nbs.length;
  const diff = normAxisAngle(normAxisAngle(t.box.angle_deg) - ref);
  return measured(id, title, 'rpd_inclination', tol, diff,
    `The long axis of ${tid} differs by ${Math.abs(diff).toFixed(0)}° from the natural teeth beside it.`,
    { tooth: tid, view: VIEW.RPD_REPLACEMENT_CLOSEUP });
}

function rpdOcclusalPlane(tid, views, tol) {
  const id = `occlusal_plane_${tid}`, title = `Occlusal plane level — ${toothName(tid)}`;
  const ann = views[VIEW.RPD_REPLACEMENT_CLOSEUP];
  const t = tooth(ann, tid);
  let plane = firstPoints(ann, 'OCCLUSAL_PLANE');
  if (!plane) {
    const nat = teeth(ann).filter((o) => o.attributes.kind === 'natural');
    if (nat.length >= 2) plane = [occlusalPoint(nat[0]), occlusalPoint(nat[nat.length - 1])];
  }
  if (!t || !plane) {
    return insufficient(id, title, 'rpd_occlusal_plane', tol,
      `Mark tooth ${tid} and the occlusal plane (or natural teeth on both sides) in the close-up photo.`, { tooth: tid });
  }
  const scale = scaleOf(ann);
  if (!scale) return insufficient(id, title, 'rpd_occlusal_plane', tol, 'No scale available.', { tooth: tid });
  const p = occlusalPoint(t);
  let d = polylineSignedDistance(p, plane) / scale.pxPerMm;
  // Make the sign mean: positive = tooth is short of the plane (out of occlusion).
  const towardsOpposing = isUpper(tid) ? 1 : -1;
  const below = (p[1] - (plane[0][1] + plane[plane.length - 1][1]) / 2) * towardsOpposing;
  d = Math.abs(d) * (below > 0 ? -1 : 1);
  const where = Math.abs(d) < 0.05 ? 'level with'
    : `${Math.abs(d).toFixed(1)} mm ${d > 0 ? 'short of' : 'beyond'}`;
  return measured(id, title, 'rpd_occlusal_plane', tol, d,
    `The biting edge of ${tid} is ${where} the occlusal plane of the natural teeth${d > 0.05 ? ', so it may not reach the opposing teeth' : d < -0.05 ? ', so it may hit the opposing teeth first' : ''}.`,
    { tooth: tid, view: VIEW.RPD_REPLACEMENT_CLOSEUP, scaleEstimated: scale.estimated });
}

function rpdOcclusalContact(tid, views, tol) {
  const id = `occlusal_contact_${tid}`, title = `Occlusal contact — ${toothName(tid)}`;
  const ann = views[VIEW.OPPOSING_OCCLUSION];
  if (!ann) {
    return insufficient(id, title, 'rpd_occlusal_contact', tol, 'The "in occlusion" photo has not been marked yet.', { tooth: tid });
  }
  const contacts = itemsOf(ann, 'OCCLUSAL_CONTACT').filter((c) => c.attributes?.fdi === tid);
  if (contacts.length) {
    return result(id, title, 'rpd_occlusal_contact', tol, {
      status: STATUS.ACCEPTABLE, value: contacts.length, display: `${contacts.length} contact${contacts.length > 1 ? 's' : ''}`,
      explanation: `Tooth ${tid} touches the opposing teeth in occlusion.`, tooth: tid, view: VIEW.OPPOSING_OCCLUSION,
    });
  }
  if ((ann.noContact || []).includes(tid)) {
    return result(id, title, 'rpd_occlusal_contact', tol, {
      status: STATUS.SIGNIFICANT, value: 0, display: 'No contact',
      explanation: `Tooth ${tid} does not touch the opposing teeth. Without contact it does not share the chewing load and the opposing tooth may over-erupt.`,
      tooth: tid, view: VIEW.OPPOSING_OCCLUSION,
    });
  }
  return insufficient(id, title, 'rpd_occlusal_contact', tol, `The contact of ${tid} was marked as not visible.`, { tooth: tid });
}

function rpdMidlineSymmetry(tid, views, tol) {
  const id = `midline_symmetry_${tid}`, title = `Midline & symmetry — ${toothName(tid)}`;
  const ann = views[VIEW.FRONTAL];
  const scale = scaleOf(ann);
  const t = tooth(ann, tid);
  const c = tooth(ann, contralateral(tid));
  const parts = [];
  let worst = null;
  if (scale && t && c) {
    const dw = (t.box.w - c.box.w) / scale.pxPerMm;
    parts.push(`${tid} is ${Math.abs(dw).toFixed(1)} mm ${dw >= 0 ? 'wider' : 'narrower'} than ${contralateral(tid)}`);
    worst = dw;
  }
  const dm = firstPoints(ann, 'DENTAL_MIDLINE');
  const rm = firstPoints(ann, 'REFERENCE_MIDLINE');
  if (scale && dm && rm && position(tid) === 1) {
    const off = Math.abs(lineDistance(dm[0], rm[0], rm[1])) / scale.pxPerMm;
    parts.push(`the dental midline is ${off.toFixed(1)} mm from the reference midline`);
    if (worst === null || off > Math.abs(worst)) worst = off;
  }
  if (worst === null) {
    return insufficient(id, title, 'rpd_midline_symmetry', tol,
      `Mark ${tid} and ${contralateral(tid)} (and the midlines for central incisors) in the anterior photo.`, { tooth: tid });
  }
  return measured(id, title, 'rpd_midline_symmetry', tol, worst,
    `In the anterior view, ${parts.join(' and ')}. Front replacements should mirror the tooth on the other side.`,
    { tooth: tid, view: VIEW.FRONTAL, scaleEstimated: scale.estimated });
}

function evaluateRpd(c, views, tolerances) {
  const out = [];
  for (const tid of c.replacedTeeth) {
    out.push(rpdSpaceFit(tid, views, tolerances.rpd_space_fit));
    out.push(rpdArchAlignment(tid, views, tolerances.rpd_arch_alignment));
    if (!isAnterior(tid)) out.push(rpdRidgeRelation(tid, views, tolerances.rpd_ridge_relation));
    out.push(rpdInclination(tid, views, tolerances.rpd_inclination));
    out.push(rpdOcclusalPlane(tid, views, tolerances.rpd_occlusal_plane));
    out.push(rpdOcclusalContact(tid, views, tolerances.rpd_occlusal_contact));
    if (isAnterior(tid)) out.push(rpdMidlineSymmetry(tid, views, tolerances.rpd_midline_symmetry));
  }
  return out;
}

// ====================================================================== CD

function evaluateCd(views, T) {
  const out = [];
  const f = views[VIEW.FRONTAL];
  const fs = scaleOf(f);
  const dm = firstPoints(f, 'DENTAL_MIDLINE');
  const lm = firstPoints(f, 'MANDIBULAR_DENTAL_MIDLINE');
  const rm = firstPoints(f, 'REFERENCE_MIDLINE');
  const plane = firstPoints(f, 'OCCLUSAL_PLANE');

  out.push(dm && rm && fs
    ? measured('cd_midline', 'Dental midline vs facial midline', 'cd_midline', T.cd_midline,
      Math.abs(lineDistance(dm[0], rm[0], rm[1])) / fs.pxPerMm,
      'Distance between the contact of the upper central incisors and the reference (facial) midline.', { view: VIEW.FRONTAL, scaleEstimated: fs.estimated })
    : insufficient('cd_midline', 'Dental midline vs facial midline', 'cd_midline', T.cd_midline, 'Mark the upper dental midline and the reference midline in the anterior photo.'));

  out.push(dm && lm && fs
    ? measured('cd_upper_lower_midline', 'Upper vs lower midline', 'cd_upper_lower_midline', T.cd_upper_lower_midline,
      Math.abs(lineDistance(lm[0], dm[0], dm[1])) / fs.pxPerMm,
      'Distance between the upper and lower dental midlines in occlusion.', { view: VIEW.FRONTAL, scaleEstimated: fs.estimated })
    : insufficient('cd_upper_lower_midline', 'Upper vs lower midline', 'cd_upper_lower_midline', T.cd_upper_lower_midline, 'Mark both dental midlines in the anterior photo.'));

  if (plane) {
    // Cant: plane against the perpendicular of the reference midline if present, else the photo horizontal.
    const ref = rm ? [[0, 0], [rm[1][1] - rm[0][1], -(rm[1][0] - rm[0][0])]] : [[0, 0], [1, 0]];
    const cant = lineAngleDiff(plane[0], plane[1], ref[0], ref[1]);
    out.push(measured('cd_occlusal_plane_cant', 'Occlusal plane cant', 'cd_occlusal_plane_cant', T.cd_occlusal_plane_cant, cant,
      rm ? 'Tilt of the occlusal plane relative to a line at right angles to the midline.'
        : 'Tilt of the occlusal plane relative to the photo horizontal (no reference midline marked, so a tilted camera adds error).',
      { view: VIEW.FRONTAL }));
  } else {
    out.push(insufficient('cd_occlusal_plane_cant', 'Occlusal plane cant', 'cd_occlusal_plane_cant', T.cd_occlusal_plane_cant, 'Mark the occlusal plane in the anterior photo.'));
  }

  const pairs = [[12, 22], [13, 23]].map(([a, b]) => [tooth(f, a), tooth(f, b)]).filter(([a, b]) => a && b);
  out.push(pairs.length
    ? (() => {
      const worst = Math.max(...pairs.map(([a, b]) => Math.abs(normAxisAngle(a.box.angle_deg) + normAxisAngle(b.box.angle_deg))));
      return measured('cd_inclination_symmetry', 'Left–right inclination symmetry', 'cd_inclination_symmetry', T.cd_inclination_symmetry, worst,
        'Matching teeth on the left and right should lean by mirror-image amounts.', { view: VIEW.FRONTAL });
    })()
    : insufficient('cd_inclination_symmetry', 'Left–right inclination symmetry', 'cd_inclination_symmetry', T.cd_inclination_symmetry, 'Mark 12 & 22 or 13 & 23 in the anterior photo.'));

  for (const [v, name] of [[VIEW.OCCLUSAL_MAXILLARY, 'upper'], [VIEW.OCCLUSAL_MANDIBULAR, 'lower']]) {
    const ann = views[v];
    const s = scaleOf(ann);
    const ml = firstPoints(ann, 'ARCH_MIDLINE');
    const canines = itemsOf(ann, 'CANINE_TIP');
    out.push(ml && s && canines.length === 2
      ? (() => {
        const [d1, d2] = canines.map((cn) => Math.abs(lineDistance(cn.points[0], ml[0], ml[1])) / s.pxPerMm);
        return measured(`cd_canine_symmetry_${name}`, `Canine symmetry (${name})`, 'cd_canine_symmetry', T.cd_canine_symmetry, d1 - d2,
          `The two ${name} canines are ${d1.toFixed(1)} mm and ${d2.toFixed(1)} mm from the arch midline.`, { view: v, scaleEstimated: s.estimated });
      })()
      : insufficient(`cd_canine_symmetry_${name}`, `Canine symmetry (${name})`, 'cd_canine_symmetry', T.cd_canine_symmetry, `Mark the arch midline and both canine tips in the ${name} arch photo.`));

    const ts = teeth(ann);
    if (ml && s && ts.length >= 6) {
      let worst = { d: 0, fdi: null };
      for (const t of ts) {
        const others = ts.filter((o) => o !== t);
        const pts = toMidlineFrame(others.map((o) => [o.box.cx, o.box.cy]), ml[0], ml[1]);
        const fit = fitQuadratic(pts);
        if (!fit) continue;
        const [p] = toMidlineFrame([[t.box.cx, t.box.cy]], ml[0], ml[1]);
        const xs = pts.map((q) => q[0]);
        const d = curveDistance(p, fit, Math.min(...xs), Math.max(...xs)) / s.pxPerMm;
        if (d > worst.d) worst = { d, fdi: t.attributes.fdi };
      }
      out.push(measured(`cd_arch_form_${name}`, `Arch form (${name})`, 'cd_arch_form', T.cd_arch_form, worst.d,
        `The tooth furthest from a smooth arch curve is ${worst.fdi}, ${worst.d.toFixed(1)} mm off the curve formed by the other teeth.`,
        { view: v, scaleEstimated: s.estimated, tooth: worst.fdi }));
    } else {
      out.push(insufficient(`cd_arch_form_${name}`, `Arch form (${name})`, 'cd_arch_form', T.cd_arch_form, `Mark the arch midline and at least 6 teeth in the ${name} arch photo.`));
    }

    if (v === VIEW.OCCLUSAL_MAXILLARY) {
      const pap = firstPoints(ann, 'INCISIVE_PAPILLA');
      const centrals = [tooth(ann, 11), tooth(ann, 21)].filter(Boolean);
      if (pap && ml && s && centrals.length) {
        const L = dist(ml[0], ml[1]);
        const ant = [(ml[0][0] - ml[1][0]) / L, (ml[0][1] - ml[1][1]) / L];
        const reach = Math.max(...centrals.flatMap((t) => boxCorners(t.box)).map((q) => (q[0] - pap[0][0]) * ant[0] + (q[1] - pap[0][1]) * ant[1]));
        const mm = reach / s.pxPerMm;
        const tol = T.cd_papilla_incisor;
        out.push(measured('cd_papilla_incisor', 'Central incisors to incisive papilla', 'cd_papilla_incisor', tol, mm - tol.target,
          `The labial surface of the central incisors is ${mm.toFixed(1)} mm in front of the incisive papilla (guide: about ${tol.target - 1}–${tol.target + 1} mm).`,
          { view: v, scaleEstimated: s.estimated, display: `${mm.toFixed(1)} mm`, tolerance: `Target ${tol.target} mm; acceptable ±${tol.acceptable} mm, minor ±${tol.minor} mm` }));
      } else {
        out.push(insufficient('cd_papilla_incisor', 'Central incisors to incisive papilla', 'cd_papilla_incisor', T.cd_papilla_incisor, 'Mark the incisive papilla, the arch midline and 11/21 in the maxillary arch photo.'));
      }
    }
  }
  return out;
}

// ================================================================= summary

/**
 * Evaluate a whole case.
 * @param {object} c { caseType: 'RPD'|'CD', replacedTeeth: number[] }
 * @param {object} views map VIEW -> annotation
 * @param {string} source SOURCE.* — who produced the marks
 */
export function evaluateCase(c, views, source = SOURCE.STUDENT_ANNOTATED, tolerances = DEFAULT_TOLERANCES) {
  if (!Object.values(SOURCE).includes(source)) throw new Error(`Unknown source ${source}`);
  const parameters = c.caseType === CASE_TYPE.RPD ? evaluateRpd(c, views, tolerances) : evaluateCd(views, tolerances);
  const counts = { ACCEPTABLE: 0, MINOR: 0, SIGNIFICANT: 0, INSUFFICIENT: 0 };
  for (const p of parameters) counts[p.status]++;
  const assessed = parameters.length - counts.INSUFFICIENT;
  return {
    source,
    caseType: c.caseType,
    replacedTeeth: c.replacedTeeth || [],
    parameters,
    counts,
    score: assessed ? Math.round(((counts.ACCEPTABLE + 0.5 * counts.MINOR) / assessed) * 100) : null,
    anyEstimatedScale: parameters.some((p) => p.scaleEstimated),
  };
}
