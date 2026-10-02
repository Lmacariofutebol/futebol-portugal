import * as cheerio from 'cheerio';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = 'https://www.zerozero.pt';
const USER_AGENT = process.env.USER_AGENT || 'PortugalClassificacoes/1.0 (+personal football standings site; once-daily refresh)';
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS || 700);
const DATA_FILE = path.resolve('data/standings.json');

const nationalCompetitions = [
  { level: 1, group: 'Nacional', association: 'Portugal', name: 'Liga Portugal Betclic', url: `${BASE}/competicao/liga-portuguesa` },
  { level: 2, group: 'Nacional', association: 'Portugal', name: 'Liga Portugal 2 Meu Super', url: `${BASE}/competicao/segunda-liga-portuguesa` },
  { level: 3, group: 'Nacional', association: 'Portugal', name: 'Liga 3 Placard', url: `${BASE}/competicao/liga-3` },
  { level: 4, group: 'Nacional', association: 'Portugal', name: 'Campeonato de Portugal', url: `${BASE}/competicao/campeonato-de-portugal` }
];

export const associations = [
  ['AF Algarve', 'af-algarve'],
  ['AF Angra Heroísmo', 'af-angra-heroismo'],
  ['AF Aveiro', 'af-aveiro'],
  ['AF Beja', 'af-beja'],
  ['AF Braga', 'af-braga'],
  ['AF Bragança', 'af-braganca'],
  ['AF Castelo Branco', 'af-castelo-branco'],
  ['AF Coimbra', 'af-coimbra'],
  ['AF Évora', 'af-evora'],
  ['AF Guarda', 'af-guarda'],
  ['AF Horta', 'af-horta'],
  ['AF Leiria', 'af-leiria'],
  ['AF Lisboa', 'af-lisboa'],
  ['AF Madeira', 'af-madeira'],
  ['AF Ponta Delgada', 'af-ponta-delgada'],
  ['AF Portalegre', 'af-portalegre'],
  ['AF Porto', 'af-porto'],
  ['AF Santarém', 'af-santarem'],
  ['AF Setúbal', 'af-setubal'],
  ['AF Viana do Castelo', 'af-viana-do-castelo'],
  ['AF Vila Real', 'af-vila-real'],
  ['AF Viseu', 'af-viseu']
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
const absolute = href => new URL(href, BASE).toString().split('#')[0];

async function fetchHtml(url, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'user-agent': USER_AGENT,
          'accept-language': 'pt-PT,pt;q=0.9,en;q=0.7',
          accept: 'text/html,application/xhtml+xml'
        },
        redirect: 'follow'
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
      const html = await res.text();
      await sleep(REQUEST_DELAY_MS);
      return html;
    } catch (err) {
      lastError = err;
      await sleep(900 * (i + 1));
    }
  }
  throw lastError;
}

function likelySeniorMensLeague(name, context = '') {
  const t = `${name} ${context}`.toLowerCase();
  const reject = [
    'futsal', 'futebol de praia', 'fut.7', 'fut7', 'futebol de 7', 'futebol de 9',
    'femin', 'junior', 'jun.', 'sub-', 'sub ', 'u19', 'u17', 'u15', 'u13', 'juven', 'iniciad',
    'masters', 'veteran', 'reservas', 'sub-23', 'sub 23', 'sub-22', 'sub 22', 'sub-20', 'sub 20',
    'taça', 'taca', 'supertaça', 'supertaca', 'torneio', 'playoff', 'play-off'
  ];
  if (reject.some(x => t.includes(x))) return false;
  const positive = ['divisão', 'divisao', 'liga', 'campeonato', 'pró-nacional', 'pro-nacional', 'elite', 'honra', 'af '];
  return positive.some(x => t.includes(x));
}

