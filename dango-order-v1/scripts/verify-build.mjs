/**
 * Verify the built output before it can be deployed (Dango Order).
 * Checks the deploy range, HTML references and secret files, then writes
 * build-info.json with the commit so a live build can be matched to GitHub.
 * Adapted from Dango Drop's verify-build.mjs.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, relative, sep, extname } from 'node:path';

const settings = JSON.parse(readFileSync('deployment.json', 'utf8'));
const root = resolve('dist');
const entry = resolve(root, settings.path.slice(1), 'index.html');
if (!existsSync(entry)) throw new Error('index.html is missing at the public URL');
const allowed = new Set([
  '.html', '.js', '.css', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico',
  '.mp3', '.ogg', '.wav', '.mp4', '.woff', '.woff2', '.ttf', '.xml', '.txt', '.json',
]);

/** Walk the public files recursively. Symlinks are never deployed. */
function inspect(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const file = resolve(dir, item.name);
    const name = relative(root, file).split(sep).join('/');
    if (item.isSymbolicLink() || item.name.startsWith('.')) {
      throw new Error('Non-public file: ' + name);
    }
    if (item.isDirectory()) {
      inspect(file);
      continue;
    }
    if (
      !allowed.has(extname(file)) ||
      /(?:^|\/)(?:package(?:-lock)?\.json|CLAUDE\.md)$/.test(name)
    ) {
      throw new Error('Not a deploy target: ' + name);
    }
    if (statSync(file).size > 25 * 1024 * 1024) {
      throw new Error('Single file too large: ' + name);
    }
    if (settings.path !== '/' && !name.startsWith(settings.path.slice(1))) {
      throw new Error('File for another project: ' + name);
    }
    if (extname(file) === '.html') {
      const html = readFileSync(file, 'utf8');
      for (const match of html.matchAll(/(?:src|poster)=["']([^"']+)["']/g)) {
        const value = match[1];
        if (/^(?:https?:|data:|#|\/\/)/.test(value)) continue;
        const target = value.startsWith('/')
          ? resolve(root, '.' + value.split(/[?#]/)[0])
          : resolve(dir, value.split(/[?#]/)[0]);
        if (!target.startsWith(root + sep) || !existsSync(target)) {
          throw new Error('Missing reference: ' + name + ' -> ' + value);
        }
      }
    }
  }
}
inspect(root);

let commit = 'unknown';
try {
  commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
} catch {
  // Local builds outside a git checkout still verify; only the stamp is vague.
}
writeFileSync(
  resolve(root, settings.path.slice(1), 'build-info.json'),
  JSON.stringify({ project: settings.name, commit, builtAt: new Date().toISOString() }, null, 2) + '\n',
);
console.log('Checked the public range and references: ' + settings.name);
