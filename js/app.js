import { listChantiers, getChantier, saveChantier, deleteChantier, nouveauChantier, nouvelleFace, exporterChantier, importerChantier, uid } from './db.js';
import { ACCESSOIRES, OUVERTURES, CATEGORIES, GAMMES, pictoImage, chargerPictos } from './catalog.js';
import { Editeur } from './editor.js';
import { metreFace, lignesDevis, redresser } from './geom.js';
import { detecter, cleAPI } from './ai.js';
import { connecterLaser, deconnecterLaser, laserConnecte, surMesure, surEtat } from './laser.js';
import { genererRapport } from './report.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const nf = (v, d = 2) => v == null ? '—' : v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let chantier = null;
let face = null;
let imgFace = null;
let saisie = '';

// ---------------- navigation ----------------
function aller(nom) {
  $$('.ecran').forEach(e => e.classList.toggle('actif', e.id === 'ecran-' + nom));
  if (nom === 'accueil') afficherAccueil();
  if (nom === 'chantier') afficherChantier();
}
$$('[data-vers]').forEach(b => b.addEventListener('click', async () => {
  if (b.dataset.vers === 'chantier' && face) { await enregistrer(); face = null; }
  aller(b.dataset.vers);
}));

let toastT;
function toast(msg, ms = 3200) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('vu');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('vu'), ms);
}
const attente = (txt) => { $('#attente-txt').textContent = txt || ''; $('#attente').hidden = !txt; };

let saveT;
function enregistrerBientot() { clearTimeout(saveT); saveT = setTimeout(enregistrer, 600); }
async function enregistrer() { clearTimeout(saveT); if (chantier) await saveChantier(chantier); }

// ---------------- accueil ----------------
async function afficherAccueil() {
  const l = (await listChantiers()).sort((a, b) => b.modifie - a.modifie);
  $('#vide-chantiers').hidden = l.length > 0;
  $('#liste-chantiers').innerHTML = l.map(c => {
    const surf = c.faces.reduce((s, f) => s + (metreFace(f).surfacePosee || 0), 0);
    return `<li class="carte" data-id="${c.id}">
      <span class="t">${esc(c.client || 'Client sans nom')}</span>
      <span class="s">${esc(c.adresse || 'Adresse à compléter')}</span>
      <span class="s">${new Date(c.date).toLocaleDateString('fr-FR')} · ${c.faces.length} face${c.faces.length > 1 ? 's' : ''} · ${nf(surf)} m² posés</span>
    </li>`;
  }).join('');
}
$('#liste-chantiers').addEventListener('click', async e => {
  const li = e.target.closest('[data-id]'); if (!li) return;
  chantier = await getChantier(li.dataset.id); aller('chantier');
});
$('#btn-nouveau').addEventListener('click', async () => {
  chantier = nouveauChantier(); await saveChantier(chantier); aller('chantier');
  $('#form-chantier [name=client]').focus();
});
$('#in-import').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try { chantier = await importerChantier(f); toast('Chantier importé.'); aller('chantier'); }
  catch (err) { toast(err.message); }
});

// réglages
$('#btn-reglages').addEventListener('click', () => { $('#in-cle').value = cleAPI.get(); $('#dlg-reglages').showModal(); });
$('#dlg-reglages').addEventListener('close', () => { if ($('#dlg-reglages').returnValue === 'ok') { cleAPI.set($('#in-cle').value); toast('Réglages enregistrés.'); } });

// installation PWA
let promptInstall;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); promptInstall = e; $('#btn-installer').hidden = false; });
$('#btn-installer').addEventListener('click', async () => { promptInstall?.prompt(); await promptInstall?.userChoice; promptInstall = null; $('#btn-installer').hidden = true; });
addEventListener('appinstalled', () => { $('#btn-installer').hidden = true; });

