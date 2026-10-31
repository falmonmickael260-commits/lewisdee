# Refonte « Le Club des audacieux »

Branche : `visual/premium-club-20261031`.
Point de restauration, créé avant modification : `restore-before-visual-20261031`.

## Intégration

- `index.html` : accueil scénographié, vraie table SVG avec relief CSS, feutre tissé, cuir, laiton et emblème ; tous les identifiants et boutons fonctionnels sont conservés.
- `css/premium.css` : direction artistique complète, accueil, formulaires, salons, table en perspective, scores, actions et victoire. Disposition verticale mobile, scores latéraux sur grand écran, mode paysage et zones sûres.
- `js/ui.js` : six faces maintenues au repos, valeur officielle conservée sur la face principale, profondeur adaptée à la taille du plateau, sélection accessible au clavier, description des valeurs, réduction des animations et nettoyage des confettis.
- `js/presentation.js` : décor d'accueil, lumière et mouvement subtil de caméra au lancer, effet de points sécurisés, perte de tour, sons d'interaction et adaptation aux changements de taille. Consomme les événements du contrôleur ; aucune règle et aucun message réseau.
- `js/main.js` : quatre appels vers la présentation aux événements existants, sans changement des actions envoyées au contrôleur.
- `js/sound.js` : notes discrètes pour les boutons et les points, avec le réglage de son existant.

Aucune dépendance de production ajoutée. `engine.js`, `game.js`, `positions.js`, `dicePhysics.js`, `net.js`, les intégrations plateforme, `server.js`, les variables de connexion et les fichiers `.env` sont inchangés. Les trajectoires existantes, rebonds et rotations restent décoratifs. Le serveur décide toujours des résultats en ligne.

## Vérifications exécutées

- `npm test` : 38 tests du moteur réussis, incluant sélections, calculs, héritage, dépassement, tours et victoire.
- `npm run test:protocol` : 3 tests réussis, transports en mémoire : création/adhésion, autorité de l'hôte, refus d'action hors tour, mêmes instantanés pour deux joueurs, sélection/désélection, sécurisation, passage de tour, relance côté serveur, conservation des dés, victoire exacte, déconnexion et refus de rejoindre une partie commencée.
- Vérification de syntaxe JavaScript, unicité des identifiants HTML, résolution de toutes les références DOM JavaScript et `git diff --check`.
- Comparaison Git : aucun changement dans les règles, la physique des trajectoires, les coordonnées de placement, le réseau et le serveur.

## Vérifications bloquées par l'environnement

Le démarrage de `server.js` et `tests/rooms.manual.mjs` échoue avec `listen EPERM` : l'environnement interdit les ports locaux. Chrome installé se termine avec `SIGABRT` au lancement automatisé. Aucun résultat de test réel WebSocket, aucune capture navigateur et aucune validation sur téléphone physique ne sont donc revendiqués.

Le script `tests/browser.manual.mjs` est fourni pour reproduire les contrôles sur un poste autorisé. Il vérifie les boutons dans le viewport en 320×568, 375×667, 390×844, 412×915, 844×390 et 1440×900, les six faces et leur valeur officielle, les erreurs JavaScript et une partie avec deux navigateurs via de vrais WebSockets. Il génère des captures dans `artifacts/` (ignoré par Git).

```sh
npm install --no-save playwright
npx playwright install chromium
npm run test:browser
node tests/rooms.manual.mjs
```

Une installation Playwright existante peut être utilisée via `PLAYWRIGHT_MODULE` ; `BROWSER_CHANNEL=chrome` utilise Chrome installé. Ces outils de contrôle ne sont pas nécessaires au jeu en production.

## Limites à valider avant publication

- La 3D utilise des cubes CSS à six faces, et non un moteur WebGL à géométrie arrondie ou à collisions rigides. Les bords sont arrondis visuellement. Les trajectoires sont cosmétiques ; aucune simulation ne calcule les résultats.
- Les appareils sans animation Web Animations affichent directement les résultats ; la préférence système de réduction des animations est respectée. L'option Paramètres désactive aussi les animations CSS. Aucun benchmark sur téléphone modeste n'a pu être effectué.
- Le dépôt d'origine ne contient pas de protocole de reconnexion en partie : `join` refuse les parties commencées. Ce comportement préexistant est conservé et testé. Ajouter une vraie reprise de session demanderait un chantier réseau distinct.
- L'écoute des ports et le navigateur étant bloqués, la revue visuelle et les tests réels multijoueurs restent requis avant une publication.

