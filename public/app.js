// ===== ÉTAT GLOBAL =====
let currentUser = null;
let allUsers = [];
let allSC = [];
let allRdv = [];
let allCR = [];
let activeMsgUserId = null;
let editingScId = null;
let editingCIPId = null;
let editingSCAccountId = null;

// ===== API =====
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include'
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch('/api' + path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erreur serveur');
  return data;
}

// ===== UTILS =====
function uid() { return Date.now().toString(36) + Math.random().toString(36).substr(2,5); }
function toast(msg, col) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.background = col || 'var(--navy)';
  t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', 3000);
}
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function togglePass(id, btn) {
  const el = document.getElementById(id);
  el.type = el.type === 'password' ? 'text' : 'password';
  btn.innerHTML = el.type === 'password' ? '&#128065;' : '&#128274;';
}
function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' });
}
function formatDateShort(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR');
}
function dayMonth(d) {
  if (!d) return { day:'--', month:'---' };
  const dt = new Date(d);
  return { day: String(dt.getDate()).padStart(2,'0'), month: dt.toLocaleDateString('fr-FR',{month:'short'}).toUpperCase() };
}
function isPast(d) { return d && new Date(d) < new Date(); }
function initials(p, n) { return ((p||'')[0]||'').toUpperCase() + ((n||'')[0]||'').toUpperCase(); }
function getSCName(scId) { const s = allSC.find(x=>x.id===scId); return s ? s.prenom+' '+s.nom : '—'; }
function getCIPName(cipId) { const u = allUsers.find(x=>x.id===cipId); return u ? u.prenom+' '+u.nom : '—'; }

// ===== LOGIN =====
async function doLogin() {
  const login = document.getElementById('loginUser').value.trim();
  const pass = document.getElementById('loginPass').value;
  const errEl = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');
  errEl.style.display = 'none';
  btn.textContent = 'Connexion...';
  btn.disabled = true;
  try {
    const data = await api('POST', '/login', { login, pass });
    if (!data.ok) {
      errEl.style.display = 'block';
      errEl.textContent = data.error || 'Identifiant ou mot de passe incorrect.';
      return;
    }
    currentUser = data.user;
    document.getElementById('loginPage').style.display = 'none';
    if (currentUser.role === 'sc') launchSCApp();
    else launchAdminApp();
  } catch(e) {
    errEl.style.display = 'block';
    errEl.textContent = 'Erreur de connexion. Veuillez réessayer.';
  } finally {
    btn.textContent = 'SE CONNECTER';
    btn.disabled = false;
  }
}

document.getElementById('loginPass').addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });
document.getElementById('loginUser').addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });

async function doLogout() {
  await api('POST', '/logout');
  currentUser = null; allUsers = []; allSC = []; allRdv = []; allCR = [];
  document.getElementById('app').style.display = 'none';
  document.getElementById('scApp').style.display = 'none';
  document.getElementById('loginPage').style.display = 'flex';
  document.getElementById('loginUser').value = '';
  document.getElementById('loginPass').value = '';
}

// ===== APP ADMIN/CIP =====
async function launchAdminApp() {
  document.getElementById('app').style.display = 'flex';
  document.getElementById('topbarName').textContent = currentUser.prenom + ' ' + currentUser.nom;
  document.getElementById('topbarRole').textContent =
    currentUser.role==='admin' ? 'Administrateur' :
    currentUser.role==='responsable' ? 'Responsable (lecture seule)' : 'Conseiller en insertion';
  const av = document.getElementById('topbarAv');
  if(av) av.textContent = initials(currentUser.prenom, currentUser.nom);
  document.getElementById('adminNavLbl').style.display = currentUser.role==='admin' ? 'block' : 'none';
  document.getElementById('adminNavBtn').style.display = currentUser.role==='admin' ? 'flex' : 'none';
  await loadAllData();
  showPage('dashboard');
  startNotifPolling();
}

async function loadAllData() {
  try {
    [allUsers, allSC, allRdv, allCR] = await Promise.all([
      api('GET', '/utilisateurs'),
      api('GET', '/volontaires'),
      api('GET', '/rdv'),
      api('GET', '/cr')
    ]);
  } catch(e) { console.error('Erreur chargement données:', e); }
}

function startNotifPolling() {
  async function checkNotifs() {
    try {
      const data = await api('GET', '/messages-non-lus');
      const count = data.count || 0;
      const badge = document.getElementById('topbarNotifCount');
      const navBadge = document.getElementById('navMsgBadge');
      if (badge) { badge.textContent = count; badge.style.display = count > 0 ? 'flex' : 'none'; }
      if (navBadge) { navBadge.textContent = count; navBadge.style.display = count > 0 ? 'inline-block' : 'none'; }
    } catch(e) {}
  }
  checkNotifs();
  setInterval(checkNotifs, 30000);
}

function showPage(page) {
  document.querySelectorAll('#app .page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#mainSidebar .nav-item').forEach(n => n.classList.remove('active'));
  const el = document.getElementById('page-' + page);
  if (el) el.classList.add('active');
  document.querySelectorAll('#mainSidebar .nav-item').forEach(n => {
    if (n.getAttribute('onclick')?.includes("'"+page+"'")) n.classList.add('active');
  });
  const titles = { dashboard:'Tableau de bord', volontaires:'Volontaires SC', rdv:'Rendez-vous', compterendus:'Comptes rendus', messages:'Messagerie', admin:'Administration' };
  const titleEl = document.getElementById('topbarPageTitle');
  if(titleEl && titles[page]) titleEl.textContent = titles[page];
  if (page==='dashboard') renderDashboard();
  else if (page==='volontaires') renderSCList();
  else if (page==='rdv') renderRdvList();
  else if (page==='compterendus') renderCRList();
  else if (page==='messages') renderMessages();
  else if (page==='admin') renderAdmin();
}

function switchTab(tabId, evt) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tabs .tab-btn').forEach(t => t.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  if(evt?.target) evt.target.classList.add('active');
}

