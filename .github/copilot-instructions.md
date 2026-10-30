# GitHub Copilot instructions

Read the root `AGENTS.md` and `docs/INVARIANTS.md` first. They are the shared source of truth for workflow, architecture and non-negotiable safety constraints. Then use `PROJECT_MAP.md` to select files and `docs/DEPENDENCY_MAP.md` to identify dependencies and suggested checks. Read only the target files and relevant callers; do not scan the repository by default.

Preserve local-data compatibility, classic-script load order, service-worker cache coverage, Android package identity and signing key. Keep the APK workflow manual-only; never add automatic triggers or build/publish without an explicit user request. Do not expose customer data, backup keys or signing credentials. Update durable documentation after meaningful architectural or business-rule changes.
