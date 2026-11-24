// Rapport imprimable (Enregistrer en PDF depuis Chrome) : une page par face + récapitulatif Uniso.
import { Editeur } from './editor.js';
import { metreFace, lignesDevis } from './geom.js';
import { ACCESSOIRES, chargerPictos } from './catalog.js';

const nf = (v, d = 2) => v == null ? '—' : v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SRC = { auto: 'calculée', laser: 'laser', manuel: 'relevée' };

async function imageAnnotee(face, plan) {
  const c = document.createElement('canvas');
  const ed = new Editeur(c, {});
  let img;
  if (face.photo && !plan) { img = new Image(); img.src = URL.createObjectURL(face.photo); await img.decode(); }
  else { img = document.createElement('canvas'); img.width = face.imgW || 2000; img.height = face.imgH || 1200; }
  ed.face = face; ed.img = img; ed.modePlan = plan || !face.photo; ed.outil = 'none';
  const out = ed.exporterImage(1800).toDataURL('image/jpeg', 0.85);
  if (img.src?.startsWith('blob:')) URL.revokeObjectURL(img.src);
  return out;
}

export async function genererRapport(ch) {
  await chargerPictos();
  const pages = [];
  const total = {};
  let surf = 0;
  for (const f of ch.faces) {
    const m = metreFace(f);
    surf += m.surfacePosee || 0;
    const lignes = lignesDevis(f, m, ch);
    for (const l of lignes.slice(1)) {
      const q = parseFloat(String(l.qte).replace(',', '.'));
      if (!isNaN(q)) { total[l.texte] ??= { ...l, q: 0 }; total[l.texte].q += q; }
    }
    const plan = f.imgW ? await imageAnnotee(f, true) : null;
    const photo = f.photo ? await imageAnnotee(f, false) : null;
    const acc = f.accessoires.filter(a => !a.propose);
    pages.push(`<section class="page">
      <div class="entete"><div><h2 style="margin:0">${esc(f.nom)}</h2><span class="legende">${esc(ch.client)} — ${esc(ch.adresse)}</span></div>
        <div style="text-align:right"><b>${nf(m.surfacePosee)} m² posés</b><br><span class="legende">brute ${nf(m.surfaceBrute)} m² − ouvertures ${nf(m.surfaceOuvertures)} m²</span></div></div>
      ${plan ? `<img class="plan" src="${plan}" alt="Plan coté de ${esc(f.nom)}">` : '<p>Pas de plan pour cette face.</p>'}
      <p class="legende">Cotes en mètres. Fond foncé : cote relevée (laser ou mètre). « ≈ » : cote calculée à l'échelle de la photo.</p>
      <div class="grille2">
        <div>
          <h3>Lignes du devis</h3>
          <table><tbody>${lignes.map(l => `<tr class="${l.client ? 'client' : ''}"><td>${esc(l.texte)}${l.client ? ' — client' : ''}</td><td class="n">${l.qte} ${l.unite}</td></tr>`).join('')}</tbody></table>
          <h3>Côtés du mur</h3>
          <table><tbody>${m.bords.map(b => `<tr><td>Côté ${b.i + 1}</td><td class="n">${nf(b.val)} m</td><td>${SRC[b.src] || b.src}</td></tr>`).join('') || '<tr><td>—</td></tr>'}</tbody></table>
        </div>
        <div>
          <h3>Ouvertures</h3>
          <table><thead><tr><th>Type</th><th class="n">L × H (m)</th><th class="n">Tableau</th><th>Appui</th></tr></thead>
          <tbody>${m.ouvertures.map(o => `<tr><td>${o.label}</td><td class="n">${nf(o.L)} × ${nf(o.H)}</td><td class="n">${o.prof ?? 20} cm</td><td>${o.appui ? 'oui' : '—'}</td></tr>`).join('') || '<tr><td colspan="4">Aucune</td></tr>'}</tbody></table>
          <h3>Accessoires</h3>
          <table><tbody>${acc.map(a => `<tr class="${a.action === 'client' || ACCESSOIRES[a.type]?.client ? 'client' : ''}"><td>${ACCESSOIRES[a.type]?.label}</td><td>${{ 'deposer-reposer': 'dépose / repose', 'sans-repose': 'dépose sans repose', client: 'à la charge du client' }[a.action] || ''}${a.note ? ' — ' + esc(a.note) : ''}</td></tr>`).join('') || '<tr><td>Aucun</td></tr>'}</tbody></table>
          ${f.remarques ? `<h3>Remarques</h3><p>${esc(f.remarques)}</p>` : ''}
        </div>
      </div>
      ${photo ? `<h3>Photo annotée</h3><img class="plan" src="${photo}" alt="Photo annotée de ${esc(f.nom)}">` : ''}
    </section>`);
  }
  const lignes = Object.values(total);
  const garde = `<section class="page">
    <div class="entete"><div><h2 style="margin:0">Métré façades — ${esc(ch.client || 'Client')}</h2><span class="legende">${esc(ch.adresse)}</span></div>
      <div style="text-align:right">Relevé du ${new Date(ch.date).toLocaleDateString('fr-FR')}<br><span class="legende">${esc(ch.gamme)}${ch.couleur ? ' — ' + esc(ch.couleur) : ''}</span></div></div>
    <h2>Récapitulatif pour le devis Uniso</h2>
    <table><thead><tr><th>Ligne</th><th class="n">Qté</th><th>U</th></tr></thead><tbody>
      <tr><td><b>${esc(ch.gamme)} - Surface posée totale</b></td><td class="n"><b>${nf(surf)}</b></td><td>m²</td></tr>
      ${lignes.map(l => `<tr class="${l.client ? 'client' : ''}"><td>${esc(l.texte)}${l.client ? ' — à la charge du client' : ''}</td><td class="n">${nf(l.q, l.unite === 'u' ? 0 : 2)}</td><td>${l.unite}</td></tr>`).join('')}
    </tbody></table>
    <h3>Détail par face</h3>
    <table><thead><tr><th>Face</th><th class="n">Brute</th><th class="n">Ouvertures</th><th class="n">Posée</th></tr></thead><tbody>
      ${ch.faces.map(f => { const m = metreFace(f); return `<tr><td>${esc(f.nom)}</td><td class="n">${nf(m.surfaceBrute)}</td><td class="n">${nf(m.surfaceOuvertures)}</td><td class="n">${nf(m.surfacePosee)}</td></tr>`; }).join('')}
    </tbody></table>
    ${ch.notes ? `<h3>Notes</h3><p>${esc(ch.notes)}</p>` : ''}
    <p class="legende" style="margin-top:24px">Surfaces posées, ouvertures déduites. La surface fabriquée (chutes comprises) est calculée par le logiciel de devis.</p>
  </section>`;
  return garde + pages.join('');
}
