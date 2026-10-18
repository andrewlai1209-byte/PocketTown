import {mkdir, readFile, readdir, stat, writeFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {createZip} from './zip.mjs';

const root = resolve(import.meta.dirname, '..');
const {version} = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const entries = ['dist', 'public', 'src', 'scripts', 'tests', 'docs', 'licenses', 'index.html', 'Start Game.cmd', 'package.json', 'package-lock.json', 'vite.config.js', 'README.md'];
const files = [];
async function collect(relative) {
  const path = join(root, relative);
  const info = await stat(path);
  if (info.isDirectory()) {
    for (const name of (await readdir(path)).sort()) await collect(join(relative, name));
  } else files.push({name:`Pocket Town 3D/${relative}`, data:await readFile(path)});
}
for (const entry of entries) await collect(entry);
const releaseDir = join(root, 'releases');
await mkdir(releaseDir, {recursive:true});
const archive = join(releaseDir, `Pocket-Town-3D-${version}.zip`);
const data = createZip(files);
await writeFile(archive, data);
console.log(`Release created: ${archive}\n${files.length} files, ${Math.round(data.length / 1024)} KB.`);
