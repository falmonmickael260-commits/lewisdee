/**
 * ui.js — Couche de présentation : rendu du plateau, des dés, du HUD,
 * des animations de lancer. Ne contient AUCUNE règle de jeu : elle se
 * contente d'afficher l'état produit par GameController (game.js) et de
 * relayer les interactions (tap sur un dé, clic sur un bouton) vers lui.
 */

import { BOARD_CENTER, generateThrowOrigin, randomSpin, randomFinalRotation, randomThrowDuration } from './positions.js';

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

function buildDieFace(value) {
  const face = document.createElement('div');
  face.className = 'die-face';
  for (let i = 1; i <= 9; i++) {
    const pip = document.createElement('span');
    pip.className = `pip p${i}${FACES[value].includes(`p${i}`) ? ' on' : ''}`;
    face.appendChild(pip);
  }
  return face;
}

/**
 * Crée (ou réutilise) l'élément DOM d'un dé et l'anime de sa position de
 * départ (proche du centre de la table) vers sa position finale, avec
 * rotation et léger rebond — chaque dé ayant sa propre trajectoire,
 * vitesse et durée.
 */
export function throwDie(layer, die, opts = {}) {
  let el = layer.querySelector(`[data-die-id="${die.id}"]`);
  const isNew = !el;
  if (isNew) {
    el = document.createElement('div');
    el.className = 'die';
    el.dataset.dieId = die.id;
    el.appendChild(buildDieFace(die.value));
    layer.appendChild(el);
  } else {
    el.replaceChildren(buildDieFace(die.value));
  }
  el.className = `die ${die.state || ''}`.trim();

  const start = opts.fromPosition || generateThrowOrigin(2.2);
  const startRot = Math.random() * 60 - 30;
  const spinDir = Math.random() < 0.5 ? -1 : 1;
  const endRot = randomFinalRotation() + randomSpin() * spinDir;
  // Rotation intermédiaire (avant l'arrêt final) pour que le dé continue
  // visiblement à tourner pendant tout le vol, pas seulement au début.
  const midRot = endRot * 0.62 + 130 * spinDir;
  const duration = reducedMotion ? 1 : randomThrowDuration();
  // Décalage en cascade : chaque dé part un peu après le précédent, comme
  // une vraie poignée de dés lancée à la main — c'est ce qui donne le
  // "rythme" du lancer plutôt que 5 dés qui bougent tous d'un seul bloc.
  const delay = reducedMotion ? 0 : (opts.delay ?? 0) + Math.random() * 50;

  el.style.left = `${pct(die.x)}%`;
  el.style.top = `${pct(die.y)}%`;

  if (reducedMotion) {
    el.style.transform = 'translate(-50%, -50%) rotate(0deg)';
    return el;
  }

  // On anime via un wrapper de transform relatif : on part du delta entre
  // le point de départ (proche du centre) et la position finale du dé.
  const dx = pct(start.x - die.x);
  const dy = pct(start.y - die.y);
  const containerSize = layer.getBoundingClientRect().width || 640;
  const dxPx = (dx / 100) * containerSize;
  const dyPx = (dy / 100) * containerSize;

  // Trajectoire COURBE : chaque dé dévie latéralement (perpendiculairement à
  // sa ligne directe départ→arrivée) d'une quantité et d'un sens propres à
  // lui, façon vrai jet à la main. C'est ce qui fait que les 5 dés partent
  // visiblement "dans tous les sens" plutôt que le long d'une même ligne.
  const travelAngle = Math.atan2(dyPx, dxPx) || 0;
  const curveDir = Math.random() < 0.5 ? -1 : 1;
  const curveMag = (90 + Math.random() * 130) * curveDir;
  const perpX = Math.cos(travelAngle + Math.PI / 2) * curveMag;
  const perpY = Math.sin(travelAngle + Math.PI / 2) * curveMag;

  // Le dé "saute" nettement plus haut à mi-course, façon jet à la main,
  // avant de retomber avec deux petits rebonds successifs à l'arrivée.
  const hop = -(90 + Math.random() * 70);
  const overshootX = dxPx < 0 ? -26 : 26;

  const keyframes = [
    { transform: `translate(-50%, -50%) translate(${dxPx}px, ${dyPx}px) rotate(${startRot}deg) scale(0.58)`, offset: 0, easing: 'cubic-bezier(.15,.85,.3,1)' },
    { transform: `translate(-50%, -50%) translate(${dxPx * 0.72 + perpX}px, ${dyPx * 0.72 + perpY + hop * 0.5}px) rotate(${midRot * 0.34}deg) scale(1.22) scaleX(0.86)`, offset: 0.2, easing: 'cubic-bezier(.3,0,.3,1)' },
    { transform: `translate(-50%, -50%) translate(${dxPx * 0.42 + perpX * 0.75}px, ${dyPx * 0.42 + perpY * 0.75 + hop}px) rotate(${midRot * 0.62}deg) scale(0.88) scaleY(0.82)`, offset: 0.42, easing: 'cubic-bezier(.3,0,.3,1)' },
    { transform: `translate(-50%, -50%) translate(${dxPx * 0.16 + perpX * 0.3 + overshootX}px, ${dyPx * 0.16 + perpY * 0.15}px) rotate(${midRot}deg) scale(1.14) scaleX(0.9)`, offset: 0.64, easing: 'cubic-bezier(.3,0,.3,1)' },
    { transform: `translate(-50%, -50%) translate(0px, -46px) rotate(${endRot * 0.86}deg) scale(0.95)`, offset: 0.79, easing: 'ease-out' },
    { transform: `translate(-50%, -50%) translate(0px, 6px) rotate(${endRot * 1.015}deg) scale(0.92) scaleY(0.78)`, offset: 0.89, easing: 'ease-out' },
    { transform: `translate(-50%, -50%) translate(0px, -12px) rotate(${endRot * 0.995}deg) scale(1.05)`, offset: 0.95, easing: 'ease-out' },
    { transform: `translate(-50%, -50%) translate(0px, 0px) rotate(${endRot}deg) scale(1)`, offset: 1, easing: 'ease-out' },
  ];

  const anim = el.animate(keyframes, { duration, delay, fill: 'both', easing: 'ease-out' });
  // Petit éclat de lumière sur la face une fois le dé posé, pour marquer
  // l'arrêt du mouvement (sensation "vrai dé qui vient de se stabiliser").
  anim.onfinish = () => el.classList.add('settled');
  return el;
}

export function markDieState(layer, dieId, state) {
  const el = layer.querySelector(`[data-die-id="${dieId}"]`);
  if (el) el.className = `die ${state}`.trim();
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
export function showComboBanner(banner, labelEl, pointsEl, combos) {
  if (!combos.length) { banner.hidden = true; return; }
  const best = combos.slice().sort((a, b) => b.points - a.points)[0];
  labelEl.textContent = combos.length > 1 ? `${combos.length} COMBINAISONS` : best.label;
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
