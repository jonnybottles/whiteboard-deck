import { homedir } from 'node:os';
import { join, relative, resolve, isAbsolute } from 'node:path';
import { realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { packageFiles, publishPackage } from '../whiteboard-deck/scripts/package-utils.mjs';
import { verifyDistribution } from './verify-distribution.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

export async function installSkill(destination) {
  await verifyDistribution(root);
  const target = resolve(destination);
  const inside = relative(root, target);
  if (!inside || (!isAbsolute(inside) && inside !== '..' && !inside.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`))) {
    throw new Error('Choose an installation directory outside the repository checkout.');
  }
  const { files, manifest } = await packageFiles(join(root, 'whiteboard-deck'));
  await publishPackage(target, files, manifest.version);
  return manifest;
}

if (process.argv[1] && await realpath(process.argv[1]) === await realpath(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  if (args.length !== 0 && (args.length !== 2 || args[0] !== '--destination' || !args[1] || args[1].startsWith('--'))) {
    throw new Error('Usage: node scripts/install-skill.mjs [--destination <skill-directory>]');
  }
  const destination = args[1] ?? join(homedir(), '.copilot', 'skills', 'whiteboard-deck');
  const manifest = await installSkill(destination);
  console.log(`Installed verified whiteboard-deck ${manifest.version}: ${resolve(destination)}\nNo dependencies, Git resources or generated projects were changed.`);
}
