import { mkdtemp, readFile, rm, writeFile, realpath } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import PptxGenJS from '@jsamuel1/pptxgenjs';
import { artifactPaths, exists, publishPptx, sha256 } from './pptx-artifacts.ts';
import { openCapture } from './capture-pptx.ts';
import type { PresenterFrame } from '../src/export/frames.ts';

export interface InspectedFrame extends PresenterFrame { imageSha256: string }

export async function inspectGenerated(root: string, file: string, expected?: string): Promise<string> {
  const local = join(root, 'scripts', 'inspect-pptx.py');
  const script = await exists(local) ? local : join(root, '.github', 'skills', 'whiteboard-deck', 'scripts', 'inspect-pptx.py');
  const args = [script, file, '--validate-generated', ...(expected ? ['--expected', expected] : [])];
  const result = spawnSync('python', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw new Error(`Python 3 is required for PPTX inspection: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`PPTX inspection failed:\n${result.stderr || result.stdout}`);
  return result.stdout;
}

export async function exportPptx(root: string): Promise<string> {
  const paths = await artifactPaths(root);
  if (!await exists(paths.html)) throw new Error('Build the HTML before exporting PowerPoint.');
  if (await exists(paths.target) || await exists(paths.receipt)) throw new Error('PPTX output already exists. Run npm run build:pptx for safe ownership-aware cleanup.');
  const htmlHash = sha256(await readFile(paths.html));
  const stage = await mkdtemp(join(root, '.build', 'pptx-export-'));
  try {
    const frames: InspectedFrame[] = [];
    const pptx = new PptxGenJS();
    pptx.defineLayout({ name: 'WHITEBOARD_WIDE', width: 40 / 3, height: 7.5 });
    pptx.layout = 'WHITEBOARD_WIDE';
    pptx.author = 'whiteboard-deck';
    pptx.subject = 'whiteboard-deck progressive-slide adaptation';
    pptx.company = '';
    const capture = await openCapture(root, stage);
    try {
      const info = await capture.page.evaluate(() => window.whiteboardExport.info());
      pptx.title = info.title;
      for (let index = 0; index < info.count; index++) {
        const frame = await capture.page.evaluate((value) => window.whiteboardExport.render(value), index);
        const image = await capture.page.locator('#capture').screenshot({ type: 'png', scale: 'device', animations: 'disabled' });
        if (image.readUInt32BE(16) !== 3000 || image.readUInt32BE(20) !== 1800) throw new Error('Unexpected capture resolution.');
        const slide = pptx.addSlide();
        slide.background = { color: 'FFFFFF' };
        slide.addImage({
          data: `image/png;base64,${image.toString('base64')}`,
          x: 5 / 12, y: 0, w: 12.5, h: 7.5,
          altText: `${frame.key}\n${frame.labels.join('\n')}`,
          objectName: frame.key,
        });
        slide.addNotes(frame.notes.join('\n'));
        frames.push({ ...frame, imageSha256: sha256(image) });
      }
      capture.check();
    } finally {
      await capture.close();
    }
    const expected = join(stage, 'expected.json');
    await writeFile(expected, JSON.stringify({ schema: 1, frames }));
    const staged = join(stage, `${paths.slug}.pptx`);
    await pptx.writeFile({ fileName: staged, compression: true });
    await inspectGenerated(root, staged, expected);
    if (sha256(await readFile(paths.html)) !== htmlHash) throw new Error('The HTML changed during export. Rebuild both outputs.');
    const target = await publishPptx(root, staged, frames.length);
    console.log(`Exported ${target} (${frames.length} progressive slides; embedded artwork, native notes and sources).\nHTML: ${paths.html}`);
    return target;
  } finally {
    await rm(stage, { recursive: true });
  }
}

if (process.argv[1] && await realpath(process.argv[1]) === await realpath(fileURLToPath(import.meta.url))) {
  await exportPptx(fileURLToPath(new URL('..', import.meta.url)));
}
