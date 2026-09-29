import { lstat, mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { exists, packageFiles, safePath } from './package-utils.mjs';

const skillRoot = fileURLToPath(new URL('..', import.meta.url));

function argumentsFrom(values) {
  const options = {};
  for (let index = 0; index < values.length; index++) {
    const key = values[index];
    if (!['--destination', '--title', '--slug'].includes(key) || !values[index + 1] || values[index + 1].startsWith('--')) {
      throw new Error('Usage: node scaffold.mjs --destination <new-folder> --title <topic> [--slug <safe-name>]');
    }
    if (options[key]) throw new Error(`Duplicate argument ${key}`);
    options[key] = values[++index];
  }
  return options;
}

async function scaffold() {
  const options = argumentsFrom(process.argv.slice(2));
  const title = options['--title']?.trim();
  if (!title || !options['--destination']) throw new Error('--destination and --title are required.');
  if (/[^\x20-\x7e]/.test(title)) throw new Error('The starter title must use printable ASCII. Extend the original glyph set explicitly for other characters.');
  const slug = options['--slug'] ?? title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!/^[a-z][a-z0-9-]*$/.test(slug)) throw new Error('The slug must start with a lowercase letter and contain only lowercase letters, digits and hyphens.');
  const destination = resolve(options['--destination']);
  const withinSkill = relative(skillRoot, destination);
  if (destination === dirname(destination) || destination === homedir() || (!withinSkill.startsWith('..') && !/^[A-Za-z]:/.test(withinSkill))) {
    throw new Error('Choose a new project directory outside the skill package, not a home or root directory.');
  }
  if (await exists(destination)) {
    const info = await lstat(destination);
    if (info.isSymbolicLink() || !info.isDirectory() || (await readdir(destination)).length) {
      throw new Error(`Destination must be a new or empty real directory: ${destination}. Nothing was overwritten.`);
    }
  }

  if (!await exists(join(skillRoot, 'package-manifest.json'))) {
    throw new Error('The skill is missing its package manifest. Reinstall a complete verified package.');
  }
  const { manifest, files } = await packageFiles(skillRoot);
  const starter = new Map();
  for (const [key, value] of files) {
    if (key.startsWith('assets/starter/')) starter.set(key.slice('assets/starter/'.length), value);
  }
  if (!starter.has('src/content/deck.ts') || !starter.has('package-lock.json')) throw new Error('The verified package has no complete starter.');
  const template = starter.get('src/content/deck.ts').toString('utf8');
  if (!template.includes("'__WHITEBOARD_TITLE__'") || !template.includes("'__WHITEBOARD_SLUG__'")) throw new Error('Starter metadata placeholders are missing.');
  starter.set('src/content/deck.ts', Buffer.from(template.replaceAll("'__WHITEBOARD_TITLE__'", JSON.stringify(title)).replaceAll("'__WHITEBOARD_SLUG__'", JSON.stringify(slug))));
  const pkg = JSON.parse(starter.get('package.json').toString('utf8'));
  const lock = JSON.parse(starter.get('package-lock.json').toString('utf8'));
  pkg.name = slug;
  lock.name = slug;
  lock.packages[''].name = slug;
  starter.set('package.json', Buffer.from(`${JSON.stringify(pkg, null, 2)}\n`));
  starter.set('package-lock.json', Buffer.from(`${JSON.stringify(lock, null, 2)}\n`));
  starter.set('README.md', Buffer.from([
    `# ${title}`, '', `Generated with whiteboard-deck ${manifest.version}.`, '',
    'This is a two-board starter, not researched topic content. Replace the sample narrative in `src\\content\\deck.ts` and add primary-source citations before presenting.', '',
    '**HTML is the default and authoritative version, with original stroke-by-stroke playback.**', '',
    '```powershell', 'npm ci', 'npm run build', 'npm test', 'npm run test:browser -- --project=edge', '```', '',
    `Open \`presentations\\${slug}.html\` directly in a browser. Use Space/Right for the next step, Left to go back, K to pause, R to replay, F for fullscreen, and N for notes/transcript/sources.`, '',
    '## Optional native PowerPoint', '',
    'Only when requested, produce HTML and PowerPoint together:', '',
    '```powershell', 'npm run build:pptx', 'npm run test:pptx', '```', '',
    `Artifacts: \`presentations\\${slug}.html\` and \`presentations\\${slug}.pptx\`.`, '',
    'PowerPoint uses one cumulative slide per completed beat, not native handwriting animation. Original artwork is embedded as 3000 x 1800 images on white 16:9 slides, with the unchanged 5:3 board centered. On-slide labels are not individually editable; speaker notes, visible-label text and source information are editable in native notes. The last slide retains the full source ledger.', '',
    'Export needs installed Edge or Chrome and Python 3, but no Office, account, cloud converter or runtime server. All capture is local and offline. Inspect the generated file again with:', '',
    '```powershell', `python scripts\\inspect-pptx.py presentations\\${slug}.pptx --validate-generated`, '```', '',
    'Also open/render in installed desktop PowerPoint to check repair warnings, notes, slide order and visual quality. Report when this check is unavailable; structural inspection alone does not prove desktop compatibility.', '',
    'An ordinary HTML build removes only a verified prior same-slug PPTX using its ownership receipt in `.build`. Modified/unmanaged files are preserved and block a conflicting export. Preserve such files elsewhere before regenerating; never overwrite a reference. Temporary captures are cleaned.', '',
    '`npm run check` runs the HTML checks. Run `npm run test:pptx` only when testing optional PowerPoint export. The HTML is not itself a PowerPoint file.', '',
    'Neither finished artifact needs a server or network. Keep reference documents local and out of tracked assets and packages.', '',
  ].join('\n')));

  for (const key of starter.keys()) safePath(destination, key);
  await mkdir(destination, { recursive: true });
  for (const [key, value] of starter) {
    const path = safePath(destination, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, value, { flag: 'wx' });
  }
  console.log(`Created ${destination}\nArtifact after building: ${join(destination, 'presentations', `${slug}.html`)}\nDependencies were not installed. No Git or remote repository was created.`);
}

if (process.argv.includes('--help')) console.log('Usage: node scaffold.mjs --destination <new-folder> --title <topic> [--slug <safe-name>]');
else await scaffold();
