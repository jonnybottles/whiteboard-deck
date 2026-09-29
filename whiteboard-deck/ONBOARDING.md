# Whiteboard Deck onboarding

This complete skill creates offline HTML whiteboard presentations by default,
with original SVG handwriting, presenter beats, notes, an accessible transcript,
and citations. Optional PowerPoint export produces a native progressive-slide
adaptation alongside HTML, not equivalent browser animation.

## Install from Git

```powershell
gh repo clone jonnybottles/whiteboard-deck
Set-Location whiteboard-deck
node scripts\verify-distribution.mjs
node scripts\install-skill.mjs
```

The installer verifies and copies the complete payload into
`%USERPROFILE%\.copilot\skills\whiteboard-deck`. Restart the CLI session afterward.
Keep the Git checkout separate from the personal installation. The strict
manifest rejects an extra `.git` directory, modified payload or partial package.

The installer supports `--destination C:\path\to\skills\whiteboard-deck` for a
separate destination. It refuses unrelated or modified existing installations.
It does not install dependencies or create Git/cloud resources.

To update, run `git pull --ff-only`, verify again, and rerun the installer.
Preserve local changes before resolving conflicts; do not force an update over
personal edits. Existing generated projects are independent and are not changed
by a skill update.

## Prerequisites

- Node.js 22.12 or newer, npm, Git, and GitHub Copilot CLI.
- Installed Edge or Chrome for browser validation and optional PowerPoint export.
- Python 3 for optional PowerPoint export/inspection.
- Access to your configured, organization-approved package registry for the
  generated project's initial `npm ci`.
- Microsoft Learn MCP when researching Microsoft products; other topics use
  authoritative primary sources.

The distribution lockfile retains exact versions and integrity hashes but no
registry-specific tarball URLs. No registry override or credential is supplied.
Validation uses the maintainer's approved feed. Other feeds, including the public
registry, have not been verified. If a pinned package is unavailable, report
the failure; do not bypass an IT block or disable integrity checks.

## First use

```text
Use whiteboard-deck to create a three-board offline presentation about Git
branching for new developers. Produce HTML only and include sources.
```

If format is unresolved, the skill asks:

```text
Output format:
1. HTML only (recommended, default)
2. HTML and PowerPoint
```

Declining the format question means HTML only. Explicit format requests are not
asked again. PowerPoint always includes HTML; it is never the only output.

## Build and inspect a generated deck

```powershell
npm ci
npm run build
npm test
npm run test:browser -- --project=edge
```

Use `--project=chrome` when appropriate. The artifact is
`presentations\<slug>.html`; open it directly in a browser. It needs no runtime
server, sign-in, external fonts or internet to present.

The starter contains sample content, not a completed researched deck. Replace
the narrative in `src\content\deck.ts` and verify sources before presenting.

## Optional PowerPoint

```powershell
npm run build:pptx
npm run test:pptx
python scripts\inspect-pptx.py presentations\<slug>.pptx --validate-generated
```

This creates both `presentations\<slug>.html` and
`presentations\<slug>.pptx`. Export uses installed Edge or Chrome locally with
networking disabled, the pinned writer, and the bundled Python inspector.
No Office install, automation, account, cloud converter or upload is required.

PowerPoint preserves the original composition and artwork with a 3000 x 1800
embedded image per completed beat. Slides accumulate in narrative order; the
last beat of each board is its final static board. White 16:9 slides center the
unchanged 5:3 board without stretching or cropping. Speaker notes, visible-label
text, source URLs, checked dates and caveats are editable in native notes; the
final slide retains the entire source ledger.

Canvas labels are not individually editable. There are no native animations,
pen motion or SVG stroke playback. Advance/back moves between slides.
HTML remains the authoritative high-fidelity version and is not itself a
PowerPoint file.

Export validates the OPC package, relationships, image dimensions, slide order
and native notes before publishing. Open/render the new file locally in desktop
PowerPoint when available to check repair warnings and visual quality.
Structural inspection alone does not prove desktop compatibility. Report when
desktop inspection is blocked or unavailable; do not bypass a security warning.

An HTML-only rebuild removes only a verified, unmodified prior same-slug PPTX.
Ownership receipts live in `.build`. Modified/unmanaged files are preserved and
block a conflicting export. If ownership proof is lost, preserve the old file
elsewhere before regenerating; never overwrite a reference document.

## HTML controls

| Control | Action |
| --- | --- |
| Space / Right | Start or finish the next presenter beat |
| Left | Return to the prior completed boundary |
| K | Pause/resume |
| A | Toggle autoplay |
| R | Replay the board |
| N | Notes, transcript and sources |
| F / Esc | Enter/leave borderless presenter view |

## Safety and troubleshooting

- Keep references local; never include their artwork, fonts, text dumps or
  original files in the skill package or generated output without permission.
- Unsupported handwriting characters fail explicitly; use an agreed ASCII
  equivalent or add original ordered strokes.
- Missing browser/Python: report the prerequisite. Export does not download a
  browser or install Office automatically.
- Modified package/installation: preserve edits and obtain a complete verified
  version; do not bypass the manifest.
- Nonempty scaffold destination: choose a new directory or edit the existing
  project instead.
- Refresh current product claims from primary sources. Never infer current
  availability from an old source-check date.
