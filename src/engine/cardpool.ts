import poolJson from '../data/cardpool.json' with { type: 'json' };
import type { Card, Cardpool, Side } from './types.ts';

export const CARDPOOL = poolJson as unknown as Cardpool;

export function getCard(cardId: string): Card {
  const c = CARDPOOL.cards[cardId];
  if (!c) throw new Error(`unknown card: ${cardId}`);
  return c;
}

export function decklistFor(side: Side): Array<{ id: string; copies: number }> {
  return CARDPOOL.decklists[side];
}
