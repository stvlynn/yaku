import { spawnSync } from 'node:child_process';
import { cp, mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const result = spawnSync(process.execPath, [process.env.npm_execpath, 'licenses', 'list', '--prod', '--json'], { encoding: 'utf8' });
if (result.status !== 0) throw new Error(result.stderr);
const groups = JSON.parse(result.stdout);
const destination = new URL('../public/licenses/', import.meta.url);
await mkdir(destination, { recursive: true });
await cp(new URL('../licenses/HY-MT2-LICENSE.txt', import.meta.url), new URL('HY-MT2-LICENSE.txt', destination));
await cp(new URL('../LICENSE', import.meta.url), new URL('Yaku-LICENSE.txt', destination));
await cp(new URL('../THIRD_PARTY_NOTICES.md', import.meta.url), new URL('THIRD_PARTY_NOTICES.md', destination));
const index = [];
for (const packages of Object.values(groups)) {
  for (const { paths, ...metadata } of packages) {
    const name = `${metadata.name.replaceAll('/', '__')}-${metadata.versions.join('_')}`;
    const directory = new URL(`${name}/`, destination);
    const files = [];
    for (const path of paths) {
      for (const entry of await readdir(path, { withFileTypes: true })) {
        if (!/^(licen[cs]e|copying|notice|third.party)/i.test(entry.name)) continue;
        await mkdir(directory, { recursive: true });
        await cp(join(path, entry.name), new URL(entry.name, directory), { recursive: true });
        files.push(`${name}/${entry.name}`);
      }
    }
    index.push({ ...metadata, files: [...new Set(files)] });
  }
}
await writeFile(new URL('dependencies.json', destination), `${JSON.stringify(index, null, 2)}\n`);
