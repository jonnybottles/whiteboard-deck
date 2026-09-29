# Real handwriting, not a typewriter

The original glyphs in `src\assets\marker-glyphs.ts` use ordered centerline
paths, a 28-unit em, and a baseline at 24. They cover printable ASCII.
Stroke order, disconnected pen lifts, whitespace and punctuation pauses
produce the effect. No installed handwriting font is required.

## Invariants

- Lay out every word before playback; subsequent letters must not shift it.
- Draw the active path progressively with stroke dash offset.
- Move the pen along that path's actual geometry.
- Hide future strokes; an unrevealed round line cap must not leave a dot.
- Lift between separate strokes and characters without drawing travel lines.
- Seed variation once per label/character; replay must reconstruct identical
  geometry, not new random handwriting.
- Serialize pen-writing actions. Several simultaneous pens break the illusion.
- Use the single playback clock for strokes, pen travel, shapes and highlights.
- Reduced motion instantly completes the requested beat and hides the pen.
- Preserve the semantic transcript; do not announce every character.

Do not animate outlines of a regular font and call them handwriting. Do not
replace this engine with changing textContent, per-letter opacity, a CSS
`steps()` width clip, or an image of a completed word.

## Extending glyphs

Add original `M/L/Q/C` centerline strokes with an explicit advance width.
Dot an `i` and cross a `t` as separate strokes. Verify uppercase, lowercase,
repeated letters, descenders, digits and punctuation at final display sizes.
Do not extract outlines or redistribute installed proprietary fonts.

Unknown characters must identify the character and label in an authoring error.
If an ASCII substitution changes meaning, do not make it without agreement.

## Pilot

Before expanding a new design, render a short mixed-case sentence, an arrow,
a cloud and a highlight. Capture a half-written glyph and the completed word.
Check continuity, stroke order, pen-tip alignment, disconnected travel and
readability. Confirm next/back/pause/replay do not leave ghost strokes.
