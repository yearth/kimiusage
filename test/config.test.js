import { mkdir, mkdtemp, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseArgs } from '../src/cli.js';
import { applyConfig, discoverConfig, loadConfig } from '../src/config.js';

test('discovers config in environment, XDG-style, then home order', async () => {
  const home = await mkdtemp(join(tmpdir(), 'kimiusage-config-'));
  const explicit = join(home, 'explicit.json');
  const xdg = join(home, '.config', 'kimiusage', 'config.json');
  const legacy = join(home, '.kimiusage.json');
  await mkdir(join(home, '.config', 'kimiusage'), { recursive: true });
  await Promise.all([
    writeFile(explicit, '{}'),
    writeFile(xdg, '{}'),
    writeFile(legacy, '{}'),
  ]);

  assert.equal(await discoverConfig({ KIMIUSAGE_CONFIG: explicit, HOME: home }), explicit);
  await unlink(explicit);
  assert.equal(await discoverConfig({ KIMIUSAGE_CONFIG: explicit, HOME: home }), xdg);
  await unlink(xdg);
  assert.equal(await discoverConfig({ HOME: home }), legacy);
  assert.equal(await discoverConfig({}), null);
});

test('rejects non-object config roots', async () => {
  const home = await mkdtemp(join(tmpdir(), 'kimiusage-config-invalid-'));
  const file = join(home, 'config.json');
  await writeFile(file, '[]');

  await assert.rejects(() => loadConfig(file), /Invalid config file:/);
});

test('applies defaults and command config without overriding explicit CLI flags', () => {
  const options = parseArgs(['weekly', '--json', '--timezone', 'UTC']);
  const merged = applyConfig(options, {
    defaults: {
      json: false,
      compact: true,
      breakdown: true,
      timezone: 'Asia/Shanghai',
      dataDir: '/tmp/a,/tmp/b',
    },
    commands: {
      weekly: {
        compact: false,
        timeZone: 'Europe/Berlin',
        startOfWeek: 'monday',
      },
    },
  });

  assert.deepEqual({
    json: merged.json,
    compact: merged.compact,
    breakdown: merged.breakdown,
    timeZone: merged.timeZone,
    startOfWeek: merged.startOfWeek,
    dataDirs: merged.dataDirs,
  }, {
    json: true,
    compact: false,
    breakdown: true,
    timeZone: 'UTC',
    startOfWeek: 'monday',
    dataDirs: ['/tmp/a', '/tmp/b'],
  });
});

test('loads display currency, exchange rates, and pricing currency', async () => {
  const home = await mkdtemp(join(tmpdir(), 'kimiusage-currency-config-'));
  const file = join(home, 'config.json');
  await writeFile(file, JSON.stringify({
    defaults: { currency: 'eur' },
    exchangeRates: {
      EUR: { perUsd: 0.86, asOf: '2026-07-13' },
    },
    pricing: {
      routed: {
        currency: 'eur',
        input: 1,
        output: 2,
        cacheRead: 0.1,
        cacheCreation: 1.25,
      },
    },
  }));

  const config = await loadConfig(file);
  const options = applyConfig(parseArgs(['daily']), config);

  assert.equal(options.currency, 'EUR');
  assert.equal(options.exchangeRates.EUR.perUsd, 0.86);
  assert.equal(options.pricing.routed.currency, 'EUR');
});

test('rejects pricing currencies without an exchange rate', async () => {
  const home = await mkdtemp(join(tmpdir(), 'kimiusage-missing-rate-'));
  const file = join(home, 'config.json');
  await writeFile(file, JSON.stringify({
    pricing: {
      routed: {
        currency: 'GBP',
        input: 1,
        output: 2,
        cacheRead: 0.1,
        cacheCreation: 1.25,
      },
    },
  }));

  await assert.rejects(() => loadConfig(file), /Missing exchange rate for GBP/);
});
