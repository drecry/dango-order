/** Remove stale build output so old files never leak into a release. */
import { existsSync, lstatSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
if (dirname(dist) !== root || (existsSync(dist) && lstatSync(dist).isSymbolicLink())) {
  throw new Error('Check the location of the public folder');
}
rmSync(dist, { recursive: true, force: true });
