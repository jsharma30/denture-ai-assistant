// Clinical and capture configuration.
// Tolerances are educational starting defaults; a department can change them here
// (or pass its own config to evaluateCase) without touching the rules.

export const STATUS = Object.freeze({
  ACCEPTABLE: 'ACCEPTABLE',
  MINOR: 'MINOR',
  SIGNIFICANT: 'SIGNIFICANT',
  INSUFFICIENT: 'INSUFFICIENT',
});

export const STATUS_LABEL = {
  ACCEPTABLE: 'Acceptable',
  MINOR: 'Minor deviation',
  SIGNIFICANT: 'Significant deviation',
  INSUFFICIENT: 'Cannot assess (not enough data)',
};

// Where a result came from. Shown on every result so a student never mistakes
// a demo or their own landmarks for a trained model's output.
export const SOURCE = Object.freeze({
  REAL_MODEL: 'REAL_MODEL',
  DEMO_MOCK: 'DEMO_MOCK',
  STUDENT_ANNOTATED: 'STUDENT_ANNOTATED',
});

export const SOURCE_LABEL = {
  REAL_MODEL: 'REAL MODEL OUTPUT',
  DEMO_MOCK: 'DEMO / MOCK OUTPUT — not your photo',
  STUDENT_ANNOTATED: 'STUDENT-ANNOTATED (your landmarks)',
};

export const DISCLAIMER =
  'AI-generated measurements are intended for educational guidance and should be ' +
  'verified by a qualified prosthodontist/clinical instructor.';

// acceptable: |value| <= acceptable ; minor: <= minor ; else significant.
export const DEFAULT_TOLERANCES = {
  // Acrylic RPD, per replacement tooth
  rpd_space_fit: { unit: 'mm', acceptable: 0.5, minor: 1.0 },
  rpd_arch_alignment: { unit: 'mm', acceptable: 1.0, minor: 2.0 },
  rpd_ridge_relation: { unit: 'mm', acceptable: 1.0, minor: 2.0 },
  rpd_inclination: { unit: '°', acceptable: 5, minor: 10 },
  rpd_occlusal_plane: { unit: 'mm', acceptable: 0.5, minor: 1.0 },
  rpd_occlusal_contact: { unit: 'contacts' },
  rpd_midline_symmetry: { unit: 'mm', acceptable: 1.0, minor: 2.0 },
  // Complete denture
  cd_midline: { unit: 'mm', acceptable: 1.0, minor: 2.0 },
  cd_upper_lower_midline: { unit: 'mm', acceptable: 1.0, minor: 2.0 },
  cd_occlusal_plane_cant: { unit: '°', acceptable: 2, minor: 4 },
  cd_canine_symmetry: { unit: 'mm', acceptable: 1.0, minor: 2.0 },
  cd_arch_form: { unit: 'mm', acceptable: 1.0, minor: 2.0 },
  // Labial surface of central incisors ~8–10 mm anterior to the incisive papilla centre.
  cd_papilla_incisor: { unit: 'mm', target: 9, acceptable: 1.0, minor: 2.5 },
  cd_inclination_symmetry: { unit: '°', acceptable: 5, minor: 10 },
};

// Used only when no calibration ruler is in the photo. Clearly marked as estimated.
export const ASSUMED_CENTRAL_INCISOR_WIDTH_MM = 8.5;

// Photo checks. Advisory thresholds only warn; retake* thresholds block, and only
// for photos that are genuinely unusable.
export const CAPTURE_QUALITY = {
  minShortSidePx: 480,
  minLuma: 70, maxLuma: 205,
  retakeMinLuma: 22, retakeMaxLuma: 248,
  maxOverexposedFraction: 0.05,
  minSharpness: 40, retakeMinSharpness: 6,
  minSubjectFill: 0.2,          // halved for occlusal views
  maxCentreOffset: 0.25,        // fraction of the frame
};