function extractCompetitionLinks(html, association) {
  const $ = cheerio.load(html);
  const found = new Map();
  $('a[href*="/competicao/"]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const name = clean($(el).text());
    if (!name || name.length < 3) return;
    let context = '';
    const parent = $(el).closest('article,li,.item,.box,.list-item,.card,div');
    if (parent.length) context = clean(parent.first().text()).slice(0, 450);
    if (!likelySeniorMensLeague(name, context)) return;
    const url = absolute(href).split('?')[0];
    if (!url.includes('/competicao/')) return;
    if (!found.has(url)) found.set(url, { group: 'Distrital', association, name, url });
  });
  return [...found.values()];
}

async function discoverAssociation(association, slug) {
  const out = new Map();
  let stalePages = 0;
  for (let page = 1; page <= 8; page++) {
    const url = `${BASE}/competicoes/${slug}?age_group_id=1&official_id=1&page=${page}`;
    let html;
    try { html = await fetchHtml(url); } catch { break; }
    const links = extractCompetitionLinks(html, association);
    const before = out.size;
    for (const item of links) out.set(item.url, item);
    if (out.size === before) stalePages += 1; else stalePages = 0;
    if (stalePages >= 2) break;
  }
  return [...out.values()];
}

function parseStandingsTable($, table) {
  const rows = [];
  const headers = $(table).find('thead th').map((_, el) => clean($(el).text()).toUpperCase()).get();
  const fallbackHeaderCells = $(table).find('tr').first().find('th,td').map((_, el) => clean($(el).text()).toUpperCase()).get();
  const h = headers.length ? headers : fallbackHeaderCells;
  const statNames = ['P','J','V','E','D','GM','GS','DG'];
  const pIndex = h.findIndex(x => x === 'P');
  const idx = Object.fromEntries(statNames.map(k => [k, h.findIndex(x => x === k)]));

  $(table).find('tbody tr, tr').each((_, tr) => {
    const cells = $(tr).find('td').map((__, td) => clean($(td).text())).get();
    if (cells.length < 7) return;
    const numericCount = cells.filter(v => /^[-+]?\d+$/.test(v)).length;
    if (numericCount < 5) return;

    const pos = Number.parseInt(cells[0], 10);
    let teamIndex = pIndex > 0 ? pIndex - 1 : 2;
    if (!cells[teamIndex] || /^[-+]?\d+$/.test(cells[teamIndex])) {
      teamIndex = cells.findIndex((v, i) => i > 0 && !/^[-+]?\d+$/.test(v) && v.length > 1);
    }
    const team = clean(cells[teamIndex]);
    if (!team || team.length > 90) return;

    const getByHeader = key => {
      const hi = idx[key];
      if (hi >= 0 && hi < cells.length) return cells[hi];
      return null;
    };
    const afterTeam = cells.slice(teamIndex + 1).filter(v => /^[-+]?\d+$/.test(v));
    const vals = {};
    statNames.forEach((k, i) => vals[k] = getByHeader(k) ?? afterTeam[i] ?? '');

    rows.push({
      pos: Number.isFinite(pos) ? pos : rows.length + 1,
      team,
      points: Number(vals.P) || 0,
      played: Number(vals.J) || 0,
      wins: Number(vals.V) || 0,
      draws: Number(vals.E) || 0,
      losses: Number(vals.D) || 0,
      gf: Number(vals.GM) || 0,
      ga: Number(vals.GS) || 0,
      gd: Number(vals.DG) || 0
    });
  });

  const unique = [];
  const seen = new Set();
  for (const r of rows) {
    const key = `${r.pos}|${r.team}`;
    if (!seen.has(key)) { seen.add(key); unique.push(r); }
  }
  return unique.length >= 3 ? unique : [];
}

