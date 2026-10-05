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

    const nearby = tokens.slice(i, i + 20).map(norm);

    if (
      nearby.includes('jgs') &&
      nearby.includes('v') &&
      nearby.includes('e') &&
      nearby.includes('d') &&
      nearby.includes('gm') &&
      nearby.includes('gs') &&
      nearby.includes('pts')
    ) {
      const ptsIndex = nearby.indexOf('pts');

      let serie = '';
      let fase = '';

      for (
        let x = i - 1;
        x >= 0 && x >= i - 350;
        x--
      ) {
        const text = clean(tokens[x]);
        const n = norm(text);

        if (
          !serie &&
          /^(s[eé]rie|serie|grupo)\b/i.test(text)
        ) {
          serie = text;
        }

        if (
          !fase &&
          (
            n.includes('fase') ||
            n.includes('apuramento') ||
            n.includes('subida') ||
            n.includes('manutencao')
          ) &&
          text.length < 100
        ) {
          fase = text;
        }

        if (serie && fase) break;
      }

      headers.push({
        headerIndex: i,
        dataStart: i + ptsIndex + 1,
        serie,
        fase
      });
    }
  }

  if (!headers.length) return [];

  const results = [];

  for (let h = 0; h < headers.length; h++) {
    const current = headers[h];

    const end =
      h + 1 < headers.length
        ? headers[h + 1].headerIndex
        : tokens.length;

    let i = current.dataStart;
    let expected = 1;

    const rows = [];

    while (expected <= 100 && i < end) {
      let posIndex = -1;

      for (
        let x = i;
        x < Math.min(end, i + 40);
        x++
      ) {
        if (tokens[x] === String(expected)) {
          posIndex = x;
          break;
        }
      }

      if (posIndex < 0) break;

      i = posIndex + 1;

      let team = '';

      while (i < end && i < posIndex + 15) {
        if (
          /[A-Za-zÀ-ÿ]/.test(tokens[i]) &&
          !/^(pos|jgs|v|e|d|gm|gs|pts|classificação|jogos|jornadas)$/i.test(
            tokens[i]
          )
        ) {
          team = tokens[i];
          i++;
          break;
        }

        i++;
      }

      if (!team) break;

      const nums = [];

      while (
        i < end &&
        nums.length < 7 &&
        i < posIndex + 35
      ) {
        if (/^-?\d+$/.test(tokens[i])) {
          nums.push(Number(tokens[i]));
        }

        i++;
      }

      if (nums.length < 7) break;

      const [
        played,
        wins,
        draws,
        losses,
        gf,
        ga,
        points
      ] = nums;

      rows.push({
        pos: expected,
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

      expected++;
    }

    if (rows.length < 3) continue;

    const labels = [];

    if (current.fase) labels.push(current.fase);
    if (current.serie) labels.push(current.serie);

    const name = labels.length
      ? `${meta.name} — ${labels.join(' — ')}`
      : meta.name;

    results.push({
      ...meta,
      name,
      source: meta.url,
      standings: rows
    });
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
