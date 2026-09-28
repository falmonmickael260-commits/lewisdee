/**
 * dicePhysics.js — Génération de trajectoires de lancer physiquement
 * crédibles, sous forme de keyframes CSS échantillonnées.
 *
 * Séquence simulée pour CHAQUE dé, individuellement randomisée :
 *   LANCER → VOL (arc) → IMPACT → REBOND(S) qui s'amortissent →
 *   ROULEMENT (rotation qui continue en ralentissant) → GLISSEMENT → ARRÊT
 *
 * Le dé est un plan 2D (face + pips), pas un vrai cube 3D : on simule la
 * culbute en 3D avec de vraies rotations CSS rotateX/rotateY (sur un
 * parent avec perspective), qui se stabilisent à une valeur quasi nulle
 * une fois le dé "posé" — seule rotateZ continue alors à tourner, comme un
 * vrai dé qui roule à plat sur la table. Chaque dé reçoit ses propres
 * amplitudes, directions et nombre de rebonds : deux dés d'un même lancer
 * n'ont jamais exactement la même animation.
 */

function easeOutCubic(u) { return 1 - Math.pow(1 - u, 3); }
function easeOutQuad(u) { return u * (2 - u); }
function smootherstep(u) { return u * u * u * (u * (u * 6 - 15) + 10); }
function hump(u) { return 4 * u * (1 - u); } // 0 → 1 → 0, pic à u=0.5

/** Choisit un entier dans [min,max] avec des poids décroissants pour les valeurs hautes. */
function weightedInt(options, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < options.length; i++) {
    r -= weights[i];
    if (r <= 0) return options[i];
  }
  return options[options.length - 1];
}

/**
 * Calcule les paramètres physiques propres à UN dé (à appeler une fois par
 * dé lancé). Retourne aussi la durée totale à utiliser pour l'animation.
 */
export function randomizeDiePhysics() {
  const bounceCount = weightedInt([1, 2, 3], [0.32, 0.42, 0.26]);

  const peakHeight = 78 + Math.random() * 60; // 78–138 : hauteur de l'arc de vol
  const bounceHeights = [];
  let h = peakHeight * (0.26 + Math.random() * 0.16); // 1er rebond ~26–42% du pic
  for (let i = 0; i < bounceCount; i++) {
    bounceHeights.push(h);
    h *= 0.38 + Math.random() * 0.18; // chaque rebond suivant s'amortit fortement
  }

  // Rotation Z (dans le plan de la table) : c'est elle qui détermine la face
  // finale — voir randomFinalRotation()/randomSpin() côté appelant.
  // Rotation X / Y (culbute en l'air) : totalement indépendantes l'une de
  // l'autre et d'un dé à l'autre, en tours complets + un léger résidu final
  // (un dé posé n'est jamais parfaitement à plat à 0.000°).
  const turnsX = 1 + Math.floor(Math.random() * 3); // 1 à 3 tours
  const turnsY = 1 + Math.floor(Math.random() * 3);
  const residualX = Math.random() * 10 - 5;
  const residualY = Math.random() * 10 - 5;
  const totalRotX = (360 * turnsX + Math.abs(residualX)) * (Math.random() < 0.5 ? -1 : 1);
  const totalRotY = (360 * turnsY + Math.abs(residualY)) * (Math.random() < 0.5 ? -1 : 1);

  // Durée totale : cible 1 à 1,5s (jusqu'à ~1,6s pour les lancers les plus amples).
  const duration = 1020 + Math.random() * 480;

  // Découpage temporel : vol, puis un segment par rebond (de plus en plus
  // court), puis roulement, puis un bref arrêt progressif.
  const fracs = [0.44]; // vol
  let bf = 0.20;
  for (let i = 0; i < bounceCount; i++) { fracs.push(bf); bf *= 0.52; }
  fracs.push(0.16); // roulement
  const usedSum = fracs.reduce((a, b) => a + b, 0);
  fracs.push(Math.max(0.05, 1 - usedSum)); // arrêt progressif
  const total = fracs.reduce((a, b) => a + b, 0);
  const normFracs = fracs.map((f) => f / total);

  const bounds = [0];
  normFracs.forEach((f) => bounds.push(bounds[bounds.length - 1] + f));
  // bounds = [0, endFlight, endBounce1, endBounce2, ..., endRoll, 1]
  const tumbleEnd = bounds[1 + bounceCount]; // fin des rebonds = fin de la culbute 3D

  return { bounceCount, peakHeight, bounceHeights, totalRotX, totalRotY, duration, bounds, tumbleEnd };
}

/**
 * Construit les keyframes WAAPI pour un dé, à partir de ses paramètres
 * physiques et de son déplacement (dxPx, dyPx = décalage entre la position
 * de départ et la position finale, voir ui.js) et de sa rotation Z finale.
 */
