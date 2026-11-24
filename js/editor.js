// Éditeur de plan de façade : photo, contour, ouvertures, accessoires, cotes. Tactile (doigt / stylet).
import { ACCESSOIRES, OUVERTURES, pictoImage } from './catalog.js';
import { metreFace, longueur } from './geom.js';
import { uid } from './db.js';

const C = {
  contour: '#5f7f12', contourFond: 'rgba(181,204,46,0.18)',
  ouv: '#1f6fb2', ouvFond: 'rgba(31,111,178,0.14)',
  propose: '#d9822b', sel: '#e0452b',
  cote: '#22303a', coteAuto: '#5b6770', chipAuto: '#ffffff', chipMes: '#22303a', active: '#e0452b',
};

const fmt = v => v == null ? '?' : v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export class Editeur {
  constructor(canvas, { onChange, onSelect, onRedresser, onMessage }) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.onChange = onChange; this.onSelect = onSelect; this.onRedresser = onRedresser; this.onMessage = onMessage;
    this.face = null; this.img = null;
    this.outil = 'select'; this.typeOuv = 'fenetre'; this.typeAcc = 'grille';
    this.vue = { s: 1, tx: 0, ty: 0 };
    this.sel = null;        // {kind:'ouv'|'acc'|'pt', id|i}
    this.active = null;     // cote active : {kind:'bord',i} | {kind:'cote',id} | {kind:'ouvL'|'ouvH',id}
    this.temp = [];         // points en cours (contour, cote, redresser)
    this.ptrs = new Map();
    this.cibles = [];
    this.modePlan = false;
    this.k = 1;             // facteur de taille des textes (export)
    this.#evenements();
    if (canvas.parentElement) new ResizeObserver(() => this.#taille()).observe(canvas.parentElement);
  }

  charger(face, img) {
    this.face = face; this.img = img; this.sel = null; this.active = null; this.temp = [];
    this.#taille(); this.cadrer();
  }

  setOutil(o) { this.outil = o; this.temp = []; this.dessiner(); }

  cadrer() {
    if (!this.img) return;
    const r = this.cv.getBoundingClientRect();
    const s = Math.min(r.width / this.face.imgW, r.height / this.face.imgH) * 0.94;
    this.vue = { s, tx: (r.width - this.face.imgW * s) / 2, ty: (r.height - this.face.imgH * s) / 2 };
    this.dessiner();
  }

  #taille() {
    const r = this.cv.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.cv.width = Math.round(r.width * dpr); this.cv.height = Math.round(r.height * dpr);
    this.cv.style.width = r.width + 'px'; this.cv.style.height = r.height + 'px';
    this.dpr = dpr;
    this.dessiner();
  }

  // ---------- coordonnées ----------
  versImage(sx, sy) { return { x: (sx - this.vue.tx) / this.vue.s, y: (sy - this.vue.ty) / this.vue.s }; }
  versEcran(p) { return { x: p.x * this.vue.s + this.vue.tx, y: p.y * this.vue.s + this.vue.ty }; }
  #pos(e) { const r = this.cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

  // ---------- événements tactiles ----------
  #evenements() {
    const cv = this.cv;
    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId);
      this.ptrs.set(e.pointerId, this.#pos(e));
      if (this.ptrs.size === 2) { this.geste = { type: 'pinch', ...this.#pinch() }; return; }
      this.#debut(this.#pos(e));
    });
    cv.addEventListener('pointermove', e => {
      if (!this.ptrs.has(e.pointerId)) return;
      this.ptrs.set(e.pointerId, this.#pos(e));
      if (this.geste?.type === 'pinch' && this.ptrs.size === 2) {
        const p = this.#pinch(), g = this.geste;
        const k = p.d / g.d;
        const s = Math.min(Math.max(g.vue.s * k, 0.05), 20);
        const ks = s / g.vue.s;
        this.vue = { s, tx: p.cx - (g.cx - g.vue.tx) * ks, ty: p.cy - (g.cy - g.vue.ty) * ks };
        this.dessiner(); return;
      }
      this.#deplace(this.#pos(e));
    });
    const fin = e => {
      if (!this.ptrs.has(e.pointerId)) return;
      const p = this.#pos(e);
      this.ptrs.delete(e.pointerId);
      if (this.geste?.type === 'pinch') { if (this.ptrs.size === 0) this.geste = null; return; }
      this.#fin(p);
    };
    cv.addEventListener('pointerup', fin);
    cv.addEventListener('pointercancel', fin);
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const p = this.#pos(e), k = Math.exp(-e.deltaY * 0.0015);
      const s = Math.min(Math.max(this.vue.s * k, 0.05), 20), ks = s / this.vue.s;
      this.vue = { s, tx: p.x - (p.x - this.vue.tx) * ks, ty: p.y - (p.y - this.vue.ty) * ks };
      this.dessiner();
    }, { passive: false });
  }

  #pinch() {
    const [a, b] = [...this.ptrs.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, vue: { ...this.vue } };
  }

  #debut(p) {
    if (!this.face) return;
    const ip = this.versImage(p.x, p.y);
    this.geste = { type: 'tap', p0: p, ip0: ip, vue: { ...this.vue }, bouge: false };
    if (this.outil === 'ouverture') { this.geste.type = 'rect'; return; }
    if (this.outil !== 'select') return;
    // poignée de redimensionnement de l'ouverture sélectionnée
    if (this.sel?.kind === 'ouv') {
      const o = this.face.ouvertures.find(x => x.id === this.sel.id);
      if (o) {
        const h = this.#poignee(o, p);
        if (h) { this.geste = { ...this.geste, type: 'resize', o, coin: h, orig: { ...o } }; return; }
      }
    }
    const t = this.#toucher(p);
    if (t?.kind === 'pt') this.geste = { ...this.geste, type: 'drag-pt', i: t.i };
    else if (t?.kind === 'ouv') { const o = this.face.ouvertures.find(x => x.id === t.id); this.geste = { ...this.geste, type: 'drag', obj: o, orig: { x: o.x, y: o.y } }; }
    else if (t?.kind === 'acc') { const a = this.face.accessoires.find(x => x.id === t.id); this.geste = { ...this.geste, type: 'drag', obj: a, orig: { x: a.x, y: a.y } }; }
    else this.geste.type = 'pan';
    this.geste.cible = t;
  }

  #deplace(p) {
    const g = this.geste; if (!g) return;
    const dx = p.x - g.p0.x, dy = p.y - g.p0.y;
    if (Math.hypot(dx, dy) > 6) g.bouge = true;
    if (!g.bouge) return;
    const ip = this.versImage(p.x, p.y);
    const s = this.vue.s;
    if (g.type === 'pan' || (g.type === 'tap' && this.outil !== 'select')) {
      g.type = 'pan';
      this.vue = { ...g.vue, tx: g.vue.tx + dx, ty: g.vue.ty + dy };
    } else if (g.type === 'drag') {
      g.obj.x = g.orig.x + dx / s; g.obj.y = g.orig.y + dy / s;
    } else if (g.type === 'drag-pt') {
      this.face.contour[g.i] = ip;
    } else if (g.type === 'rect') {
      g.ip1 = ip;
    } else if (g.type === 'resize') {
      const { o, orig, coin } = g;
      let x0 = orig.x, y0 = orig.y, x1 = orig.x + orig.w, y1 = orig.y + orig.h;
      if (coin.includes('l')) x0 = ip.x; if (coin.includes('r')) x1 = ip.x;
      if (coin.includes('t')) y0 = ip.y; if (coin.includes('b')) y1 = ip.y;
      Object.assign(o, { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) });
    }
    this.dessiner();
  }

  #fin(p) {
    const g = this.geste; this.geste = null;
    if (!g || !this.face) return;
    const ip = this.versImage(p.x, p.y);
    if (g.type === 'rect') {
      if (!g.bouge || !g.ip1) return this.onMessage?.('Faites glisser le doigt pour tracer l’ouverture.');
      const o = {
        id: uid(), type: this.typeOuv, x: Math.min(g.ip0.x, ip.x), y: Math.min(g.ip0.y, ip.y),
        w: Math.abs(ip.x - g.ip0.x), h: Math.abs(ip.y - g.ip0.y), prof: 20, appui: OUVERTURES[this.typeOuv].appui,
      };
      this.face.ouvertures.push(o);
      this.#choisir({ kind: 'ouv', id: o.id });
      this.active = { kind: 'ouvL', id: o.id };
      return this.#change();
    }
    if (['drag', 'drag-pt', 'resize'].includes(g.type) && g.bouge) return this.#change();
    if (g.bouge) return; // pan
    // --- simple tap ---
    if (this.outil === 'select') {
      const c = this.#cibleCote(p);
      if (c) { this.active = c; this.dessiner(); return this.onSelect?.(this.sel, this.active); }
      const t = g.cible;
      this.#choisir(t && t.kind !== 'pt' ? t : null);
      return;
    }
    if (this.outil === 'contour') {
      const pts = this.face.contour;
      if (this.temp.length >= 3) {
        const d = this.versEcran(this.temp[0]);
        if (Math.hypot(d.x - p.x, d.y - p.y) < 28) {
          this.face.contour = this.temp; this.face.mesures = {}; this.temp = [];
          this.outil = 'select'; this.active = { kind: 'bord', i: 0 };
          this.onMessage?.('Contour fermé. Mesurez maintenant les côtés (laser ou clavier).');
          return this.#change(true);
        }
      }
      if (!this.temp.length && pts.length) this.onMessage?.('Nouveau contour : le précédent sera remplacé à la fermeture.');
      this.temp.push(this.#aimant(ip));
      return this.dessiner();
    }
    if (this.outil === 'accessoire') {
      const a = { id: uid(), type: this.typeAcc, x: ip.x, y: ip.y, s: 1, action: 'deposer-reposer', note: '' };
      this.face.accessoires.push(a);
      this.#choisir({ kind: 'acc', id: a.id });
      return this.#change();
    }
    if (this.outil === 'cote') {
      this.temp.push(ip);
      if (this.temp.length === 2) {
        const c = { id: uid(), a: this.temp[0], b: this.temp[1], val: null, src: 'auto' };
        this.face.cotes.push(c); this.temp = [];
        this.active = { kind: 'cote', id: c.id };
        this.onSelect?.(this.sel, this.active);
        return this.#change();
      }
      return this.dessiner();
    }
    if (this.outil === 'redresser') {
      this.temp.push(ip);
      if (this.temp.length === 4) { const pts = this.temp; this.temp = []; this.dessiner(); return this.onRedresser?.(pts); }
      return this.dessiner();
    }
  }

  /** Aimante un point sur l'horizontale / la verticale du point précédent (façades d'équerre). */
  #aimant(ip) {
    const prev = this.temp[this.temp.length - 1];
    if (!prev) return ip;
    const tol = 10 / this.vue.s;
    const q = { ...ip };
    if (Math.abs(q.x - prev.x) < tol) q.x = prev.x;
    if (Math.abs(q.y - prev.y) < tol) q.y = prev.y;
    const first = this.temp[0];
    if (this.temp.length >= 2) {
      if (Math.abs(q.x - first.x) < tol) q.x = first.x;
      if (Math.abs(q.y - first.y) < tol) q.y = first.y;
    }
    return q;
  }

  #choisir(t) { this.sel = t; this.dessiner(); this.onSelect?.(this.sel, this.active); }
  #change(structure = false) { this.dessiner(); this.onChange?.(structure); this.onSelect?.(this.sel, this.active); }

  #toucher(p) {
    const f = this.face, r = 22;
    for (let i = 0; i < f.contour.length; i++) {
      const e = this.versEcran(f.contour[i]);
      if (Math.hypot(e.x - p.x, e.y - p.y) < r) return { kind: 'pt', i };
    }
    for (const a of [...f.accessoires].reverse()) {
      const e = this.versEcran(a);
      const t = Math.max(18, 26 * (a.s || 1));
      if (Math.abs(e.x - p.x) < t && Math.abs(e.y - p.y) < t) return { kind: 'acc', id: a.id };
    }
    const ip = this.versImage(p.x, p.y);
    for (const o of [...f.ouvertures].reverse())
      if (ip.x >= o.x && ip.x <= o.x + o.w && ip.y >= o.y && ip.y <= o.y + o.h) return { kind: 'ouv', id: o.id };
    return null;
  }

  #poignee(o, p) {
    const pts = { tl: [o.x, o.y], tr: [o.x + o.w, o.y], br: [o.x + o.w, o.y + o.h], bl: [o.x, o.y + o.h] };
    for (const [k, [x, y]] of Object.entries(pts)) {
      const e = this.versEcran({ x, y });
      if (Math.hypot(e.x - p.x, e.y - p.y) < 24) return k;
    }
    return null;
  }

  #cibleCote(p) {
    for (const c of this.cibles) if (p.x >= c.x - 6 && p.x <= c.x + c.w + 6 && p.y >= c.y - 6 && p.y <= c.y + c.h + 6) return c.ref;
    return null;
  }

  /** Liste ordonnée des cotes à relever (pour l'enchaînement au laser). */
  ordreCotes() {
    const l = this.face.contour.map((_, i) => ({ kind: 'bord', i }));
    for (const o of this.face.ouvertures) if (!o.propose) l.push({ kind: 'ouvL', id: o.id }, { kind: 'ouvH', id: o.id });
    for (const c of this.face.cotes) l.push({ kind: 'cote', id: c.id });
    return l;
  }
  static memeCote(a, b) { return a && b && a.kind === b.kind && a.i === b.i && a.id === b.id; }

  // ---------- dessin ----------
  dessiner(ctxExt, vueExt) {
    const ctx = ctxExt || this.ctx;
    const vue = vueExt || this.vue;
    const dpr = ctxExt ? 1 : this.dpr || 1;
    const W = ctxExt ? ctx.canvas.width : this.cv.width / dpr, H = ctxExt ? ctx.canvas.height : this.cv.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = this.modePlan ? '#ffffff' : '#e6e8e1';
    ctx.fillRect(0, 0, W, H);
    if (!this.face || !this.img) return;
    const f = this.face;
    const E = p => ({ x: p.x * vue.s + vue.tx, y: p.y * vue.s + vue.ty });
    if (!this.modePlan) ctx.drawImage(this.img, vue.tx, vue.ty, f.imgW * vue.s, f.imgH * vue.s);
    else this.#grille(ctx, vue, W, H);
    const metre = metreFace(f);
    const ech = metre.echelle;
    if (!ctxExt) this.cibles = [];
    const cibles = ctxExt ? [] : this.cibles;

    // contour
    if (f.contour.length) {
      ctx.beginPath();
      f.contour.forEach((p, i) => { const e = E(p); i ? ctx.lineTo(e.x, e.y) : ctx.moveTo(e.x, e.y); });
      ctx.closePath();
      ctx.fillStyle = C.contourFond; ctx.fill();
      ctx.lineWidth = this.modePlan ? 3 : 2.5; ctx.strokeStyle = C.contour; ctx.stroke();
      if (!ctxExt && this.outil === 'select') for (const p of f.contour) { const e = E(p); ctx.fillStyle = '#fff'; ctx.strokeStyle = C.contour; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x, e.y, 7, 0, 7); ctx.fill(); ctx.stroke(); }
      const sens = Math.sign(signe(f.contour)) || 1;
      metre.bords.forEach(b => this.#cote(ctx, E(b.a), E(b.b), b.val, b.src, -28 * sens * this.k, { kind: 'bord', i: b.i }, cibles));
    }

    // ouvertures
    for (const o of f.ouvertures) {
      const e = E(o), w = o.w * vue.s, h = o.h * vue.s;
      ctx.fillStyle = this.modePlan ? '#ffffff' : C.ouvFond;
      ctx.fillRect(e.x, e.y, w, h);
      ctx.setLineDash(o.propose ? [8, 6] : []);
      ctx.strokeStyle = o.propose ? C.propose : (this.sel?.id === o.id ? C.sel : C.ouv);
      ctx.lineWidth = this.sel?.id === o.id ? 3 : 2;
      ctx.strokeRect(e.x, e.y, w, h);
      ctx.setLineDash([]);
      const appui = o.appui ?? OUVERTURES[o.type]?.appui;
      if (appui) { ctx.fillStyle = C.ouv; ctx.fillRect(e.x - 4, e.y + h, w + 8, 4); }
      if (o.propose) continue;
      const mo = metre.ouvertures.find(x => x.id === o.id);
      this.#cote(ctx, e, { x: e.x + w, y: e.y }, mo?.L, o.L != null ? o.srcL || 'manuel' : 'auto', -16 * this.k, { kind: 'ouvL', id: o.id }, cibles, true);
      this.#cote(ctx, { x: e.x + w, y: e.y }, { x: e.x + w, y: e.y + h }, mo?.H, o.H != null ? o.srcH || 'manuel' : 'auto', -16 * this.k, { kind: 'ouvH', id: o.id }, cibles, true);
      if (!ctxExt && this.sel?.id === o.id) for (const [x, y] of [[e.x, e.y], [e.x + w, e.y], [e.x + w, e.y + h], [e.x, e.y + h]]) {
        ctx.fillStyle = C.sel; ctx.fillRect(x - 7, y - 7, 14, 14);
      }
    }

    // cotes libres
    for (const c of f.cotes) {
      const auto = longueur(ech, c.b.x - c.a.x, c.b.y - c.a.y);
      this.#cote(ctx, E(c.a), E(c.b), c.val ?? auto, c.val ? c.src : 'auto', 0, { kind: 'cote', id: c.id }, cibles);
    }

    // accessoires
    for (const a of f.accessoires) {
      const e = E(a), t = 22 * (a.s || 1) * (ctxExt ? this.k : Math.min(Math.max(vue.s * 3, 0.8), 1.6));
      const img = pictoImage(a.type);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 4;
      ctx.fillStyle = '#fff'; ctx.fillRect(e.x - t - 2, e.y - t - 2, 2 * t + 4, 2 * t + 4);
      ctx.restore();
      if (img.complete !== false) try { ctx.drawImage(img, e.x - t, e.y - t, 2 * t, 2 * t); } catch {}
      ctx.lineWidth = this.sel?.id === a.id ? 3 : 2;
      ctx.setLineDash(a.propose ? [5, 4] : []);
      ctx.strokeStyle = a.propose ? C.propose : this.sel?.id === a.id ? C.sel : a.action === 'client' ? '#7b4fa8' : '#22303a';
      ctx.strokeRect(e.x - t - 2, e.y - t - 2, 2 * t + 4, 2 * t + 4);
      ctx.setLineDash([]);
      if (a.action === 'sans-repose') { ctx.strokeStyle = C.sel; ctx.beginPath(); ctx.moveTo(e.x - t, e.y + t); ctx.lineTo(e.x + t, e.y - t); ctx.stroke(); }
    }

    // tracé en cours
    if (!ctxExt) {
      const g = this.geste;
      if (g?.type === 'rect' && g.ip1) {
        const a = E(g.ip0), b = E(g.ip1);
        ctx.strokeStyle = C.sel; ctx.setLineDash([6, 4]); ctx.lineWidth = 2;
        ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y); ctx.setLineDash([]);
      }
      if (this.temp.length) {
        ctx.strokeStyle = C.sel; ctx.lineWidth = 2.5; ctx.beginPath();
        this.temp.forEach((p, i) => { const e = E(p); i ? ctx.lineTo(e.x, e.y) : ctx.moveTo(e.x, e.y); });
        if (this.outil === 'redresser' && this.temp.length === 4) ctx.closePath();
        ctx.stroke();
        this.temp.forEach((p, i) => { const e = E(p); ctx.fillStyle = i === 0 ? C.sel : '#fff'; ctx.strokeStyle = C.sel; ctx.beginPath(); ctx.arc(e.x, e.y, i === 0 ? 10 : 7, 0, 7); ctx.fill(); ctx.stroke(); });
      }
    }
  }

  #grille(ctx, vue, W, H) {
    const m = metreFace(this.face).echelle;
    const pas = m ? 1 / Math.sqrt(m.u) : 100; // 1 m
    const p = pas * vue.s;
    if (p < 8) return;
    ctx.strokeStyle = '#eef0ea'; ctx.lineWidth = 1;
    for (let x = vue.tx % p; x < W; x += p) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = vue.ty % p; y < H; y += p) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  }

  #cote(ctx, a, b, val, src, off, ref, cibles, petit = false) {
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
    if (L < 4) return;
    const nx = -dy / L * off, ny = dx / L * off;
    const A = { x: a.x + nx, y: a.y + ny }, B = { x: b.x + nx, y: b.y + ny };
    const actif = Editeur.memeCote(ref, this.active);
    const mesure = src !== 'auto';
    ctx.strokeStyle = actif ? C.active : mesure ? C.cote : C.coteAuto;
    ctx.lineWidth = (actif ? 2 : 1.2) * this.k;
    if (off) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(A.x, A.y); ctx.moveTo(b.x, b.y); ctx.lineTo(B.x, B.y); ctx.globalAlpha = .5; ctx.stroke(); ctx.globalAlpha = 1; }
    ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
    for (const P of [A, B]) { ctx.beginPath(); ctx.moveTo(P.x - 4, P.y + 4); ctx.lineTo(P.x + 4, P.y - 4); ctx.stroke(); }
    const txt = (mesure ? '' : '≈ ') + fmt(val);
    const k = this.k;
    ctx.font = `${mesure ? 700 : 500} ${(petit ? 12 : 14) * k}px system-ui, sans-serif`;
    const tw = ctx.measureText(txt).width + 12 * k, th = (petit ? 18 : 22) * k;
    const cx = (A.x + B.x) / 2 - tw / 2, cy = (A.y + B.y) / 2 - th / 2;
    ctx.fillStyle = actif ? C.active : mesure ? C.chipMes : C.chipAuto;
    ctx.strokeStyle = actif ? C.active : mesure ? C.chipMes : C.coteAuto;
    ctx.beginPath(); ctx.roundRect(cx, cy, tw, th, 6); ctx.fill(); ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = actif || mesure ? '#fff' : C.cote;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, cx + tw / 2, cy + th / 2 + 1);
    cibles.push({ x: cx, y: cy, w: tw, h: th, ref });
  }

  /** Image annotée (rapport PDF), recadrée sur la façade. */
  exporterImage(maxCote = 1800) {
    const f = this.face;
    let x0 = 0, y0 = 0, x1 = f.imgW, y1 = f.imgH;
    const pts = [...f.contour, ...f.ouvertures.flatMap(o => [o, { x: o.x + o.w, y: o.y + o.h }]), ...f.accessoires];
    if (f.contour.length >= 3) {
      x0 = Math.min(...pts.map(p => p.x)); x1 = Math.max(...pts.map(p => p.x));
      y0 = Math.min(...pts.map(p => p.y)); y1 = Math.max(...pts.map(p => p.y));
      const m = Math.max(x1 - x0, y1 - y0) * 0.08;
      x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(f.imgW, x1 + m); y1 = Math.min(f.imgH, y1 + m);
    }
    const s = Math.min(maxCote / (x1 - x0), maxCote / (y1 - y0), 3);
    const marge = 70;
    const c = document.createElement('canvas');
    c.width = Math.round((x1 - x0) * s) + 2 * marge; c.height = Math.round((y1 - y0) * s) + 2 * marge;
    const sel = this.sel, act = this.active, k = this.k;
    this.sel = null; this.active = null; this.k = Math.max(1, c.width / 800);
    this.dessiner(c.getContext('2d'), { s, tx: marge - x0 * s, ty: marge - y0 * s });
    this.sel = sel; this.active = act; this.k = k;
    return c;
  }
}

function signe(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; s += p.x * q.y - q.x * p.y; }
  return s;
}
