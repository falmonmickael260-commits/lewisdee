/**
 * ui.js — Couche de présentation : rendu du plateau, des dés, du HUD,
 * des animations de lancer. Ne contient AUCUNE règle de jeu : elle se
 * contente d'afficher l'état produit par GameController (game.js) et de
 * relayer les interactions (tap sur un dé, clic sur un bouton) vers lui.
 */

import { BOARD_CENTER, generateThrowOrigin, randomSpin, randomFinalRotation } from './positions.js';
import { randomizeDiePhysics, buildDiceThrowKeyframes } from './dicePhysics.js';
import { playImpactSound, playRollSound } from './sound.js';

const FACES = {
  1: ['p1'],
  2: ['p2', 'p3'],
  3: ['p2', 'p1', 'p3'],
  4: ['p2', 'p5', 'p4', 'p3'],
  5: ['p2', 'p5', 'p1', 'p4', 'p3'],
  6: ['p2', 'p5', 'p4', 'p3', 'p8', 'p9'],
};

let reducedMotion = false;
export function setReducedMotion(v) { reducedMotion = v; }

/** Convertit une coordonnée du repère 1000x1000 en pourcentage (0-100). */
function pct(v) { return (v / 1000) * 100; }

function buildDieFace(value, extraClass) {
  const face = document.createElement('div');
  face.className = `die-face${extraClass ? ` ${extraClass}` : ''}`;
  for (let i = 1; i <= 9; i++) {
    const pip = document.createElement('span');
    pip.className = `pip p${i}${FACES[value].includes(`p${i}`) ? ' on' : ''}`;
    face.appendChild(pip);
  }
  return face;
}

// Paires de faces opposées d'un vrai dé (la somme des deux fait toujours 7).
const OPPOSITE_PAIRS = [[1, 6], [2, 5], [3, 4]];

/** Détermine les 6 valeurs du cube à partir de la face qui doit être visible de face. */
function cubeFaceValues(value) {
  const back = 7 - value;
  const [pairA, pairB] = OPPOSITE_PAIRS.filter((p) => !p.includes(value));
  return { front: value, back, right: pairA[0], left: pairA[1], top: pairB[0], bottom: pairB[1] };
}

/**
 * Construit un VRAI cube en 3D (6 faces positionnées dans l'espace via
 * translateZ + rotateX/rotateY, voir le CSS), pas un simple plan qu'on
 * penche. C'est ce qui permet à la culbute du lancer de montrer de vraies
 * faces adjacentes pendant le vol, au lieu d'un carré plat qui se tord.
 */
function buildDieCube(value) {
  const cube = document.createElement('div');
  cube.className = 'die-cube';
  const values = cubeFaceValues(value);
  for (const [faceName, faceValue] of Object.entries(values)) {
    cube.appendChild(buildDieFace(faceValue, `cube-face face-${faceName}`));
  }
  return cube;
}

/**
 * Crée (ou réutilise) l'élément DOM d'un dé et l'anime avec une vraie
 * physique de lancer : vol en arc, culbute 3D indépendante par dé, impact,
 * un à trois rebonds qui s'amortissent, roulement (rotation qui continue en
 * ralentissant), puis glissement final progressif. Chaque dé reçoit ses
 * propres paramètres aléatoires (voir dicePhysics.js) : deux dés d'un même
 * lancer n'ont jamais la même trajectoire, hauteur, nombre de rebonds ou
 * vitesse de rotation.
 */
