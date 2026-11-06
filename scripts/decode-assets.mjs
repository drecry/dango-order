/**
 * Decode the committed dango images (Dango Order).
 *
 * The GitHub connector used to push this repo cannot upload binary files,
 * so the real character PNGs are stored as base64 text files under
 * assets-src/:
 *   - one file per image:  assets-src/assets/dango/<name>.png.b64
 *   - or, for images whose base64 is larger than the connector's
 *     single-argument limit, numbered chunks:
 *     assets-src/assets/dango/<name>.png.b64.part-00, .part-01, ...
 * This script joins the chunks (when present), decodes the base64 back
 * into real PNGs under public/, where the game reads them from. It runs
 * automatically before `npm run dev` and `npm run build` (npm predev /
 * prebuild hooks).
 *
 * The decoded PNGs are git-ignored build artifacts. The .b64 files are
 * the tracked source of truth — they contain the exact image bytes from
 * Google Drive (Dango Drop's public/assets/dango). A future direct git
 * push can replace each .png.b64 (and its parts) with the real .png file
 * under public/ and delete this script; the game code only ever reads
 * the .png files.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = join(root, 'assets-src');
const publicDir = join(root, 'public');

/**
 * Collect decode jobs: target PNG path -> base64 text (single file, or
 * numbered parts joined in order).
 */
const jobs = new Map();
const walk = (dir, relative) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    const rel = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      walk(path, rel);
      continue;
    }
    const single = rel.match(/^(.*\.png)\.b64$/);
    const part = rel.match(/^(.*\.png)\.b64\.part-(\d+)$/);
    if (single) {
      jobs.set(join(publicDir, single[1]), readFileSync(path, 'utf8'));
    } else if (part) {
      const target = join(publicDir, part[1]);
      const list = jobs.get(target) ?? [];
      list[Number(part[2])] = readFileSync(path, 'utf8');
      jobs.set(target, list);
    }
  }
};

const decoded = [];
if (!existsSync(sourceDir)) {
  console.log('No assets-src/ directory, nothing to decode.');
} else {
  walk(sourceDir, '');
  for (const [target, value] of jobs) {
    const base64 = Array.isArray(value)
      ? value.join('')
      : value;
    const bytes = Buffer.from(base64.trim(), 'base64');
    let needsWrite = true;
    try {
      needsWrite = !readFileSync(target).equals(bytes);
    } catch {
      needsWrite = true;
    }
    if (needsWrite) {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, bytes);
      decoded.push(target);
    }
  }
  console.log(
    decoded.length > 0
      ? `Decoded ${decoded.length} image(s) from .png.b64 files.`
      : 'All images already decoded.',
  );
}
