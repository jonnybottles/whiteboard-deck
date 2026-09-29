import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, mkdir, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { installSkill } from '../scripts/install-skill.mjs';
import { REPOSITORY_FILES, scanText, verifyDistribution, verifyFiles } from '../scripts/verify-distribution.mjs';
import { verifyPackage } from '../whiteboard-deck/scripts/package-utils.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
async function temporary(t) {
  const directory = await mkdtemp(join(tmpdir(), 'whiteboard-distribution-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
async function snapshot() {
  return new Map(await Promise.all(REPOSITORY_FILES.map(async (name) => [name, await readFile(join(root, ...name.split('/')))])));
}

test('the complete reviewed distribution and neutral lockfile verify', async () => {
  const report = await verifyDistribution(root);
  assert.equal(report.version, '1.1.2');
  assert.equal(report.payloadFiles, 46);
  assert.equal(report.files, 56);
  assert.equal(report.dependencies, 109);
});

test('sensitive-content reports redact values and detect representative patterns', () => {
  const examples = [
    ['gh' + 'p_' + 'A'.repeat(30), 'credential-token'],
    ['client_' + 'secret=' + 'synthetic'.repeat(3), 'credential-assignment'],
    ['https://' + 'name:fake-password' + '@example.invalid', 'credential-url'],
    ['C:\\' + 'Users\\' + 'example\\secret', 'personal-path'],
    ['demo' + '@example.invalid', 'contact-email'],
    ['https://pkgs.visualstudio' + '.com/fictional', 'internal-endpoint'],
  ];
  for (const [value, rule] of examples) {
    const findings = scanText('fixture.txt', value);
    assert.ok(findings.some((finding) => finding.includes(rule)));
    assert.ok(findings.every((finding) => !finding.includes(value)));
  }
});

test('unexpected files, edited payloads and altered fingerprints fail closed', async () => {
  const files = await snapshot();
  const extra = new Map(files).set('.env', Buffer.from('synthetic only'));
  assert.throws(() => verifyFiles(extra), /Unexpected or missing/);
  const changed = new Map(files).set('whiteboard-deck/SKILL.md', Buffer.from('An accidental edit.\n'));
  assert.throws(() => verifyFiles(changed), /Modified or corrupt payload/);
  const manifest = JSON.parse(files.get('whiteboard-deck/package-manifest.json'));
  manifest.sourceDigest = '0'.repeat(64);
  const corrupted = new Map(files).set('whiteboard-deck/package-manifest.json', Buffer.from(JSON.stringify(manifest)));
  assert.throws(() => verifyFiles(corrupted), /Invalid payload fingerprint/);
  const endpoint = 'https://pkgs.visualstudio' + '.com/fictional';
  const privateUrl = new Map(files).set('README.md', Buffer.from(endpoint));
  assert.throws(() => verifyFiles(privateUrl), /internal-endpoint/);
  const binary = new Map(files).set('README.md', Buffer.from([0, 1, 2]));
  assert.throws(() => verifyFiles(binary), /binary\/control/);
});

test('installation is verified, repeatable and preserves unrelated or modified work', async (t) => {
  const directory = await temporary(t);
  const installed = join(directory, 'personal skill');
  await installSkill(installed);
  const first = await verifyPackage(installed);
  await installSkill(installed);
  assert.equal((await verifyPackage(installed)).sourceDigest, first.sourceDigest);
  await writeFile(join(installed, 'SKILL.md'), 'Local edits');
  await assert.rejects(() => installSkill(installed), /Modified or corrupt/);
  assert.equal(await readFile(join(installed, 'SKILL.md'), 'utf8'), 'Local edits');
  const unrelated = join(directory, 'unrelated');
  await mkdir(unrelated);
  await writeFile(join(unrelated, 'keep.txt'), 'keep');
  await assert.rejects(() => installSkill(unrelated), /unrelated or incomplete/);
  assert.equal(await readFile(join(unrelated, 'keep.txt'), 'utf8'), 'keep');
  await assert.rejects(() => installSkill(join(root, 'inside-checkout')), /outside the repository/);
});

test('installer refuses malformed arguments without touching the destination', async (t) => {
  const directory = await temporary(t);
  const result = spawnSync(process.execPath, [
    join(root, 'scripts', 'install-skill.mjs'), '--destination', directory, '--unexpected',
  ], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Usage:/);
});

test('linked installation directories are not overwritten', async (t) => {
  const directory = await temporary(t);
  const actual = join(directory, 'actual');
  const linked = join(directory, 'linked');
  await mkdir(actual);
  await writeFile(join(actual, 'keep.txt'), 'keep');
  await symlink(actual, linked, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(() => installSkill(linked), /real directory|link/);
  assert.equal(await readFile(join(actual, 'keep.txt'), 'utf8'), 'keep');
});