export function throwDie(layer, die, opts = {}) {
  let el = layer.querySelector(`[data-die-id="${die.id}"]`);
  const isNew = !el;
  if (isNew) {
    el = document.createElement('div');
    el.className = 'die';
    el.dataset.dieId = die.id;
    el.appendChild(buildDieCube(die.value));
    layer.appendChild(el);
  } else {
    el.replaceChildren(buildDieCube(die.value));
  }
  el.className = dieClassName(die);

  const start = opts.fromPosition || generateThrowOrigin(1.8);
  const startRotZ = Math.random() * 50 - 25;
  const spinDir = Math.random() < 0.5 ? -1 : 1;
  const endRotZ = randomFinalRotation() + randomSpin() * spinDir;

  el.style.left = `${pct(die.x)}%`;
  el.style.top = `${pct(die.y)}%`;

  // Demi-taille réelle du dé en pixels, pour que les 6 faces du cube
  // (translateZ) se positionnent exactement au bord de la boîte, quelle
  // que soit la taille réelle du plateau à l'écran (mobile compris).
  const containerSizeForCube = layer.getBoundingClientRect().width || 640;
  el.style.setProperty('--cube-half', `${(containerSizeForCube * 0.05).toFixed(1)}px`);

  if (reducedMotion) {
    el.style.transform = 'translate(-50%, -50%) rotateZ(0deg)';
    return el;
  }

  const physics = randomizeDiePhysics();
  // Décalage en cascade : chaque dé part un peu après le précédent, comme
  // une vraie poignée de dés lancée à la main — c'est ce qui donne le
  // "rythme" du lancer plutôt que 5 dés qui bougent tous d'un seul bloc.
  const delay = (opts.delay ?? 0) + Math.random() * 50;

  // On anime via un wrapper de transform relatif : on part du delta entre
  // le point de départ (proche du centre) et la position finale du dé.
  const dx = pct(start.x - die.x);
  const dy = pct(start.y - die.y);
  const containerSize = containerSizeForCube;
  const dxPx = (dx / 100) * containerSize;
  const dyPx = (dy / 100) * containerSize;

  const keyframes = buildDiceThrowKeyframes(physics, { dxPx, dyPx, startRotZ, endRotZ });

  const anim = el.animate(keyframes, { duration: physics.duration, delay, fill: 'both', easing: 'linear' });
  // Bruit d'impact au moment du premier contact avec la table, puis un
  // petit "tac" plus discret à chaque rebond suivant — le tout très subtil.
  const flightMs = physics.bounds[1] * physics.duration;
  setTimeout(() => playImpactSound(1), delay + flightMs);
  for (let b = 1; b < physics.bounceCount; b++) {
    const bounceMs = physics.bounds[1 + b] * physics.duration;
    setTimeout(() => playImpactSound(1 - b * 0.3), delay + bounceMs);
  }
  setTimeout(() => playRollSound(), delay + physics.bounds[1] * physics.duration);
  // Petit éclat de lumière sur la face une fois le dé posé, pour marquer
  // l'arrêt du mouvement (sensation "vrai dé qui vient de se stabiliser").
  anim.onfinish = () => el.classList.add('settled');
  return el;
}

/**
 * Construit la classe CSS d'un dé à partir de son état de base ('scorable'
 * / 'dead' / 'locked' / …) ET de son éventuelle sélection manuelle — le
 * joueur peut sélectionner N'IMPORTE QUEL dé, y compris un dé "mort", donc
 * les deux informations sont indépendantes et se combinent.
 */
function dieClassName(die) {
  const base = typeof die === 'string' ? die : (die.state || '');
  const selected = typeof die === 'object' && die.selected ? ' selected' : '';
  return `die ${base}${selected}`.trim();
}

export function markDieState(layer, dieId, die) {
  const el = layer.querySelector(`[data-die-id="${dieId}"]`);
  if (el) el.className = dieClassName(die);
}

export function clearDeadDiceFade(layer, dieIds) {
  dieIds.forEach((id) => {
    const el = layer.querySelector(`[data-die-id="${id}"]`);
    if (el) {
      el.classList.add('bust-anim');
      setTimeout(() => el.remove(), 420);
    }
  });
}

export function removeAllDice(layer) {
  layer.replaceChildren();
}

