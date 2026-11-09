# Android app

A native Android app that runs the same screens and clinical engine as the
browser version (`../web`), copied into the APK at build time, so the phone
and browser always give the same results. It works offline.

- Photos come straight from the camera app or gallery and are never edited.
- Results keep the REAL MODEL / DEMO-MOCK / STUDENT-ANNOTATED labels.

## Getting the APK (no coding)

GitHub builds it automatically: open the repository's **Actions** tab →
**Android APK** → the latest green run → **Artifacts** →
`denture-ai-assistant-apk`. Unzip and install `app-debug.apk` on an Android
phone (allow "install unknown apps" when asked).

## Building yourself

Open this `android/` folder in Android Studio and press Run, or
`./gradlew assembleDebug`.
