# ZEvent Régie

Une régie web pour suivre plusieurs lives du ZEvent sur un seul écran, avec le
son de chaque source réglable indépendamment.

**En ligne : [zevent-regie.vercel.app](https://zevent-regie.vercel.app)**

## Ce que ça fait

- **Mur automatique** — la grille se recalcule à chaque source ajoutée ou
  retirée, en cherchant l'agencement qui donne les plus grandes vignettes
  possibles sans déformer le 16/9.
- **Mixage libre** — un curseur de volume par source, plusieurs audibles en même
  temps. Une bordure verte et un vu-mètre signalent celles qu'on entend.
- **Trois dispositions** — grille, focus (une source agrandie, les autres en
  bandeau défilant) et plein cadre. Basculer ne recharge jamais les lecteurs.
- **Réorganisation** — glissez une source directement depuis son image, ou
  utilisez les flèches du bandeau de contrôle.
- **Paliers de dons** — la pastille `Goals` d'une source ouvre la liste de ses
  paliers, avec celui en cours mis en avant.
- **Recherche** — les streamers du ZEvent en direct, triables par viewers, par
  dons ou par nom, avec l'historique de ceux déjà regardés.
- **Partage** — la composition du mur s'écrit dans l'URL : `?pov=zerator,mastu`.

### Raccourcis

| Touche | Effet |
| --- | --- |
| `1` … `9` | Rendre cette source seule audible |
| `0` | Tout couper |
| `G` / `F` / `P` | Grille / focus / plein cadre |
| `S` | Afficher ou masquer le panneau des sources |

## Installer sa propre régie

Node 20 ou plus récent suffit. Aucune clé d'API, aucun compte.

```bash
git clone https://github.com/daniellazer2902/zevent-regie.git
cd zevent-regie
npm install
npm run dev
```

L'application écoute sur <http://localhost:5080>.

Sous Windows, `run.bat` fait la même chose d'un double-clic, installation
comprise.

## Comment c'est fait

Next.js et React, sans dépendance d'interface. Trois routes serveur relaient
l'API publique du ZEvent, qui n'émet aucun en-tête CORS et ne peut donc pas être
appelée depuis le navigateur :

| Route | Rôle | Cache |
| --- | --- | --- |
| `/api/streamers` | Liste complète des participants | 30 s |
| `/api/pulse` | Cagnotte et viewers seuls, quelques centaines d'octets | 10 s |
| `/api/goals?ids=…` | Paliers de dons, groupés en un appel | 20 s |

Les réglages et l'historique vivent dans le `localStorage` du navigateur : rien
n'est stocké côté serveur, et les flux vidéo vont de Twitch directement au
spectateur.

### Deux contraintes qui expliquent le code

Le lecteur Twitch s'exécute dans un processus séparé et n'envoie aucun événement
souris à la page qui l'héberge. Une couche transparente posée par-dessus capte
donc le survol et le glisser. Tant qu'une source n'a pas démarré, cette couche
prend la forme d'un cadre et laisse une ouverture en son centre : le navigateur
n'accorde le droit de lire qu'à un clic atterrissant dans le lecteur lui-même.

Déplacer un nœud du DOM contenant une `iframe` la fait recharger. Les vignettes
ne sont donc jamais réordonnées : leur position dans le document ne bouge pas,
seule leur géométrie change. C'est ce qui permet de passer d'une disposition à
l'autre sans perdre une seconde de flux ni les niveaux de son.

## Licence

MIT.
