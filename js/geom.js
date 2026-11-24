// Géométrie : redressement de photo (homographie), échelle, calcul des cotes et du métré.
import { OUVERTURES, ACCESSOIRES } from './catalog.js';

// ---------- Homographie ----------
function solve(A, b) { // élimination de Gauss avec pivot partiel
  const n = b.length;
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
    for (let r = i + 1; r < n; r++) {
      const f = A[r][i] / A[i][i];
      for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
      b[r] -= f * b[i];
    }
  }
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c];
    x[i] = s / A[i][i];
  }
  return x;
}

/** Homographie qui envoie src[i] sur dst[i] (4 points). */
export function homographie(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i], { x: X, y: Y } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]); b.push(X);
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]); b.push(Y);
  }
  const h = solve(A, b);
  return [...h, 1];
}
export function appliquer(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  return { x: (H[0] * x + H[1] * y + H[2]) / w, y: (H[3] * x + H[4] * y + H[5]) / w };
}

/** Ordonne 4 points : haut-gauche, haut-droit, bas-droit, bas-gauche. */
export function ordonner4(pts) {
  const c = pts.reduce((s, p) => ({ x: s.x + p.x / 4, y: s.y + p.y / 4 }), { x: 0, y: 0 });
  const tri = [...pts].sort((a, b) => Math.atan2(a.y - c.y, a.x - c.x) - Math.atan2(b.y - c.y, b.x - c.x));
  // atan2 trié : commence vers -π (gauche/haut). On cale le premier sur le plus proche du coin haut-gauche.
  let k = 0, best = Infinity;
  tri.forEach((p, i) => { const d = p.x + p.y; if (d < best) { best = d; k = i; } });
  return [0, 1, 2, 3].map(i => tri[(k + i) % 4]);
}

/**
 * Redresse l'image : les 4 coins cliqués (rectangle réel largeur × hauteur en m) deviennent un rectangle exact.
 * Retourne { canvas, echelle (px/m), H (image redressée -> image source) }.
 */
export function redresser(img, coins, largeur, hauteur, maxCote = 3000) {
  const [hg, hd, bd, bg] = ordonner4(coins);
  const unit = [{ x: 0, y: 0 }, { x: largeur, y: 0 }, { x: largeur, y: hauteur }, { x: 0, y: hauteur }];
  const versMetres = homographie([hg, hd, bd, bg], unit);
  // emprise de toute la photo dans le repère en mètres
  const W = img.naturalWidth || img.width, Hh = img.naturalHeight || img.height;
  const coinsPhoto = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: Hh }, { x: 0, y: Hh }].map(p => appliquer(versMetres, p.x, p.y));
  // Toute la photo est conservée (la référence peut être une petite fenêtre),
  // dans la limite de 30 m de part et d'autre (au-delà : ciel, horizon).
  const lim = (v, a, b) => Math.min(Math.max(v, a), b);
  const dedans = coinsPhoto.every(p => isFinite(p.x) && isFinite(p.y));
  const xs = dedans ? coinsPhoto.map(p => p.x) : [-30, largeur + 30];
  const ys = dedans ? coinsPhoto.map(p => p.y) : [-15, hauteur + 15];
  const x0 = lim(Math.min(...xs), -30, 0);
  const x1 = lim(Math.max(...xs), largeur, largeur + 30);
  const y0 = lim(Math.min(...ys), -20, 0);
  const y1 = lim(Math.max(...ys), hauteur, hauteur + 20);
  const echelle = Math.min(maxCote / (x1 - x0), maxCote / (y1 - y0), 250);
  const ow = Math.round((x1 - x0) * echelle), oh = Math.round((y1 - y0) * echelle);
  // inverse : pixel de sortie -> pixel source
  const versPhoto = homographie(unit, [hg, hd, bd, bg]);
  const src = document.createElement('canvas');
  src.width = W; src.height = Hh;
  const sctx = src.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(img, 0, 0);
  const sd = sctx.getImageData(0, 0, W, Hh).data;
  const out = document.createElement('canvas');
  out.width = ow; out.height = oh;
  const octx = out.getContext('2d');
  const od = octx.createImageData(ow, oh);
  const d = od.data;
  for (let j = 0; j < oh; j++) {
    const my = y0 + j / echelle;
    for (let i = 0; i < ow; i++) {
      const mx = x0 + i / echelle;
      const w = versPhoto[6] * mx + versPhoto[7] * my + 1;
      const sx = ((versPhoto[0] * mx + versPhoto[1] * my + versPhoto[2]) / w) | 0;
      const sy = ((versPhoto[3] * mx + versPhoto[4] * my + versPhoto[5]) / w) | 0;
      const o = (j * ow + i) * 4;
      if (sx >= 0 && sy >= 0 && sx < W && sy < Hh && w > 0) {
        const s = (sy * W + sx) * 4;
        d[o] = sd[s]; d[o + 1] = sd[s + 1]; d[o + 2] = sd[s + 2]; d[o + 3] = 255;
      } else { d[o] = 236; d[o + 1] = 238; d[o + 2] = 232; d[o + 3] = 255; }
    }
  }
  octx.putImageData(od, 0, 0);
  const rect = { x: -x0 * echelle, y: -y0 * echelle, w: largeur * echelle, h: hauteur * echelle };
  return { canvas: out, echelle, rect };
}

