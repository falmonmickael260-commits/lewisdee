/** Local opponents. Every action goes through the unchanged GameController. */
import { detectCombinations, calculateScore, WINNING_SCORE } from './engine.js';

export function chooseBotMove(controller) {
  const dice = controller.tableDice;
  let best = null, bank = null;
  for (let mask = 1; mask < (1 << dice.length); mask++) {
    const selected = dice.filter((_, index) => mask & (1 << index));
    const detection = detectCombinations(selected);
    if (detection.deadIds.length || !detection.combos.length) continue;
    const points = calculateScore(detection.combos);
    const total = controller.turnScore + points;
    if (controller.currentPlayer.score + total > WINNING_SCORE) continue;
    const candidate = { ids: selected.map(die => die.id), points, total };
    if (!best || points > best.points) best = candidate;
    if (total % 100 === 0 && (!bank || total > bank.total)) bank = candidate;
  }
  if (!best) return null;
  const remaining = WINNING_SCORE - controller.currentPlayer.score;
  if (bank && (bank.total >= 400 || remaining <= 1000 || controller.rollsThisTurn >= 3)) {
    return { ...bank, action: 'bank' };
  }
  return { ...best, action: 'reroll' };
}

export function attachBots(controller, botIds, {
  turnDelay = 3000, thinkDelay = 1850,
  schedule = setTimeout, cancel = clearTimeout,
} = {}) {
  const bots = new Set(botIds);
  let timer = null, disposed = false;
  const isBot = () => !disposed && !controller.gameOver && bots.has(controller.currentPlayerIndex);
  function later(callback, delay) {
    if (timer !== null) cancel(timer);
    timer = schedule(() => { timer = null; if (isBot()) callback(); }, delay);
  }
  function begin() {
    if (!isBot()) return;
    later(() => {
      // A cautious opponent chooses the existing "Nouvelle main" option.
      if (controller.hasPendingInheritance) controller.declineInheritance();
      controller.roll();
    }, turnDelay);
  }
  const unsubscribe = [
    controller.on('turnChanged', begin),
    controller.on('rolled', ({ isBust }) => {
      if (!isBot() || isBust) return;
      later(() => {
        const move = chooseBotMove(controller);
        if (!move) return;
        const selected = new Set(move.ids);
        for (const die of [...controller.tableDice]) {
          if (Boolean(die.selected) !== selected.has(die.id)) controller.toggleDie(die.id);
        }
        if (move.action === 'bank' && controller.canBank) controller.bankScore();
        else if (controller.canReroll) controller.reroll();
      }, thinkDelay);
    }),
    controller.on('victory', () => { if (timer !== null) cancel(timer); }),
  ];
  begin();
  return () => {
    disposed = true;
    if (timer !== null) cancel(timer);
    unsubscribe.forEach(off => off());
  };
}
