import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, unlink, writeFile, link, realpath } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

export async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true; }
  catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false; throw error; }
}

async function realDirectory(path: string): Promise<void> {
  const info = await lstat(path);
  if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(`Expected a real artifact directory: ${path}`);
}

export async function artifactPaths(root: string) {
  await realDirectory(root);
  const pkg: unknown = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  if (typeof pkg !== 'object' || pkg === null || !('name' in pkg)
    || typeof pkg.name !== 'string' || !/^[a-z][a-z0-9-]*$/.test(pkg.name)) {
    throw new Error('The package name must be a safe artifact slug.');
  }
  const name = pkg.name;
  for (const folder of ['presentations', '.build']) {
    const path = join(root, folder);
    if (await exists(path)) await realDirectory(path);
    else await mkdir(path);
  }
  return {
    slug: name,
    target: join(root, 'presentations', `${name}.pptx`),
    html: join(root, 'presentations', `${name}.html`),
    receipt: join(root, '.build', `${name}.pptx-receipt.json`),
  };
}

export async function cleanPptx(root: string): Promise<void> {
  const paths = await artifactPaths(root);
  const targetExists = await exists(paths.target);
  if (!await exists(paths.receipt)) {
    if (targetExists) console.warn(`Preserved unmanaged PPTX (not refreshed): ${paths.target}`);
    return;
  }
  if ((await lstat(paths.receipt)).isSymbolicLink()) throw new Error('Refusing a linked PPTX receipt.');
  let receipt: unknown;
  try { receipt = JSON.parse(await readFile(paths.receipt, 'utf8')); }
  catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    console.warn(`Preserved PPTX with an invalid ownership receipt: ${paths.target}`);
    return;
  }
  let ownedHash: string | undefined;
  if (typeof receipt === 'object' && receipt !== null
    && 'schema' in receipt && receipt.schema === 1
    && 'generator' in receipt && receipt.generator === 'whiteboard-deck'
    && 'slug' in receipt && receipt.slug === paths.slug
    && 'sha256' in receipt && typeof receipt.sha256 === 'string' && /^[a-f0-9]{64}$/.test(receipt.sha256)) {
    ownedHash = receipt.sha256;
  }
  if (!ownedHash || (targetExists && ((await lstat(paths.target)).isSymbolicLink()
    || !(await lstat(paths.target)).isFile() || sha256(await readFile(paths.target)) !== ownedHash))) {
    console.warn(`Preserved modified or unverified PPTX (not refreshed): ${paths.target}`);
    return;
  }
  if (targetExists) {
    await unlink(paths.target);
    console.log(`Removed verified prior PPTX export: ${paths.target}`);
  }
  await unlink(paths.receipt);
}

export async function publishPptx(root: string, staged: string, frameCount: number): Promise<string> {
  const paths = await artifactPaths(root);
  if (!Number.isInteger(frameCount) || frameCount < 1) throw new Error('Cannot publish an empty or invalid frame count.');
  if (await exists(paths.target) || await exists(paths.receipt)) {
    throw new Error(`Refusing to overwrite an unmanaged PPTX or receipt for ${paths.slug}. Preserve it elsewhere first.`);
  }
  const stagedInfo = await lstat(staged);
  if (stagedInfo.isSymbolicLink() || !stagedInfo.isFile()) throw new Error('Refusing a linked or non-file staged PPTX.');
  const digest = sha256(await readFile(staged));
  const receipt = {
    schema: 1, generator: 'whiteboard-deck', slug: paths.slug, sha256: digest,
    htmlSha256: sha256(await readFile(paths.html)), frameCount,
  };
  const encodedReceipt = `${JSON.stringify(receipt, null, 2)}\n`;
  const stagedReceipt = join(dirname(staged), 'publication-receipt.json');
  await writeFile(stagedReceipt, encodedReceipt, { flag: 'wx' });
  let published = false;
  let receipted = false;
  try {
    // An exclusive hard link publishes validated bytes atomically on the same volume.
    await link(staged, paths.target);
    published = true;
    await link(stagedReceipt, paths.receipt);
    receipted = true;
    if (sha256(await readFile(paths.target)) !== digest || await readFile(paths.receipt, 'utf8') !== encodedReceipt) {
      throw new Error('Published PPTX or ownership verification failed.');
    }
    return paths.target;
  } catch (error) {
    if (receipted && await readFile(paths.receipt, 'utf8') === encodedReceipt) await unlink(paths.receipt);
    if (published && sha256(await readFile(paths.target)) === digest) await unlink(paths.target);
    throw error;
  }
}

if (process.argv[1] && await realpath(process.argv[1]) === await realpath(fileURLToPath(import.meta.url))) {
  await cleanPptx(fileURLToPath(new URL('..', import.meta.url)));
}
