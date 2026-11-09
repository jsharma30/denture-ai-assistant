# Acrylic RPD Pilot Dataset — Annotation Protocol (v1.0)

This is the rulebook for the 50-case acrylic removable partial denture (RPD)
pilot dataset. Everyone who photographs or labels a case follows it, so that
every case is labelled the same way and can later be used to train and test
the app.

Nothing is trained during the pilot. The goal is a clean, consistent,
well-checked set of photos and labels.

---

## 1. Scope

- **Included:** acrylic RPDs only, i.e. acrylic denture base, acrylic or
  composite artificial teeth, and wrought-wire clasps if present.
- **Not included:** cast metal frameworks, major connectors, rests, cast
  clasps, or complete dentures. Do not label these, and do not add a case
  that uses them.
- Photos may be of the denture **on the cast/articulator** or **in the
  mouth**. Record which one in the case register (`setting` column).

## 2. Before photographing

1. **Consent.** Only photograph a case once written consent for educational
   use is recorded (`consent` column = Yes). No consent means no photos.
2. **No identifiers.** No faces (crop the frame to the mouth or lips), names,
   hospital numbers, dates or patient labels in the photo. Turn off location
   (GPS) on the camera or phone.
3. **Calibration ruler.** Recommended. Place a small millimetre ruler (or a
   10 mm marker) in the same plane as the teeth so real sizes can be
   measured. If there's no ruler, sizes are estimated from the central
   incisor width, which is less accurate.
4. **Never edit the photo.** No cropping, filters, rotation, retouching or
   "enhance". The **only** change allowed is renaming the file (section 3).
   Labels are drawn on top in the annotation tool; the photo itself stays
   untouched.

## 3. The 5 photos per case

Every case has exactly these 5 photos. Rename each one as shown, where
`RPD-007` is the case ID:

| # | View | File name | What it must show |
|---|---|---|---|
| 1 | Maxillary arch | `RPD-007_1_maxillary_arch.jpg` | Upper arch from directly below (occlusal view, mirror allowed), all teeth from the last molar on one side to the last molar on the other, plus the palate |
| 2 | Mandibular arch | `RPD-007_2_mandibular_arch.jpg` | Lower arch from directly above (occlusal view), all teeth from last molar to last molar |
| 3 | Anterior view | `RPD-007_3_anterior.jpg` | Front view, teeth in occlusion, canine to canine at minimum, camera level with the occlusal plane |
| 4 | Edentulous / replacement-tooth region | `RPD-007_4_replacement_region.jpg` | Close-up of the replaced teeth with at least one natural tooth on each side (or the last natural tooth for a free-end saddle) |
| 5 | Replacement-tooth region in occlusion | `RPD-007_5_replacement_occlusion.jpg` | Same region from the side with the jaws closed, so the contact with the opposing teeth is visible |

**Mirror rule:** occlusal mirror photos are flipped left↔right. Label every
tooth with its true anatomical FDI number anyway (for example, the patient's
right first molar is always 16, whichever side of the picture it is on). Tick
`mirrored = Yes` in the case register.

**If the RPD replaces teeth in two separate regions**, photos 4 and 5 show the
region with the most replaced teeth. Write the other region in the notes.

A photo that is a little dark, tilted or off-centre is still fine. The app
only refuses a photo that is genuinely unusable (completely blurred,
completely dark or completely washed out). Retake only those.

## 4. Annotation tool

