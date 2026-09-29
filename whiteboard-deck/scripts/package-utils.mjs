import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { homedir } from 'node:os';

export const MANIFEST = 'package-manifest.json';

export function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

export async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export function safePath(root, relative) {
  if (typeof relative !== 'string' || !relative || isAbsolute(relative) || /[\\:\0]/.test(relative)) {
    throw new Error(`Invalid package path: ${relative}`);
  }
  const parts = relative.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) throw new Error(`Unsafe package path: ${relative}`);
  return join(root, ...parts);
}

export async function listFiles(root, prefix = '') {
  const info = await lstat(root);
  if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(`Expected a real directory, not a link: ${root}`);
  const found = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`Links are not allowed in a skill package: ${join(root, entry.name)}`);
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...await listFiles(join(root, entry.name), relative));
    else if (entry.isFile()) found.push(relative);
    else throw new Error(`Unsupported package entry: ${relative}`);
  }
  return found.sort();
}

export async function verifyPackage(root) {
  const actual = await listFiles(root);
  if (!actual.includes(MANIFEST)) throw new Error(`Refusing an unrelated or incomplete skill directory: ${root}`);
  const manifest = JSON.parse(await readFile(join(root, MANIFEST), 'utf8'));
  if (manifest.schema !== 1 || manifest.name !== 'whiteboard-deck' || !manifest.files || Array.isArray(manifest.files)) {
    throw new Error(`Invalid whiteboard-deck manifest at ${root}`);
  }
  const expected = [...Object.keys(manifest.files), MANIFEST].sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error(`Skill package contains missing or unexpected files: ${root}. Preserve local changes before replacing it.`);
  }
  if (digest(JSON.stringify(manifest.files)) !== manifest.sourceDigest) throw new Error(`Invalid package fingerprint at ${root}`);
  for (const [relative, expectedHash] of Object.entries(manifest.files)) {
    const path = safePath(root, relative);
    if (typeof expectedHash !== 'string' || digest(await readFile(path)) !== expectedHash) {
      throw new Error(`Modified or corrupt skill file: ${relative}. Refusing to overwrite it.`);
    }
  }
  return manifest;
}

export async function packageFiles(root) {
  const manifest = await verifyPackage(root);
  const files = new Map();
  for (const relative of Object.keys(manifest.files)) files.set(relative, await readFile(safePath(root, relative)));
  return { manifest, files };
}

export async function publishPackage(destination, files, version) {
  const target = resolve(destination);
  if (target === dirname(target) || target === homedir()) throw new Error('A skill package cannot replace a root or home directory.');
  if (!files.size || files.has(MANIFEST)) throw new Error('Package files must be nonempty and must not include their own manifest.');
  const previous = await exists(target);
  if (previous) await verifyPackage(target);
  await mkdir(dirname(target), { recursive: true });
  const stage = await mkdtemp(join(dirname(target), '.whiteboard-stage-'));
  let backup;
  try {
    const hashes = {};
    for (const [relative, value] of [...files.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
      const path = safePath(stage, relative);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, value, { flag: 'wx' });
      hashes[relative] = digest(value);
    }
    const manifest = { schema: 1, name: 'whiteboard-deck', version, sourceDigest: digest(JSON.stringify(hashes)), files: hashes };
    await writeFile(join(stage, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
    await verifyPackage(stage);
    if (previous) {
      backup = `${target}.backup-${randomUUID()}`;
      await rename(target, backup);
    }
    try {
      await rename(stage, target);
    } catch (error) {
      if (backup && !await exists(target)) await rename(backup, target);
      throw error;
    }
    if (backup) {
      await verifyPackage(backup);
      await rm(backup, { recursive: true });
    }
    return manifest;
  } finally {
    if (await exists(stage)) await rm(stage, { recursive: true });
  }
}
