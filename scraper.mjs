import * as cheerio from 'cheerio';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = 'https://centroderesultados-as-prd.azurewebsites.net';
const INDEX_URL = `${BASE}/Competition`;
const DATA_FILE = path.resolve('data/standings.json');
const DELAY = 250;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const clean = v => String(v || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
const norm = v => clean(v).normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase();

async function getHtml(url) {
  const r = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0',
      'accept-language': 'pt-PT,pt;q=0.9',
      accept: 'text/html,application/xhtml+xml'
    },
    redirect: 'follow'
  });

  if (!r.ok) throw new Error(`HTTP ${r.status}: ${url}`);

  const html = await r.text();
  await sleep(DELAY);
  return html;
}

function absolute(href) {
  return new URL(href, BASE).toString().split('#')[0];
}

function isLeague(name) {
  const t = norm(name);

  if (
    t.includes('taca') ||
    t.includes('superta') ||
    t.includes('cup') ||
    t.includes('torneio') ||
    t.includes('futsal') ||
    t.includes('femin')
  ) return false;

  return (
    t.includes('divisao') ||
    t.includes('campeonato') ||
    t.includes('liga') ||
    t.includes('honra') ||
    t.includes('elite') ||
    t.includes('pro-nacional') ||
    t.includes('pro nacional')
  );
}

function discoverIndex(html) {
  const $ = cheerio.load(html);
  const competitions = [];
  const associations = [];

  const nationals = new Map([
    ['liga portugal betclic', 1],
    ['liga portugal meu super', 2],
    ['liga 3 placard', 3],
    ['campeonato de portugal', 4]
  ]);

  $('a[href]').each((_, a) => {
    const name = clean($(a).text());
    const href = $(a).attr('href');
    if (!href) return;

    const n = norm(name);

    if (nationals.has(n)) {
      competitions.push({
        group: 'Nacional',
        association: 'Portugal',
        level: nationals.get(n),
        name,
        url: absolute(href)
      });
    }

    if (
      /^a\.f\./i.test(name) &&
      /GetCompetitionsByAssociation/i.test(href)
    ) {
      associations.push({
        name: name.replace(/^A\.F\./i, 'AF').trim(),
        url: absolute(href)
      });
    }
  });

  return { competitions, associations };
}

function discoverAssociation(html, association) {
  const $ = cheerio.load(html);
  const found = new Map();

  let football = false;
  let senior = false;

  const elements = $('body *').toArray();

  for (const el of elements) {
    const $el = $(el);

    const own = clean(
      $el.clone().children().remove().end().text()
    );

    const n = norm(own);

    if (n === 'competicoes de futebol') {
      football = true;
      senior = false;
      continue;
    }

    if (
      n === 'competicoes de futsal' ||
      n === 'competicoes de futebol de praia'
    ) {
      football = false;
      senior = false;
    }

    if (football && n === 'senior' && !senior) {
      senior = true;
      continue;
    }

    if (
      senior &&
      (
        n.startsWith('junior-') ||
        n.includes('juvenil') ||
        n.includes('iniciado') ||
        n.includes('infantil') ||
        n.includes('benjamim')
      )
    ) {
      break;
    }

    if (!football || !senior) continue;

    if (String(el.tagName || '').toLowerCase() !== 'a') continue;

    const href = $el.attr('href');
    const name = clean($el.text());

    if (
      href &&
      /Competition\/Details/i.test(href) &&
      isLeague(name)
    ) {
      const url = absolute(href);

      found.set(url, {
        group: 'Distrital',
        association,
        name,
        url
      });
    }
  }

  return [...found.values()];
}

function pageTokens($) {
  return $('body *')
    .filter((_, el) => $(el).children().length === 0)
    .map((_, el) => clean($(el).text()))
    .get()
    .filter(Boolean);
}

