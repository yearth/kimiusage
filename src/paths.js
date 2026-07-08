import { access, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export function defaultDataDirs(env = process.env) {
  if (env.KIMI_DATA_DIR) {
    return env.KIMI_DATA_DIR.split(',').map((value) => value.trim()).filter(Boolean);
  }
  const home = env.HOME;
  if (!home) return [];
  return [join(home, '.kimi-code'), join(home, '.kimi')];
}

export async function discoverWireFiles(dataDirs) {
  const files = [];
  for (const dir of dataDirs) {
    if (!(await exists(dir))) continue;
    await walk(dir, files);
  }
  return files.sort();
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
    } else if (entry.isFile() && entry.name === 'wire.jsonl') {
      files.push(path);
    }
  }
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
