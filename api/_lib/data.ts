import fs from 'node:fs';
import path from 'node:path';
import type { SeedData } from './types';

let cache: SeedData | undefined;

export function getSeedData(): SeedData {
  if (cache) {
    return cache;
  }

  const filePath = path.join(process.cwd(), 'db', 'seed-data.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  cache = JSON.parse(raw) as SeedData;
  return cache;
}