// ---------------- chantier ----------------
const form = $('#form-chantier');
form.gamme.innerHTML = GAMMES.map(g => `<option>${g}</option>`).join('');
form.addEventListener('input', () => {
  for (const k of ['client', 'adresse', 'date', 'gamme', 'couleur', 'notes']) chantier[k] = form[k].value;
  $('#titre-chantier').textContent = chantier.client || 'Nouveau chantier';
  enregistrerBientot(); afficherRecap();
});
$('#btn-suppr-chantier').addEventListener('click', async () => {
  if (!confirm(`Supprimer définitivement le chantier « ${chantier.client || 'sans nom'} » et toutes ses photos ? Cette action est irréversible.`)) return;
  await deleteChantier(chantier.id); chantier = null; aller('accueil');
});

const urls = [];
function afficherChantier() {
  for (const k of ['client', 'adresse', 'date', 'gamme', 'couleur', 'notes']) form[k].value = chantier[k] ?? '';
  $('#titre-chantier').textContent = chantier.client || 'Nouveau chantier';
  urls.splice(0).forEach(URL.revokeObjectURL);
  $('#liste-faces').innerHTML = chantier.faces.map(f => {
    const m = metreFace(f);
    const u = f.photo ? URL.createObjectURL(f.photo) : ''; if (u) urls.push(u);
    const nAcc = f.accessoires.filter(a => !a.propose).length;
    return `<li class="carte" data-face="${f.id}">
      ${u ? `<img class="vignette" src="${u}" alt="">` : '<div class="vignette"></div>'}
      <div><span class="t">${esc(f.nom)}</span><br>
      <span class="s">${nf(m.surfacePosee)} m² posés · ${m.ouvertures.length} ouverture${m.ouvertures.length > 1 ? 's' : ''} · ${nAcc} accessoire${nAcc > 1 ? 's' : ''}</span></div>
    </li>`;
  }).join('') || '<li class="note">Ajoutez la première face à relever.</li>';
  afficherRecap();
}

function afficherRecap() {
  const total = {};
  let surf = 0;
  for (const f of chantier.faces) {
    const m = metreFace(f); surf += m.surfacePosee || 0;
    for (const l of lignesDevis(f, m, chantier).slice(1)) {
      const q = parseFloat(String(l.qte).replace(',', '.'));
      if (isNaN(q)) continue;
      total[l.texte] ??= { ...l, q: 0 };
      total[l.texte].q += q;
    }
  }
  const lignes = Object.values(total);
  $('#recap-chantier').innerHTML = `<h2>Récapitulatif pour le devis Uniso</h2>
    <table><thead><tr><th>Ligne</th><th class="n">Qté</th><th>U</th></tr></thead><tbody>
    <tr><td><b>${esc(chantier.gamme)}${chantier.couleur ? ' - ' + esc(chantier.couleur) : ''} - Surface posée totale</b></td><td class="n"><b>${nf(surf)}</b></td><td>m²</td></tr>
    ${lignes.map(l => `<tr class="${l.client ? 'client' : ''}"><td>${esc(l.texte)}${l.client ? ' — à la charge du client' : ''}</td><td class="n">${nf(l.q, l.unite === 'u' ? 0 : 2)}</td><td>${l.unite}</td></tr>`).join('')}
    </tbody></table>`;
}

$('#liste-faces').addEventListener('click', e => {
  const li = e.target.closest('[data-face]'); if (!li) return;
  ouvrirFace(chantier.faces.find(f => f.id === li.dataset.face));
});
$('#btn-ajout-face').addEventListener('click', () => {
  const nom = $('#sel-nom-face').value;
  if (nom) return ajouterFace(nom);
  $('#in-nom-face').value = ''; $('#dlg-nom').showModal();
});
$('#dlg-nom').addEventListener('close', () => { if ($('#dlg-nom').returnValue === 'ok') ajouterFace($('#in-nom-face').value.trim() || 'Face'); });
async function ajouterFace(nom) {
  const f = nouvelleFace(nom); chantier.faces.push(f); await enregistrer(); ouvrirFace(f);
}

