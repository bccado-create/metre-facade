# Métré façade

Appli web installable (PWA) pour tablette Android : relevé des façades et pignons en extérieur pour les devis Uniso.

## Déroulé sur le chantier
1. **Nouveau chantier** → client, adresse, gamme, couleur.
2. **Ajouter la face** → prendre la photo bien en face.
3. **Étalonner** : mesurez **une ouverture** (largeur × hauteur du tableau), touchez ses 4 coins sur la photo (glissez le doigt pour viser avec la loupe) et tapez ses deux cotes. La photo est remise d'équerre et mise à l'échelle : la façade et toutes les autres ouvertures se calculent (≈).
   - Prenez la **plus grande** ouverture (porte de garage, baie) : plus elle est grande, plus le calcul est juste.
   - Ajoutez **une cote de contrôle** au laser (la largeur totale de la façade) : l'appli recale tout le plan dessus.
4. **Contour** (touchez chaque angle du mur, pointe du pignon comprise), **Ouverture** (glisser d'un coin à l'autre), **Accessoire** (palette avec les pictos du devis).
5. **Détecter (IA)** : propose les ouvertures et accessoires en orange (clé API dans Réglages, réseau nécessaire). Touchez pour corriger, puis « Tout valider ».
6. **Cotes** : touchez une cote sur le plan, puis tirez au laser ou tapez la valeur. L'appli passe seule à la cote suivante. Chaque cote relevée recale l'échelle.
7. **Rapport PDF** (récap Uniso + une page par face) et **Partager / sauvegarder** (fichier .json du chantier, photos comprises, à réimporter sur une autre tablette).

## Laser Bluetooth
- Leica DISTO et Bosch GLM (modèles « C ») : bouton **Laser**, dans Chrome.
- Autres lasers : mode « clavier Bluetooth », la valeur s'écrit dans la cote active.

## Tester sur l'ordinateur
```
node serve.mjs
```
puis http://localhost:5173

## Mettre sur la tablette
L'appli doit être servie en **HTTPS** (GitHub Pages, Netlify…). Ouvrir l'adresse dans Chrome sur la tablette, puis « Installer l'appli » (ou menu ⋮ → Ajouter à l'écran d'accueil). Elle fonctionne ensuite hors ligne ; seule la détection IA a besoin du réseau.

Les chantiers restent dans la tablette (stockage du navigateur) : pensez à « Partager / sauvegarder » régulièrement.
