// Stockage local des chantiers (IndexedDB) : tout reste sur la tablette, photos comprises.
const DB_NAME = 'metre-facade';
const STORE = 'chantiers';
let dbPromise;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(r?.result);
    t.onerror = () => reject(t.error);
  });
}

export const listChantiers = () => tx('readonly', s => s.getAll());
export const getChantier = id => tx('readonly', s => s.get(id));
export const saveChantier = c => { c.modifie = Date.now(); return tx('readwrite', s => s.put(c)); };
export const deleteChantier = id => tx('readwrite', s => s.delete(id));

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function nouveauChantier() {
  return {
    id: uid(), client: '', adresse: '', date: new Date().toISOString().slice(0, 10),
    gamme: 'Uniso 85', couleur: '', notes: '', faces: [], cree: Date.now(), modifie: Date.now(),
  };
}

export function nouvelleFace(nom) {
  return {
    id: uid(), nom, photo: null, imgW: 0, imgH: 0, redressee: false,
    echelle: null,          // pixels par mètre (référence)
    contour: [],            // [{x,y}] en pixels image
    ouvertures: [],         // {id,type,x,y,w,h,prof,appui,L,H,propose}
    accessoires: [],        // {id,type,x,y,s,action,note,propose}
    cotes: [],              // {id,a,b,val,src,cible} ; cible = 'bord:i' | 'libre'
    mesures: {},            // valeurs relevées sur les bords du contour : {i: {val,src}}
    echafaudage: false, remarques: '',
  };
}

// --- Export / import d'un chantier complet (photos en base64) ---
const blobToDataURL = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });
const dataURLToBlob = async u => (await fetch(u)).blob();

export async function exporterChantier(c) {
  const copie = structuredClone({ ...c, faces: [] });
  for (const f of c.faces) copie.faces.push({ ...structuredClone({ ...f, photo: null }), photo: f.photo ? await blobToDataURL(f.photo) : null });
  return new Blob([JSON.stringify({ format: 'metre-facade', version: 1, chantier: copie })], { type: 'application/json' });
}

export async function importerChantier(file) {
  const data = JSON.parse(await file.text());
  if (data.format !== 'metre-facade') throw new Error("Ce fichier n'est pas un chantier Métré façade.");
  const c = data.chantier;
  for (const f of c.faces) if (f.photo) f.photo = await dataURLToBlob(f.photo);
  if (await getChantier(c.id)) c.id = uid();
  await saveChantier(c);
  return c;
}
