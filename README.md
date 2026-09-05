# Patina Humanizer for Obsidian

Inspect a note locally, open a full writing audit, or review a verified rewrite
of a selection before applying it. The plugin uses Patina CLI; it embeds no
model and stores no provider key.

Commands: **Score current note**, **Audit current note**, **Humanize selection**,
and **Install or update CLI**. Configure language, backend, CLI path and score
threshold in settings. Background scoring uses offline npm resolution. Only the
explicit installation command downloads a package.

Requires a desktop local vault and Patina CLI with `patina inspect`. Explicit
audit/rewrite actions can send text through the backend configured in your CLI.
Rewrites require confirmation and refuse to overwrite a changed or closed note.
Scores are editing hints, not authorship probabilities.

The plugin ID is `patina-humanizer`; the unrelated `patina` ID is already used
in the community directory. Development: `npm ci`, `npm test`, `npm run build`.
Release assets are `main.js`, `manifest.json`, and `styles.css`.
