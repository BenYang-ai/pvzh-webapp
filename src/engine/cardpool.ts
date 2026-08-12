import poolJson from '../data/cardpool.json' with { type: 'json' };
import type { Card, Cardpool, Side, Superpower } from './types.ts';

export const CARDPOOL = poolJson as unknown as Cardpool;

export function getCard(cardId: string): Card {
  const c = CARDPOOL.cards[cardId];
  if (!c) throw new Error(`unknown card: ${cardId}`);
  return c;
}

export function decklistFor(side: Side): Array<{ id: string; copies: number }> {
  return CARDPOOL.decklists[side];
}

// —— 超能力(§8)——
export function superpowersFor(side: Side): Superpower[] {
  return CARDPOOL.superpowers[side];
}

export function getSuperpower(spId: string): Superpower {
  const sp = [...CARDPOOL.superpowers.plant, ...CARDPOOL.superpowers.zombie].find((s) => s.id === spId);
  if (!sp) throw new Error(`unknown superpower: ${spId}`);
  return sp;
}
