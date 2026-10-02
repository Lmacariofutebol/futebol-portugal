import { updateAll, readData } from '../scraper.mjs';
import fs from 'node:fs/promises';

const before = await readData();

try {
  const data = await updateAll({ onProgress: msg => console.log(`[update] ${msg}`) });

  if (!data.competitionCount) {
    if (before.competitionCount) {
      await fs.writeFile('data/standings.json', JSON.stringify(before, null, 2), 'utf8');
      console.warn(`[update] sem dados novos; mantidas ${before.competitionCount} classificações anteriores.`);
    } else {
      console.warn('[update] sem dados válidos na primeira recolha; o site será publicado em modo de espera.');
    }
    process.exitCode = 2;
  } else {
    console.log(`[update] concluído: ${data.competitionCount} tabelas, ${data.associationCount} associações.`);
  }
} catch (error) {
  if (before.competitionCount) {
    await fs.writeFile('data/standings.json', JSON.stringify(before, null, 2), 'utf8');
  }
  console.error('[update] falhou:', error?.stack || error);
  process.exitCode = 1;
}
