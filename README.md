# Profile-inventory

Site personnel de Galvez Martin, en trois parties : accueil (titre + présentation rapide), À propos (portrait + fiche personnelle), Activités (cartes de projets, trois par ligne). Un clic sur une carte ouvre la page de l'activité avec sa progression (`activite.html`).
La photo de décollage ouvre le site ; ses couleurs (nuages, ciel, flamme, sol) servent de palette au reste.
Site 100 % statique (HTML/CSS/JS), sans dépendance ni étape de build.

## Voir le site

Ouvrir `index.html` dans un navigateur, ou servir le dossier :

```bash
python3 -m http.server 8000   # puis http://localhost:8000
```

## Modifier le contenu soi-même

1. Cliquer sur **✎ Éditer** en bas de page (ou ajouter `#edit` à l'adresse).
2. En mode édition :
   - cliquer sur n'importe quel texte (nom, présentation, cartes, titres d'activités…) pour le modifier ;
   - dans « À propos » : ajouter sa photo de portrait, ajouter/supprimer des lignes de la fiche « En bref » ;
   - sur une carte d'activité : **＋ Couverture** pour choisir l'image (sinon la première photo d'une tâche est utilisée) ;
   - cliquer sur une carte d'activité : sa page s'ouvre (en mode édition si vous y étiez) ; ajouter une tâche dans **Accompli**, **En cours** ou **À exécuter** ;
   - changer le statut d'une tâche avec les boutons ou en la **glissant** d'une colonne à l'autre ;
   - **＋ Photo** ajoute une ou plusieurs photos à une tâche (redimensionnées automatiquement), cliquer dessus pour les agrandir ;
   - ajouter, déplacer ou supprimer des activités.
3. La barre de chargement de chaque activité se met à jour : partie pleine = accompli, partie hachurée = en cours.

Les modifications sont enregistrées automatiquement **dans votre navigateur** (IndexedDB).

## Publier les modifications

Les modifications (textes, tâches, **photos**) sont d'abord enregistrées **uniquement sur l'appareil** utilisé.
Le bouton **Publier** (orange tant qu'il reste des modifications) les envoie directement sur GitHub, en un seul commit :

- `js/data.js` : textes et tâches (léger, quelques Ko) ;
- `assets/photos/<empreinte>.jpg` : chaque photo devient un vrai fichier (seules les nouvelles sont envoyées).

**Une seule fois par appareil**, il faut une clé d'accès GitHub (fine-grained token) :
[créer la clé](https://github.com/settings/personal-access-tokens/new) → *Only select repositories* : `Profile-inventory`
→ *Permissions* (apparaît une fois le dépôt choisi) → *Add permissions* → **Contents** → **Read and write** → *Generate token*, puis la coller dans la fenêtre « Publier ».
Alternative plus simple : une [clé classique](https://github.com/settings/tokens/new?scopes=public_repo&description=site) avec la case `public_repo` (dépôt public).
La clé reste dans le navigateur de l'appareil (jamais dans les fichiers du site).

Le site en ligne est à jour 1 à 2 minutes après (GitHub Pages ; `js/data.js` est toujours rechargé sans cache).

**Importer** recharge une sauvegarde, **Réinitialiser** efface les modifications locales et revient à la version publiée.

## Mise à jour en ligne (cache)

Les liens vers `css/style.css`, `js/app.js`, `js/data.js` et la photo portent un numéro de version (`?v=11`).
Après avoir modifié un de ces fichiers, augmentez ce numéro dans `index.html`, `activite.html` (et `css/style.css` pour la photo)
pour que les navigateurs des visiteurs rechargent la nouvelle version au lieu de l'ancienne gardée en cache.

## Structure

```
index.html      accueil, À propos, liste des activités
activite.html   page d'une activité (progression détaillée), ?id=<identifiant>
css/style.css   styles
js/data.js      contenu publié (profil, activités, tâches, photos)
js/app.js       rendu, mode édition, photos, sauvegarde
assets/         photo d'en-tête (hero.jpg, hero-small.jpg pour mobile)
assets/photos/  photos des activités, du portrait et des couvertures (créées par « Publier »)
```
