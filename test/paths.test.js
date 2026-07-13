import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { discoverWireFiles, metadataFromPath } from '../src/paths.js';

test('discovers only supported Kimi wire layouts', async () => {
  const root = join(tmpdir(), `kimiusage-paths-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const files = [
    '.kimi-code/sessions/ws-a/session-a/agents/main/wire.jsonl',
    '.kimi/sessions/group-a/session-b/wire.jsonl',
    '.kimi-code/sessions/ws-a/session-a/wire.jsonl',
    '.kimi-code/sessions/ws-a/session-a/agents/main/nested/wire.jsonl',
    '.kimi/sessions/group-a/session-b/nested/wire.jsonl',
    '.kimi-code/sessions/ws-a/session-a/agents/main/other.jsonl',
  ];
  for (const file of files) {
    const path = join(root, file);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, '{}\n');
  }

  const discovered = await discoverWireFiles([
    join(root, '.kimi-code'),
    join(root, '.kimi'),
  ]);

  assert.deepEqual(discovered.map((file) => relative(root, file)), [
    '.kimi-code/sessions/ws-a/session-a/agents/main/wire.jsonl',
    '.kimi/sessions/group-a/session-b/wire.jsonl',
  ]);
});

test('extracts Kimi Code and legacy path metadata', () => {
  assert.deepEqual(
    metadataFromPath('/tmp/home/.kimi-code/sessions/ws-a/session-a/agents/main/wire.jsonl'),
    {
      source: 'kimi-code',
      rootDir: '/tmp/home/.kimi-code',
      workspace: 'ws-a',
      sessionId: 'session-a',
      agentId: 'main',
    },
  );
  assert.deepEqual(
    metadataFromPath('/tmp/home/.kimi/sessions/group-a/session-b/wire.jsonl'),
    {
      source: 'kimi',
      rootDir: '/tmp/home/.kimi',
      workspace: 'group-a',
      sessionId: 'session-b',
      agentId: null,
    },
  );
});
