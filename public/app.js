let data={competitions:[]};
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

function fmtDate(iso){
  if(!iso)return 'a aguardar';
  const d=new Date(iso);
  return new Intl.DateTimeFormat('pt-PT',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Lisbon'}).format(d);
}


function render(){
  const q=norm($('search').value),scope=$('scope').value,assoc=$('association').value;
  
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
  $('content').innerHTML=[...groups].map(([name,list])=>`<div class="group"><div class="group-title"><h2>${esc(name)}</h2><span>${list.length} ${list.length===1?'classificação':'classificações'}</span></div>${list.map(card).join('')}</div>`).join('');
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
