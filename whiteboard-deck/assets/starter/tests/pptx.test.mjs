import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { artifactPaths, cleanPptx, exists, publishPptx, sha256 } from '../scripts/pptx-artifacts.ts';
import { openCapture } from '../scripts/capture-pptx.ts';
import { exportPptx, inspectGenerated } from '../scripts/export-pptx.ts';
import { deck } from '../src/content/deck.ts';
import { presenterFrame } from '../src/export/frames.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const npm = process.env.npm_execpath ?? join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
function runNpm(args) {
  const result = spawnSync(process.execPath, [npm, '--prefix', root, ...args], {
    cwd: root, env: { ...process.env, NODE_TEST_CONTEXT: undefined }, encoding: 'utf8', timeout: 180_000,
  });
  assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
}
async function temporary(t) {
  await mkdir(join(root, '.build'), { recursive: true });
  const folder = await mkdtemp(join(root, '.build', 'pptx-test-'));
  t.after(() => rm(folder, { recursive: true }));
  return folder;
}

test('HTML is the default; explicit export creates both artifacts and exact ordered native notes', async (t) => {
  const folder = await temporary(t);
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.build, 'npm run typecheck && vite build && node scripts/export-html.mjs');
  assert.doesNotMatch(await readFile(join(root, 'scripts', 'pptx-artifacts.ts'), 'utf8'), /from ['"](?:@playwright|@jsamuel1)/);
  runNpm(['run', 'build']);
  const paths = await artifactPaths(root);
  assert.equal(await exists(paths.target), false);
  const before = await readFile(paths.html);
  assert.doesNotMatch(before.toString(), /whiteboardExport|pptxgenjs|capture-pptx/);
  runNpm(['run', 'build:pptx']);
  assert.deepEqual(await readFile(paths.html), before);
  const report = JSON.parse(await inspectGenerated(root, paths.target));
  const expected = [];
  for (const [boardIndex, board] of deck.boards.entries()) {
    const targets = new Set();
    for (const [beatIndex, beat] of board.beats.entries()) {
      beat.actions.forEach((action) => targets.add(action.target));
      const frame = presenterFrame(deck, boardIndex, beatIndex, targets);
      const inspected = report.frames[expected.length];
      assert.equal(inspected.key, frame.key);
      expected.push({ ...frame, imageSha256: inspected.image_sha256 });
    }
  }
  const expectedFile = join(folder, 'expected.json');
  await writeFile(expectedFile, JSON.stringify({ schema: 1, frames: expected }));
  await inspectGenerated(root, paths.target, expectedFile);
  assert.equal(report.slide_count, deck.boards.reduce((n, board) => n + board.beats.length, 0));
  const receipt = JSON.parse(await readFile(paths.receipt, 'utf8'));
  assert.equal(receipt.sha256, sha256(await readFile(paths.target)));
  assert.equal(receipt.htmlSha256, sha256(before));
  assert.equal((await readdir(join(root, '.build'))).some((name) => name.startsWith('pptx-export-')), false);

  const mutate = `
import json, sys, xml.etree.ElementTree as ET
from zipfile import ZipFile, ZIP_DEFLATED
source, target, mode = sys.argv[1:]
with ZipFile(source) as z:
    data = {n: z.read(n) for n in z.namelist()}
if mode == 'missing': del data['[Content_Types].xml']
elif mode == 'content-type':
    data['[Content_Types].xml'] = data['[Content_Types].xml'].replace(b'image/png', b'application/octet-stream')
elif mode == 'slide-id':
    name = 'ppt/presentation.xml'
    root = ET.fromstring(data[name])
    children = root.find('{http://schemas.openxmlformats.org/presentationml/2006/main}sldIdLst')
    children[1].set('id', children[0].get('id'))
    data[name] = ET.tostring(root)
elif mode == 'order':
    name = 'ppt/presentation.xml'
    root = ET.fromstring(data[name])
    children = root.find('{http://schemas.openxmlformats.org/presentationml/2006/main}sldIdLst')
    first, second = children[0], children[1]
    children.remove(second); children.insert(0, second)
    data[name] = ET.tostring(root)
elif mode == 'bounds':
    name = 'ppt/slides/slide1.xml'
    data[name] = data[name].replace(b'x="381000"', b'x="-1"')
elif mode == 'external':
    name = 'ppt/slides/_rels/slide1.xml.rels'
    data[name] = data[name].replace(b'<Relationship ', b'<Relationship TargetMode="External" ', 1)
elif mode == 'notes':
    name = 'ppt/slides/_rels/slide1.xml.rels'
    root = ET.fromstring(data[name])
    for node in list(root):
        if node.get('Type', '').endswith('/notesSlide'): root.remove(node)
    data[name] = ET.tostring(root)
elif mode == 'path':
    name = 'ppt/notesSlides/notesSlide1.xml'
    data[name] = data[name].replace(b'whiteboard-deck:', b'file:///private/')
elif mode == 'xml':
    name = 'ppt/presentation.xml'
    data[name] = b'<!DOCTYPE p [<!ENTITY x "unsafe">]>' + data[name]
elif mode == 'unsafe': data['../outside.txt'] = b'no'
elif mode == 'media':
    name = next(n for n in data if n.endswith('.png'))
    data[name] = b'not a PNG'
elif mode == 'source':
    name = max((n for n in data if n.startswith('ppt/notesSlides/notesSlide') and n.endswith('.xml')),
               key=lambda n: int(n.rsplit('notesSlide', 1)[1][:-4]))
    data[name] = data[name].replace(b'https://', b'not-a-source:')
with ZipFile(target, 'w', ZIP_DEFLATED) as z:
    for name, content in data.items(): z.writestr(name, content)
    if mode == 'duplicate': z.writestr('ppt/presentation.xml', data['ppt/presentation.xml'])
`;
  for (const mode of ['missing', 'content-type', 'slide-id', 'order', 'bounds', 'external', 'notes', 'path', 'xml', 'unsafe', 'media', 'duplicate', ...(deck.sources.length ? ['source'] : [])]) {
    const target = join(folder, `${mode}.pptx`);
    const changed = spawnSync('python', ['-c', mutate, paths.target, target, mode], { encoding: 'utf8' });
    assert.equal(changed.status, 0, changed.stderr);
    await assert.rejects(() => inspectGenerated(root, target, expectedFile), /inspection failed/, mode);
  }
});

test('capture excludes future effects at exact boundaries and detects real off-board paths', async (t) => {
  const folder = await temporary(t);
  const session = await openCapture(root, folder);
  t.after(() => session.close());
  const effects = ['draw', 'fade', 'descend', 'wipe', 'bars', 'wheel'];
  const fixture = {
    id: 'fixture', title: 'Capture fixture', subtitle: '', caption: '', sources: [],
    boards: [{
      id: 'board', title: 'A board', theme: '', intro: '', description: 'A capture fixture',
      elements: [
        { kind: 'text', id: 'title', x: 70, y: 50, text: 'Start', size: 40, maxWidth: 1000 },
        ...effects.map((effect, i) => ({ kind: 'box', id: effect, x: 70 + i * 210, y: 300, width: 100, height: 100, color: 'rose' })),
      ],
      beats: [
        { id: 'first', title: 'Start', notes: 'Explain & <compare>.', sources: [], actions: [{ target: 'title' }] },
        ...effects.map((effect) => ({
          id: effect, title: effect, notes: `Explain ${effect}`, sources: [],
          actions: [{ target: effect, effect, withPrevious: true, delay: 0, duration: 100 }],
        })),
      ],
    }],
  };
  await session.page.evaluate((value) => window.whiteboardExport.load(value), fixture);
  await session.page.evaluate(() => window.whiteboardExport.render(0));
  const initial = await session.page.locator('#capture').screenshot();
  for (let index = 0; index <= effects.length; index++) {
    const frame = await session.page.evaluate((i) => window.whiteboardExport.render(i), index);
    assert.deepEqual(frame.elements, ['title', ...effects.slice(0, index)]);
    assert.equal(await session.page.locator('#capture [data-pen]').count(), 0);
  }
  const changed = structuredClone(fixture);
  changed.boards[0].elements[1].color = 'blue';
  await session.page.evaluate((value) => window.whiteboardExport.load(value), changed);
  await session.page.evaluate(() => window.whiteboardExport.render(0));
  assert.deepEqual(await session.page.locator('#capture').screenshot(), initial);
  await session.page.evaluate(() => window.whiteboardExport.render(1));
  assert.notDeepEqual(await session.page.locator('#capture').screenshot(), initial);
  const invalid = structuredClone(fixture);
  invalid.boards[0].elements[1] = { kind: 'path', id: 'draw', x: 70, y: 300, width: 100, height: 100, paths: ['M0 0 L2000 0'] };
  await session.page.evaluate((value) => window.whiteboardExport.load(value), invalid);
  await assert.rejects(() => session.page.evaluate(() => window.whiteboardExport.render(1)), /Off-board artwork/);
  session.check();
});

test('ownership cleanup never deletes unrelated or modified files; publication fails without a receipt', async (t) => {
  const root = await temporary(t);
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'fixture' }));
  const paths = await artifactPaths(root);
  const staged = join(root, '.build', 'staged.pptx');
  await writeFile(staged, 'a validated test artifact');
  await assert.rejects(() => publishPptx(root, staged, 1), /ENOENT/);
  assert.equal(await exists(paths.target), false);
  await writeFile(paths.html, 'html');
  await publishPptx(root, staged, 1);
  await assert.rejects(() => publishPptx(root, staged, 1), /Refusing/);
  await cleanPptx(root);
  assert.equal(await exists(paths.target), false);
  assert.equal(await exists(paths.receipt), false);
  await writeFile(paths.target, 'a local reference');
  await cleanPptx(root);
  assert.equal(await readFile(paths.target, 'utf8'), 'a local reference');
  await writeFile(paths.receipt, '{"schema":1,"generator":"whiteboard-deck","slug":"fixture","sha256":"' + '0'.repeat(64) + '"}');
  await cleanPptx(root);
  assert.equal(await readFile(paths.target, 'utf8'), 'a local reference');
  await writeFile(paths.receipt, '{broken');
  await cleanPptx(root);
  assert.equal(await readFile(paths.target, 'utf8'), 'a local reference');
});

test('a failed capture publishes no PPTX and cleans its run-owned staging', async (t) => {
  const fixture = await temporary(t);
  await writeFile(join(fixture, 'package.json'), JSON.stringify({ name: 'broken-capture' }));
  const paths = await artifactPaths(fixture);
  await writeFile(paths.html, 'An existing HTML artifact must survive export failure.');
  await assert.rejects(() => exportPptx(fixture), /capture\.html/);
  assert.equal(await exists(paths.target), false);
  assert.equal(await exists(paths.receipt), false);
  assert.equal(await readFile(paths.html, 'utf8'), 'An existing HTML artifact must survive export failure.');
  assert.equal((await readdir(join(fixture, '.build'))).some((name) => name.startsWith('pptx-export-')), false);
});