function parseStandings(html, meta) {
  const $ = cheerio.load(html);
  const tokens = pageTokens($);

  const headers = [];

  for (let i = 0; i < tokens.length; i++) {
    if (norm(tokens[i]) !== 'pos') continue;

    const nearby = tokens.slice(i, i + 25).map(norm);

    if (
      nearby.includes('jgs') &&
      nearby.includes('v') &&
      nearby.includes('e') &&
      nearby.includes('d') &&
      nearby.includes('gm') &&
      nearby.includes('gs') &&
      nearby.includes('pts')
    ) {
      const ptsOffset = nearby.indexOf('pts');

      let label = '';

      for (let x = i - 1; x >= Math.max(0, i - 150); x--) {
        const t = clean(tokens[x]);

        if (/^(Série|Serie|Grupo)\s+/i.test(t)) {
          label = t;
          break;
        }
      }

      headers.push({
        header: i,
        dataStart: i + ptsOffset + 1,
        label
      });
    }
  }

  if (!headers.length) return [];

  const results = [];

  for (let h = 0; h < headers.length; h++) {
    const current = headers[h];

    const end =
      h + 1 < headers.length
        ? headers[h + 1].header
        : tokens.length;

    const rows = [];
    const seen = new Set();

    let i = current.dataStart;

    while (i < end) {
      if (!/^\d+$/.test(tokens[i])) {
        i++;
        continue;
      }

      const pos = Number(tokens[i]);

      if (pos < 1 || pos > 100) {
        i++;
        continue;
      }

      const posIndex = i;

      let team = '';
      let teamIndex = -1;

      for (
        let x = posIndex + 1;
        x < Math.min(end, posIndex + 25);
        x++
      ) {
        const value = tokens[x];

        if (
          /[A-Za-zÀ-ÿ]/.test(value) &&
          !/^(pos|jgs|v|e|d|gm|gs|pts|classificação|jogos|jornadas)$/i.test(value)
        ) {
          team = value;
          teamIndex = x;
          break;
        }
      }

      if (!team) {
        i++;
        continue;
      }

      const nums = [];

      for (
        let x = teamIndex + 1;
        x < Math.min(end, teamIndex + 40);
        x++
      ) {
        if (/^-?\d+$/.test(tokens[x])) {
          nums.push(Number(tokens[x]));
        }

        if (nums.length === 7) break;
      }

      if (nums.length < 7) {
        i++;
        continue;
      }

      const [
        played,
        wins,
        draws,
        losses,
        gf,
        ga,
        points
      ] = nums;

      // Evita interpretar números alheios à classificação.
      if (
        played < 0 || played > 60 ||
        wins < 0 || wins > 60 ||
        draws < 0 || draws > 60 ||
        losses < 0 || losses > 60 ||
        gf < 0 || gf > 300 ||
        ga < 0 || ga > 300 ||
        points < -20 || points > 200
      ) {
        i++;
        continue;
      }

      const key = `${pos}|${team}`;

      if (!seen.has(key)) {
        seen.add(key);

        rows.push({
          pos,
          team,
          points,
          played,
          wins,
          draws,
          losses,
          gf,
          ga,
          gd: gf - ga
        });
      }

      i = teamIndex + 1;
    }

    if (rows.length < 3) continue;

    /*
      Algumas páginas FPF intercalam duas séries:
      1A,1B,2A,2B,3A,3B...
      Se isso acontecer, separamo-las.
    */
    const counts = new Map();

    for (const row of rows) {
      counts.set(row.pos, (counts.get(row.pos) || 0) + 1);
    }

    const numberOfSeries = Math.max(...counts.values());

    if (numberOfSeries > 1) {
      const series = Array.from(
        { length: numberOfSeries },
        () => []
      );

      const occurrence = new Map();

      for (const row of rows) {
        const n = occurrence.get(row.pos) || 0;

        series[n].push(row);
        occurrence.set(row.pos, n + 1);
      }

      series.forEach((serieRows, index) => {
        if (serieRows.length < 3) return;

        serieRows.sort((a, b) => a.pos - b.pos);

        const suffix =
          current.label ||
          `Série ${index + 1}`;

        results.push({
          ...meta,
          name: `${meta.name} — ${suffix}`,
          source: meta.url,
          standings: serieRows
        });
      });

    } else {
      rows.sort((a, b) => a.pos - b.pos);

      results.push({
        ...meta,
        name: current.label
          ? `${meta.name} — ${current.label}`
          : meta.name,
        source: meta.url,
        standings: rows
      });
    }
  }

  return results;
}
async function scrapeCompetition(meta) {
  try {
    const html = await getHtml(meta.url);
    return parseStandings(html, meta);
  } catch (e) {
    return [];
  }
}

async function previousData() {
  try {
    return JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
  } catch {
    return {
      updatedAt: null,
      source: 'Centro de Resultados FPF',
      competitionCount: 0,
      associationCount: 0,
      competitions: []
    };
  }
}

export async function updateAll({ onProgress = () => {} } = {}) {
  onProgress('A abrir a FPF…');

  const indexHtml = await getHtml(INDEX_URL);
  const discovered = discoverIndex(indexHtml);

  const roots = [...discovered.competitions];

  for (const association of discovered.associations) {
    onProgress(`A descobrir ${association.name}…`);

    try {
      const html = await getHtml(association.url);

      roots.push(
        ...discoverAssociation(html, association.name)
      );
    } catch (e) {
      onProgress(`Aviso em ${association.name}: ${e.message}`);
    }
  }

  const uniqueRoots = [
    ...new Map(roots.map(x => [x.url, x])).values()
  ];

  onProgress(
    `Encontradas ${uniqueRoots.length} competições candidatas.`
  );

  const competitions = [];

  for (let i = 0; i < uniqueRoots.length; i++) {
    const meta = uniqueRoots[i];

    onProgress(
      `A atualizar ${meta.name} (${i + 1}/${uniqueRoots.length})…`
    );

    competitions.push(
      ...await scrapeCompetition(meta)
    );
  }

  competitions.sort((a, b) => {
    if (a.group !== b.group) {
      return a.group === 'Nacional' ? -1 : 1;
    }

    if ((a.level || 99) !== (b.level || 99)) {
      return (a.level || 99) - (b.level || 99);
    }

    return `${a.association} ${a.name}`
      .localeCompare(`${b.association} ${b.name}`, 'pt');
  });

  const valid = competitions.filter(
    c => c.standings && c.standings.length >= 3
  );

  if (!valid.length) {
    onProgress(
      'Sem classificações válidas; mantida a última versão.'
    );
    return previousData();
  }

  const payload = {
    updatedAt: new Date().toISOString(),
    timezone: 'Europe/Lisbon',
    source: 'Centro de Resultados FPF',
    competitionCount: valid.length,
    associationCount: new Set(
      valid
        .filter(x => x.group === 'Distrital')
        .map(x => x.association)
    ).size,
    competitions: valid
  };

  await fs.mkdir(path.dirname(DATA_FILE), {
    recursive: true
  });

  await fs.writeFile(
    DATA_FILE,
    JSON.stringify(payload, null, 2),
    'utf8'
  );

  onProgress(
    `OK: ${payload.competitionCount} classificações de ${payload.associationCount} associações.`
  );

  return payload;
}

export async function readData() {
  return previousData();
}
