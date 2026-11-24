// Détection automatique des ouvertures et accessoires par Claude (vision).
// La clé API reste sur la tablette (localStorage) ; l'appel part directement vers l'API Anthropic.
import { ACCESSOIRES, OUVERTURES } from './catalog.js';

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.8.0/+esm';
const MODELE = 'claude-opus-5-5';

export const cleAPI = {
  get: () => { try { return localStorage.getItem('anthropic-key') || ''; } catch { return ''; } },
  set: k => { try { localStorage.setItem('anthropic-key', k.trim()); } catch {} },
};

const boite = { type: 'array', items: { type: 'number' }, description: '[x0, y0, x1, y1] en millièmes de la largeur / hauteur de l’image (0–1000)' };
const SCHEMA = {
  type: 'object',
  properties: {
    contour: {
      type: 'array', items: { type: 'array', items: { type: 'number' } },
      description: 'Polygone du mur à isoler (sans toiture), points [x, y] en millièmes, sens horaire',
    },
    ouvertures: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: Object.keys(OUVERTURES) },
          boite,
          appui: { type: 'boolean' },
        },
        required: ['type', 'boite', 'appui'], additionalProperties: false,
      },
    },
    accessoires: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: Object.keys(ACCESSOIRES) },
          boite,
          note: { type: 'string' },
        },
        required: ['type', 'boite', 'note'], additionalProperties: false,
      },
    },
  },
  required: ['contour', 'ouvertures', 'accessoires'], additionalProperties: false,
};

const CONSIGNE = `Tu analyses la photo d'une façade de maison pour un métré d'isolation thermique par l'extérieur (bardage isolant Uniso).
Repère et localise précisément :
- le contour du mur à habiller (murs et pignons, sans la toiture ni le sol) ;
- chaque ouverture (fenêtre, porte, porte-fenêtre, baie, porte de garage, soupirail) : boîte serrée sur le tableau (l'ouverture dans le mur, pas le volet ouvert) ; appui = true si un appui de fenêtre est visible ou attendu ;
- chaque accessoire fixé sur la façade qui gêne la pose : descentes d'eaux pluviales, gouttières, dauphins, robinets, regards, grilles de ventilation, ventouses de chaudière, groupes de clim/PAC, sorties VMC, coffrets EDF/gaz/télécom et câbles, luminaires, prises, sonnettes, paraboles/antennes, volets battants (type "volets", une boîte par fenêtre équipée de gonds), stores, grilles de défense, garde-corps, rampes, marches, marquises, boîtes aux lettres, numéros, carré de cheminée, pannes apparentes, rives.
Une boîte par objet. Dans "note", précise en quelques mots (matière, état, ex. "descente zinc", "grille plastique ronde"). N'invente rien que tu ne vois pas.`;

async function versBase64(blobOuCanvas, max = 1568) {
  const img = blobOuCanvas instanceof Blob ? await createImageBitmap(blobOuCanvas) : blobOuCanvas;
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const url = c.toDataURL('image/jpeg', 0.85);
  return url.slice(url.indexOf(',') + 1);
}

/**
 * Analyse l'image de la face. Retourne {contour, ouvertures, accessoires} en pixels de l'image.
 */
export async function detecter(source, largeur, hauteur) {
  const key = cleAPI.get();
  if (!key) throw new Error('Ajoutez votre clé API Anthropic dans Réglages pour utiliser la détection automatique.');
  if (!navigator.onLine) throw new Error('Pas de réseau : posez les accessoires à la main avec la palette.');
  const { default: Anthropic } = await import(SDK_URL);
  // Clé personnelle de l'utilisateur, utilisée uniquement depuis sa propre tablette.
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  const data = await versBase64(source);
  let rep;
  try {
    rep = await client.beta.messages.create({
      model: MODELE,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } },
          { type: 'text', text: CONSIGNE },
        ],
      }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error('Clé API refusée : vérifiez-la dans Réglages.');
    if (e instanceof Anthropic.RateLimitError) throw new Error('Trop de demandes en même temps : réessayez dans une minute.');
    if (e instanceof Anthropic.APIConnectionError) throw new Error('Connexion impossible avec le service d’analyse : vérifiez le réseau.');
    if (e instanceof Anthropic.APIError) throw new Error(`Analyse impossible (${e.status}) : ${e.message}`);
    throw e;
  }
  if (rep.stop_reason === 'refusal') throw new Error("L'analyse a été refusée pour cette photo. Posez les éléments à la main.");
  if (rep.stop_reason === 'max_tokens') throw new Error('Réponse incomplète : réessayez.');
  const texte = rep.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const r = JSON.parse(texte);
  const X = v => (v / 1000) * largeur, Y = v => (v / 1000) * hauteur;
  const box = b => {
    const [x0, y0, x1, y1] = b;
    return { x: X(Math.min(x0, x1)), y: Y(Math.min(y0, y1)), w: X(Math.abs(x1 - x0)), h: Y(Math.abs(y1 - y0)) };
  };
  return {
    contour: (r.contour || []).filter(p => p.length >= 2).map(([x, y]) => ({ x: X(x), y: Y(y) })),
    ouvertures: r.ouvertures.filter(o => o.boite?.length === 4).map(o => ({ type: o.type, appui: o.appui, ...box(o.boite) })),
    accessoires: r.accessoires.filter(a => a.boite?.length === 4 && ACCESSOIRES[a.type]).map(a => {
      const b = box(a.boite);
      return { type: a.type, note: a.note, x: b.x + b.w / 2, y: b.y + b.h / 2, bw: b.w, bh: b.h };
    }),
  };
}
