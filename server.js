const express = require('express');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== BASE DE DONNÉES JSON (fichier local, zéro dépendance native) =====
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'crij.json');

function readDB() {
  try {
    if (fs.existsSync(DB_PATH)) {
      return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    }
  } catch(e) { console.error('Erreur lecture DB:', e); }
  return initDB();
}

function writeDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch(e) { console.error('Erreur écriture DB:', e); }
}

function initDB() {
  const hash = bcrypt.hashSync('Admin2024!', 10);
  const data = {
    utilisateurs: [
      { id: 'admin', login: 'admin', pass_hash: hash, role: 'admin',
        prenom: 'Administrateur', nom: 'CRIJ', email: 'admin@crij-mayotte.fr', tel: '',
        sc_id: null, cip_id: null, created_at: new Date().toISOString() }
    ],
    volontaires: [],
    rendez_vous: [],
    comptes_rendus: [],
    messages: [],
    alertes: []
  };
  writeDB(data);
  console.log('[CRIJ] Base de données initialisée (admin / Admin2024!)');
  return data;
}

// Charger la DB au démarrage
let db = readDB();
console.log(`[CRIJ] DB chargée: ${db.utilisateurs.length} utilisateurs, ${db.volontaires.length} volontaires`);

// ===== UTILS =====
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

function saveDB() {
  writeDB(db);
}

function sendMail(email, sujet, corps) {
  console.log(`[MAIL] À: ${email} | ${sujet}`);
}

// ===== MIDDLEWARE =====
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'crij-mayotte-secret-2027',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));

// Middleware auth
function auth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Non connecté' });
  next();
}
function adminOnly(req, res, next) {
  if (!req.session.userId || req.session.role !== 'admin') {
    return res.status(403).json({ error: 'Accès refusé' });
  }
  next();
}

// ===== AUTH =====
app.post('/api/login', (req, res) => {
  const { login, pass } = req.body;
  const user = db.utilisateurs.find(u => u.login === login);
  if (!user) return res.json({ ok: false, error: 'Identifiant ou mot de passe incorrect' });
  if (!bcrypt.compareSync(pass, user.pass_hash)) return res.json({ ok: false, error: 'Identifiant ou mot de passe incorrect' });
  req.session.userId = user.id;
  req.session.role = user.role;
  req.session.prenom = user.prenom;
  req.session.nom = user.nom;
  res.json({ ok: true, user: { id: user.id, login: user.login, role: user.role, prenom: user.prenom, nom: user.nom, email: user.email, tel: user.tel, scId: user.sc_id, cipId: user.cip_id } });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/me', auth, (req, res) => {
  const user = db.utilisateurs.find(u => u.id === req.session.userId);
  if (!user) return res.status(401).json({ error: 'Session invalide' });
  res.json({ id: user.id, login: user.login, role: user.role, prenom: user.prenom, nom: user.nom, email: user.email, tel: user.tel, scId: user.sc_id, cipId: user.cip_id });
});

// ===== UTILISATEURS =====
app.get('/api/utilisateurs', auth, (req, res) => {
  res.json(db.utilisateurs.map(u => ({ id: u.id, login: u.login, role: u.role, prenom: u.prenom, nom: u.nom, email: u.email, tel: u.tel, sc_id: u.sc_id, cip_id: u.cip_id })));
});

app.post('/api/utilisateurs', adminOnly, (req, res) => {
  const { login, pass, role, prenom, nom, email, tel, scId, cipId } = req.body;
  if (!login || !pass || !role) return res.status(400).json({ error: 'Champs obligatoires manquants' });
  if (db.utilisateurs.find(u => u.login === login)) return res.status(400).json({ error: 'Identifiant déjà utilisé' });
  const id = uid();
  const hash = bcrypt.hashSync(pass, 10);
  db.utilisateurs.push({ id, login, pass_hash: hash, role, prenom: prenom||'', nom: nom||'', email: email||'', tel: tel||'', sc_id: scId||null, cip_id: cipId||null, created_at: new Date().toISOString() });
  saveDB();
  res.json({ ok: true, id });
});

app.put('/api/utilisateurs/:id', adminOnly, (req, res) => {
  const user = db.utilisateurs.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });
  const { login, pass, prenom, nom, email, tel, cipId } = req.body;
  if (login) user.login = login;
  if (pass) user.pass_hash = bcrypt.hashSync(pass, 10);
  if (prenom !== undefined) user.prenom = prenom;
  if (nom !== undefined) user.nom = nom;
  if (email !== undefined) user.email = email;
  if (tel !== undefined) user.tel = tel;
  if (cipId !== undefined) user.cip_id = cipId;
  saveDB();
  res.json({ ok: true });
});

app.delete('/api/utilisateurs/:id', adminOnly, (req, res) => {
  db.utilisateurs = db.utilisateurs.filter(u => u.id !== req.params.id);
  saveDB();
  res.json({ ok: true });
});

