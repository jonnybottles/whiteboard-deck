# Validate the artifact, not just the source

## Content and build

- Replace the starter's sample narrative with topic-appropriate content.
- Every element has a reveal; every cited source exists and supports the claim.
- Refresh current/preview claims and record a real checked date.
- Run `npm run build` and `npm test`.
- Confirm that `presentations\<slug>.html` is the newly generated artifact.
- The artifact must not contain a reference document, copied source images,
  secrets, machine-specific paths, external fonts or asset dependencies.
- For HTML only, do not run the optional PPTX export suite. The ordinary build
  removes only a verified prior same-slug export; unmanaged files are preserved.
- Only when PowerPoint is selected, run `npm run build:pptx` and
  `npm run test:pptx`. Verify both current artifact paths and native notes/source
  information. The export itself validates the OPC package against captured
  images and beat metadata before publication.

## Browser behavior

Run the included browser smoke test against an installed browser. Use
`--project=edge` or `--project=chrome` as appropriate. Do not claim browsers
that were not exercised.

- Copy only the HTML into a new folder whose path contains spaces.
- Open it using `file:` with networking disabled.
- Traverse every board and reveal; observe zero HTTP(S) asset/API requests.
- Confirm real partial strokes and a pen aligned to the active path.
- Test next while drawing, next while paused, back, replay, board switching,
  pause/resume, speed changes and autoplay.
- Test reduced motion, keyboard-only use, visible focus, readable transcript,
  fullscreen, and narrow-screen controls.
- In presenter view, only the borderless white canvas is visible: no toolbar,
  title bar, progress strip, notes panel or intro overlay. Check Right/Left
  navigation immediately after entering, and across board boundaries. Esc/F
  must restore normal controls without changing the current drawing.
- Verify the full viewport stays white in dark mode and at wide/portrait
  aspect ratios. Fit the complete SVG without cropping or stretching it.
- A source link may open external documentation only after an explicit click;
  it must not also advance a step.

If automating partial-stroke capture, install an observer before playback and
pause when a real stroke becomes partial. Polling a brief first-letter window
after clicking can miss the window under load and create a flaky test.

## Visual review

Inspect every completed board and representative intermediate frames.

- No text overlap, clipped labels, or cramped line wrapping.
- No cloud outline through a title, descender or first/last letter.
- Arrows terminate at the intended element and avoid text.
- Highlights stay behind their labels.
- Clear reading order, contrast and whitespace.
- Later labels remain hidden until their intended beat.
- Final layouts do not change between replay and direct completion.
- The pen lifts between strokes; no scratches join disconnected letters.

A passing geometric text-collision test does not prove cloud containment or
correct flow direction. Fix visual issues and re-render the affected boards.

## Optional native PowerPoint

- Every compiled beat becomes one cumulative slide, with no future targets in
  the captured frame. Check intermediate frames as well as each final board.
- Verify the white 16:9 canvas, unchanged board aspect ratio, notes, full source
  ledger, and embedded 3000 x 1800 image dimensions.
- The generated-mode inspector checks required OPC parts, relationships, slide
  placement/order, images, notes and protected-content/external-asset rules.
- Open/render locally in installed desktop PowerPoint when possible. Check for
  repair warnings, missing images, clipped content and unreadable notes.
- Never imply that a structurally valid ZIP proves it opens without repair.
  Record which desktop version was actually inspected, or state the limitation.
- Check error paths: unknown/modified PPTX files remain intact, failed exports
  cannot be mistaken for fresh output, and temporary capture files are cleaned.

## Reusable-package check

The generated personal package must include its starter, scripts and references.
Scaffold into a clean folder without the canonical project in the working
directory. Build and open a different-topic sample from that folder.
Use a genuinely isolated directory outside the source workspace and its
`node_modules` ancestry; run the generated project's own `npm ci`. Verify both
ordinary HTML-only and explicit combined builds, its bundled Python inspection,
and its browser tests. All export files and their hashes must appear in the
package manifest. For the Git distribution, verify a clean clone and its
installed payload without copying Git metadata into the skill.

The scaffold helper must reject a nonempty target, invalid slug, missing bundle
or modified package. Installation must refuse unrelated/modified existing files.

## Post-run reflection

Check that the workflow solved the actual task:

- Was the result a complete topic deck rather than the unchanged starter?
- Was motion visibly drawn inside each character?
- Did reference analysis inspect animations as well as screenshots?
- Were claims primary-source grounded and appropriately qualified?
- Did the isolated artifact work without sibling files or network access?
- Were original documents and account/credential state preserved?
- Were any checks blocked or skipped, and was that stated accurately?

Record concrete defects and fixes in the session. Suggest canonical maintenance
only for repeatable lessons; do not silently modify installed copies or publish
anything the user did not authorize.
