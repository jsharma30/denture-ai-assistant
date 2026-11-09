# Denture AI Assistant

An educational app for BDS students that checks complete denture (CD) and
acrylic removable partial denture (RPD) tooth arrangement against
prosthodontic principles.

> **Safety notice:** AI-generated measurements are intended for educational
> guidance and should be verified by a qualified prosthodontist/clinical
> instructor. The app never gives an autonomous clinical diagnosis.

## Use it

| Where | How |
|---|---|
| **iPad / any browser** | https://jsharma30.github.io/denture-ai-assistant/ (after GitHub Pages is switched on: Settings → Pages → Branch `gh-pages` / `(root)` → Save) |
| **Android** | Actions tab → **Android APK** → latest green run → Artifacts → `denture-ai-assistant-apk` |
| **Edit the code** | On github.com, open the repository and press the <kbd>.</kbd> key: VS Code opens in the browser |

## What it does

- **Acrylic RPD (5 photos):** maxillary arch, mandibular arch, anterior view,
  edentulous/replacement-tooth region, and replacement region in occlusion.
  Kennedy class is worked out from the replaced teeth. Each replacement tooth
  is graded for space fit, arch alignment, ridge relation, inclination,
  occlusal plane level, occlusal contact and (front teeth) midline & symmetry.
- **Complete denture (3 photos):** midlines, occlusal plane cant, canine
  symmetry, arch form, incisor–papilla distance, inclination symmetry.
- **Grades:** Acceptable / Minor deviation / Significant deviation / Cannot
  assess. Missing landmarks are never guessed.
- **Flexible photo checks:** 🟢 good, 🟡 usable with friendly tips (glare,
  dark, soft, off-centre), 🔴 only for genuinely unusable photos.
- **Original photos are never altered.** Marks are drawn on a separate layer;
  "View original" shows the untouched file; a SHA-256 check confirms the
  photo analysed is byte-identical to the one taken.
- **Every result is labelled** REAL MODEL OUTPUT, DEMO / MOCK, or
  STUDENT-ANNOTATED. No model is trained yet, so "Try AI model" says so
  honestly instead of inventing detections.
- Learn page, clinical-check list, and progress tracking (scores only,
  stored on the device, no photos).

## Project layout

| Folder | Contents |
|---|---|
| `web/` | Browser app and the clinical rules engine (`web/engine/`), with tests |
| `android/` | Android app that runs the same screens and engine |
| `backend/` | Optional model server: real detections only when trained weights exist |
| `ml/` | Pilot dataset protocol (`ml/pilot_rpd/`), CVAT converter, training recipe |
| `.github/workflows/` | Automatic tests, website publishing and APK build |

## Tests

```bash
cd web && npm install && npm test          # engine
python3 -m http.server 8080 &  npm run e2e   # whole app in a browser
cd ../backend && pip install -r requirements-dev.txt && pytest
cd ../ml && pytest tests
```

These run automatically on GitHub after every change.
