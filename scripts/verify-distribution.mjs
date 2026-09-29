import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT_FILES = [
  '.gitattributes', '.gitignore', 'LICENSE', 'README.md', 'package.json',
  'scripts/install-skill.mjs', 'scripts/verify-distribution.mjs',
  'tests/distribution.test.mjs', 'tests/integration.test.mjs',
];
export const PAYLOAD_FILES = [
  'ONBOARDING.md', 'SKILL.md',
  'assets/starter/.gitattributes', 'assets/starter/.gitignore',
  'assets/starter/index.html', 'assets/starter/package-lock.json', 'assets/starter/package.json',
  'assets/starter/playwright.config.ts', 'assets/starter/tsconfig.json',
  'assets/starter/vite.config.ts', 'assets/starter/vitest.config.ts',
  'assets/starter/scripts/capture-pptx.ts', 'assets/starter/scripts/export-html.mjs',
  'assets/starter/scripts/export-pptx.ts', 'assets/starter/scripts/inspect-pptx.py',
  'assets/starter/scripts/pptx-artifacts.ts',
  'assets/starter/src/assets/marker-glyphs.ts', 'assets/starter/src/content/deck.ts',
  'assets/starter/src/content/helpers.ts', 'assets/starter/src/engine/layout.ts',
  'assets/starter/src/engine/playback.ts', 'assets/starter/src/engine/renderer.ts',
  'assets/starter/src/engine/svg.ts', 'assets/starter/src/engine/timeline.ts',
  'assets/starter/src/engine/validate.ts', 'assets/starter/src/export/capture.css',
  'assets/starter/src/export/capture.html', 'assets/starter/src/export/capture.ts',
  'assets/starter/src/export/frames.ts', 'assets/starter/src/main.ts',
  'assets/starter/src/model.ts', 'assets/starter/src/styles.css', 'assets/starter/src/ui/player.ts',
  'assets/starter/tests/browser/smoke.spec.ts', 'assets/starter/tests/pptx.test.mjs',
  'assets/starter/tests/unit/engine.test.ts', 'assets/starter/tests/unit/export.test.ts',
  'references/DECK_SCHEMA.md', 'references/FOUNDRY_RESEARCH.md', 'references/HANDWRITING.md',
  'references/POWERPOINT_EXPORT.md', 'references/REFERENCE_ANALYSIS.md', 'references/VALIDATION.md',
  'scripts/inspect-pptx.py', 'scripts/package-utils.mjs', 'scripts/scaffold.mjs',
];
export const REPOSITORY_FILES = [
  ...ROOT_FILES, 'whiteboard-deck/package-manifest.json',
  ...PAYLOAD_FILES.map((path) => `whiteboard-deck/${path}`),
].sort();
const digest = (value) => createHash('sha256').update(value).digest('hex');
const MAX_FILE = 2 * 1024 * 1024;
const MAX_TOTAL = 8 * 1024 * 1024;
const decoder = new TextDecoder('utf-8', { fatal: true });
const rules = [
  ['credential-token', /(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,})/],
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['credential-assignment', /(?:_authToken|client_secret|api[_-]?key|password|accountkey|sharedaccesssignature)\s*[=:]\s*["']?[A-Za-z0-9/+_=-]{12,}/i],
  ['credential-url', /https?:\/\/[^\s/:@]+:[^\s/@]+@/i],
  ['personal-path', /(?:[A-Z]:\\{1,2}Users\\{1,2}[A-Za-z0-9_.-]+|\/(?:Users|home)\/[A-Za-z0-9_.-]+)/i],
  ['contact-email', /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i],
  ['internal-endpoint', /(?:[.]visualstudio[.]com|dev[.]azure[.]com|[.]dynamics[.]com|[.]sharepoint[.]com|[.]onmicrosoft[.]com)/i],
  ['credential-query', /[?&](?:sig|access_token|api_key|client_secret)=[A-Za-z0-9%+/_=-]{12,}/i],
];

export function scanText(name, text) {
  const findings = [];
  for (const [index, line] of text.split('\n').entries()) {
    for (const [rule, pattern] of rules) {
      if (pattern.test(line)) findings.push(`${name}:${index + 1} [${rule}]`);
    }
  }
  return findings;
}

export function verifyFiles(files) {
  const actual = [...files.keys()].sort();
  if (JSON.stringify(actual) !== JSON.stringify(REPOSITORY_FILES)) {
    const extra = actual.filter((name) => !REPOSITORY_FILES.includes(name));
    const missing = REPOSITORY_FILES.filter((name) => !files.has(name));
    throw new Error(`Unexpected or missing distribution files. Extra: ${extra.join(', ') || 'none'}; missing: ${missing.join(', ') || 'none'}.`);
  }
  let total = 0;
  const texts = new Map();
  const findings = [];
  for (const [name, content] of files) {
    total += content.length;
    if (content.length > MAX_FILE || total > MAX_TOTAL) throw new Error(`Distribution size limit exceeded: ${name}`);
    const text = decoder.decode(content);
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) throw new Error(`Unexpected binary/control data: ${name}`);
    if (text.includes('\r')) throw new Error(`Non-LF content would invalidate package hashes: ${name}`);
    texts.set(name, text);
    findings.push(...scanText(name, text));
  }
  if (findings.length) throw new Error(`Sensitive-content review required (values redacted):\n${findings.join('\n')}`);
  const manifest = JSON.parse(texts.get('whiteboard-deck/package-manifest.json'));
  if (manifest.schema !== 1 || manifest.name !== 'whiteboard-deck' || !manifest.files || Array.isArray(manifest.files)) {
    throw new Error('Invalid payload manifest.');
  }
  if (JSON.stringify(Object.keys(manifest.files).sort()) !== JSON.stringify([...PAYLOAD_FILES].sort())) {
    throw new Error('Payload manifest differs from the reviewed allowlist.');
  }
  if (digest(JSON.stringify(manifest.files)) !== manifest.sourceDigest) throw new Error('Invalid payload fingerprint.');
  for (const [name, expected] of Object.entries(manifest.files)) {
    if (!/^[a-f0-9]{64}$/.test(expected) || digest(files.get(`whiteboard-deck/${name}`)) !== expected) {
      throw new Error(`Modified or corrupt payload: ${name}`);
    }
  }
  const rootPackage = JSON.parse(texts.get('package.json'));
  const pkg = JSON.parse(texts.get('whiteboard-deck/assets/starter/package.json'));
  const lock = JSON.parse(texts.get('whiteboard-deck/assets/starter/package-lock.json'));
  if (rootPackage.private !== true || pkg.private !== true || lock.lockfileVersion !== 3
    || lock.name !== pkg.name || lock.packages?.['']?.name !== pkg.name) {
    throw new Error('Invalid private-package or lockfile metadata.');
  }
  if (![rootPackage.version, pkg.version, lock.version, lock.packages[''].version].every((version) => version === manifest.version)) {
    throw new Error('Distribution versions do not agree.');
  }
  if (JSON.stringify(pkg.devDependencies) !== JSON.stringify(lock.packages[''].devDependencies)
    || Object.values(pkg.devDependencies).some((version) => !/^\d+\.\d+\.\d+$/.test(version))) {
    throw new Error('Direct dependencies must be exact-pinned and match the lockfile.');
  }
  let dependencies = 0;
  for (const [name, entry] of Object.entries(lock.packages)) {
    if (!name) continue;
    dependencies++;
    if ('resolved' in entry || entry.link || !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(entry.version)
      || !/^(?:sha1|sha256|sha384|sha512)-[A-Za-z0-9+/]+={0,2}$/.test(entry.integrity)) {
      throw new Error(`Expected a registry-neutral, integrity-pinned dependency: ${name}`);
    }
  }
  if (!dependencies) throw new Error('Missing starter dependencies.');
  if (pkg.scripts.build !== 'npm run typecheck && vite build && node scripts/export-html.mjs'
    || !pkg.scripts['build:pptx']?.startsWith('npm run build &&')) {
    throw new Error('HTML-default and explicit PowerPoint build contracts changed.');
  }
  return { version: manifest.version, files: files.size, payloadFiles: PAYLOAD_FILES.length, dependencies, sourceDigest: manifest.sourceDigest };
}

