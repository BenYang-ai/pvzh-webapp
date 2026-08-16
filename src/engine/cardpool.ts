import poolJson from '../data/cardpool.json' with { type: 'json' };
import type { Card, Cardpool, Side, Superpower } from './types.ts';
import { validateCardpool } from './cardpool-validate.ts';

export const CARDPOOL = poolJson as unknown as Cardpool;

// dev 启动自检:非法数据(拼错关键词/效果 kind/引用不存在的卡)在这里立刻报出,不必等那张卡被抽到。
// 测试环境有 tests/engine/cardpool.test.ts 兜底(断言问题列表为空)。生产不跑,零开销。
if (import.meta.env?.DEV) {
  const problems = validateCardpool(CARDPOOL);
  if (problems.length) console.error(`[cardpool] ${problems.length} schema problem(s):\n${problems.join('\n')}`);
}

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
