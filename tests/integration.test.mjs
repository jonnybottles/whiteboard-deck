import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { verifyDistribution } from '../scripts/verify-distribution.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
function run(args, cwd) {
  const result = spawnSync(process.execPath, args, {
    cwd, encoding: 'utf8', timeout: 240_000, maxBuffer: 4 * 1024 * 1024,
    env: {
      ...process.env, NODE_PATH: '', NODE_TEST_CONTEXT: undefined,
      npm_config_update_notifier: 'false', npm_config_fetch_retries: '0',
      npm_config_fetch_timeout: '60000',
    },
  });
  assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
}

test('a clean installation scaffolds and exports HTML/PPTX independently', { timeout: 600_000 }, async (t) => {
  const before = await verifyDistribution(root);
  const directory = await mkdtemp(join(tmpdir(), 'whiteboard clean install '));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const installed = join(directory, 'personal skill');
  const project = join(directory, 'version control deck');
  run([join(root, 'scripts', 'install-skill.mjs'), '--destination', installed], directory);
  run([
    join(installed, 'scripts', 'scaffold.mjs'), '--destination', project,
    '--title', 'Version control basics', '--slug', 'version-control-basics',
  ], directory);
  const lockBefore = await readFile(join(project, 'package-lock.json'));
  const npm = process.env.npm_execpath ?? join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const npmRun = (args) => run([npm, '--prefix', project, ...args], project);
  npmRun(['ci', '--no-audit', '--no-fund', '--omit-lockfile-registry-resolved']);
  assert.deepEqual(await readFile(join(project, 'package-lock.json')), lockBefore);
  npmRun(['run', 'check']);
  await assert.rejects(() => readFile(join(project, 'presentations', 'version-control-basics.pptx')), { code: 'ENOENT' });
  npmRun(['run', 'test:pptx']);
  const receipt = JSON.parse(await readFile(join(project, '.build', 'version-control-basics.pptx-receipt.json'), 'utf8'));
  assert.equal(receipt.frameCount, 7);
  assert.equal(receipt.sha256, sha256(await readFile(join(project, 'presentations', 'version-control-basics.pptx'))));
  assert.equal(receipt.htmlSha256, sha256(await readFile(join(project, 'presentations', 'version-control-basics.html'))));
  assert.deepEqual(await readFile(join(project, 'package-lock.json')), lockBefore);
  assert.deepEqual(await verifyDistribution(root), before);
});