$('#btn-partager').addEventListener('click', async () => {
  await enregistrer();
  const blob = await exporterChantier(chantier);
  const nom = `metre-${(chantier.client || 'chantier').replace(/[^\w-]+/g, '_')}-${chantier.date}.json`;
  const file = new File([blob], nom, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Métré ' + (chantier.client || '') }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nom; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast('Fichier du chantier enregistré dans Téléchargements.');
});

$('#btn-rapport').addEventListener('click', async () => {
  await enregistrer();
  attente('Préparation du rapport…');
  try { $('#rapport').innerHTML = await genererRapport(chantier); aller('rapport'); }
  finally { attente(); }
});
$('#btn-imprimer').addEventListener('click', () => window.print());

// ---------------- éditeur de face ----------------
const editeur = new Editeur($('#canvas'), {
  onChange: () => { enregistrerBientot(); majPanneaux(); },
  onSelect: () => majPanneaux(),
  onRedresser: pts => demanderRedressement(pts),
  onMessage: m => toast(m),
});

async function chargerImage(blob) {
  const url = URL.createObjectURL(blob);
  const img = new Image(); img.src = url; await img.decode();
  return img;
}
function imageVierge(w = 2000, h = 1200) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
  return c;
}

async function ouvrirFace(f) {
  face = f;
  aller('face');
  $('#titre-face').textContent = f.nom;
  editeur.modePlan = !f.photo;
  majBascule();
  if (f.photo) imgFace = await chargerImage(f.photo);
  else if (f.imgW) imgFace = imageVierge(f.imgW, f.imgH);
  else imgFace = null;
  $('#sans-photo').hidden = !!imgFace;
  setOutil(f.contour.length ? 'select' : (f.redressee || !f.photo ? 'contour' : 'redresser'));
  requestAnimationFrame(() => editeur.charger(f, imgFace));
  majPanneaux();
}

$('#titre-face').addEventListener('input', () => { face.nom = $('#titre-face').textContent.trim() || 'Face'; enregistrerBientot(); });
$('#titre-face').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });

for (const id of ['#in-photo', '#in-photo-2']) $(id).addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  if (face.contour.length && !confirm('Remplacer la photo ? Le contour, les ouvertures, les accessoires et les cotes de cette face seront effacés.')) return;
  attente('Chargement de la photo…');
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 3200 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.88));
    Object.assign(face, { photo: blob, imgW: c.width, imgH: c.height, redressee: false, echelle: null, contour: [], ouvertures: [], accessoires: [], cotes: [], mesures: {} });
    await enregistrer();
    await ouvrirFace(face);
    aide('Touchez les 4 coins d’une fenêtre dont vous connaissez la largeur et la hauteur. Glissez le doigt pour viser avec la loupe.');
  } finally { attente(); }
});
$('#btn-sans-photo').addEventListener('click', () => {
  Object.assign(face, { imgW: 2000, imgH: 1200 });
  enregistrer(); ouvrirFace(face);
});

// outils
function setOutil(o) {
  editeur.setOutil(o);
  $$('.outils [data-outil]').forEach(b => b.classList.toggle('on', b.dataset.outil === o));
  const aides = {
    redresser: 'Touchez les 4 coins d’une fenêtre (ou de la façade) dont vous connaissez les cotes. Glissez le doigt pour viser avec la loupe.',
    contour: 'Touchez chaque angle du mur, puis le premier point pour fermer. Glissez pour viser, deux doigts pour zoomer.',
    ouverture: 'Faites glisser sur la photo, d’un coin à l’autre de l’ouverture (tableau).',
    accessoire: 'Choisissez l’accessoire à droite, puis touchez sa position sur la façade.',
    cote: 'Touchez le point de départ puis le point d’arrivée de la cote.',
    select: '',
  };
  aide(aides[o]);
  majPanneaux();
}
let aideT;
function aide(t) { const a = $('#aide'); a.textContent = t || ''; a.hidden = !t; clearTimeout(aideT); if (t) aideT = setTimeout(() => a.hidden = true, 7000); }
$$('.outils [data-outil]').forEach(b => b.addEventListener('click', () => setOutil(b.dataset.outil)));
$('#btn-cadrer').addEventListener('click', () => editeur.cadrer());
function majBascule() { $('#vue-photo').classList.toggle('on', !editeur.modePlan); $('#vue-plan').classList.toggle('on', editeur.modePlan); }
$('#vue-photo').addEventListener('click', () => { if (!face.photo) return toast('Pas de photo pour cette face.'); editeur.modePlan = false; majBascule(); editeur.dessiner(); });
$('#vue-plan').addEventListener('click', () => { editeur.modePlan = true; majBascule(); editeur.dessiner(); });

