/**
 * sound.js — Petits sons de dés, entièrement synthétisés via WebAudio (pas
 * de fichier à charger). Volontairement discret : un "clac" bref à
 * l'impact, un "tac" plus léger à chaque rebond suivant, et un souffle très
 * doux qui décroît pendant le roulement. Activable/désactivable via
 * setSoundEnabled() (voir le réglage "Sons" de l'écran Paramètres).
 */

let enabled = true;
let ctx = null;
let noiseBuffer = null;

export function setSoundEnabled(v) { enabled = v; }

function getContext() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  return ctx;
}

function getNoiseBuffer(context) {
  if (noiseBuffer) return noiseBuffer;
  const length = context.sampleRate * 0.3;
  noiseBuffer = context.createBuffer(1, length, context.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return noiseBuffer;
}

/** Petit "clac"/"tac" d'impact. intensity ~0.2-1 : plus faible à chaque rebond suivant. */
export function playImpactSound(intensity = 1) {
  if (!enabled || intensity <= 0) return;
  const context = getContext();
  if (!context) return;
  if (context.state === 'suspended') context.resume().catch(() => {});

  const now = context.currentTime;
  const src = context.createBufferSource();
  src.buffer = getNoiseBuffer(context);

  const filter = context.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 900 + Math.random() * 500;
  filter.Q.value = 0.7;

  const gain = context.createGain();
  const peak = 0.16 * Math.min(1, intensity);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(peak, now + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.09);

  src.connect(filter).connect(gain).connect(context.destination);
  src.start(now);
  src.stop(now + 0.12);
}

/** Souffle très doux, façon roulement, qui décroît progressivement. */
export function playRollSound() {
  if (!enabled) return;
  const context = getContext();
  if (!context) return;
  if (context.state === 'suspended') context.resume().catch(() => {});

  const now = context.currentTime;
  const src = context.createBufferSource();
  src.buffer = getNoiseBuffer(context);
  src.loop = true;

  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 700;

  const gain = context.createGain();
  gain.gain.setValueAtTime(0.05, now);
  gain.gain.exponentialRampToValueAtTime(0.0006, now + 0.42);

  src.connect(filter).connect(gain).connect(context.destination);
  src.start(now);
  src.stop(now + 0.45);
}
