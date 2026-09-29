# Deck authoring contract

Edit `src\content\deck.ts`. The starter imports typed helpers and exports `deck`.
Geometry uses a 1500 x 900 SVG viewBox. All elements persist once revealed.

The same model is the sole source for optional PowerPoint export. Each completed
beat becomes a cumulative native slide; the renderer's compiled timeline governs
visibility. Preserve truthful custom-path bounds, original element layering,
per-beat notes and source IDs. Do not maintain separate PowerPoint content.
The board stays 5:3 and is centered on a 16:9 white slide without distortion.

## Structure

```typescript
import type { Deck } from '../model.ts';
import { arrow, beat, box, text } from './helpers.ts';

export const deck: Deck = {
  id: 'sample-story',
  title: 'A sample story',
  subtitle: 'A whiteboard field guide',
  caption: 'An illustrative explanation.',
  sources: [],
  boards: [{
    id: 'overview',
    title: 'The big picture',
    theme: '01 / UNDERSTAND',
    intro: 'Start with one idea.',
    description: 'Two connected ideas form a flow.',
    elements: [
      text('title', 70, 50, 50, 'Connect two ideas', 1300),
      box('first', 200, 330, 340, 190),
      text('first-label', 252, 380, 32, 'First idea', 290),
      arrow('connection', [[550, 425], [920, 425]]),
      box('second', 930, 330, 340, 190),
      text('second-label', 970, 380, 32, 'Next idea', 285),
    ],
    beats: [
      beat('frame', 'Frame the idea', ['title'], 'Introduce the purpose.'),
      beat('first', 'Draw the first part', ['first', 'first-label'], 'Explain the first part.'),
      beat('connect', 'Connect the parts', ['connection', 'second', 'second-label'], 'Explain direction and meaning.'),
    ],
  }],
};
```

The starter is a scaffold, not researched content. Replace its sample narrative.

## Elements and sequencing

| Helper | Purpose |
| --- | --- |
| `text(id, x, y, size, value, maxWidth, color?, source?)` | Stroke-written text; optional source ID creates an accessible link. |
| `box(id, x, y, width, height, color?, kind?)` | Hand-drawn box, cloud, ellipse or highlight. |
| `arrow(id, points, color?)` | Connected line segments with a drawn arrowhead. Points use board coordinates. |
| `path(id, x, y, width, height, paths, color?)` | Custom paths use coordinates local to x/y. Declare truthful bounds. |
| `beat(id, title, targets, notes, sources?)` | One presenter beat; each target is an element ID or action object. |

Colors: `ink`, `blue`, `rose`, `muted`, `amber`. Use the existing theme tokens,
not inline colors or new external fonts.

Each element must appear exactly once across its board's beats. IDs must be
lowercase letters/digits/hyphens and begin with a letter. Highlights belong
before their text in the element array (layer order), even if revealed later.

An action may specify `effect`, `withPrevious`, `delay`, or `duration`.
Text always uses `write`. Other elements can `draw`, `fade`, `descend`, `wipe`,
`bars`, or `wheel`. Ink actions share one serial writing track even when a
with-previous group is requested. Avoid long blocks of simultaneous writing.

## Layout

- Leave breathing room at the canvas edges and around arrow endpoints.
- Plan complete text layout before animating. `maxWidth` wraps whole words;
  explicit `\n` gives intentional line breaks.
- Check the actual glyph widths. Handwritten labels can be wider than a normal
  font of the same nominal size.
- Keep canvas labels short and move detail to notes.
- Cloud top scallops are not rectangular padding: inspect the rendered contour
  around the first and last letters.
- Arrows must not cut through labels. A connector label belongs beside the
  path, not on top of it.

Build validation rejects missing/duplicate reveals, invalid IDs and sources,
unsupported glyphs, basic overflow and text-to-text collisions. Actual path
geometry, arrow meaning and cloud containment still require visual inspection.

## Sources

Each source has `id`, `title`, `url`, `checked` (YYYY-MM-DD), `supports`, and
`caveat`. Use credential-free HTTPS primary sources. Cite the source IDs in the
relevant beat. Store concise paraphrases, not copied articles. Preview status,
region, configuration and API/portal distinctions belong in the caveat.

No runtime source fetch occurs. Links open only on deliberate selection.