// ===== DASHBOARD =====
async function renderDashboard() {
  await loadAllData();
  const greetEl = document.getElementById('dashGreeting');
  if(greetEl) greetEl.textContent = 'Bonjour, ' + currentUser.prenom + ' !';
  const today = new Date();
  const mySC = currentUser.role==='cip' ? allSC.filter(s=>s.cip_id===currentUser.id) : allSC;
  const rdvAVenir = allRdv.filter(r => !isPast(r.date));
  const msgs = await api('GET', '/messages-non-lus');
  document.getElementById('statSC').textContent = mySC.length;
  document.getElementById('statRdvA').textContent = rdvAVenir.length;
  document.getElementById('statCR').textContent = allCR.length;
  document.getElementById('statMsg').textContent = msgs.count || 0;

  const rdvList = document.getElementById('dashRdvList');
  const prochains = rdvAVenir.sort((a,b)=>new Date(a.date)-new Date(b.date)).slice(0,4);
  rdvList.innerHTML = prochains.length === 0
    ? '<p style="font-size:13px;color:var(--text-light);padding:12px 0;">Aucun rendez-vous a venir.</p>'
    : prochains.map(r => rdvCard(r, false)).join('');

  const crList = document.getElementById('dashCRList');
  const recentCR = [...allCR].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,3);
  crList.innerHTML = recentCR.length === 0
    ? '<p style="font-size:13px;color:var(--text-light);padding:12px 0;">Aucun compte rendu.</p>'
    : recentCR.map(c=>`<div class="cr-item"><h4>${c.sc_prenom||''} ${c.sc_nom||''} — ${c.type||''}</h4><p>${(c.points||'').substring(0,100)}</p><div class="cr-meta"><span>${formatDate(c.date)}</span></div></div>`).join('');

  const alertList = document.getElementById('dashAlertList');
  const alerts = rdvAVenir.filter(r=>(new Date(r.date)-today)/(1000*60*60*24)<=3);
  alertList.innerHTML = alerts.length === 0
    ? '<p style="font-size:13px;color:var(--text-light);">Aucune alerte en cours.</p>'
    : alerts.map(r=>`<div class="alert-item rdv"><div class="alert-dot"></div><div class="alert-content"><strong>RDV imminent</strong><span>${r.sc_prenom||''} ${r.sc_nom||''} — ${formatDate(r.date)} ${r.heure||''}</span></div></div>`).join('');
}

// ===== VOLONTAIRES =====
function renderSCList() {
  const search = (document.getElementById('searchSC').value||'').toLowerCase();
  const filterCIP = document.getElementById('filterCIP').value;
  const cipSel = document.getElementById('filterCIP');
  const cips = allUsers.filter(u=>u.role==='cip');
  cipSel.innerHTML = '<option value="">Tous les conseillers</option>' + cips.map(c=>`<option value="${c.id}" ${filterCIP===c.id?'selected':''}>${c.prenom} ${c.nom}</option>`).join('');
  cipSel.value = filterCIP;
  let list = [...allSC];
  if(currentUser.role==='cip') list = list.filter(s=>s.cip_id===currentUser.id);
  if(search) list = list.filter(s=>(s.prenom+' '+s.nom+(s.mission||'')).toLowerCase().includes(search));
  if(filterCIP) list = list.filter(s=>s.cip_id===filterCIP);
  const container = document.getElementById('scTableContainer');
  const readOnly = currentUser.role==='responsable';
  if(list.length===0){ container.innerHTML='<div class="empty-state"><h4>Aucun volontaire</h4><p>Ajoutez des volontaires depuis l\'administration.</p></div>'; return; }
  container.innerHTML=`<table><thead><tr><th>Volontaire</th><th>Mission</th><th>Conseiller</th><th>Statut</th><th>Actions</th></tr></thead><tbody>
    ${list.map(s=>{
      const sc = s.statut||'En cours';
      const col = sc==='En cours'?'badge-green':sc==='Termine'?'badge-navy':'badge-coral';
      return `<tr>
        <td><div style="display:flex;align-items:center;gap:10px;">
          <div style="width:34px;height:34px;border-radius:50%;background:var(--navy);color:white;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;">${initials(s.prenom,s.nom)}</div>
          <div><strong style="font-size:13px;">${s.prenom} ${s.nom}</strong><br><span style="font-size:11px;color:var(--text-light);">${s.email||''}</span></div>
        </div></td>
        <td style="font-size:12px;">${s.mission||'—'}</td>
        <td style="font-size:12px;">${getCIPName(s.cip_id)}</td>
        <td><span class="badge ${col}">${sc}</span></td>
        <td>
          <button class="btn btn-teal btn-sm" onclick="openFiche('${s.id}')">Voir la fiche</button>
          ${!readOnly?`<button class="btn btn-outline btn-sm" onclick="openRdvFor('${s.id}')" style="margin-left:4px;">RDV</button>`:''}
        </td>
      </tr>`;
    }).join('')}
  </tbody></table>`;
}

