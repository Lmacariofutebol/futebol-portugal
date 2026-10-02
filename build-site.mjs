import fs from 'node:fs/promises';
import path from 'node:path';

const out = path.resolve('_site');
await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(path.join(out, 'data'), { recursive: true });
await fs.cp('public', out, { recursive: true });
await fs.copyFile('data/standings.json', path.join(out, 'data', 'standings.json'));
await fs.writeFile(path.join(out, '.nojekyll'), '', 'utf8');
console.log(`[build] site estático criado em ${out}`);