// ---- redressement ----
let pointsRed = null;
let redQuoi = 'ouverture';
$('#in-red-type').innerHTML = Object.entries(OUVERTURES).map(([k, o]) => `<option value="${k}">${o.label}</option>`).join('');
function majRedQuoi(v) {
  redQuoi = v;
  $$('#red-quoi button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  $('#red-type-l').hidden = v !== 'ouverture';
}
$('#red-quoi').addEventListener('click', e => { const b = e.target.closest('button'); if (b) majRedQuoi(b.dataset.v); });
function demanderRedressement(pts) {
  pointsRed = pts;
  $('#in-red-l').value = ''; $('#in-red-h').value = '';
  majRedQuoi('ouverture');
  $('#dlg-redresser').showModal();
  $('#in-red-l').focus();
}
$('#dlg-redresser').addEventListener('close', async () => {
  if ($('#dlg-redresser').returnValue !== 'ok') { setOutil('select'); return; }
  const L = num($('#in-red-l').value), H = num($('#in-red-h').value);
  if (!(L > 0 && H > 0)) return toast('Indiquez une largeur et une hauteur en mètres, par exemple 8,45.');
  attente('Redressement de la photo…');
  try {
    await new Promise(r => setTimeout(r, 30));
    const { canvas, echelle, rect } = redresser(imgFace, pointsRed, L, H);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.88));
    Object.assign(face, { photo: blob, imgW: canvas.width, imgH: canvas.height, redressee: true, echelle, ouvertures: [], accessoires: [], cotes: [], mesures: {}, contour: [] });
    if (redQuoi === 'contour') {
      face.contour = [{ x: rect.x, y: rect.y }, { x: rect.x + rect.w, y: rect.y }, { x: rect.x + rect.w, y: rect.y + rect.h }, { x: rect.x, y: rect.y + rect.h }];
      face.mesures = { 0: { val: L, src: 'manuel' }, 1: { val: H, src: 'manuel' }, 2: { val: L, src: 'manuel' }, 3: { val: H, src: 'manuel' } };
    } else {
      const type = $('#in-red-type').value;
      face.ouvertures.push({ id: uid(), type, x: rect.x, y: rect.y, w: rect.w, h: rect.h, L, H, srcL: 'manuel', srcH: 'manuel', prof: 20, appui: OUVERTURES[type].appui });
    }
    await enregistrer();
    await ouvrirFace(face);
    if (redQuoi === 'contour') {
      setOutil('ouverture');
      toast('Façade mise à l’échelle : tracez les ouvertures, leurs cotes se calculent seules.', 6000);
    } else if (cleAPI.get() && navigator.onLine) {
      toast('Photo mise à l’échelle. Recherche de la façade et des autres ouvertures…', 6000);
      $('#btn-detecter').click();
    } else {
      setOutil('contour');
      aide('Photo mise à l’échelle. Touchez maintenant chaque angle de la façade (la pointe du pignon aussi), puis le premier point pour fermer.');
    }
  } catch (e) { toast('Redressement impossible : ' + e.message); }
  finally { attente(); }
});
const num = s => parseFloat(String(s).replace(',', '.').replace(/[^\d.]/g, ''));

