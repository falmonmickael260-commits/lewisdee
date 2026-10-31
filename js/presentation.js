/** Visual effects only: consumes controller events, never generates results or sends actions. */
import { placeCarriedDie, setReducedMotion } from './ui.js';
import { playUITone } from './sound.js';

const motion = matchMedia('(prefers-reduced-motion: reduce)');
const motionToggle = document.getElementById('toggle-reduced-motion');
function applyMotion(value) {
  motionToggle.checked = value;
  setReducedMotion(value);
}
applyMotion(motion.matches);
motion.addEventListener('change', (event) => applyMotion(event.matches));

const hero = document.getElementById('hero-dice');
[{ value: 5, x: 440, y: 640, angle: -22 }, { value: 3, x: 670, y: 520, angle: 16 }, { value: 6, x: 640, y: 760, angle: -5 }].forEach((die, i) => {
  const element = placeCarriedDie(hero, { ...die, id: `hero-${i}`, state: 'locked' });
  element.style.setProperty('--cube-half', `${hero.clientWidth * 0.065}px`);
  element.style.transform = `translate(-50%, -50%) rotateZ(${die.angle}deg)`;
  element.removeAttribute('role');
  element.removeAttribute('tabindex');
});

// Keyboard selection reuses the existing click handler and its multiplayer turn guards.
document.getElementById('dice-layer').addEventListener('keydown', (event) => {
  const die = event.target.closest('.die');
  if (die && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    die.click();
  }
});
document.addEventListener('click', (event) => {
  if (event.target.closest('button:not(:disabled), .die')) playUITone('tap');
});

const table = document.getElementById('table-round');
const instruction = document.getElementById('table-instruction');
const effectTimers = new Map();
function pulse(name, duration) {
  clearTimeout(effectTimers.get(name));
  table.classList.remove(name);
  void table.offsetWidth;
  table.classList.add(name);
  effectTimers.set(name, setTimeout(() => { table.classList.remove(name); effectTimers.delete(name); }, duration));
}
export function resetPresentation() {
  effectTimers.forEach(clearTimeout);
  effectTimers.clear();
  table.classList.remove('is-rolling', 'is-banked', 'is-bust');
  instruction.textContent = 'Lancez les dés pour ouvrir le jeu';
}
export function presentRoll() {
  pulse('is-rolling', 1750);
  instruction.textContent = 'Touchez les dés pour composer votre sélection';
}
export function presentBank(gained) {
  table.dataset.gained = gained.toLocaleString('fr-FR');
  pulse('is-banked', 900);
  playUITone('points');
}
export function presentBust() {
  pulse('is-bust', 1400);
  instruction.textContent = 'La chance tourne… Au joueur suivant';
}

// Recalculate cube depth after resizing/orientation changes; the result value is untouched.
if (typeof ResizeObserver === 'function') {
  const layer = document.getElementById('dice-layer');
  new ResizeObserver(() => {
    layer.querySelectorAll('.die').forEach(die => {
      if (die.offsetWidth > 0) die.style.setProperty('--cube-half', `${die.offsetWidth / 2}px`);
    });
  }).observe(layer);
  new ResizeObserver(() => {
    hero.querySelectorAll('.die').forEach(die => die.style.setProperty('--cube-half', `${hero.clientWidth * 0.065}px`));
  }).observe(hero);
}
