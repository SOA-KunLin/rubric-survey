import { copyFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));
const dests = [
  join(root, '..', 'backend', 'src', 'rubric', 'rubric.json'),
  join(root, '..', 'frontend', 'src', 'data', 'rubric.json'),
];
for (const d of dests) {
  mkdirSync(dirname(d), { recursive: true });
  copyFileSync(join(root, '..', 'rubric.json'), d);
}
console.log('[sync-rubric] rubric.json synced to backend & frontend');
