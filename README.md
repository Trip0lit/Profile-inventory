# Profile-inventory

Site personnel de Galvez Martin, en trois parties : accueil (titre + présentation rapide), À propos (portrait + fiche personnelle), Activités (cartes de projets, trois par ligne). Un clic sur une carte ouvre la page de l'activité avec sa progression (`activite.html`).
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

Les visiteurs voient le contenu de `js/data.js`. Pour publier ce que vous avez saisi :

1. Mode édition → **Exporter** : télécharge un nouveau `data.js` (photos incluses).
2. Remplacer `js/data.js` par ce fichier, puis commit / push (ou ré-upload chez votre hébergeur).

**Importer** recharge une sauvegarde `data.js`, **Réinitialiser** efface les modifications locales et revient à la version publiée.

## Structure

```
index.html      accueil, À propos, liste des activités
activite.html   page d'une activité (progression détaillée), ?id=<identifiant>
css/style.css   styles
js/data.js      contenu publié (profil, activités, tâches, photos)
js/app.js       rendu, mode édition, photos, sauvegarde
js/lava.js      fond animé « coulée de lave » du hero
```
