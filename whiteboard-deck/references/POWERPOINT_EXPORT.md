# Optional native PowerPoint adaptation

HTML is the default and authoritative artifact. Resolve output format at the
start of a deck request: HTML only (recommended/default), or HTML and PowerPoint.
Ask only when unresolved; declining the format question means HTML only.
Explicit PowerPoint means both artifacts, never PPTX alone.

## Fidelity contract

| Preserved | Different from HTML |
| --- | --- |
| Original handwriting artwork, colors and diagram relationships | Board artwork is an embedded 3000 x 1800 PNG, not editable stroke/text objects. |
| Fixed 1500 x 900 board composition | Native 16:9 slides center the 5:3 board on white with side margins. |
| Every board and completed presenter beat, in order | One cumulative slide per beat; no native animations or pen motion. |
| Completed final board | The last beat of each board is the static final board; no duplicate final slides. |
| Speaker notes and visible-label transcript | Editable native notes, not the HTML companion UI. |
| Source URLs, checked dates, supports summaries and caveats | Plain-text citations in notes; the final slide's notes retain the full source ledger. |
| Offline operation | PowerPoint controls replace the HTML player's clock, speed and autoplay controls. |

Do not promise equivalent SVG path drawing, typewriter handwriting, fades that
imitate writing, or unsupported animation metadata. If individually editable
canvas labels or real stroke animation are essential, explain this export's
limits rather than silently substituting another representation.

## Commands and prerequisites

```powershell
npm ci
npm run build
```

HTML only: `presentations\<slug>.html`. The ordinary build does not invoke a
browser, Python or the PowerPoint generator.

```powershell
npm run build:pptx
npm run test:pptx
```

Combined output: `presentations\<slug>.html` and `presentations\<slug>.pptx`.
`build:pptx` first performs the normal HTML build, then captures and structurally
validates the native adaptation. `test:pptx` explicitly exercises export; do not
run it as part of an HTML-only authoring request.

Optional export needs Python 3 and an installed Edge or Chrome in addition to
the normal Node/npm dependencies. Export tries Edge, then Chrome; it never
downloads a browser. Dependencies are exact-pinned through the configured npm
feed; the PowerPoint writer is `@jsamuel1/pptxgenjs` 5.0.9. Neither finished file
requires a runtime server, user account or network. Office is not needed to
generate the file. No content is uploaded.

## Rendering and lifecycle

The export-only capture entry imports the existing deck, renderer, palette and
compiled timeline, not a second narrative. It renders exact completed beat
boundaries and removes future targets before capture, including effects that
start at the same timestamp as the preceding beat ends. Original element order
preserves highlights behind labels. Real transformed stroke bounds are checked.

Slide size is 13 1/3 x 7.5 inches. Board placement is x = 5/12, y = 0,
width = 12.5, height = 7.5 inches. There is no stretching, cropping, browser
chrome, pen or external media.

An ignored `.build\<slug>.pptx-receipt.json` records ownership and hashes.
An HTML rebuild removes only a matching, unmodified, exporter-owned PPTX and
receipt. Unmanaged or modified files are preserved with a warning; combined
export refuses to overwrite a conflicting file. Never delete arbitrary PPTX
files to fix a collision. Losing `.build` also loses ownership proof.

New output is captured and validated in run-owned staging, then published
exclusively. Failed exports do not report success or revive an old verified
artifact. Temporary capture pages and images are cleaned up.

## Inspection

In a generated project:

```powershell
python scripts\inspect-pptx.py presentations\<slug>.pptx --validate-generated
```

The standard-library inspector checks package integrity, required parts and
relationships, slide order/identity, white widescreen dimensions, image placement
and resolution, native notes, and offline/protected-content constraints.
During export it additionally compares every embedded image hash and expected
note/source line to capture metadata. It does not extract reference assets or
modify the input. Pattern checks are not a guarantee of detecting every secret.

Inspect complete boards and progressive frames for legibility, arrow direction,
containment and ordering. Open the resulting file locally in desktop PowerPoint
when available; verify no repair dialog, correct slide count, readable notes,
white canvas and expected rendering. Use approved computer-use tools for direct
UI inspection, not newly introduced Office automation. Do not bypass security
warnings or save an auto-repaired file. Report unperformed/blocked desktop checks.

## Primary library documentation

- Notes: `https://jsamuel1.github.io/PptxGenJS/docs/speaker-notes/`
- Images: `https://jsamuel1.github.io/PptxGenJS/docs/api-images/`
- Layout: `https://jsamuel1.github.io/PptxGenJS/docs/usage-pres-options/`
- Pinned release: `https://github.com/jsamuel1/PptxGenJS/releases/tag/v5.0.9`

Checked September 24, 2026. Use the pinned release's TypeScript signatures;
documentation examples can differ between versions.