async function workingFiles(root) {
  const files = new Map();
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const name = relative(root, path).split('\\').join('/');
      const info = await lstat(path);
      if (name === '.git' && info.isDirectory() && !info.isSymbolicLink()) continue;
      if (info.isSymbolicLink()) throw new Error(`Links are forbidden in the distribution: ${name}`);
      if (info.isDirectory()) await walk(path);
      else if (info.isFile()) {
        if (!REPOSITORY_FILES.includes(name)) throw new Error(`Unexpected distribution file: ${name}`);
        if (info.size > MAX_FILE) throw new Error(`Distribution size limit exceeded: ${name}`);
        files.set(name, await readFile(path));
      } else throw new Error(`Unsupported distribution entry: ${name}`);
    }
  }
  await walk(root);
  return files;
}

function git(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], { maxBuffer: MAX_TOTAL + MAX_FILE, windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(`Git snapshot inspection failed (${args[0]}).`);
  return result.stdout;
}

function snapshotFiles(root, selection) {
  const staged = selection === 'staged';
  const listing = git(root, staged ? ['ls-files', '--stage', '-z'] : ['ls-tree', '-r', '-z', selection]);
  const files = new Map();
  for (const record of listing.toString('utf8').split('\0').filter(Boolean)) {
    const tab = record.indexOf('\t');
    const header = record.slice(0, tab).split(' ');
    const name = record.slice(tab + 1);
    if (tab < 0 || !['100644', '100755'].includes(header[0]) || (staged ? header[2] !== '0' : header[1] !== 'blob')) {
      throw new Error(`Unsupported Git entry (conflict, link or submodule): ${name}`);
    }
    if (!REPOSITORY_FILES.includes(name)) throw new Error(`Unexpected tracked distribution file: ${name}`);
    if (files.has(name)) throw new Error(`Duplicate Git snapshot entry: ${name}`);
    const oid = header[staged ? 1 : 2];
    const size = Number(git(root, ['cat-file', '-s', oid]).toString());
    if (!Number.isSafeInteger(size) || size > MAX_FILE) throw new Error(`Git blob exceeds size limit: ${name}`);
    files.set(name, git(root, ['cat-file', 'blob', oid]));
  }
  return files;
}

export async function verifyDistribution(root, selection = 'working') {
  if (selection !== 'working' && selection !== 'staged' && !/^[A-Za-z0-9._/-]+$/.test(selection)) {
    throw new Error('Invalid Git revision.');
  }
  const files = selection === 'working' ? await workingFiles(root) : snapshotFiles(root, selection);
  return verifyFiles(files);
}

if (process.argv[1] && await realpath(process.argv[1]) === await realpath(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  let selection = 'working';
  if (args.length === 1 && args[0] === '--staged') selection = 'staged';
  else if (args.length === 2 && args[0] === '--commit') selection = args[1];
  else if (args.length) throw new Error('Usage: node scripts/verify-distribution.mjs [--staged | --commit <revision>]');
  const report = await verifyDistribution(fileURLToPath(new URL('..', import.meta.url)), selection);
  console.log(`Verified ${selection}: ${report.files} files, whiteboard-deck ${report.version}, ${report.dependencies} integrity-pinned dependencies.\nPayload fingerprint: ${report.sourceDigest}`);
}