// ===== FICHE VOLONTAIRE =====
function openFiche(scId) {
  editingScId = scId;
  const sc = allSC.find(s=>s.id===scId) || {};
  document.querySelectorAll('#modalFiche .tab-btn').forEach((b,i)=>b.classList.toggle('active',i===0));
  document.querySelectorAll('#modalFiche .tab-content').forEach((t,i)=>t.classList.toggle('active',i===0));
  document.getElementById('ficheModalTitle').textContent = sc.prenom ? `Fiche — ${sc.prenom} ${sc.nom}` : 'Nouvelle fiche';
  const fields = {fPrenom:'prenom',fNom:'nom',fNaissance:'naissance',fTel:'tel',fEmail:'email',fAdresse:'adresse',fCommune:'commune',fMission:'mission',fStructure:'structure',fDebut:'debut',fFin:'fin',fStatut:'statut',fObs:'obs'};
  Object.entries(fields).forEach(([elId,key])=>{ const el=document.getElementById(elId); if(el) el.value=sc[key]||''; });
  const cipSel = document.getElementById('fCIP');
  cipSel.innerHTML='<option value="">-- Selectionner --</option>'+allUsers.filter(u=>u.role==='cip').map(c=>`<option value="${c.id}" ${sc.cip_id===c.id?'selected':''}>${c.prenom} ${c.nom}</option>`).join('');
  const diag = sc.diag||{};
  const diagFields = {dSitFam:'sitfam',dEnfants:'enfants',dLogement:'logement',dRessources:'ressources',dDroits:'droits',dDiplome:'diplome',dFormation:'formation',dExperiences:'experiences',dCompetences:'competences',dProjet:'projet',dPermis:'permis',dTransport:'transport',dNumerique:'numerique',dInternet:'internet'};
  Object.entries(diagFields).forEach(([elId,key])=>{ const el=document.getElementById(elId); if(el) el.value=diag[key]||''; });
  renderFreinTags(sc.freins||[]);
  renderActionsList(sc.actions||[{text:'',status:'En attente'}]);
  renderFicheTimeline(scId);
  document.querySelector('#modalFiche .modal-footer').style.display = currentUser.role==='responsable' ? 'none' : 'flex';
  openModal('modalFiche');
}

function renderFreinTags(freins) {
  const labels = {logement:'Logement',mobilite:'Mobilite',sante:'Sante',numerique:'Numerique',financier:'Financier',langue:'Maitrise du francais',autres:'Autres'};
  document.getElementById('freinTags').innerHTML = freins.map(f=>`<span class="frein-tag ${f}">${labels[f]||f} <span class="frein-remove" onclick="removeFrein('${f}')">&#10005;</span></span>`).join('');
}

function addFrein() {
  const sel = document.getElementById('freinSelect');
  if(!sel.value) return;
  const sc = allSC.find(s=>s.id===editingScId);
  if(!sc) return;
  if(!sc.freins) sc.freins=[];
  if(!sc.freins.includes(sel.value)) sc.freins.push(sel.value);
  renderFreinTags(sc.freins);
  sel.value='';
}

function removeFrein(f) {
  const sc = allSC.find(s=>s.id===editingScId);
  if(!sc) return;
  sc.freins = (sc.freins||[]).filter(x=>x!==f);
  renderFreinTags(sc.freins);
}

function renderActionsList(actions) {
  document.getElementById('actionsList').innerHTML = actions.map((a,i)=>`
    <div class="diag-field"><label>Action ${i+1}</label>
      <div style="display:flex;gap:8px;">
        <input type="text" class="action-input" value="${a.text||''}" placeholder="Decrire l'action...">
        <select class="action-status" style="padding:9px;border:1.5px solid var(--border);border-radius:7px;font-size:12px;font-family:'Open Sans',sans-serif;">
          <option ${a.status==='En attente'?'selected':''}>En attente</option>
          <option ${a.status==='En cours'?'selected':''}>En cours</option>
          <option ${a.status==='Realise'?'selected':''}>Realise</option>
        </select>
      </div>
    </div>`).join('');
}

function addAction() {
  const container = document.getElementById('actionsList');
  const count = container.querySelectorAll('.diag-field').length+1;
  const div = document.createElement('div');
  div.className='diag-field';
  div.innerHTML=`<label>Action ${count}</label><div style="display:flex;gap:8px;"><input type="text" class="action-input" placeholder="Decrire l'action..."><select class="action-status" style="padding:9px;border:1.5px solid var(--border);border-radius:7px;font-size:12px;font-family:'Open Sans',sans-serif;"><option>En attente</option><option>En cours</option><option>Realise</option></select></div>`;
  container.appendChild(div);
}

function renderFicheTimeline(scId) {
  const rdvs = allRdv.filter(r=>r.sc_id===scId).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const crs = allCR.filter(c=>c.sc_id===scId);
  const container = document.getElementById('ficheTimeline');
  const items = [
    ...rdvs.map(r=>({date:r.date,type:'rdv',label:r.type,desc:r.lieu,past:isPast(r.date)})),
    ...crs.map(c=>({date:c.date,type:'cr',label:'CR — '+c.type,desc:(c.points||'').substring(0,80),past:true}))
  ].sort((a,b)=>new Date(b.date)-new Date(a.date));
  if(items.length===0){ container.innerHTML='<div class="empty-state"><h4>Aucun accompagnement</h4></div>'; return; }
  container.innerHTML=items.map(item=>`<div class="timeline-item ${item.past?'past':''}">
    <div class="timeline-dot"></div>
    <div class="timeline-content">
      <div class="timeline-date">${formatDate(item.date)} — <span class="badge ${item.type==='rdv'?'badge-navy':'badge-teal'}">${item.type==='rdv'?'RDV':'CR'}</span></div>
      <div class="timeline-title">${item.label}</div>
      ${item.desc?`<div class="timeline-desc">${item.desc}</div>`:''}
    </div>
  </div>`).join('');
}

