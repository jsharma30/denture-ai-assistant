// DEMO / MOCK data. Synthetic geometry for a made-up case, used only to show
// what a finished report looks like. It is never presented as an analysis of a
// student's photo, and every result built from it is labelled DEMO_MOCK.

import { CASE_TYPE, VIEW } from './capture.js';
import { TYPICAL_WIDTH_MM } from './annotation.js';
import { position } from './fdi.js';

const PX = 10; // synthetic pixels per mm
const ruler = (x, y) => ({ label: 'CALIBRATION_MARKER', shape: 'polyline', points: [[x, y], [x + 10 * PX, y]], attributes: { length_mm: 10 } });

/** Teeth of one upper quadrant along a parabolic arch, in an 1000×800 synthetic occlusal photo. */
function occlusalArch(replaced, shiftOutMm) {
  const cx = 500, top = 150, k = 0.0064;
  const items = [];
  for (const side of [-1, 1]) {
    let s = 0, x = 0;
    for (let p = 1; p <= 7; p++) {
      const fdi = (side < 0 ? 10 : 20) + p;
      const w = TYPICAL_WIDTH_MM.upper[p] * PX;
      const target = s + w / 2;
      // walk along the curve to arc length `target`
      let acc = s, xx = x;
      while (acc < target) {
        const nx = xx + 0.5;
        acc += Math.hypot(0.5, k * (nx * nx - xx * xx));
        xx = nx;
      }
      const slope = 2 * k * xx;
      const ang = Math.atan(slope) * (180 / Math.PI) * side;
      let px = cx + side * xx, py = top + k * xx * xx;
      if (shiftOutMm[fdi]) {
        const n = [side * slope, -1]; const L = Math.hypot(n[0], n[1]); // outward normal (towards the cheek)
        px += (n[0] / L) * shiftOutMm[fdi] * PX; py += (n[1] / L) * shiftOutMm[fdi] * PX;
      }
      items.push({
        label: 'TOOTH', shape: 'rotated_box',
        box: { cx: px, cy: py, w, h: (p <= 3 ? 7 : 10) * PX, angle_deg: ang },
        attributes: { fdi, kind: replaced.includes(fdi) ? 'artificial' : 'natural', visibility: 'full' },
      });
      // advance to the far edge of this tooth
      while (acc < s + w) {
        const nx = xx + 0.5;
        acc += Math.hypot(0.5, k * (nx * nx - xx * xx));
        xx = nx;
      }
      s += w; x = xx;
    }
  }
  return items;
}

/** Buccal close-up of 13–16 (patient's right, upper), occlusal edges along y = 400. */
function closeup(spec) {
  const items = [];
  let x = 150;
  for (const fdi of [13, 14, 15, 16]) {
    const p = position(fdi);
    const w = TYPICAL_WIDTH_MM.upper[p] * PX * 1.2;
    const h = (p === 3 ? 10 : p === 6 ? 7 : 8) * PX * 1.2;
    const s = spec[fdi] || {};
    x += (s.gapBeforeMm || 0) * PX * 1.2;
    const occl = 400 - (s.shortMm || 0) * PX * 1.2;
    items.push({
      label: 'TOOTH', shape: 'rotated_box',
      box: { cx: x + w / 2, cy: occl - h / 2, w, h, angle_deg: s.tiltDeg || 0 },
      attributes: { fdi, kind: s.artificial ? 'artificial' : 'natural', visibility: 'full' },
    });
    x += w;
  }
  items.push({ label: 'OCCLUSAL_PLANE', shape: 'polyline', points: [[150, 400], [x, 400]] });
  items.push({ label: 'CALIBRATION_MARKER', shape: 'polyline', points: [[150, 520], [150 + 10 * PX * 1.2, 520]], attributes: { length_mm: 10 } });
  return items;
}

/** The demo case: maxillary Kennedy Class III, 14 and 15 replaced, 15 set with typical student errors. */
export function demoCase() {
  const replaced = [14, 15];
  return {
    case: { caseType: CASE_TYPE.RPD, replacedTeeth: replaced, arch: 'maxillary', demo: true },
    size: { w: 1000, h: 800 },
    views: {
      [VIEW.OCCLUSAL_MAXILLARY]: {
        view: VIEW.OCCLUSAL_MAXILLARY,
        items: [
          ruler(80, 760),
          { label: 'ARCH_MIDLINE', shape: 'polyline', points: [[500, 120], [500, 700]] },
          ...occlusalArch(replaced, { 15: 1.4 }),
        ],
      },
      [VIEW.OCCLUSAL_MANDIBULAR]: { view: VIEW.OCCLUSAL_MANDIBULAR, items: [] },
      [VIEW.FRONTAL]: { view: VIEW.FRONTAL, items: [] },
      [VIEW.RPD_REPLACEMENT_CLOSEUP]: {
        view: VIEW.RPD_REPLACEMENT_CLOSEUP,
        items: closeup({ 14: { artificial: true, gapBeforeMm: 0.3 }, 15: { artificial: true, tiltDeg: 8, shortMm: 0.8 } }),
      },
      [VIEW.OPPOSING_OCCLUSION]: {
        view: VIEW.OPPOSING_OCCLUSION,
        items: [{ label: 'OCCLUSAL_CONTACT', shape: 'point', points: [[420, 400]], attributes: { fdi: 14 } }],
        noContact: [15],
      },
    },
  };
}
