# Agent instructions

- Start with `PROJECT_MAP.md`; read only the task's module and direct dependencies.
- Consult relevant sections of `docs/PROJECT_CONTEXT.md`; use `docs/CHANGELOG.md` for recent decisions.
- Avoid full-repo scans. Code is authoritative; verify details that may have changed.
- JS uses ordered classic scripts/global scope. New JS files must be added to `index.html` and `sw.js`; review the SW cache version.
- Preserve local data/schema compatibility. Never reset or migrate user data without an explicit safe plan.
- Preserve Android `applicationId` and signing key. Never expose, replace or regenerate the keystore/credentials.
- Update docs for durable behavior/architecture changes. Do not build or publish when the user says not to.
- Review the diff and summarize changed files and effects before finishing.