// ---- détection IA ----
$('#btn-detecter').addEventListener('click', async () => {
  if (!imgFace || !face.photo) return toast('Prenez d’abord une photo de la face.');
  attente('Recherche des ouvertures et accessoires…');
  try {
    const r = await detecter(face.photo, face.imgW, face.imgH);
    if (!face.contour.length && r.contour.length >= 3) face.contour = r.contour;
    for (const o of r.ouvertures) face.ouvertures.push({ id: uid(), ...o, prof: 20, propose: true });
    for (const a of r.accessoires) face.accessoires.push({ id: uid(), type: a.type, x: a.x, y: a.y, s: 1, note: a.note, action: 'deposer-reposer', propose: true });
    editeur.dessiner(); enregistrerBientot(); majPanneaux();
    majBandeauIA();
  } catch (e) { toast(e.message, 6000); }
  finally { attente(); }
});
function majBandeauIA() {
  const n = face.ouvertures.filter(o => o.propose).length + face.accessoires.filter(a => a.propose).length;
  $('#bandeau-ia').hidden = !n;
  $('#txt-ia').textContent = `${n} élément${n > 1 ? 's' : ''} proposé${n > 1 ? 's' : ''} (en orange) : touchez-les pour corriger.`;
}
$('#ia-ok').addEventListener('click', () => { face.ouvertures.forEach(o => delete o.propose); face.accessoires.forEach(a => delete a.propose); fin(); });
$('#ia-non').addEventListener('click', () => { face.ouvertures = face.ouvertures.filter(o => !o.propose); face.accessoires = face.accessoires.filter(a => !a.propose); fin(); });
function fin() { editeur.dessiner(); enregistrerBientot(); majPanneaux(); majBandeauIA(); }

// ---- laser ----
surMesure(v => {
  if (!face || !editeur.active) return toast(`Mesure laser ${nf(v, 3)} m : touchez d’abord une cote sur le plan.`);
  appliquerCote(v, 'laser');
  toast(`Laser : ${nf(v, 3)} m`);
});
surEtat((etat, nom) => {
  $('#btn-laser').classList.toggle('connecte', etat === 'connecte');
  $('#etat-laser').textContent = etat === 'connecte' ? (nom || 'Laser').slice(0, 10) : 'Laser';
  if (etat === 'deconnecte') toast('Laser déconnecté.');
});
$('#btn-laser').addEventListener('click', async () => {
  if (laserConnecte()) { if (confirm('Déconnecter le laser ?')) deconnecterLaser(); return; }
  try { const n = await connecterLaser(); toast(`${n || 'Laser'} connecté : chaque mesure remplit la cote active.`); }
  catch (e) { if (e.name !== 'NotFoundError') toast(e.message, 6000); }
});

// ---- saisie des cotes ----
function decrireCote(ref) {
  if (!ref) return null;
  const m = metreFace(face);
  if (ref.kind === 'bord') { const b = m.bords[ref.i]; return b && { titre: `Côté ${ref.i + 1} du mur`, auto: b.auto, val: face.mesures[ref.i]?.val }; }
  if (ref.kind === 'cote') { const c = face.cotes.find(x => x.id === ref.id); if (!c) return null; const mm = m.echelle; return { titre: 'Cote libre', auto: mm ? Math.sqrt((c.b.x - c.a.x) ** 2 * mm.u + (c.b.y - c.a.y) ** 2 * mm.v) : null, val: c.val }; }
  const o = face.ouvertures.find(x => x.id === ref.id); if (!o) return null;
  const mo = m.ouvertures.find(x => x.id === ref.id);
  const lab = OUVERTURES[o.type]?.label || 'Ouverture';
  if (ref.kind === 'ouvL') return { titre: `${lab} : largeur`, auto: m.echelle ? o.w * Math.sqrt(m.echelle.u) : null, val: o.L, mo };
  return { titre: `${lab} : hauteur`, auto: m.echelle ? o.h * Math.sqrt(m.echelle.v) : null, val: o.H, mo };
}

