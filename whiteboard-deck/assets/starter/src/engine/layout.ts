import { getGlyph } from '../assets/marker-glyphs.ts';
import type { Glyph } from '../assets/marker-glyphs.ts';
import type { TextElement } from '../model.ts';

export interface PlacedGlyph {
  character: string;
  index: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  glyph: Glyph;
}

export interface TextLayout {
  glyphs: PlacedGlyph[];
  lines: string[];
  width: number;
  height: number;
}

export function seededValue(seed: string, index: number): number {
  let hash = 2166136261;
  for (const character of `${seed}:${index}`) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function textWidth(text: string, scale: number, context: string): number {
  return [...text].reduce((sum, character) => sum + (getGlyph(character, context).advance + 1.8) * scale, 0);
}

export function layoutText(element: TextElement): TextLayout {
  const scale = element.size / 28;
  const lineHeight = element.lineHeight ?? element.size * 1.32;
  const lines: string[] = [];
  for (const paragraph of element.text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      if (textWidth(word, scale, element.id) > element.maxWidth) {
        throw new Error(`Word ${JSON.stringify(word)} exceeds maxWidth in ${element.id}. Widen the label or reduce its size.`);
      }
      const candidate = line ? `${line} ${word}` : word;
      if (textWidth(candidate, scale, element.id) > element.maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }

  let index = 0;
  const glyphs: PlacedGlyph[] = [];
  for (const [lineIndex, line] of lines.entries()) {
    let x = element.x;
    for (const character of line) {
      const glyph = getGlyph(character, element.id);
      const variation = seededValue(element.id, index);
      glyphs.push({
        character, index, glyph,
        x,
        y: element.y + lineIndex * lineHeight + (variation - 0.5) * 1.3,
        scale,
        rotation: (seededValue(element.id, index + 1000) - 0.5) * 3.2,
      });
      x += (glyph.advance + 1.8) * scale;
      index++;
    }
  }
  return {
    glyphs,
    lines,
    width: Math.max(0, ...lines.map((line) => textWidth(line, scale, element.id))),
    height: Math.max(0, lines.length - 1) * lineHeight + element.size * 1.25,
  };
}