// ---------- Échelle ----------
/**
 * Modèle d'échelle à deux facteurs (horizontal / vertical) estimé sur les cotes mesurées :
 * longueur² = dx²·u + dy²·v. Corrige un redressement imparfait.
 */
export function modeleEchelle(face) {
  const obs = [];
  face.contour.forEach((p, i) => {
    const m = face.mesures[i];
    if (m?.val > 0) { const q = face.contour[(i + 1) % face.contour.length]; obs.push([q.x - p.x, q.y - p.y, m.val]); }
  });
  for (const c of face.cotes) if (c.val > 0) obs.push([c.b.x - c.a.x, c.b.y - c.a.y, c.val]);
  for (const o of face.ouvertures) {
    if (o.propose) continue;
    if (o.L > 0) obs.push([o.w, 0, o.L]);
    if (o.H > 0) obs.push([0, o.h, o.H]);
  }
  if (!obs.length) {
    if (!face.echelle) return null;
    const k = 1 / face.echelle ** 2;
    return { u: k, v: k, source: 'redressement', n: 0 };
  }
  // isotrope (moindres carrés sur k)
  let num = 0, den = 0;
  for (const [dx, dy, L] of obs) { const p = dx * dx + dy * dy; num += p * L * L; den += p * p; }
  const iso = { u: num / den, v: num / den, source: 'cotes', n: obs.length };
  // deux facteurs si les cotes sont dans les deux directions
  let a = 0, b = 0, c = 0, r1 = 0, r2 = 0;
  for (const [dx, dy, L] of obs) {
    const X = dx * dx, Y = dy * dy, Z = L * L;
    a += X * X; b += X * Y; c += Y * Y; r1 += X * Z; r2 += Y * Z;
  }
  const det = a * c - b * b;
  if (det > 1e-3 * a * c) {
    const u = (r1 * c - r2 * b) / det, v = (a * r2 - b * r1) / det;
    if (u > 0 && v > 0 && u / v < 4 && v / u < 4) return { u, v, source: 'cotes', n: obs.length };
  }
  return iso;
}

export const longueur = (m, dx, dy) => m ? Math.sqrt(dx * dx * m.u + dy * dy * m.v) : null;

export function airePx(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; s += p.x * q.y - q.x * p.y; }
  return Math.abs(s) / 2;
}

const arr = (x, n = 2) => Math.round(x * 10 ** n) / 10 ** n;