Use **CVAT** (free, https://app.cvat.ai). It works in a browser.

1. Create a project called `RPD pilot`.
2. Under **Constructor → Raw**, paste the whole contents of `cvat_labels.json`
   and press **Done**. This loads the exact labels below. Never rename them;
   the app reads these exact names.
3. Create one task per case (`RPD-007`) and upload its 5 photos.
4. When finished, **Export task dataset → CVAT for images 1.1**, and save the
   exported zip into the case's `annotations/` folder.

| Shape in CVAT | Used for |
|---|---|
| Rotated rectangle (box, then rotate) | Each tooth |
| Polygon | Denture base, edentulous space |
| Polyline | Clasps, midlines, ridge crest, ruler, occlusal plane |
| Point | Small landmarks (papilla, canine tip, cusp, contacts) |

## 5. How to label teeth (all views)

Label a tooth if **at least one third of its crown is visible**.

Draw a **rotated rectangle** that fits tightly around the visible crown:

- **Occlusal views (1 and 2):** the long sides of the box run
  **mesiodistally**, along the arch. Rotate the box so that it follows the
  arch curve at that tooth. One long edge touches the most buccal point of
  the crown and the other the most lingual or palatal point.
- **Facial and close-up views (3, 4 and 5):** the box is upright along the
  tooth's long axis. **One short edge sits on the incisal edge or cusp tips,
  and the opposite edge on the cervical margin** (the gingival or
  denture-base margin). Rotate it to match the tooth's inclination; the
  rotation itself is what the app uses to measure inclination.
- Do not include the gingiva, the acrylic flange or the neighbouring tooth.

Set these attributes on every tooth:

| Attribute | Values | Rule |
|---|---|---|
| `fdi` | 11–18, 21–28, 31–38, 41–48 | True anatomical number, even in mirror photos |
| `kind` | `natural` / `artificial` | Artificial = a denture tooth |
| `visibility` | `full` / `partial` | Partial = between one third and most of the crown visible |
| `fdi_uncertain` | Yes / No | Yes when you are not sure of the number; the reviewer decides |

Each FDI number appears **at most once per photo**.

## 6. What to label in each view

**General rule: if a landmark is not visible, do not guess. Leave it out and
write its name in the QC sheet column "Not visible".**

### View 1 — Maxillary arch

| Label | Shape | How |
|---|---|---|
| `TOOTH` | Rotated rectangle | Every visible upper tooth, natural and artificial (section 5) |
| `DENTURE_BASE` | Polygon | Outline of the visible acrylic plate |
| `EDENTULOUS_SPACE` | Polygon | Each gap the RPD fills, outlined along the ridge between the abutment teeth. Attribute `replaced_teeth`, e.g. `14,15` |
| `CLASP` | Polyline | Follow the wire from the acrylic to its tip. Attributes `abutment` (FDI) and `type` (`circumferential`, `adams`, `ball_ended`, `other`) |
| `INCISIVE_PAPILLA` | Point | Centre of the papilla (only if not covered by acrylic) |
| `ARCH_MIDLINE` | Polyline, 2 points | Along the mid-palatal raphe. First point anterior (near the papilla), second posterior |
| `CANINE_TIP` | Point | Cusp tip of each visible canine. Attribute `fdi` |
| `MOLAR_MB_CUSP` | Point | Mesiobuccal cusp tip of each first molar. Attribute `fdi` |
| `CALIBRATION_MARKER` | Polyline, 2 points | Two ruler marks exactly 10 mm apart. Attribute `length_mm` = 10 |

### View 2 — Mandibular arch

As view 1, with these differences:

- no `INCISIVE_PAPILLA`;
- `ARCH_MIDLINE` runs from between the lower central incisors (or the lingual
  frenum) to the midpoint between the retromolar pads;
- add `EDENTULOUS_RIDGE`: a polyline along the crest of the residual ridge in
  each edentulous area, from mesial to distal.

### View 3 — Anterior view

| Label | Shape | How |
|---|---|---|
| `TOOTH` | Rotated rectangle | Every visible tooth, upper and lower |
| `DENTAL_MIDLINE` | Polyline, 2 points | Contact between the upper central incisors: incisal end first, then cervical |
| `MANDIBULAR_DENTAL_MIDLINE` | Polyline, 2 points | The same between the lower central incisors |
| `REFERENCE_MIDLINE` | Polyline, 2 points | The facial or arch midline used for comparison (upper labial frenum, or the philtrum if lips are visible): top point first |
| `OCCLUSAL_PLANE` | Polyline | Through the incisal edges and cusp tips of the upper teeth, from the patient's right to left |
| `CALIBRATION_MARKER` | Polyline, 2 points | As view 1, if a ruler is in the frame |

### View 4 — Edentulous / replacement-tooth region

| Label | Shape | How |
|---|---|---|
| `TOOTH` | Rotated rectangle | Each replacement tooth and the natural teeth next to it |
| `EDENTULOUS_SPACE` | Polygon | The space as it would be without the RPD: from the distal surface of one abutment to the mesial surface of the next, along the ridge |
| `EDENTULOUS_RIDGE` | Polyline | Ridge crest under the replacement teeth (if visible) |
| `DENTURE_BASE` | Polygon | Visible acrylic flange |
| `CLASP` | Polyline | As view 1 |
| `OCCLUSAL_PLANE` | Polyline | Through the cusp tips of the natural teeth on both sides of the space |
| `CALIBRATION_MARKER` | Polyline, 2 points | As view 1 |

### View 5 — Replacement-tooth region in occlusion

| Label | Shape | How |
|---|---|---|
| `TOOTH` | Rotated rectangle | Replacement teeth, neighbouring natural teeth and the opposing teeth |
| `OCCLUSAL_CONTACT` | Point | Each place where a replacement tooth visibly touches an opposing tooth. Attribute `fdi` = the replacement tooth |
| `OCCLUSAL_PLANE` | Polyline | As view 4 |
| `CALIBRATION_MARKER` | Polyline, 2 points | As view 1 |

## 7. Expert grading of each replacement tooth

The clinical instructor fills in the **Replacement-tooth assessment** sheet:
one row per artificial tooth. Grade each of the 7 parameters as
**Acceptable**, **Minor deviation**, **Significant deviation** or
**Cannot assess** (photo does not show it). These grades are the "ground
truth" the app will later be compared with.

| # | Parameter | What is judged | Suggested guide (confirm with your department) |
|---|---|---|---|
| 1 | Space fit | The tooth fills the space mesiodistally: no gap, no overlap | Gap/overlap ≤0.5 mm acceptable, ≤1 mm minor |
| 2 | Arch alignment | Buccolingual position follows the arch curve of the natural teeth | ≤1 mm off the curve acceptable, ≤2 mm minor |
| 3 | Ridge relation | Tooth sits over the ridge crest (posteriors) | ≤1 mm acceptable, ≤2 mm minor |
| 4 | Long-axis inclination | Matches neighbouring teeth / the expected inclination | ≤5° acceptable, ≤10° minor |
| 5 | Occlusal plane level | Incisal edge or cusp tips level with the adjacent natural teeth | ≤0.5 mm step acceptable, ≤1 mm minor |
| 6 | Occlusal contact | Contacts the opposing teeth in occlusion | Contact acceptable, light/one cusp minor, none significant |
| 7 | Midline and symmetry | Anterior replacements only: midline and symmetry with the contralateral tooth | ≤1 mm acceptable, ≤2 mm minor; posteriors = "Cannot assess" |

Optional measurement columns (mm or °) may be filled when a ruler is in the
photo.

## 8. What counts as an acceptable annotation

A photo's annotation is **accepted** only when all of these are true:

1. **Complete.** Every required label for that view is present, or listed as
   "Not visible".
2. **Tooth numbers correct.** Every FDI number is correct and appears once.
3. **Boxes tight and oriented.** Box edges are within about 0.5 mm of the
   crown outline, and oriented as in section 5.
4. **Points accurate.** Points are within about 0.5 mm of the true landmark.
5. **Point order.** Two-point lines are drawn in the stated order.
6. **No guessing.** Nothing is drawn where it is not visible.
7. **Original photo.** The file is the camera original, only renamed.

The reviewer fills in the **Annotation QC** sheet (5 rows per case, one per
photo). The `Accepted` column turns **Yes** automatically when every check is
Yes.

### Double annotation (consistency check)

10 of the 50 cases (suggested: RPD-005, 010, 015 … 050) are labelled
independently by a second annotator. Targets:

| Measure | Target |
|---|---|
| FDI numbers agree | 100% |
| Tooth box overlap (IoU) | ≥ 0.75 |
| Landmark points | ≤ 1 mm apart |
| Expert grades agree | ≥ 80% |

If a target is missed, discuss the differences, update this protocol (raise
the version number) and re-check the affected cases.

## 9. Step by step (no coding needed)

1. Give the case the next free ID in `case_register.xlsx` (RPD-001 … RPD-050).
2. Record consent, Kennedy class, replaced teeth and setting in that row.
3. Take the 5 photos (section 3) and rename them.
4. Make a folder `cases/RPD-007/` with `photos/` and `annotations/` inside
   (copy the `RPD-000_EXAMPLE` folder and rename it). Put the 5 photos in
   `photos/`.
5. Label the photos in CVAT (sections 4–6) and export to `annotations/`.
6. Tick the photo columns in the register. "Ready" turns Yes once consent and
   all 5 photos are in.
7. The reviewer fills in **Annotation QC** for each photo.
8. The instructor fills in **Replacement-tooth assessment**.

**Storage:** real case folders contain patient photos. Keep them on secure
institutional storage, **not** in the public GitHub repository. The
repository is set to ignore everything in `cases/` except the example.
