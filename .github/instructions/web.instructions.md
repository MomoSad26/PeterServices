---
applyTo: "index.html, styles.css, prefs.js, sw.js, js/**/*.js"
---

For web changes, read root `AGENTS.md` and `docs/INVARIANTS.md`, then use `PROJECT_MAP.md` and the relevant rows of `docs/DEPENDENCY_MAP.md`. Keep classic-script global scope and load order intact. New scripts must be listed in both `index.html` and `sw.js`; evaluate cache-version changes. Changes to persisted data must consider existing device data and backup import/export. Check shared callers and side effects rather than editing a module in isolation.