function appliquerCote(val, src) {
  const ref = editeur.active; if (!ref) return;
  if (ref.kind === 'bord') { if (val == null) delete face.mesures[ref.i]; else face.mesures[ref.i] = { val, src }; }
  else if (ref.kind === 'cote') { const c = face.cotes.find(x => x.id === ref.id); if (c) { c.val = val; c.src = val == null ? 'auto' : src; } }
  else {
    const o = face.ouvertures.find(x => x.id === ref.id);
    if (o) { const k = ref.kind === 'ouvL' ? 'L' : 'H'; if (val == null) { delete o[k]; delete o['src' + k]; } else { o[k] = val; o['src' + k] = src; } }
  }
  if (val != null) suivante(); else { editeur.dessiner(); majPanneaux(); }
  enregistrerBientot();
}
function suivante() {
  const ordre = editeur.ordreCotes();
  const i = ordre.findIndex(r => Editeur.memeCote(r, editeur.active));
  const reste = [...ordre.slice(i + 1), ...ordre.slice(0, i + 1)];
  const non = reste.find(r => { const d = decrireCote(r); return d && d.val == null; });
  editeur.active = non || null;
  editeur.dessiner(); majPanneaux();
  if (!non) toast('Toutes les cotes sont relevées.');
}
$('.pave').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.k === 'del') saisie = saisie.slice(0, -1);
  else if (b.textContent === ',') { if (!saisie.includes(',')) saisie += saisie ? ',' : '0,'; }
  else saisie += b.textContent;
  $('#saisie-val').value = saisie;
});
$('#saisie-val').addEventListener('input', e => { saisie = e.target.value.replace('.', ','); });
$('#saisie-val').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#saisie-ok').click(); } });
$('#saisie-ok').addEventListener('click', () => {
  const v = num(saisie);
  if (!(v > 0)) return toast('Tapez une valeur en mètres, par exemple 2,35.');
  saisie = ''; appliquerCote(v, 'manuel');
});
$('#saisie-auto-btn').addEventListener('click', () => { saisie = ''; appliquerCote(null); });
$('#saisie-suiv').addEventListener('click', () => suivante());

