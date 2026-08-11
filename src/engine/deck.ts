import type { Card, Fighter, InstanceRef, Side } from './types.ts';
import { getCard, decklistFor } from './cardpool.ts';

// 解析 "armored:1" → { name:'armored', value:1 }
export function parseKeyword(kw: string): { name: string; value: number | null } {
  const [name, val] = kw.split(':');
  return { name, value: val === undefined ? null : Number(val) };
}

export function keywordValue(keywords: string[], name: string): number | null {
  for (const kw of keywords) {
    const p = parseKeyword(kw);
    if (p.name === name) return p.value ?? 0;
  }
  return null;
}

export function hasKeyword(keywords: string[], name: string): boolean {
  return keywords.some((kw) => parseKeyword(kw).name === name);
}

// 按 decklist 展开成实例牌库(未洗)。instanceId 用递增计数器,确定性。
export function buildDeck(side: Side, startCounter: number): { deck: InstanceRef[]; counter: number } {
  const deck: InstanceRef[] = [];
  let counter = startCounter;
  for (const { id, copies } of decklistFor(side)) {
    for (let i = 0; i < copies; i++) {
      deck.push({ instanceId: `${side}_${counter}`, cardId: id });
      counter++;
    }
  }
  return { deck, counter };
}

// 从卡定义 + 实例引用生成场上 fighter(印刷值起步)。
export function makeFighter(ref: InstanceRef, owner: Side): Fighter {
  const card: Card = getCard(ref.cardId);
  if (card.type !== 'fighter') throw new Error(`not a fighter: ${ref.cardId}`);
  return {
    instanceId: ref.instanceId,
    cardId: ref.cardId,
    owner,
    attack: card.attack ?? 0,
    health: card.health ?? 0,
    keywords: [...card.keywords],
    frozen: false,
    cantBeHurt: false,
    gravestone: hasKeyword(card.keywords, 'gravestone'),
  };
}