/** Métré complet d'une face : cotes, surfaces, linéaires, accessoires. */
export function metreFace(face) {
  const m = modeleEchelle(face);
  const n = face.contour.length;
  const bords = face.contour.map((p, i) => {
    const q = face.contour[(i + 1) % n];
    const auto = longueur(m, q.x - p.x, q.y - p.y);
    const mes = face.mesures[i];
    return { i, a: p, b: q, auto, val: mes?.val ?? auto, src: mes?.src ?? 'auto' };
  });
  const brute = m && n >= 3 ? airePx(face.contour) * Math.sqrt(m.u * m.v) : null;
  const ouv = face.ouvertures.filter(o => !o.propose).map(o => {
    const L = o.L ?? (m ? o.w * Math.sqrt(m.u) : null);
    const H = o.H ?? (m ? o.h * Math.sqrt(m.v) : null);
    const def = OUVERTURES[o.type] || OUVERTURES.fenetre;
    const appui = o.appui ?? def.appui;
    return {
      ...o, L, H, appui, label: def.label,
      surface: L && H ? L * H : null,
      tableaux: L && H ? 2 * H + L : null,       // jambages + linteau (pas de tableau bas)
      appuiML: appui && L ? L : 0,
      classe: (o.prof ?? 20) < 29 ? 'inf.29' : 'sup.29',
    };
  });
  const surfOuv = ouv.reduce((s, o) => s + (o.surface || 0), 0);
  const perimetre = n >= 2 && bords.every(b => b.val != null) ? bords.reduce((s, b) => s + b.val, 0) : null;
  const acc = {};
  for (const a of face.accessoires) {
    if (a.propose) continue;
    const k = a.type;
    acc[k] ??= { type: k, ...ACCESSOIRES[k], n: 0, deposeSansRepose: 0, client: ACCESSOIRES[k]?.client || false };
    acc[k].n++;
    if (a.action === 'sans-repose') acc[k].deposeSansRepose++;
    if (a.action === 'client') acc[k].client = true;
  }
  const tableaux = {};
  for (const o of ouv) {
    if (!o.tableaux) continue;
    tableaux[o.classe] ??= { ml: 0, appui: 0 };
    tableaux[o.classe].ml += o.tableaux;
    tableaux[o.classe].appui += o.appuiML;
  }
  return {
    echelle: m, bords, ouvertures: ouv, accessoires: Object.values(acc), tableaux,
    surfaceBrute: brute, surfaceOuvertures: surfOuv,
    surfacePosee: brute != null ? Math.max(0, brute - surfOuv) : null,
    perimetre,
  };
}

/** Lignes du récapitulatif façon devis Uniso pour une face. */
export function lignesDevis(face, metre, chantier) {
  const L = [];
  const f = (v, n = 2) => v == null ? '—' : arr(v, n).toLocaleString('fr-FR', { minimumFractionDigits: n, maximumFractionDigits: n });
  L.push({ texte: `${chantier.gamme}${chantier.couleur ? ' - ' + chantier.couleur : ''} - Surface posée`, qte: f(metre.surfacePosee), unite: 'm²', type: 'panneaux' });
  L.push({ texte: 'Profil façade standard', qte: f(metre.perimetre, 1), unite: 'ml', type: 'profils' });
  for (const [classe, t] of Object.entries(metre.tableaux)) {
    L.push({ texte: `Ouverture std prof. tableau ${classe}`, qte: f(t.ml), unite: 'ml', type: 'ouvertures' });
    if (t.appui) L.push({ texte: `Appui std prof. tableau ${classe}`, qte: f(t.appui), unite: 'ml', type: 'appuis' });
  }
  for (const a of metre.accessoires) {
    const extra = a.deposeSansRepose ? ` (dont ${a.deposeSansRepose} dépose sans repose)` : '';
    L.push({ texte: (a.devis || a.label) + extra, qte: String(a.n), unite: 'u', type: a.type, client: a.client });
  }
  if (face.echafaudage) L.push({ texte: 'Échafaudage', qte: '1', unite: 'u', type: 'echafaudage' });
  return L;
}

export { arr };
