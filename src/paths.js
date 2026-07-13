import { access, readdir } from 'node:fs/promises';
import { basename, join, sep } from 'node:path';

export function defaultDataDirs(env = process.env) {
  if (env.KIMI_DATA_DIR) {
    return env.KIMI_DATA_DIR.split(',').map((value) => value.trim()).filter(Boolean);
  }
  const home = env.HOME;
  if (!home) return [];
  return [join(home, '.kimi-code'), join(home, '.kimi')];
}

export async function discoverWireFiles(dataDirs) {
  const files = new Set();
  for (const dir of dataDirs) {
    if (!(await exists(dir))) continue;
    await walk(dir, files);
  }
  return Array.from(files).sort();
}

async function walk(dir, files) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(path, files);
    } else if (entry.isFile() && entry.name === 'wire.jsonl' && metadataFromPath(path)) {
      files.add(path);
    }
  }
}

export function metadataFromPath(file) {
  const parts = file.split(sep);
  const sessions = parts.lastIndexOf('sessions');
  if (sessions === -1) return null;

  const rootDir = parts.slice(0, sessions).join(sep) || sep;
  const rootName = basename(rootDir);
  const relative = parts.slice(sessions + 1);
  if (
    rootName !== '.kimi' &&
    relative.length === 5 &&
    relative[2] === 'agents' &&
    relative[4] === 'wire.jsonl'
  ) {
    return {
      source: 'kimi-code',
      rootDir,
      workspace: relative[0],
      sessionId: relative[1],
      agentId: relative[3],
    };
  }
  if (rootName !== '.kimi-code' && relative.length === 3 && relative[2] === 'wire.jsonl') {
    return {
      source: 'kimi',
      rootDir,
      workspace: relative[0],
      sessionId: relative[1],
      agentId: null,
    };
  }
  return null;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