// ===== VOLONTAIRES =====
app.get('/api/volontaires', auth, (req, res) => {
  let list = [...db.volontaires];
  if (req.session.role === 'cip') list = list.filter(s => s.cip_id === req.session.userId);
  else if (req.session.role === 'sc') {
    const user = db.utilisateurs.find(u => u.id === req.session.userId);
    list = list.filter(s => s.id === user?.sc_id);
  }
  res.json(list);
});

app.post('/api/volontaires', adminOnly, (req, res) => {
  const { prenom, nom, email, tel, mission, cipId } = req.body;
  if (!prenom || !nom) return res.status(400).json({ error: 'Prénom et nom obligatoires' });
  const id = uid();
  db.volontaires.push({ id, prenom, nom, email: email||'', tel: tel||'', naissance:'', adresse:'', commune:'', mission: mission||'', structure:'', cip_id: cipId||null, debut:'', fin:'', statut:'En cours', obs:'', diag:{}, freins:[], actions:[], created_at: new Date().toISOString() });
  saveDB();
  res.json({ ok: true, id });
});

app.put('/api/volontaires/:id', auth, (req, res) => {
  if (req.session.role === 'responsable') return res.status(403).json({ error: 'Lecture seule' });
  const idx = db.volontaires.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Volontaire non trouvé' });
  const v = req.body;
  db.volontaires[idx] = { ...db.volontaires[idx], ...v, cip_id: v.cipId || v.cip_id || db.volontaires[idx].cip_id };
  saveDB();
  res.json({ ok: true });
});

app.delete('/api/volontaires/:id', adminOnly, (req, res) => {
  const id = req.params.id;
  db.volontaires = db.volontaires.filter(s => s.id !== id);
  db.rendez_vous = db.rendez_vous.filter(r => r.sc_id !== id);
  db.comptes_rendus = db.comptes_rendus.filter(c => c.sc_id !== id);
  db.messages = db.messages.filter(m => m.from_id !== id && m.to_id !== id);
  db.alertes = db.alertes.filter(a => a.sc_id !== id);
  db.utilisateurs = db.utilisateurs.filter(u => u.sc_id !== id);
  saveDB();
  res.json({ ok: true });
});

// ===== RENDEZ-VOUS =====
app.get('/api/rdv', auth, (req, res) => {
  let list = db.rendez_vous.map(r => {
    const sc = db.volontaires.find(v => v.id === r.sc_id);
    return { ...r, sc_prenom: sc?.prenom||'', sc_nom: sc?.nom||'' };
  });
  if (req.session.role === 'cip') {
    const mySC = db.volontaires.filter(s => s.cip_id === req.session.userId).map(s => s.id);
    list = list.filter(r => mySC.includes(r.sc_id));
  } else if (req.session.role === 'sc') {
    const user = db.utilisateurs.find(u => u.id === req.session.userId);
    list = list.filter(r => r.sc_id === user?.sc_id);
  }
  res.json(list.sort((a,b) => new Date(b.date) - new Date(a.date)));
});

app.post('/api/rdv', auth, (req, res) => {
  if (req.session.role === 'responsable' || req.session.role === 'sc') return res.status(403).json({ error: 'Non autorisé' });
  const { scId, date, heure, type, lieu, obs } = req.body;
  if (!scId || !date) return res.status(400).json({ error: 'Données manquantes' });
  const id = uid();
  db.rendez_vous.push({ id, sc_id: scId, date, heure: heure||'', type: type||'Entretien individuel', lieu: lieu||'Bureau CRIJ', obs: obs||'', created_by: req.session.userId, created_at: new Date().toISOString() });
  const scUser = db.utilisateurs.find(u => u.sc_id === scId);
  if (scUser) {
    db.alertes.push({ id: uid(), sc_id: scId, user_id: scUser.id, type: 'rdv', texte: `Nouveau rendez-vous le ${date} à ${heure||''} — ${type||'Entretien'}`, lu: false, created_at: new Date().toISOString() });
    sendMail(scUser.email, 'Nouveau RDV — CRIJ Mayotte', `RDV planifié le ${date}`);
  }
  saveDB();
  res.json({ ok: true, id });
});

app.delete('/api/rdv/:id', auth, (req, res) => {
  if (req.session.role === 'responsable' || req.session.role === 'sc') return res.status(403).json({ error: 'Non autorisé' });
  db.rendez_vous = db.rendez_vous.filter(r => r.id !== req.params.id);
  saveDB();
  res.json({ ok: true });
});

