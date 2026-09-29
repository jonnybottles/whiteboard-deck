import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
if (!/^[a-z][a-z0-9-]*$/.test(pkg.name)) throw new Error('The package name must be a safe artifact slug.');
const dist = join(root, 'dist');
const files = await readdir(dist);
if (files.some((file) => file !== 'index.html')) {
  throw new Error(`The single-file build left sidecar assets: ${files.filter((file) => file !== 'index.html').join(', ')}. Inline them before exporting.`);
}
const html = (await readFile(join(dist, 'index.html'), 'utf8')).replace(/\r\n?/g, '\n');
const externalAssets = [...html.matchAll(/<(?:script|link|img|source|video|audio|iframe)\b[^>]*\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)]
  .map((match) => match[1]).filter((value) => !value.startsWith('data:') && !value.startsWith('#'));
const styles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]).join('\n');
const cssAssets = [...styles.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)]
  .map((match) => match[1].trim()).filter((value) => !value.startsWith('data:') && !value.startsWith('#'));
if (externalAssets.length || cssAssets.length) throw new Error(`The artifact still requires external assets: ${[...externalAssets, ...cssAssets].join(', ')}`);
if (/gh[pousr]_[A-Za-z0-9]{20,}|reference-local[\\/]/i.test(html)) {
  throw new Error('The artifact contains a credential-shaped value or protected reference name.');
}
if (!html.includes('scoutTheme') || !html.includes('--cp-board-paper')) throw new Error('The whiteboard theme is missing.');
await mkdir(join(root, 'presentations'), { recursive: true });
const target = join(root, 'presentations', `${pkg.name}.html`);
await writeFile(target, html);
console.log(`Exported ${target} (${Buffer.byteLength(html).toLocaleString()} bytes; no external asset dependencies).`);