Aucune publication, aucun push et aucun changement d'infrastructure effectué.


## Mode solo contre des bots

Le bouton **Jouer contre des bots** ouvre un choix de 1 à 5 adversaires. Les bots utilisent les actions publiques du contrôleur local, analysent leurs sélections avec le moteur officiel, relancent et sécurisent automatiquement. Les commandes du joueur sont masquées pendant leur tour. Les délais laissent les animations se terminer ; quitter annule leurs actions et rejouer conserve les adversaires.

`npm run test:bots` : 4 tests couvrent sélection, total rond, victoire exacte, annulation des actions et une partie complète jusqu'à 10 000. Les 38 tests moteur et les 3 tests protocole restent valides. Les bots sont disponibles en local ; les salons en ligne restent inchangés.

`npm run screenshots` produit six captures réelles (accueil, choix des bots, partie ; mobile et ordinateur) dans `artifacts/screenshots/`, avec Playwright installé. Le script sert les fichiers locaux par interception navigateur : aucun déploiement ni port serveur n'est nécessaire. Le lancement de Chrome reste bloqué dans l'environnement de l'agent ; les captures n'ont pas pu être produites ici.


## Correction des dés et des petits écrans

Les ombres et halos hérités ne sont plus cumulés sur les six faces : sélection et conservation sont indiquées sur la face principale. Les arêtes sont moins arrondies pour limiter les ouvertures entre faces. La perspective est atténuée sur mobile, les dés ont une taille visuelle minimale de 36 px et leurs cibles tactiles restent au moins de 44 px ; les boutons d'action mesurent au moins 48 px. Le plateau exploite davantage la largeur en portrait et le zoom navigateur est autorisé.

La couche d'animation `dicePhysics.js` est désormais corrigée : les rotations se terminent sur un nombre entier de tours, au lieu de revenir brutalement à zéro au dernier échantillon. Le résultat officiel n'est pas modifié. Les animations terminées sont libérées et la profondeur est recalculée selon la taille réelle du dé.

`npm run test:animation` vérifie sur 100 trajectoires l'absence de rotation inverse à la dernière image et l'orientation finale de la face officielle. Total des suites exécutées : 46 tests réussis. La validation visuelle sur navigateur et téléphone réel reste à faire, les blocages de l'environnement étant inchangés.


## Lisibilité des dés sélectionnés et célébration de main pleine

Les dés au repos montrent désormais un dessin SVG continu avec une seule face officielle et une tranche discrète. Les six faces CSS restent disponibles uniquement pendant le lancer. Les dés sélectionnés portent un halo doré marqué, une coche et une légère élévation ; les dés verrouillés ont un contour vert. Le dessin est déterminé uniquement par la valeur fournie par le contrôleur. Six tests contrôlent le nombre exact de points pour les valeurs 1 à 6.

L'indicateur serveur `isHotDiceOpportunity` déclenche, après le lancer, une couronne et une bannière « MAIN PLEINE », un éclat de table, un mouvement des dés et un son discret. Les effets sont annulés à la relance, à la sécurisation, au changement de tour et en quittant. Les animations réduites montrent une célébration statique. Aucune action, règle ni synchronisation réseau n'est modifiée.

Tests exécutés : 38 moteur + 4 bots + 4 protocole + 7 dessin/animation = 53 tests réussis. Le nouveau test de protocole vérifie le même indicateur de main pleine pour deux clients et l'absence de célébration sur un dépassement. Les assertions navigateur ont été adaptées au rendu à face unique mais leur exécution reste bloquée par l'environnement. La dernière capture disponible sur le Bureau était celle de Render, sans dés ; aucun constat visuel du jeu déployé n'est revendiqué.
