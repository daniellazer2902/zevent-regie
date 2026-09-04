# ZEvent Régie — design

Date : 2026-09-04
Statut : validé, prêt pour le plan d'implémentation

## Objectif

Une régie web qui affiche plusieurs lives Twitch du ZEvent simultanément sur
un seul écran, avec le son pilotable indépendamment sur chaque flux.

Usage cible : 8 POV affichés, dont 1 à 3 audibles à faible volume.

## Contraintes établies

### API ZEvent

`https://zevent.fr/api/` répond sans authentification. Vérifié le 2026-09-04 :
338 streamers référencés, 254 en ligne.

Champs exploités par POV : `twitch` (login), `display`, `profileUrl`
(avatar), `online`, `viewersAmount.number`, `donationAmount.formatted`.

Champs globaux exploités : `donationAmount.formatted` (cagnotte),
`viewersCount.formatted`.

L'API n'émet aucun en-tête CORS. Un appel direct depuis le navigateur est
donc impossible : le relais serveur n'est pas un confort, c'est une nécessité.

### Lecteur Twitch

Une iframe écrite à la main n'est pas pilotable (isolation cross-origin).
Le SDK `https://player.twitch.tv/js/embed/v1.js` construit cette iframe et
expose un objet `Twitch.Player`.

API confirmée dans la documentation officielle :

- `setVolume(Float 0..1)` / `getVolume()`
- `setMuted(Boolean)` / `getMuted()`
- `setQuality(String)` / `getQualities()`
- `setChannel(String)` — change de chaîne sans reconstruire le lecteur
- Événements : `READY`, `PLAYING`, `OFFLINE`, `ONLINE`, `ENDED`, `PAUSE`

Conséquences à respecter :

1. `getQualities()` ne renvoie de valeurs utiles qu'une fois la lecture
   démarrée. Le sélecteur de qualité se peuple sur l'événement `PLAYING`.
2. Twitch réinitialise la qualité après une coupure publicitaire ou une
   reconnexion. La qualité choisie est donc réappliquée à chaque `PLAYING`.
3. Les navigateurs interdisent la lecture audio automatique. Tout lecteur
   démarre muet ; le premier son exige un geste de l'utilisateur. Non
   contournable, à assumer dans l'interface.
4. Le paramètre `parent` doit correspondre au domaine hôte. Il est calculé
   à l'exécution depuis `window.location.hostname`, ce qui rend le même
   build valide en local et en ligne.

### Charge réseau et CPU

Un flux 720p consomme environ 4 Mbit/s. Huit flux dépassent 30 Mbit/s et
saturent la plupart des machines. Le réglage de qualité par POV n'est pas
une option accessoire : c'est le levier qui rend 8 POV utilisables.

## Architecture

Next.js, port **5080**, dossier `C:\Users\Admin\Desktop\ClaudeApps\zevent-regie`.

Serveur — un seul rôle :

- `GET /api/streamers` relaie `https://zevent.fr/api/`, normalise la réponse
  aux champs utiles et la met en cache 30 secondes. Le cache protège l'API
  ZEvent quand plusieurs personnes utilisent l'application déployée.

Client — tout le reste. Aucune base de données, aucun compte.
`localStorage` porte l'historique et les préférences, propres à chaque
navigateur.

### Déploiement

Vercel. Le partage se fait par URL, pas par script de lancement : demander à
chaque ami d'installer Node et de lancer `npm install` produit des pannes
qu'il faut ensuite dépanner à distance.

L'application reste lancable en local sur le port 5080 sans modification.

## Modèle de données client

Un POV :

    { id, login, display, avatar, volume, muted, quality, status }

- `id` : identifiant stable, indépendant du login, pour que React ne
  reconstruise pas le lecteur lors d'une réorganisation.
- `status` : `loading` | `playing` | `offline` | `ended`, alimenté par les
  événements du SDK.

État global : `pov[]`, `layout` (`grid` | `focus` | `fullscreen`), `focusedId`.

## Règle structurante

**Un lecteur Twitch n'est jamais démonté tant que son POV existe.**

Changer de disposition, promouvoir un POV au centre ou passer en plein écran
ne doit pas recréer les iframes : cela coûterait plusieurs secondes de
rechargement et réinitialiserait les volumes à chaque bascule.

En pratique : les lecteurs vivent dans un conteneur stable et les
dispositions ne modifient que leur géométrie CSS. Cette règle contraint
l'implémentation React et prime sur toute simplification de structure.

## Fonctionnalités

### Grille automatique

Le nombre de colonnes découle du nombre de POV, en cherchant l'agencement
qui remplit le mieux l'écran sans déformer le rapport 16/9.

| POV | Disposition |
|-----|-------------|
| 1   | plein écran |
| 2   | 2 × 1 |
| 3–4 | 2 × 2 |
| 5–6 | 3 × 2 |
| 7–9 | 3 × 3 |
| 10–12 | 4 × 3 |
| 13–16 | 4 × 4 |

Aucun maximum imposé : la limite est celle de la machine.

### Dispositions

- **Grille** — tous les POV à taille égale. Mode par défaut.
- **Focus** — un POV agrandi, les autres en vignettes latérales. Un clic
  promeut n'importe quelle vignette.
- **Plein écran** — un POV occupe l'écran ; les autres restent chargés et
  audibles.

### Audio — mixage libre

Chaque POV possède son curseur de volume et son bouton mute, indépendants.

- Un POV ajouté arrive muet.
- Un bouton « couper tout sauf celui-ci » dans l'overlay.
- Un bandeau de mixage en bas d'écran récapitule les POV audibles et leur
  niveau, sans avoir à survoler chaque vignette.

### Overlay au survol

Apparaît **en haut au centre** de la vignette survolée, disparaît à la
sortie du curseur pour ne rien masquer.

Contenu : avatar, nom, viewers, montant récolté.
Contrôles : volume, mute, solo, qualité, focus, plein écran, réorganiser,
retirer.

### Recherche

Panneau latéral escamotable listant les streamers en ligne, avec avatar.
Recherche instantanée par nom, tri par viewers ou par cagnotte. Un clic
ajoute le POV.

Périmètre limité aux streamers ZEvent : cela couvre le besoin sans exiger
de clé d'API Twitch.

### Historique local

Les POV déjà regardés sont conservés en `localStorage` et affichés en haut
du panneau de recherche, les plus récents d'abord.

### Partage d'une composition

La composition s'encode dans l'URL : `?pov=zerator,ponce,domingo`.
Une régie prête à l'emploi peut donc être envoyée sur Discord.

## Hors périmètre

Retirés volontairement de cette version :

- synchronisation temps réel entre plusieurs spectateurs ;
- chats Twitch intégrés ;
- enregistrement des flux ;
- recherche Twitch au-delà du ZEvent (exigerait un Client ID Twitch).

## Vérification

- La grille adopte la bonne disposition pour 1 à 16 POV.
- Deux POV audibles simultanément à des volumes distincts.
- Une qualité choisie survit à une coupure publicitaire.
- Passer de grille à focus puis à plein écran ne recharge aucun lecteur et
  préserve les volumes.
- Un stream qui s'arrête affiche un état `offline` explicite.
- Une URL `?pov=` reconstruit la composition à l'identique.
- L'historique survit à un rechargement de page.
- L'application fonctionne sur `localhost:5080` et sur le domaine déployé.

## Registre des ports

Port 5080 à ajouter au registre de `~/.claude/CLAUDE.md`.
Prochain port disponible ensuite : 5090.