// ---------------- panneaux latéraux ----------------
function majPanneaux() {
  if (!face) return;
  // panneau d'outil
  const po = $('#panneau-outil');
  if (editeur.outil === 'accessoire') {
    po.className = 'panneau palette';
    po.innerHTML = '<h2>Accessoires</h2>' + CATEGORIES.map(c => `<h3>${c.label}</h3><div class="grille-acc">${Object.entries(ACCESSOIRES).filter(([, a]) => a.cat === c.id)
      .map(([k, a]) => `<button data-acc="${k}" class="${editeur.typeAcc === k ? 'on' : ''}"><span class="pic" data-pic="${k}"></span>${a.label}</button>`).join('')}</div>`).join('');
    po.querySelectorAll('[data-pic]').forEach(s => { const im = pictoImage(s.dataset.pic); s.replaceWith(im instanceof HTMLCanvasElement ? cloneCanvas(im) : Object.assign(new Image(), { src: im.src, alt: '' })); });
  } else if (editeur.outil === 'ouverture') {
    po.className = 'panneau';
    po.innerHTML = `<h2>Type d'ouverture</h2><div class="choix">${Object.entries(OUVERTURES).map(([k, o]) => `<button data-ouv="${k}" class="${editeur.typeOuv === k ? 'on' : ''}">${o.label}</button>`).join('')}</div>`;
  } else { po.className = ''; po.innerHTML = ''; }

  // saisie de cote
  const d = decrireCote(editeur.active);
  $('#panneau-saisie').hidden = !d;
  if (d) {
    $('#saisie-quoi').textContent = d.titre;
    $('#saisie-auto').textContent = d.val != null ? `relevé ${nf(d.val)} m` : d.auto != null ? `≈ ${nf(d.auto)} m` : 'échelle inconnue';
    saisie = ''; $('#saisie-val').value = ''; $('#saisie-val').placeholder = d.val != null ? nf(d.val) : '0,00';
    if (!matchMedia('(pointer: coarse)').matches) $('#saisie-val').focus({ preventScroll: true });
  }

  // sélection
  const ps = $('#panneau-sel');
  const sel = editeur.sel;
  const o = sel?.kind === 'ouv' && face.ouvertures.find(x => x.id === sel.id);
  const a = sel?.kind === 'acc' && face.accessoires.find(x => x.id === sel.id);
  ps.hidden = !o && !a;
  if (o) {
    const appui = o.appui ?? OUVERTURES[o.type]?.appui;
    ps.innerHTML = `<h2>${OUVERTURES[o.type]?.label}</h2>
      <div class="choix" data-champ="type">${Object.entries(OUVERTURES).map(([k, v]) => `<button data-v="${k}" class="${o.type === k ? 'on' : ''}">${v.label}</button>`).join('')}</div>
      <label style="margin-top:10px">Profondeur du tableau (cm)<input data-champ="prof" inputmode="decimal" value="${o.prof ?? 20}"></label>
      <label class="case" style="margin-top:8px"><input type="checkbox" data-champ="appui" ${appui ? 'checked' : ''}> Appui de fenêtre</label>
      <div class="sel-actions">
        ${o.propose ? '<button class="btn primaire" data-act="valider">Valider</button>' : ''}
        <button class="btn discret" data-act="L">Largeur</button><button class="btn discret" data-act="H">Hauteur</button>
        <button class="btn danger" data-act="suppr">Supprimer</button>
      </div>`;
  } else if (a) {
    const def = ACCESSOIRES[a.type];
    ps.innerHTML = `<h2>${def?.label}</h2>${a.note ? `<p class="note">${esc(a.note)}</p>` : ''}
      <label>Type<select data-champ="type">${Object.entries(ACCESSOIRES).map(([k, v]) => `<option value="${k}" ${k === a.type ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
      <div class="choix" data-champ="action" style="margin-top:10px">
        ${[['deposer-reposer', 'Dépose / repose'], ['sans-repose', 'Dépose sans repose'], ['client', 'À la charge du client']].map(([k, l]) => `<button data-v="${k}" class="${a.action === k ? 'on' : ''}">${l}</button>`).join('')}
      </div>
      <label style="margin-top:10px">Remarque<input data-champ="note" value="${esc(a.note || '')}"></label>
      <label style="margin-top:8px">Taille du picto<input type="range" min="0.5" max="3" step="0.1" data-champ="s" value="${a.s || 1}"></label>
      <div class="sel-actions">
        ${a.propose ? '<button class="btn primaire" data-act="valider">Valider</button>' : ''}
        <button class="btn danger" data-act="suppr">Supprimer</button>
      </div>`;
  }

  // métré de la face
  const m = metreFace(face);
  const ech = m.echelle;
  const lignes = lignesDevis(face, m, chantier);
  $('#panneau-metre').innerHTML = `<h2>Métré de la face</h2>
    <table><tbody>
      <tr><td>Surface brute</td><td class="n">${nf(m.surfaceBrute)} m²</td></tr>
      <tr><td>Ouvertures déduites</td><td class="n">− ${nf(m.surfaceOuvertures)} m²</td></tr>
      <tr><td><b>Surface posée</b></td><td class="n"><b>${nf(m.surfacePosee)} m²</b></td></tr>
      ${lignes.slice(1).map(l => `<tr class="${l.client ? 'client' : ''}"><td>${esc(l.texte)}</td><td class="n">${l.qte} ${l.unite}</td></tr>`).join('')}
    </tbody></table>
    <label class="case" style="margin-top:8px"><input type="checkbox" id="chk-echaf" ${face.echafaudage ? 'checked' : ''}> Échafaudage nécessaire</label>
    <label style="margin-top:8px">Remarques de la face<textarea id="txt-rem" rows="2">${esc(face.remarques)}</textarea></label>
    <p class="echelle">${!ech ? 'Échelle inconnue : redressez la photo ou relevez une première cote.' :
      ech.source === 'redressement' ? 'Échelle issue du redressement. Relevez quelques cotes pour la vérifier.' :
      `Échelle recalée sur ${ech.n} cote${ech.n > 1 ? 's' : ''} relevée${ech.n > 1 ? 's' : ''} · ≈ = calculée, foncé = relevée.`}</p>`;
  majBandeauIA();
}
function cloneCanvas(c) { const n = document.createElement('canvas'); n.width = c.width; n.height = c.height; n.getContext('2d').drawImage(c, 0, 0); return n; }

$('#panneau-outil').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.acc) { editeur.typeAcc = b.dataset.acc; majPanneaux(); aide(`Touchez la façade pour placer : ${ACCESSOIRES[b.dataset.acc].label}.`); }
  if (b.dataset.ouv) { editeur.typeOuv = b.dataset.ouv; majPanneaux(); }
});

function objSel() {
  const s = editeur.sel; if (!s) return null;
  return s.kind === 'ouv' ? face.ouvertures.find(x => x.id === s.id) : face.accessoires.find(x => x.id === s.id);
}
$('#panneau-sel').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const obj = objSel(); if (!obj) return;
  const champ = b.closest('[data-champ]')?.dataset.champ;
  if (champ && b.dataset.v) { obj[champ] = b.dataset.v; if (champ === 'type' && editeur.sel.kind === 'ouv') obj.appui = OUVERTURES[b.dataset.v].appui; }
  if (b.dataset.act === 'valider') delete obj.propose;
  if (b.dataset.act === 'suppr') {
    if (editeur.sel.kind === 'ouv') face.ouvertures = face.ouvertures.filter(x => x !== obj);
    else face.accessoires = face.accessoires.filter(x => x !== obj);
    editeur.sel = null; editeur.active = null;
  }
  if (b.dataset.act === 'L' || b.dataset.act === 'H') editeur.active = { kind: 'ouv' + b.dataset.act, id: obj.id };
  editeur.dessiner(); enregistrerBientot(); majPanneaux();
});
$('#panneau-sel').addEventListener('change', e => {
  const obj = objSel(); const c = e.target.dataset.champ; if (!obj || !c) return;
  if (c === 'appui') obj.appui = e.target.checked;
  else if (c === 'prof') obj.prof = num(e.target.value) || 0;
  else if (c === 's') obj.s = +e.target.value;
  else obj[c] = e.target.value;
  editeur.dessiner(); enregistrerBientot(); majPanneaux();
});
$('#panneau-sel').addEventListener('input', e => {
  const obj = objSel(); if (!obj) return;
  if (e.target.dataset.champ === 's') { obj.s = +e.target.value; editeur.dessiner(); }
});
$('#panneau-metre').addEventListener('change', e => {
  if (e.target.id === 'chk-echaf') { face.echafaudage = e.target.checked; majPanneaux(); }
  if (e.target.id === 'txt-rem') face.remarques = e.target.value;
  enregistrerBientot();
});

// suppression au clavier
addEventListener('keydown', e => {
  if (!face || !$('#ecran-face').classList.contains('actif')) return;
  if (e.target.matches('input, textarea, [contenteditable]')) return;
  if (/^[\d,.]$/.test(e.key) && editeur.active) { $('#saisie-val').focus(); return; } // laser en mode clavier
  if (e.key === 'Escape') { editeur.temp = []; setOutil('select'); }
});

// ---------------- démarrage ----------------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
afficherAccueil();
chargerPictos().then(() => editeur.dessiner());
document.addEventListener('click', e => { const b = e.target.closest('[data-fermer]'); if (b) b.closest('dialog').close('annuler'); });