// ===== COMPTES RENDUS =====
app.get('/api/cr', auth, (req, res) => {
  let list = db.comptes_rendus.map(c => {
    const sc = db.volontaires.find(v => v.id === c.sc_id);
    return { ...c, sc_prenom: sc?.prenom||'', sc_nom: sc?.nom||'' };
  });
  if (req.session.role === 'cip') {
    const mySC = db.volontaires.filter(s => s.cip_id === req.session.userId).map(s => s.id);
    list = list.filter(c => mySC.includes(c.sc_id));
  } else if (req.session.role === 'sc') {
    const user = db.utilisateurs.find(u => u.id === req.session.userId);
    list = list.filter(c => c.sc_id === user?.sc_id);
  }
  res.json(list.sort((a,b) => new Date(b.date) - new Date(a.date)));
});

app.post('/api/cr', auth, (req, res) => {
  if (req.session.role === 'responsable' || req.session.role === 'sc') return res.status(403).json({ error: 'Non autorisé' });
  const { scId, date, type, points, avancees, vigilance, actions, prochainRdv } = req.body;
  if (!scId || !date) return res.status(400).json({ error: 'Données manquantes' });
  const id = uid();
  db.comptes_rendus.push({ id, sc_id: scId, date, type: type||'', points: points||'', avancees: avancees||'', vigilance: vigilance||'', actions: actions||'', prochain_rdv: prochainRdv||null, created_by: req.session.userId, created_at: new Date().toISOString() });
  if (prochainRdv) {
    db.rendez_vous.push({ id: uid(), sc_id: scId, date: prochainRdv, type: 'Point de suivi', lieu: 'Bureau CRIJ', created_by: req.session.userId, created_at: new Date().toISOString() });
  }
  const scUser = db.utilisateurs.find(u => u.sc_id === scId);
  if (scUser) {
    db.alertes.push({ id: uid(), sc_id: scId, user_id: scUser.id, type: 'cr', texte: `Votre compte rendu du ${date} est disponible.`, lu: false, created_at: new Date().toISOString() });
    sendMail(scUser.email, 'Compte rendu disponible — CRIJ', `CR du ${date} disponible.`);
  }
  saveDB();
  res.json({ ok: true, id });
});

app.delete('/api/cr/:id', auth, (req, res) => {
  if (req.session.role === 'responsable' || req.session.role === 'sc') return res.status(403).json({ error: 'Non autorisé' });
  db.comptes_rendus = db.comptes_rendus.filter(c => c.id !== req.params.id);
  saveDB();
  res.json({ ok: true });
});

// ===== MESSAGES =====
app.get('/api/messages/:avecId', auth, (req, res) => {
  const moi = req.session.userId;
  const autre = req.params.avecId;
  const msgs = db.messages.filter(m => (m.from_id === moi && m.to_id === autre) || (m.from_id === autre && m.to_id === moi));
  db.messages.forEach(m => { if (m.to_id === moi && m.from_id === autre) m.lu = true; });
  saveDB();
  res.json(msgs.sort((a,b) => new Date(a.created_at) - new Date(b.created_at)));
});

app.post('/api/messages', auth, (req, res) => {
  const { toId, texte } = req.body;
  if (!toId || !texte) return res.status(400).json({ error: 'Données manquantes' });
  const id = uid();
  db.messages.push({ id, from_id: req.session.userId, to_id: toId, texte, lu: false, created_at: new Date().toISOString() });
  if (req.session.role !== 'sc') {
    const dest = db.utilisateurs.find(u => u.id === toId);
    if (dest) {
      db.alertes.push({ id: uid(), sc_id: dest.sc_id, user_id: toId, type: 'msg', texte: `Message de votre conseiller : "${texte.substring(0,60)}"`, lu: false, created_at: new Date().toISOString() });
      sendMail(dest.email, 'Nouveau message — CRIJ', texte);
    }
  } else {
    db.alertes.push({ id: uid(), user_id: toId, type: 'msg', texte: `Message de ${req.session.prenom} ${req.session.nom} : "${texte.substring(0,60)}"`, lu: false, created_at: new Date().toISOString() });
  }
  saveDB();
  res.json({ ok: true, id });
});

app.get('/api/messages-non-lus', auth, (req, res) => {
  const count = db.messages.filter(m => m.to_id === req.session.userId && !m.lu).length;
  res.json({ count });
});

// ===== ALERTES =====
app.get('/api/alertes', auth, (req, res) => {
  const alertes = db.alertes.filter(a => a.user_id === req.session.userId).sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  db.alertes.forEach(a => { if (a.user_id === req.session.userId) a.lu = true; });
  saveDB();
  res.json(alertes);
});

app.get('/api/alertes-count', auth, (req, res) => {
  const count = db.alertes.filter(a => a.user_id === req.session.userId && !a.lu).length;
  res.json({ count });
});

// ===== ROUTE PRINCIPALE =====
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== DÉMARRAGE =====
app.listen(PORT, () => {
  console.log(`[CRIJ] Serveur démarré sur http://localhost:${PORT}`);
});
