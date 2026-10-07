let data={competitions:[]};
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

function fmtDate(iso){
  if(!iso)return 'a aguardar';
  const d=new Date(iso);
  return new Intl.DateTimeFormat('pt-PT',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Lisbon'}).format(d);
}

function populateAssociations(){
  const items=[...new Set(data.competitions.filter(x=>x.group==='Distrital').map(x=>x.association))].sort((a,b)=>a.localeCompare(b,'pt'));
  $('association').innerHTML='<option value="">Todas as associações</option>'+items.map(x=>`<option>${esc(x)}</option>`).join('');
}

function render(){
  const q=norm($('search').value),scope=$('scope').value,assoc=$('association').value;
  const comps=data.competitions.filter(c=>{
    if(scope&&c.group!==scope)return false;
    if(assoc&&c.association!==assoc)return false;
    if(!q)return true;
    return norm(`${c.name} ${c.association} ${(c.standings||[]).map(x=>x.team).join(' ')}`).includes(q);
  });

  $('notice').style.display=comps.length?'none':'block';
  $('notice').innerHTML=data.competitions.length
    ? 'Sem resultados para estes filtros.'
    : '<strong>Aguardando a primeira recolha automática com dados válidos.</strong><br>O site está publicado, mas a fonte ainda não forneceu classificações ao atualizador.';

  const groups=new Map();
  for(const c of comps){
    const key=c.group==='Nacional'?'Competições Nacionais':c.association;
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(c);
  }
  const priority=['af lisboa','af setubal','af leiria','af santarem'];

const divRank=c=>{
  const n=norm(c.name).replace(/[.ªº]/g,'').replace(/\s+/g,' ');

  if(n.includes('3 divisao') || n.includes('iii divisao')) return 3;
  if(n.includes('2 divisao') || n.includes('ii divisao')) return 2;
  if(n.includes('1 divisao') || n.includes('i divisao')) return 1;

  return 99;
};

const ordered=[...groups].sort(([a],[b])=>{
  if(a==='Competições Nacionais') return -1;
  if(b==='Competições Nacionais') return 1;

  const ai=priority.indexOf(norm(a));
  const bi=priority.indexOf(norm(b));

  if(ai!==-1 || bi!==-1){
    if(ai===-1) return 1;
    if(bi===-1) return -1;
    return ai-bi;
  }

  return a.localeCompare(b,'pt-PT');
});

for(const [name,list] of ordered){
  if(name!=='Competições Nacionais'){
    list.sort((a,b)=>{
      if(norm(name)==='af leiria'){
  const ah=norm(a.name).includes('honra');
  const bh=norm(b.name).includes('honra');
  if(ah!==bh) return ah ? -1 : 1;
}
     if(norm(name)==='af aveiro'){
  const an=norm(a.name);
  const bn=norm(b.name);

  // Campeonato Sabseg sempre primeiro
  const as=an.includes('sabseg');
  const bs=bn.includes('sabseg');
  if(as!==bs) return as ? -1 : 1;

  // Na 2.ª Divisão: Zona Norte antes da Zona Centro
  if(divRank(a)===2 && divRank(b)===2){
    const zonaRank=n=>{
      if(n.includes('zona norte')) return 0;
      if(n.includes('zona centro')) return 1;
      return 2;
    };

    const z=zonaRank(an)-zonaRank(bn);
    if(z!==0) return z;
  }
}
      if(norm(name)==='af beja'){
  const bejaRank=c=>{
    const n=norm(c.name)
      .replace(/[.ªº]/g,' ')
      .replace(/\s+/g,' ');

    if(n.includes('primeira divisao') || n.includes('1 divisao')) return 0;
    if(n.includes('honra')) return 1;

    if(n.includes('2 divisao') && n.includes(' a')) return 2;
    if(n.includes('2 divisao') && n.includes(' b')) return 3;

    return 99;
  };

  const br=bejaRank(a)-bejaRank(b);
  if(br!==0) return br;
}
      if(norm(name)==='af braga'){
  const bragaRank=c=>{
    const n=norm(c.name)
      .replace(/[.ªº]/g,' ')
      .replace(/[-–—|_/]/g,' ')
      .replace(/\s+/g,' ')
      .trim();

    const serieRank=()=>{
  const m=n.match(/serie\W*([a-f])\b/);
  if(!m) return 0;
  return 'abcdef'.indexOf(m[1]) + 1;
};

    if(n.includes('pro nacional')) return 0;

    if(n.includes('honra')) return 10 + serieRank();

    if(
      n.includes('1 divisao') ||
      n.includes('primeira divisao')
    ) return 20 + serieRank();

    return 99;
  };

  const br=bragaRank(a)-bragaRank(b);
  if(br!==0) return br;
}
      if(norm(name)==='af coimbra'){
  const coimbraRank=c=>{
    const n=norm(c.name)
      .replace(/[.ªº]/g,' ')
      .replace(/[-–—|_/]/g,' ')
      .replace(/\s+/g,' ')
      .trim();

    if(n.includes('elite')) return 0;
    if(n.includes('honra')) return 1;

    if(
      n.includes('1 divisao') ||
      n.includes('primeira divisao')
    ) return 2;

    return 99;
  };

  const cr=coimbraRank(a)-coimbraRank(b);
  if(cr!==0) return cr;
}
      if(norm(name)==='af evora'){
  const evoraRank=c=>{
    const n=norm(c.name);

    if(n.includes('liga elite')) return 0;
    if(n.includes('liga afe')) return 1;

    return 99;
  };

  const er=evoraRank(a)-evoraRank(b);
  if(er!==0) return er;
}
      if(norm(name)==='af madeira'){
  const madeiraRank=c=>{
    const n=norm(c.name);

    if(n.includes('torrestir')) return 0;

    if(
      n.includes('campeonato regional') &&
      (
        n.includes('1 divisao') ||
        n.includes('1ª divisao') ||
        n.includes('primeira divisao')
      )
    ) return 1;

    return 99;
  };

  const mr=madeiraRank(a)-madeiraRank(b);
  if(mr!==0) return mr;
}
      if(norm(name)==='af porto'){
  const portoRank=c=>{
    const n=norm(c.name)
      .replace(/[.ªº"']/g,' ')
      .replace(/[-–—|_/]/g,' ')
      .replace(/\s+/g,' ')
      .trim();

    const serieRank=()=>{
      const m=n.match(/serie\W*(\d+)/);
      if(m) return Number(m[1]);
      return 99;
    };

    if(n.includes('decathlon') && n.includes('liga pro')) return 0;

    if(n.includes('elite')) return 100 + serieRank();

    if(n.includes('honra')) return 200 + serieRank();

    if(
      n.includes('1 divisao') ||
      n.includes('1a divisao') ||
      n.includes('primeira divisao')
    ) return 300 + serieRank();

    return 999;
  };

  const pr=portoRank(a)-portoRank(b);
  if(pr!==0) return pr;
}
      if(norm(name).includes('viana') && norm(name).includes('castelo')){
  const vianaRank=c=>{
    const n=norm(c.name);

    if(n.includes('sabseg')) return 0;
    if(n.includes('mka')) return 1;

    return 99;
  };

  const vr=vianaRank(a)-vianaRank(b);
  if(vr!==0) return vr;
}
      if(norm(name)==='af viseu'){
  const viseuRank=c=>{
    const n=norm(c.name)
      .replace(/[.ªº"']/g,' ')
      .replace(/[-–—|_/]/g,' ')
      .replace(/\s+/g,' ')
      .trim();

    if(n.includes('honra')) return 0;

    if(
      n.includes('1 divisao') ||
      n.includes('primeira divisao')
    ) return 10;

    if(
      n.includes('2 divisao') ||
      n.includes('segunda divisao')
    ){
      if(n.includes('serie a')) return 20;
      if(n.includes('serie b')) return 21;
      return 22;
    }

    return 99;
  };

  const vr=viseuRank(a)-viseuRank(b);
  if(vr!==0) return vr;
}
      const d=divRank(a)-divRank(b);
      if(d!==0) return d;
      return a.name.localeCompare(b.name,'pt-PT');
    });
  }
}

$('content').innerHTML=ordered.map(([name,list])=>
  `<div class="group"><div class="group-title"><h2>${esc(norm(name)==='af horta' ? 'Campeonato Futebol Açores' : name)}</h2><span>${list.length} ${list.length===1?'classificação':'classificações'}</span></div>${list.map(card).join('')}</div>`
).join('');
}

function card(c){
  const rows=(c.standings||[]).map(r=>`<tr><td class="pos">${r.pos}</td><td class="team">${esc(r.team)}</td><td class="points">${r.points}</td><td>${r.played}</td><td>${r.wins}</td><td>${r.draws}</td><td>${r.losses}</td><td>${r.gf}</td><td>${r.ga}</td><td>${r.gd>0?'+':''}${r.gd}</td></tr>`).join('');
  return `<article class="competition-card"><div class="card-head"><div><h3>${esc(c.name)}</h3><div class="meta"><span class="badge">${esc(c.group)}</span>${c.group==='Distrital'?`<span class="badge">${esc(c.association)}</span>`:''}</div></div><a class="source-link" href="${esc(c.source)}" target="_blank" rel="noopener">zerozero ↗</a></div><div class="table-wrap"><table class="standings"><thead><tr><th>#</th><th class="team">Equipa</th><th>P</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GM</th><th>GS</th><th>DG</th></tr></thead><tbody>${rows}</tbody></table></div></article>`;
}

async function init(){
  try{
    const r=await fetch('./data/standings.json',{cache:'no-store'});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    data=await r.json();
    data.competitions=(data.competitions||[]).filter(c=>{
  const assoc=norm(c.association);
  const name=norm(c.name);

  // Retirar toda a AF Angra do Heroísmo
  if(assoc.includes('angra') && assoc.includes('heroismo')) return false;

  // AF Horta: retirar apenas Campeonato AFH - Seniores Futebol
  if(
    assoc==='af horta' &&
    name.includes('campeonato afh') &&
    name.includes('seniores futebol')
  ) return false;
// AF Coimbra: retirar Seniores Sub-22
if(
  assoc==='af coimbra' &&
  name.includes('sub-22')
) return false;
      // AF Madeira: retirar Masters +35 e +45
if(
  assoc==='af madeira' &&
  (
    name.includes('masters +35') ||
    name.includes('masters +45')
  )
) return false;
      // AF Viseu: retirar Campeonato Distrital Sub 23 - ESTANEL
if(
  assoc==='af viseu' &&
  name.includes('sub 23') &&
  name.includes('estanel')
) return false;
  return true;
});

data.competitionCount=data.competitions.length;
data.associationCount=new Set(
  data.competitions
    .filter(c=>c.group==='Distrital')
    .map(c=>c.association)
).size;
    data.competitions=data.competitions||[];
    $('competitionCount').textContent=data.competitionCount||0;
    $('associationCount').textContent=data.associationCount||0;
    $('updatedAt').textContent=fmtDate(data.updatedAt);
    populateAssociations();render();
  }catch(e){
    $('notice').style.display='block';
    $('notice').textContent='Não foi possível carregar o ficheiro local de classificações.';
  }
}

['search','scope','association'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',render));
init();