async function saveFiche() {
  const sc = allSC.find(s=>s.id===editingScId);
  if(!sc) return;
  sc.prenom=document.getElementById('fPrenom').value;
  sc.nom=document.getElementById('fNom').value;
  sc.naissance=document.getElementById('fNaissance').value;
  sc.tel=document.getElementById('fTel').value;
  sc.email=document.getElementById('fEmail').value;
  sc.adresse=document.getElementById('fAdresse').value;
  sc.commune=document.getElementById('fCommune').value;
  sc.mission=document.getElementById('fMission').value;
  sc.structure=document.getElementById('fStructure').value;
  sc.cip_id=document.getElementById('fCIP').value;
  sc.cipId=sc.cip_id;
  sc.debut=document.getElementById('fDebut').value;
  sc.fin=document.getElementById('fFin').value;
  sc.statut=document.getElementById('fStatut').value;
  sc.obs=document.getElementById('fObs').value;
  sc.diag={sitfam:document.getElementById('dSitFam').value,enfants:document.getElementById('dEnfants').value,logement:document.getElementById('dLogement').value,ressources:document.getElementById('dRessources').value,droits:document.getElementById('dDroits').value,diplome:document.getElementById('dDiplome').value,formation:document.getElementById('dFormation').value,experiences:document.getElementById('dExperiences').value,competences:document.getElementById('dCompetences').value,projet:document.getElementById('dProjet').value,permis:document.getElementById('dPermis').value,transport:document.getElementById('dTransport').value,numerique:document.getElementById('dNumerique').value,internet:document.getElementById('dInternet').value};
  const inputs=document.querySelectorAll('#actionsList .action-input');
  const statuses=document.querySelectorAll('#actionsList .action-status');
  sc.actions=Array.from(inputs).map((inp,i)=>({text:inp.value,status:statuses[i]?statuses[i].value:'En attente'}));
  try {
    await api('PUT', '/volontaires/'+editingScId, sc);
    closeModal('modalFiche');
    toast('Fiche enregistree', 'var(--teal)');
    await loadAllData();
    renderSCList();
  } catch(e) { toast('Erreur: '+e.message, '#DC3545'); }
}

