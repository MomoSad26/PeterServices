---
applyTo: "android/**, .github/workflows/build-apk.yml"
---

For Android or release-workflow changes, read root `AGENTS.md` and the Android/release sections in `docs/PROJECT_CONTEXT.md`. Preserve `applicationId`, the existing signing key and monotonically increasing version codes. The web source lives at the repository root and is copied by `android/sync-web.sh`. Inspect the native WebView bridge, manifest, Gradle configuration, release workflow and app update-check logic when relevant. Never expose signing credentials; do not build or publish unless requested.