export function removeDiceExcept(layer, keepIds) {
  [...layer.children].forEach((el) => {
    if (!keepIds.includes(el.dataset.dieId)) el.remove();
  });
}

/** Affiche la bannière de combinaison détectée (ex: "FULL — 400 POINTS"). */
export function showComboBanner(banner, labelEl, pointsEl, combos, { prefix = '' } = {}) {
  if (!combos.length) { banner.hidden = true; return; }
  const best = combos.slice().sort((a, b) => b.points - a.points)[0];
  const label = combos.length > 1 ? `${combos.length} COMBINAISONS` : best.label;
  labelEl.textContent = `${prefix}${label}`;
  pointsEl.textContent = `${combos.reduce((s, c) => s + c.points, 0).toLocaleString('fr-FR')} POINTS`;
  banner.hidden = false;
}

export function hideComboBanner(banner) { banner.hidden = true; }

export function showBustBanner(banner, subEl, message) {
  subEl.textContent = message;
  banner.hidden = false;
  setTimeout(() => { banner.hidden = true; }, 1400);
}

/** Rend la liste des joueurs autour de la table. */
export function renderPlayers(container, players, currentIndex) {
  container.replaceChildren();
  players.forEach((p, i) => {
    const chip = document.createElement('div');
    chip.className = `player-chip${i === currentIndex ? ' active' : ''}`;
    chip.innerHTML = `
      <span class="avatar">${p.avatar}</span>
      <span class="info">
        <span class="p-name">${escapeHtml(p.name)}</span>
        <span class="p-score">${p.score.toLocaleString('fr-FR')} pts</span>
      </span>`;
    container.appendChild(chip);
  });
}

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function bumpElement(el) {
  el.classList.remove('bump');
  // force reflow to restart animation
  void el.offsetWidth;
  el.classList.add('bump');
}

const numberTweens = new WeakMap();

/**
 * Anime un nombre affiché dans `el` de sa valeur actuelle vers `to`
 * (montée/descente progressive façon compteur premium, formatée en
 * français). Annule proprement toute animation en cours sur le même
 * élément pour éviter les à-coups si les valeurs changent vite.
 */
export function animateNumber(el, to, { duration = 420, prefix = '' } = {}) {
  const existing = numberTweens.get(el);
  if (existing) cancelAnimationFrame(existing);

  const fromText = el.textContent.replace(/[^\d-]/g, '');
  const from = fromText ? parseInt(fromText, 10) : 0;
  if (from === to) {
    el.textContent = `${prefix}${to.toLocaleString('fr-FR')}`;
    return;
  }
  const start = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 3); // ease-out cubic

  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    const value = Math.round(from + (to - from) * ease(t));
    el.textContent = `${prefix}${value.toLocaleString('fr-FR')}`;
    if (t < 1) {
      numberTweens.set(el, requestAnimationFrame(tick));
    } else {
      numberTweens.delete(el);
    }
  }
  numberTweens.set(el, requestAnimationFrame(tick));
}

/** Petit moteur de confettis léger (canvas 2D, sans dépendance). */
export function launchConfetti(canvas) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const resize = () => {
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
  };
  resize();
  window.addEventListener('resize', resize);

  const colors = ['#e8b84b', '#f4d488', '#3fb27f', '#f5ede0', '#e05252'];
  const pieces = Array.from({ length: 120 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * canvas.height * 0.5,
    vx: (Math.random() - 0.5) * 2.4 * dpr,
    vy: (1.5 + Math.random() * 2.6) * dpr,
    size: (4 + Math.random() * 6) * dpr,
    rot: Math.random() * Math.PI,
    vrot: (Math.random() - 0.5) * 0.2,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));

  let frame = 0;
  let raf;
  function tick() {
    frame++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vrot;
      if (p.y > canvas.height + 20) { p.y = -20; p.x = Math.random() * canvas.width; }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    });
    if (frame < 420) raf = requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  tick();
  return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
}