// ===== RDV =====
function initRdvForm() {
  const sel = document.getElementById('rdvSC');
  const list = currentUser.role==='cip' ? allSC.filter(s=>s.cip_id===currentUser.id) : allSC;
  sel.innerHTML='<option value="">-- Selectionner un volontaire --</option>'+list.map(s=>`<option value="${s.id}">${s.prenom} ${s.nom}</option>`).join('');
  ['rdvDate','rdvHeure','rdvObs'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('rdvLieu').value='Bureau CRIJ Mayotte';
  document.getElementById('rdvType').selectedIndex=0;
}

function openRdvFor(scId) { initRdvForm(); document.getElementById('rdvSC').value=scId; showPage('rdv'); openModal('modalRdv'); }

async function saveRdv() {
  const scId=document.getElementById('rdvSC').value;
  const date=document.getElementById('rdvDate').value;
  if(!scId||!date){ toast('Volontaire et date obligatoires','#DC3545'); return; }
  try {
    await api('POST','/rdv',{scId,date,heure:document.getElementById('rdvHeure').value,type:document.getElementById('rdvType').value,lieu:document.getElementById('rdvLieu').value,obs:document.getElementById('rdvObs').value});
    closeModal('modalRdv');
    toast('RDV enregistre','var(--teal)');
    allRdv = await api('GET','/rdv');
    renderRdvList();
  } catch(e){ toast('Erreur: '+e.message,'#DC3545'); }
}

function rdvCard(r, past) {
  const dm = dayMonth(r.date);
  return `<div class="rdv-item ${past?'past':''}">
    <div class="rdv-date-badge ${past?'past':''}"><div class="d">${dm.day}</div><div class="m">${dm.month}</div></div>
    <div class="rdv-info"><strong>${r.sc_prenom||''} ${r.sc_nom||''}</strong><span>${r.type||''} — ${r.lieu||'CRIJ'}</span></div>
    <div class="rdv-time-badge">${r.heure||''}</div>
    ${!past&&currentUser.role!=='responsable'?`<button class="btn btn-danger btn-sm" onclick="deleteRdv('${r.id}')">Supprimer</button>`:''}
  </div>`;
}

function renderRdvList() {
  const avenir = allRdv.filter(r=>!isPast(r.date)).sort((a,b)=>new Date(a.date)-new Date(b.date));
  const passes = allRdv.filter(r=>isPast(r.date)).sort((a,b)=>new Date(b.date)-new Date(a.date));
  let html='';
  if(avenir.length) html+=`<h4 style="font-size:11px;font-weight:800;color:var(--teal);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">A venir</h4>`+avenir.map(r=>rdvCard(r,false)).join('');
  if(passes.length) html+=`<h4 style="font-size:11px;font-weight:800;color:var(--text-light);text-transform:uppercase;letter-spacing:1px;margin:16px 0 10px;">Passes</h4>`+passes.slice(0,20).map(r=>rdvCard(r,true)).join('');
  document.getElementById('rdvListContainer').innerHTML = html || '<div class="empty-state"><h4>Aucun rendez-vous</h4></div>';
}

async function deleteRdv(id) {
  if(!confirm('Supprimer ce rendez-vous ?')) return;
  await api('DELETE','/rdv/'+id);
  allRdv = await api('GET','/rdv');
  renderRdvList();
  toast('RDV supprime');
}

// ===== COMPTES RENDUS =====
function initCRForm() {
  const sel=document.getElementById('crSC');
  const list=currentUser.role==='cip'?allSC.filter(s=>s.cip_id===currentUser.id):allSC;
  sel.innerHTML='<option value="">-- Selectionner --</option>'+list.map(s=>`<option value="${s.id}">${s.prenom} ${s.nom}</option>`).join('');
  ['crDate','crPoints','crAvancees','crVigilance','crActions','crProchainRdv'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('crType').selectedIndex=0;
}

async function saveCR() {
  const scId=document.getElementById('crSC').value;
  const date=document.getElementById('crDate').value;
  if(!scId||!date){toast('Donnees manquantes','#DC3545');return;}
  try {
    await api('POST','/cr',{scId,date,type:document.getElementById('crType').value,points:document.getElementById('crPoints').value,avancees:document.getElementById('crAvancees').value,vigilance:document.getElementById('crVigilance').value,actions:document.getElementById('crActions').value,prochainRdv:document.getElementById('crProchainRdv').value||null});
    closeModal('modalCR');
    toast('Compte rendu enregistre','var(--teal)');
    [allCR,allRdv]=await Promise.all([api('GET','/cr'),api('GET','/rdv')]);
    renderCRList();
  } catch(e){toast('Erreur: '+e.message,'#DC3545');}
}

function renderCRList() {
  const container=document.getElementById('crListContainer');
  if(allCR.length===0){container.innerHTML='<div class="empty-state"><h4>Aucun compte rendu</h4></div>';return;}
  container.innerHTML=allCR.map(c=>`<div class="cr-item">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
      <div><h4>${c.sc_prenom||''} ${c.sc_nom||''} — <span class="badge badge-teal">${c.type||''}</span></h4>
      <div class="cr-meta"><span>${formatDate(c.date)}</span></div></div>
      ${currentUser.role!=='responsable'?`<button class="btn btn-danger btn-sm" onclick="deleteCR('${c.id}')">Supprimer</button>`:''}
    </div>
    ${c.points?`<p style="margin-top:10px;"><strong style="font-size:11px;color:var(--text-light);text-transform:uppercase;">Points abordes :</strong><br>${c.points}</p>`:''}
    ${c.avancees?`<p><strong style="font-size:11px;color:var(--text-light);text-transform:uppercase;">Avancees :</strong><br>${c.avancees}</p>`:''}
    ${c.actions?`<p><strong style="font-size:11px;color:var(--text-light);text-transform:uppercase;">Actions :</strong><br>${c.actions}</p>`:''}
  </div>`).join('');
}

async function deleteCR(id) {
  if(!confirm('Supprimer ce compte rendu ?')) return;
  await api('DELETE','/cr/'+id);
  allCR=await api('GET','/cr');
  renderCRList();
  toast('Compte rendu supprime');
}

// ===== MESSAGES =====
async function renderMessages() {
  const mySC = currentUser.role==='cip' ? allSC.filter(s=>s.cip_id===currentUser.id) : allSC;
  const container=document.getElementById('msgConvList');
  if(mySC.length===0){container.innerHTML='<p style="font-size:13px;color:var(--text-light);padding:16px;">Aucun volontaire assigne.</p>';return;}
  const scUsers = allUsers.filter(u=>u.role==='sc');
  container.innerHTML=mySC.map(s=>{
    const scUser=scUsers.find(u=>u.sc_id===s.id);
    return `<div onclick="openConv('${scUser?.id||''}','${s.prenom} ${s.nom}')" style="padding:14px;border-bottom:1px solid var(--border);cursor:pointer;display:flex;gap:12px;align-items:center;transition:background 0.15s;" onmouseover="this.style.background='var(--bg2)'" onmouseout="this.style.background='white'">
      <div style="width:38px;height:38px;border-radius:50%;background:var(--teal);color:white;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0;">${initials(s.prenom,s.nom)}</div>
      <div><div style="font-size:13px;font-weight:600;">${s.prenom} ${s.nom}</div><div style="font-size:11px;color:var(--text-light);">${s.mission||'—'}</div></div>
    </div>`;
  }).join('');
}

async function openConv(userId, userName) {
  if(!userId){toast('Cet utilisateur n\'a pas de compte de connexion','#DC3545');return;}
  activeMsgUserId = userId;
  document.getElementById('msgChatTitle').textContent = userName;
  document.getElementById('msgInputArea').style.display='flex';
  const msgs = await api('GET','/messages/'+userId);
  const thread=document.getElementById('msgThread');
  thread.innerHTML=msgs.length===0?'<p style="text-align:center;color:var(--text-light);font-size:13px;margin-top:20px;">Aucun message.</p>':
    msgs.map(m=>`<div><div class="msg-bubble ${m.from_id===currentUser.id?'sent':'received'}">${m.texte}<div class="msg-meta">${new Date(m.created_at).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</div></div></div>`).join('');
  thread.scrollTop=thread.scrollHeight;
}

async function sendMsg() {
  const texte=document.getElementById('msgInput').value.trim();
  if(!texte||!activeMsgUserId) return;
  try{
    await api('POST','/messages',{toId:activeMsgUserId,texte});
    document.getElementById('msgInput').value='';
    await openConv(activeMsgUserId, document.getElementById('msgChatTitle').textContent);
  }catch(e){toast('Erreur envoi','#DC3545');}
}

// ===== ADMIN =====
async function renderAdmin() {
  await loadAllData();
  renderAdminCIP(); renderAdminSC(); renderAdminResp();
}

function renderAdminCIP() {
  const cips=allUsers.filter(u=>u.role==='cip');
  const container=document.getElementById('adminCIPList');
  if(cips.length===0){container.innerHTML='<div class="empty-state"><h4>Aucun conseiller</h4></div>';return;}
  container.innerHTML=`<table><thead><tr><th>Nom</th><th>Email</th><th>Tel</th><th>Identifiant</th><th>Volontaires</th><th>Actions</th></tr></thead><tbody>
    ${cips.map(c=>`<tr>
      <td><strong>${c.prenom} ${c.nom}</strong></td>
      <td>${c.email||'—'}</td><td>${c.tel||'—'}</td>
      <td><span class="badge badge-navy">${c.login}</span></td>
      <td>${allSC.filter(s=>s.cip_id===c.id).length}</td>
      <td><button class="btn btn-outline btn-sm" onclick="editCIP('${c.id}')">Modifier</button>
          <button class="btn btn-danger btn-sm" onclick="deleteCIP('${c.id}')" style="margin-left:4px;">Supprimer</button></td>
    </tr>`).join('')}
  </tbody></table>`;
}

function renderAdminSC() {
  const container=document.getElementById('adminSCList');
  if(allSC.length===0){container.innerHTML='<div class="empty-state"><h4>Aucun volontaire</h4></div>';return;}
  const scUsers=allUsers.filter(u=>u.role==='sc');
  container.innerHTML=`<table><thead><tr><th>Nom</th><th>Email</th><th>Tel</th><th>Mission</th><th>Conseiller</th><th>Identifiant</th><th>Actions</th></tr></thead><tbody>
    ${allSC.map(s=>{
      const scUser=scUsers.find(u=>u.sc_id===s.id);
      return `<tr>
        <td><strong>${s.prenom} ${s.nom}</strong></td>
        <td>${s.email||'—'}</td><td>${s.tel||'—'}</td>
        <td style="font-size:12px;">${s.mission||'—'}</td>
        <td style="font-size:12px;">${getCIPName(s.cip_id)}</td>
        <td>${scUser?`<span class="badge badge-teal">${scUser.login}</span>`:'<span class="badge badge-gray">Aucun</span>'}</td>
        <td><button class="btn btn-outline btn-sm" onclick="editSCAccount('${s.id}')">Modifier</button>
            <button class="btn btn-danger btn-sm" onclick="deleteSCAccount('${s.id}')" style="margin-left:4px;">Supprimer</button></td>
      </tr>`;
    }).join('')}
  </tbody></table>`;
}

function renderAdminResp() {
  const resps=allUsers.filter(u=>u.role==='responsable');
  const container=document.getElementById('adminRespList');
  if(resps.length===0){container.innerHTML='<div class="empty-state"><h4>Aucun responsable</h4></div>';return;}
  container.innerHTML=`<table><thead><tr><th>Nom</th><th>Email</th><th>Identifiant</th><th>Actions</th></tr></thead><tbody>
    ${resps.map(r=>`<tr>
      <td><strong>${r.prenom} ${r.nom}</strong></td>
      <td>${r.email||'—'}</td>
      <td><span class="badge badge-gold">${r.login}</span></td>
      <td><button class="btn btn-danger btn-sm" onclick="deleteResp('${r.id}')">Supprimer</button></td>
    </tr>`).join('')}
  </tbody></table>`;
}

function openAddCIP() {
  editingCIPId=null;
  document.getElementById('cipModalTitle').textContent='Ajouter un CIP';
  ['cipPrenom','cipNom','cipEmail','cipTel','cipLogin','cipPass'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  openModal('modalAddCIP');
}

function editCIP(id) {
  editingCIPId=id;
  const u=allUsers.find(x=>x.id===id);
  if(!u) return;
  document.getElementById('cipModalTitle').textContent='Modifier le conseiller';
  document.getElementById('cipPrenom').value=u.prenom||'';
  document.getElementById('cipNom').value=u.nom||'';
  document.getElementById('cipEmail').value=u.email||'';
  document.getElementById('cipTel').value=u.tel||'';
  document.getElementById('cipLogin').value=u.login||'';
  document.getElementById('cipPass').value='';
  openModal('modalAddCIP');
}

async function saveCIP() {
  const prenom=document.getElementById('cipPrenom').value.trim();
  const nom=document.getElementById('cipNom').value.trim();
  const login=document.getElementById('cipLogin').value.trim();
  const pass=document.getElementById('cipPass').value;
  if(!prenom||!nom||!login){toast('Champs obligatoires manquants','#DC3545');return;}
  try {
    if(editingCIPId) {
      await api('PUT','/utilisateurs/'+editingCIPId,{login,pass:pass||undefined,prenom,nom,email:document.getElementById('cipEmail').value,tel:document.getElementById('cipTel').value});
    } else {
      if(!pass){toast('Mot de passe obligatoire','#DC3545');return;}
      await api('POST','/utilisateurs',{login,pass,role:'cip',prenom,nom,email:document.getElementById('cipEmail').value,tel:document.getElementById('cipTel').value});
    }
    closeModal('modalAddCIP'); toast('Conseiller enregistre','var(--teal)');
    await loadAllData(); renderAdminCIP(); editingCIPId=null;
  }catch(e){toast('Erreur: '+e.message,'#DC3545');}
}

async function deleteCIP(id) {
  if(!confirm('Supprimer ce conseiller ?')) return;
  await api('DELETE','/utilisateurs/'+id);
  await loadAllData(); renderAdminCIP(); toast('Conseiller supprime');
}

function openAddSC() {
  editingSCAccountId=null;
  document.getElementById('scModalTitle').textContent='Ajouter un volontaire';
  ['scaPrenom','scaNom','scaEmail','scaTel','scaMission','scaLogin','scaPass'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const cipSel=document.getElementById('scaCIP');
  cipSel.innerHTML='<option value="">-- Selectionner --</option>'+allUsers.filter(u=>u.role==='cip').map(c=>`<option value="${c.id}">${c.prenom} ${c.nom}</option>`).join('');
  openModal('modalAddSC');
}

function editSCAccount(scId) {
  editingSCAccountId=scId;
  const sc=allSC.find(s=>s.id===scId);
  const scUser=allUsers.find(u=>u.sc_id===scId);
  if(!sc) return;
  document.getElementById('scModalTitle').textContent='Modifier le volontaire';
  document.getElementById('scaPrenom').value=sc.prenom||'';
  document.getElementById('scaNom').value=sc.nom||'';
  document.getElementById('scaEmail').value=sc.email||'';
  document.getElementById('scaTel').value=sc.tel||'';
  document.getElementById('scaMission').value=sc.mission||'';
  document.getElementById('scaLogin').value=scUser?scUser.login:'';
  document.getElementById('scaPass').value='';
  const cipSel=document.getElementById('scaCIP');
  cipSel.innerHTML='<option value="">-- Selectionner --</option>'+allUsers.filter(u=>u.role==='cip').map(c=>`<option value="${c.id}" ${sc.cip_id===c.id?'selected':''}>${c.prenom} ${c.nom}</option>`).join('');
  openModal('modalAddSC');
}

async function saveSCAccount() {
  const prenom=document.getElementById('scaPrenom').value.trim();
  const nom=document.getElementById('scaNom').value.trim();
  const login=document.getElementById('scaLogin').value.trim();
  const pass=document.getElementById('scaPass').value;
  const cipId=document.getElementById('scaCIP').value;
  if(!prenom||!nom||!login){toast('Champs obligatoires manquants','#DC3545');return;}
  try{
    if(editingSCAccountId){
      const sc=allSC.find(s=>s.id===editingSCAccountId);
      if(sc){
        sc.prenom=prenom;sc.nom=nom;sc.email=document.getElementById('scaEmail').value;
        sc.tel=document.getElementById('scaTel').value;sc.mission=document.getElementById('scaMission').value;
        sc.cip_id=cipId;sc.cipId=cipId;
        await api('PUT','/volontaires/'+editingSCAccountId,sc);
      }
      const scUser=allUsers.find(u=>u.sc_id===editingSCAccountId);
      if(scUser) await api('PUT','/utilisateurs/'+scUser.id,{login,pass:pass||undefined,prenom,nom,email:document.getElementById('scaEmail').value});
      else if(pass) await api('POST','/utilisateurs',{login,pass,role:'sc',prenom,nom,email:document.getElementById('scaEmail').value,scId:editingSCAccountId});
    }else{
      if(!pass){toast('Mot de passe obligatoire','#DC3545');return;}
      const scRes=await api('POST','/volontaires',{prenom,nom,email:document.getElementById('scaEmail').value,tel:document.getElementById('scaTel').value,mission:document.getElementById('scaMission').value,cipId});
      await api('POST','/utilisateurs',{login,pass,role:'sc',prenom,nom,email:document.getElementById('scaEmail').value,scId:scRes.id});
    }
    closeModal('modalAddSC');toast('Volontaire enregistre','var(--teal)');
    await loadAllData();renderAdminSC();editingSCAccountId=null;
  }catch(e){toast('Erreur: '+e.message,'#DC3545');}
}

async function deleteSCAccount(scId) {
  if(!confirm('Supprimer ce volontaire et toutes ses donnees ?')) return;
  await api('DELETE','/volontaires/'+scId);
  await loadAllData();renderAdminSC();toast('Volontaire supprime');
}

function openAddResp() {
  ['respPrenom','respNom','respEmail','respLogin','respPass'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  openModal('modalAddResp');
}

async function saveResp() {
  const prenom=document.getElementById('respPrenom').value.trim();
  const nom=document.getElementById('respNom').value.trim();
  const login=document.getElementById('respLogin').value.trim();
  const pass=document.getElementById('respPass').value;
  if(!prenom||!nom||!login||!pass){toast('Tous les champs sont obligatoires','#DC3545');return;}
  try{
    await api('POST','/utilisateurs',{login,pass,role:'responsable',prenom,nom,email:document.getElementById('respEmail').value});
    closeModal('modalAddResp');toast('Responsable cree','var(--teal)');
    await loadAllData();renderAdminResp();
  }catch(e){toast('Erreur: '+e.message,'#DC3545');}
}

async function deleteResp(id) {
  if(!confirm('Supprimer ce responsable ?')) return;
  await api('DELETE','/utilisateurs/'+id);
  await loadAllData();renderAdminResp();toast('Responsable supprime');
}

// ===== SC APP =====
async function launchSCApp() {
  document.getElementById('scApp').style.display='flex';
  document.getElementById('scTopbarName').textContent=currentUser.prenom+' '+currentUser.nom;
  const av=document.getElementById('scTopbarAv');
  if(av) av.textContent=initials(currentUser.prenom,currentUser.nom);
  const greet=document.getElementById('scDashGreeting');
  if(greet) greet.textContent='Bonjour, '+currentUser.prenom+' !';
  await loadSCData();
  showSCPage('sc-accueil');
  startSCNotifPolling();
}

async function loadSCData() {
  try{
    [allRdv,allCR]=await Promise.all([api('GET','/rdv'),api('GET','/cr')]);
    allUsers=await api('GET','/utilisateurs');
  }catch(e){}
}

function startSCNotifPolling() {
  async function check(){
    try{
      const [msgs,alerts]=await Promise.all([api('GET','/messages-non-lus'),api('GET','/alertes-count')]);
      const mb=document.getElementById('scMsgBadge');
      const ab=document.getElementById('scAlertBadge');
      if(mb){mb.textContent=msgs.count||0;mb.style.display=(msgs.count>0)?'inline-block':'none';}
      if(ab){ab.textContent=alerts.count||0;ab.style.display=(alerts.count>0)?'inline-block':'none';}
      document.getElementById('scStatMsg').textContent=msgs.count||0;
    }catch(e){}
  }
  check();setInterval(check,20000);
}

function showSCPage(page) {
  document.querySelectorAll('#scApp .page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.sc-nav-item').forEach(n=>n.classList.remove('active'));
  const el=document.getElementById('page-'+page);
  if(el) el.classList.add('active');
  document.querySelectorAll('.sc-nav-item').forEach(n=>{if(n.getAttribute('onclick')?.includes("'"+page+"'"))n.classList.add('active');});
  if(page==='sc-accueil') renderSCDash();
  else if(page==='sc-rdv') renderSCRdv();
  else if(page==='sc-cr') renderSCCR();
  else if(page==='sc-messages') renderSCMessages();
  else if(page==='sc-alertes') renderSCAlertes();
}

function renderSCDash() {
  const today=new Date();
  const avenir=allRdv.filter(r=>!isPast(r.date)).sort((a,b)=>new Date(a.date)-new Date(b.date));
  document.getElementById('scStatRdv').textContent=allRdv.length;
  document.getElementById('scStatCR').textContent=allCR.length;
  const container=document.getElementById('scDashRdv');
  if(avenir.length===0){container.innerHTML='<p style="font-size:13px;color:var(--text-light);">Aucun rendez-vous a venir.</p>';return;}
  container.innerHTML=avenir.slice(0,2).map(r=>{
    const dm=dayMonth(r.date);
    return `<div class="rdv-item"><div class="rdv-date-badge"><div class="d">${dm.day}</div><div class="m">${dm.month}</div></div><div class="rdv-info"><strong>${r.type||''}</strong><span>${r.lieu||'Bureau CRIJ'}</span></div><div class="rdv-time-badge">${r.heure||''}</div></div>`;
  }).join('');
}

function renderSCRdv() {
  const avenir=allRdv.filter(r=>!isPast(r.date)).sort((a,b)=>new Date(a.date)-new Date(b.date));
  const passes=allRdv.filter(r=>isPast(r.date)).sort((a,b)=>new Date(b.date)-new Date(a.date));
  let html='';
  if(avenir.length) html+=`<h4 style="font-size:11px;font-weight:800;color:var(--teal);text-transform:uppercase;margin-bottom:10px;">A venir</h4>`+avenir.map(r=>{const dm=dayMonth(r.date);return`<div class="rdv-item"><div class="rdv-date-badge"><div class="d">${dm.day}</div><div class="m">${dm.month}</div></div><div class="rdv-info"><strong>${r.type}</strong><span>${r.lieu||'CRIJ'}</span></div><div class="rdv-time-badge">${r.heure||''}</div></div>`;}).join('');
  if(passes.length) html+=`<h4 style="font-size:11px;font-weight:800;color:var(--text-light);text-transform:uppercase;margin:16px 0 10px;">Passes</h4>`+passes.map(r=>{const dm=dayMonth(r.date);return`<div class="rdv-item past"><div class="rdv-date-badge past"><div class="d">${dm.day}</div><div class="m">${dm.month}</div></div><div class="rdv-info"><strong>${r.type}</strong><span>${r.lieu||'CRIJ'}</span></div><div class="rdv-time-badge">${r.heure||''}</div></div>`;}).join('');
  document.getElementById('scRdvList').innerHTML=html||'<div class="empty-state"><h4>Aucun rendez-vous</h4></div>';
}

function renderSCCR() {
  document.getElementById('scCRList').innerHTML=allCR.length===0?'<div class="empty-state"><h4>Aucun compte rendu</h4></div>':
    allCR.map(c=>`<div class="cr-item"><h4>${c.type||''} — ${formatDate(c.date)}</h4>${c.points?`<p><strong style="font-size:11px;color:var(--text-light);text-transform:uppercase;">Points abordes :</strong><br>${c.points}</p>`:''} ${c.avancees?`<p><strong style="font-size:11px;color:var(--text-light);text-transform:uppercase;">Avancees :</strong><br>${c.avancees}</p>`:''} ${c.actions?`<p><strong style="font-size:11px;color:var(--text-light);text-transform:uppercase;">Actions :</strong><br>${c.actions}</p>`:''}</div>`).join('');
}

async function renderSCMessages() {
  const cipUser=allUsers.find(u=>u.id===currentUser.cipId);
  if(!cipUser){
    // Find CIP from SC profile
    const scProfile=allUsers.find(u=>u.id===currentUser.id);
  }
  // Get CIP user via sc profile
  let cipId=null;
  const scUsers=allUsers.filter(u=>u.role==='cip');
  // Find by checking all CIPs
  document.getElementById('scMsgCIPName').textContent='Votre conseiller';
  if(!cipId && allSC.length>0){
    const myProfile=allSC.find(s=>s.id===currentUser.scId);
    if(myProfile){ cipId=myProfile.cip_id; const cip=allUsers.find(u=>u.id===cipId); if(cip) document.getElementById('scMsgCIPName').textContent=`Conseiller : ${cip.prenom} ${cip.nom}`; }
  }
  if(!cipId){ document.getElementById('scMsgThread').innerHTML='<p style="text-align:center;color:var(--text-light);font-size:13px;">Conseiller non assigne.</p>'; return; }
  window._scCipUserId=cipId;
  const msgs=await api('GET','/messages/'+cipId);
  const thread=document.getElementById('scMsgThread');
  thread.innerHTML=msgs.length===0?'<p style="text-align:center;color:var(--text-light);font-size:13px;margin-top:20px;">Ecrivez a votre conseiller ci-dessous.</p>':
    msgs.map(m=>`<div><div class="msg-bubble ${m.from_id===currentUser.id?'sent':'received'}">${m.texte}<div class="msg-meta">${new Date(m.created_at).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</div></div></div>`).join('');
  thread.scrollTop=thread.scrollHeight;
}

async function sendSCMsg() {
  const texte=document.getElementById('scMsgInput').value.trim();
  const toId=window._scCipUserId;
  if(!texte||!toId){toast('Aucun conseiller assigne','#DC3545');return;}
  try{
    await api('POST','/messages',{toId,texte});
    document.getElementById('scMsgInput').value='';
    await renderSCMessages();
  }catch(e){toast('Erreur envoi','#DC3545');}
}

async function renderSCAlertes() {
  const alertes=await api('GET','/alertes');
  const container=document.getElementById('scAlerteList');
  container.innerHTML=alertes.length===0?'<div class="empty-state"><h4>Aucune alerte</h4></div>':
    alertes.map(a=>`<div class="alert-item ${a.type}"><div class="alert-dot"></div>
      <div class="alert-content"><strong>${a.type==='rdv'?'Rendez-vous':a.type==='cr'?'Compte rendu disponible':'Message'}</strong>
      <span>${a.texte}</span>
      <span style="display:block;font-size:11px;color:var(--text-light);margin-top:4px;">${new Date(a.created_at).toLocaleString('fr-FR')}</span>
    </div></div>`).join('');
}

// ===== MODALS CLOSE ON OVERLAY =====
document.querySelectorAll('.modal-overlay').forEach(overlay=>{
  overlay.addEventListener('click', e=>{if(e.target===overlay)overlay.classList.remove('open');});
});

// ===== CHECK SESSION AU DEMARRAGE =====
(async()=>{
  try{
    const user=await api('GET','/me');
    currentUser=user;
    if(user.role==='sc') launchSCApp();
    else launchAdminApp();
    document.getElementById('loginPage').style.display='none';
  }catch(e){
    document.getElementById('loginPage').style.display='flex';
  }
})();