function parsePage(html, sourceUrl, meta = {}) {
  const $ = cheerio.load(html);
  const title = clean($('h1').first().text()) || meta.name || 'Competição';
  const tables = [];
  $('table').each((_, table) => {
    const text = clean($(table).text()).toUpperCase();
    if (text.includes(' P ') || text.includes('CLASSIFICA')) {
      const rows = parseStandingsTable($, table);
      if (rows.length) tables.push(rows);
    }
  });

  const season = title.match(/20\d{2}\s*\/\s*\d{2,4}|20\d{2}\/\d{2}/)?.[0] || '';
  const editionLinks = new Map();
  $('a[href*="/edicao/"]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const parentText = clean($(el).closest('article,li,.item,.box,.card,div').first().text());
    const linkText = clean($(el).text());
    const context = `${linkText} ${parentText}`;
    const relevantSeason = !season || context.includes(season) || /2026\/?27/.test(context) || context.includes('Ver Prova');
    if (!relevantSeason) return;
    if (/taça|taca|supertaça|playoff|play-off/i.test(context)) return;
    const url = absolute(href).split('?')[0];
    if (!editionLinks.has(url)) editionLinks.set(url, { url, label: context.slice(0, 140) });
  });

  return { title, tables, editionLinks: [...editionLinks.values()], sourceUrl };
}

async function scrapeOneCompetition(meta) {
  try {
    const html = await fetchHtml(meta.url);
    const parsed = parsePage(html, meta.url, meta);
    const results = [];

    parsed.tables.forEach((rows, i) => results.push({
      ...meta,
      name: parsed.tables.length > 1 ? `${parsed.title} — ${i + 1}` : parsed.title,
      source: meta.url,
      standings: rows
    }));

    if (results.length === 0 || parsed.editionLinks.length > 1) {
      const candidates = parsed.editionLinks.slice(0, 18);
      for (const item of candidates) {
        try {
          const subHtml = await fetchHtml(item.url);
          const sub = parsePage(subHtml, item.url, meta);
          sub.tables.forEach((rows, i) => results.push({
            ...meta,
            name: sub.tables.length > 1 ? `${sub.title} — ${i + 1}` : sub.title,
            source: item.url,
            standings: rows
          }));
        } catch (e) {
          // Mantém as restantes séries/fases mesmo se uma falhar.
        }
      }
    }

    const deduped = new Map();
    for (const r of results) {
      const key = `${r.name}|${r.standings.map(x => x.team).join(',')}`;
      if (!deduped.has(key)) deduped.set(key, r);
    }
    return [...deduped.values()];
  } catch (error) {
    return [{ ...meta, error: String(error?.message || error), standings: [] }];
  }
}

export async function updateAll({ onProgress = () => {} } = {}) {
  onProgress('A descobrir campeonatos distritais no zerozero…');
  const discovered = [];
  for (const [association, slug] of associations) {
    onProgress(`A descobrir ${association}…`);
    const items = await discoverAssociation(association, slug);
    discovered.push(...items);
  }

  const competitionMap = new Map();
  for (const c of [...nationalCompetitions, ...discovered]) competitionMap.set(c.url, c);
  const competitions = [...competitionMap.values()];

  const all = [];
  let done = 0;
  for (const meta of competitions) {
    onProgress(`A atualizar ${meta.name} (${done + 1}/${competitions.length})…`);
    const parts = await scrapeOneCompetition(meta);
    all.push(...parts);
    done += 1;
  }

  const valid = all.filter(x => x.standings?.length);
  valid.sort((a, b) => {
    if (a.group !== b.group) return a.group === 'Nacional' ? -1 : 1;
    if ((a.level || 99) !== (b.level || 99)) return (a.level || 99) - (b.level || 99);
    return `${a.association} ${a.name}`.localeCompare(`${b.association} ${b.name}`, 'pt');
  });

  const payload = {
    updatedAt: new Date().toISOString(),
    timezone: 'Europe/Lisbon',
    source: 'zerozero.pt',
    competitionCount: valid.length,
    associationCount: new Set(valid.filter(x => x.group === 'Distrital').map(x => x.association)).size,
    competitions: valid,
    diagnostics: {
      discoveredRoots: competitions.length,
      failedRoots: all.filter(x => x.error).map(x => ({ name: x.name, url: x.url, error: x.error }))
    }
  };

  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  if (payload.competitionCount > 0) {
    await fs.writeFile(DATA_FILE, JSON.stringify(payload, null, 2), 'utf8');
  }
  return payload;
}

export async function readData() {
  try {
    return JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
  } catch {
    return { updatedAt: null, source: 'zerozero.pt', competitionCount: 0, associationCount: 0, competitions: [] };
  }
}
