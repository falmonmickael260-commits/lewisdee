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
