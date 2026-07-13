import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseArgs, runCli } from '../src/cli.js';

test('parses public report options and explicit markers', () => {
  const value = parseArgs([
    'monthly',
    '--json',
    '--compact',
    '--breakdown',
    '--since',
    '2026-01-01',
    '--until',
    '2026-01-31',
    '--timezone',
    'Asia/Shanghai',
    '--offline',
  ]);

  assert.deepEqual({
    command: value.command,
    json: value.json,
    compact: value.compact,
    breakdown: value.breakdown,
    since: value.since,
    until: value.until,
    timeZone: value.timeZone,
    jsonExplicit: value.jsonExplicit,
    compactExplicit: value.compactExplicit,
    breakdownExplicit: value.breakdownExplicit,
    timeZoneExplicit: value.timeZoneExplicit,
  }, {
    command: 'monthly',
    json: true,
    compact: true,
    breakdown: true,
    since: '2026-01-01',
    until: '2026-01-31',
    timeZone: 'Asia/Shanghai',
    jsonExplicit: true,
    compactExplicit: true,
    breakdownExplicit: true,
    timeZoneExplicit: true,
  });
});

test('renders help without scanning data', async () => {
  const result = await runCli(['--help'], {});

  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /--no-cost/);
  assert.equal(result.stderr, '');
});

test('routes monthly and session table labels', async () => {
  const missing = join(tmpdir(), `kimiusage-missing-${Date.now()}-${Math.random()}`);
  const monthly = await runCli(['monthly', '--data-dir', missing, '--no-cost'], {});
  const session = await runCli(['session', '--data-dir', missing, '--no-cost'], {});

  assert.match(monthly.stdout, /^Month\s+/);
  assert.match(session.stdout, /^Session\s+/);
});

test('rejects invalid CLI input', () => {
  assert.throws(() => parseArgs(['yearly']), /Unknown command: yearly/);
  assert.throws(() => parseArgs(['daily', '--wat']), /Unknown option: --wat/);
  assert.throws(() => parseArgs(['daily', '--since']), /Missing value for --since/);
  assert.throws(
    () => parseArgs(['daily', '--timezone', '--json']),
    /Missing value for --timezone/,
  );
});

test('uses USD display currency from config', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kimiusage-usd-'));
  const dataDir = join(
    root,
    '.kimi-code',
    'sessions',
    'workspace-a',
    'session-a',
    'agents',
    'main',
  );
  const configPath = join(root, 'config.json');
  await mkdir(dataDir, { recursive: true });
  await writeFile(configPath, JSON.stringify({
    defaults: {
      currency: 'USD',
      dataDirs: [join(root, '.kimi-code')],
    },
  }));
  await writeFile(join(dataDir, 'wire.jsonl'), `${JSON.stringify({
    type: 'usage.record',
    usageScope: 'turn',
    time: Date.UTC(2026, 0, 1),
    model: 'kimi-code/kimi-for-coding',
    usage: { inputOther: 100, output: 0, inputCacheRead: 0, inputCacheCreation: 0 },
  })}\n`);

  const result = await runCli(['daily', '--config', configPath], { HOME: root });

  assert.match(result.stdout, /Cost \(USD\)/);
  assert.match(result.stdout, /\$0\.000060/);
});
