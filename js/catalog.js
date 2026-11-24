// Catalogue des ouvertures et accessoires de façade.
// `devis` = intitulé de la ligne du devis Uniso (légende des pictos Ouest Eco-Logis).
// `picto` = fichier de pictos/ ; sinon `code` = pastille texte dessinée par l'appli.

export const OUVERTURES = {
  fenetre:        { label: 'Fenêtre',        appui: true,  bas: true },
  'porte-fenetre':{ label: 'Porte-fenêtre',  appui: false, bas: false },
  porte:          { label: 'Porte',          appui: false, bas: false },
  baie:           { label: 'Baie vitrée',    appui: false, bas: false },
  garage:         { label: 'Porte de garage',appui: false, bas: false },
  soupirail:      { label: 'Soupirail',      appui: true,  bas: true },
};

export const CATEGORIES = [
  { id: 'eau',   label: 'Réseaux eau' },
  { id: 'air',   label: 'Ventilation / clim' },
  { id: 'elec',  label: 'Électricité / gaz' },
  { id: 'menu',  label: 'Menuiserie / divers' },
  { id: 'toit',  label: 'Toiture / bois' },
];

export const ACCESSOIRES = {
  // Réseaux eau
  descente:   { cat: 'eau',  label: 'Descente EP',          devis: 'Remplacement de descente EP', picto: 'descente', unite: 'u' },
  gouttiere:  { cat: 'eau',  label: 'Gouttière',            devis: 'Éléments divers (gouttière)', code: 'GT', unite: 'u' },
  dauphin:    { cat: 'eau',  label: 'Dauphin',              devis: 'Éléments divers (dauphin)', code: 'DA', unite: 'u' },
  robinet:    { cat: 'eau',  label: 'Robinet extérieur',    devis: "Point d'eau", picto: 'eau', client: true, unite: 'u' },
  regard:     { cat: 'eau',  label: 'Regard / tampon',      devis: 'Éléments divers (regard)', code: 'RG', unite: 'u' },
  // Ventilation / clim
  grille:     { cat: 'air',  label: 'Grille de ventilation',devis: 'Grille de ventilation', picto: 'grille', unite: 'u' },
  ventouse:   { cat: 'air',  label: 'Ventouse chaudière',   devis: 'Éléments divers (ventouse)', code: 'VC', unite: 'u' },
  clim:       { cat: 'air',  label: 'Groupe PAC / clim',    devis: 'Groupe climatisation', picto: 'clim', client: true, unite: 'u' },
  extracteur: { cat: 'air',  label: 'Extracteur / sortie VMC', devis: 'Éléments divers (sortie VMC)', code: 'VM', unite: 'u' },
  // Électricité / gaz
  edf:        { cat: 'elec', label: 'Coffret / câble EDF',  devis: 'Protection EDF', picto: 'edf', unite: 'u' },
  gaz:        { cat: 'elec', label: 'Coffret gaz',          devis: 'Éléments divers (coffret gaz)', code: 'GZ', unite: 'u' },
  telecom:    { cat: 'elec', label: 'Coffret / câble télécom', devis: 'Éléments divers (télécom)', code: 'TL', unite: 'u' },
  eclairage:  { cat: 'elec', label: 'Luminaire / applique', devis: "Point d'éclairage", picto: 'eclairage', unite: 'u' },
  prise:      { cat: 'elec', label: 'Prise extérieure',     devis: 'Éléments divers (prise ext.)', code: 'PR', unite: 'u' },
  sonnette:   { cat: 'elec', label: 'Sonnette / interphone',devis: 'Éléments divers (sonnette)', code: 'SO', unite: 'u' },
  parabole:   { cat: 'elec', label: 'Parabole / antenne',   devis: 'Parabole', picto: 'parabole', unite: 'u' },
  // Menuiserie / divers
  volets:     { cat: 'menu', label: 'Volets battants (gonds)', devis: 'Gonds', picto: 'gonds', unite: 'u' },
  store:      { cat: 'menu', label: 'Store / banne',        devis: 'Store', picto: 'store', unite: 'u' },
  'grille-defense': { cat: 'menu', label: 'Grille de défense', devis: 'Grille de défense', picto: 'grille-defense', unite: 'u' },
  'gc-ext':   { cat: 'menu', label: 'Garde-corps extérieur',devis: 'Garde-corps extérieur', picto: 'gc-ext', unite: 'u' },
  'gc-int':   { cat: 'menu', label: 'Garde-corps intérieur',devis: 'Garde-corps intérieur', picto: 'gc-int', unite: 'u' },
  rampe:      { cat: 'menu', label: 'Rampe',                devis: 'Rampe', picto: 'rampe', unite: 'u' },
  marches:    { cat: 'menu', label: 'Escalier / marches',   devis: 'Escalier', picto: 'marches', unite: 'u' },
  marquise:   { cat: 'menu', label: 'Marquise / auvent',    devis: 'Éléments divers (marquise)', code: 'MQ', unite: 'u' },
  bal:        { cat: 'menu', label: 'Boîte aux lettres',    devis: 'Éléments divers (boîte aux lettres)', code: 'BL', unite: 'u' },
  numero:     { cat: 'menu', label: 'Numéro / plaque',      devis: 'Éléments divers (numéro)', code: 'N°', unite: 'u' },
  // Toiture / bois
  cheminee:   { cat: 'toit', label: 'Carré de cheminée',    devis: 'Carré de cheminée', picto: 'cheminee', unite: 'u' },
  pannes:     { cat: 'toit', label: 'Panne (entourage)',    devis: 'Entourage de pannes', picto: 'pannes', unite: 'u' },
  rive:       { cat: 'toit', label: 'Rive à habiller',      devis: 'Habillage de rives', picto: 'rive', unite: 'ml' },
};

export const GAMMES = ['Uniso 32', 'Uniso 85', 'Uniso 102'];

const cache = new Map();
/** Image (ou canvas) du picto, prête à dessiner. */
export function pictoImage(type) {
  if (cache.has(type)) return cache.get(type);
  const a = ACCESSOIRES[type];
  let img;
  if (a?.picto) {
    img = new Image();
    img.src = `pictos/${a.picto}.png`;
  } else {
    img = document.createElement('canvas');
    img.width = img.height = 96;
    const c = img.getContext('2d');
    c.fillStyle = a?.client ? '#7b4fa8' : '#b5cc2e';
    c.beginPath(); c.roundRect(4, 4, 88, 88, 14); c.fill();
    c.fillStyle = '#1e2a1a';
    c.font = '700 40px system-ui, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(a?.code || '?', 48, 52);
    img.complete = true;
  }
  cache.set(type, img);
  return img;
}

/** Précharge tous les pictos (à attendre avant un dessin d'export). */
export const chargerPictos = () => Promise.all(Object.keys(ACCESSOIRES).map(t => {
  const im = pictoImage(t);
  return im.decode ? im.decode().catch(() => {}) : null;
}));