export function buildDiceThrowKeyframes(physics, { dxPx, dyPx, startRotZ, endRotZ }) {
  const { bounceCount, peakHeight, bounceHeights, totalRotX, totalRotY, bounds, tumbleEnd } = physics;

  // Léger arc latéral (le poignet n'est jamais parfaitement rectiligne).
  const lateralDir = Math.random() < 0.5 ? -1 : 1;
  const lateralMag = (16 + Math.random() * 22) * lateralDir;
  const dist = Math.hypot(dxPx, dyPx) || 1;
  const perpX = (-dyPx / dist) * lateralMag;
  const perpY = (dxPx / dist) * lateralMag;

  const SAMPLES = 34;
  const frames = [];

  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;

    // --- Détermine dans quel segment on se trouve et la progression locale ---
    let segIndex = bounds.length - 2;
    for (let s = 0; s < bounds.length - 1; s++) {
      if (t <= bounds[s + 1] || s === bounds.length - 2) { segIndex = s; break; }
    }
    const segStart = bounds[segIndex];
    const segEnd = bounds[segIndex + 1];
    const u = segEnd > segStart ? (t - segStart) / (segEnd - segStart) : 1;

    let height = 0;
    let posProgressLocal; // 0..1 de progression de DÉPLACEMENT au sein de ce segment
    let easedLocal;

    if (segIndex === 0) {
      // Vol : arc parabolique, accélère puis ralentit (smootherstep).
      height = peakHeight * hump(u);
      easedLocal = smootherstep(u);
    } else if (segIndex <= bounceCount) {
      // Rebond n (1..bounceCount) : hauteur qui décroît, ralentissement par friction.
      const bh = bounceHeights[segIndex - 1];
      height = bh * hump(u);
      easedLocal = easeOutQuad(u);
    } else if (segIndex === bounceCount + 1) {
      // Roulement : à plat sur la table, décélération franche (friction).
      height = 0;
      easedLocal = easeOutCubic(u);
    } else {
      // Glissement final / arrêt : quasiment immobile.
      height = 0;
      easedLocal = easeOutCubic(u) * 0.15;
    }

    // Fraction du déplacement total déjà "consommée" avant ce segment,
    // proportionnelle au découpage temporel (voir randomizeDiePhysics).
    const consumedBefore = segStart;
    const segShare = segEnd - segStart;
    const overallProgress = Math.min(1, consumedBefore + easedLocal * segShare);
    const remaining = 1 - overallProgress;

    const x = dxPx * remaining + Math.sin(t * Math.PI) * perpX * (1 - t * 0.4);
    const y = dyPx * remaining + Math.sin(t * Math.PI) * perpY * (1 - t * 0.4) - height;

    // Rotation Z : ralentit continûment sur tout le lancer (friction du spin).
    const rotZ = startRotZ + (endRotZ - startRotZ) * easeOutCubic(t);

    // Culbute 3D : accumule pendant vol+rebonds puis se fige (résidu quasi nul).
    const tumbleT = tumbleEnd > 0 ? Math.min(1, t / tumbleEnd) : 1;
    const tumbleEase = easeOutCubic(tumbleT);
    const rotX = totalRotX * tumbleEase;
    const rotY = totalRotY * tumbleEase;

    // Écrasement à l'impact (bref, au tout début de chaque segment de rebond)
    // + léger gonflement quand le dé est en l'air (hauteur > 0).
    let scaleX = 1, scaleY = 1;
    if (segIndex >= 1 && segIndex <= bounceCount && u < 0.22) {
      const squash = (1 - u / 0.22) * 0.14;
      scaleY = 1 - squash;
      scaleX = 1 + squash * 0.6;
    } else if (segIndex === 0 && u < 0.12) {
      // anticipation au tout départ du lancer
      const lift = (1 - u / 0.12) * 0.22;
      scaleY = 1 - lift * 0.5;
      scaleX = 1 - lift * 0.3;
    }
    const airLift = 1 + (height / Math.max(1, peakHeight)) * 0.05;

    frames.push({
      transform:
        `translate(-50%, -50%) translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) ` +
        `rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) rotateZ(${rotZ.toFixed(2)}deg) ` +
        `scale(${(scaleX * airLift).toFixed(3)}, ${(scaleY * airLift).toFixed(3)})`,
      offset: t,
    });
  }

  // Verrouille l'état final exact (évite tout résidu d'arrondi visuel).
  frames[frames.length - 1].transform =
    `translate(-50%, -50%) translate(0px, 0px) rotateX(0deg) rotateY(0deg) rotateZ(${endRotZ}deg) scale(1, 1)`;

  return frames;
}
