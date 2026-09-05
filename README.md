# Patina Humanizer for Obsidian

Inspect a note locally, open a full writing audit, or review a verified rewrite
of a selection before applying it. The plugin uses Patina CLI; it embeds no
model and stores no provider key.

Commands: **Score current note**, **Audit current note**, **Humanize selection**,
and **Install or update CLI**. Configure language, backend, CLI path and score
threshold in settings. Background scoring uses offline npm resolution. Only the
explicit installation command downloads a package.

Requires Obsidian 1.13.7 or newer, a desktop local vault, and Patina CLI 8.2.0
or newer. Explicit
audit/rewrite actions can send text through the backend configured in your CLI.
Rewrites require confirmation and refuse to overwrite a changed or closed note.
Scores are editing hints, not authorship probabilities.

The plugin ID is `patina-humanizer`; the unrelated `patina` ID is already used
in the community directory. Development: `npm ci`, `npm test`, `npm run build`.
Release assets are `main.js`, `manifest.json`, and `styles.css`.

For manual installation, create `.obsidian/plugins/patina-humanizer/` inside
your vault and copy those three release assets into it. Restart Obsidian, enable
**Patina Humanizer** in Community plugins, then run **Patina Humanizer: Install
or update CLI** from the command palette. Community-directory registration is
a separate step; manual installation does not require it.

Validation includes an isolated Obsidian 1.13.7 host, local score inspection,
live Kimi audit/verified-rewrite commands, preview/discard/apply guards and
automatic score updates. Other desktop operating systems have not received
the same host verification. The plugin embeds no model or provider credential.
