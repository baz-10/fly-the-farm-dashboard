import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const testRunner = resolve(root, 'node_modules/react-scripts/scripts/test.js');
const shardCount = Number.parseInt(process.env.JEST_SHARD_COUNT || '8', 10);
if (!Number.isInteger(shardCount) || shardCount < 1 || shardCount > 32) {
  throw new Error('JEST_SHARD_COUNT must be an integer from 1 to 32.');
}

const environment = { ...process.env, CI: 'true', WATCHMAN_DISABLE: '1' };
const listed = spawnSync(process.execPath, [testRunner, '--listTests', '--runInBand', '--watchAll=false'], {
  cwd: root, env: environment, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024,
});
if (listed.status !== 0) throw new Error(listed.stderr || 'Jest test discovery failed.');
const tests = listed.stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean).sort();
if (!tests.length) throw new Error('Jest test discovery returned no tests.');

const shards = Array.from({ length: Math.min(shardCount, tests.length) }, () => []);
tests.forEach((testPath, index) => shards[index % shards.length].push(testPath));
for (let index = 0; index < shards.length; index += 1) {
  process.stdout.write(`Running deterministic Jest shard ${index + 1}/${shards.length} (${shards[index].length} suites).\n`);
  const run = spawnSync(process.execPath, [
    testRunner, '--runInBand', '--watchAll=false', '--forceExit', '--testTimeout=15000', '--runTestsByPath', ...shards[index],
  ], { cwd: root, env: environment, stdio: 'inherit' });
  if (run.status !== 0) process.exit(run.status || 1);
}
process.stdout.write(`Deterministic Jest acceptance passed (${tests.length} suites across ${shards.length} shards).\n`);
