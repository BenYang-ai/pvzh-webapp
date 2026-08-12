// 测试工具:直接构造精简 GameState(绕过发牌),让规则测试确定且聚焦。
import type { Fighter, GameState, Side } from '../../src/engine/types.ts';
import { makeFighter } from '../../src/engine/deck.ts';
import { DEFAULT_CONFIG } from '../../src/config.ts';

function dummyDeck(side: Side, cardId: string) {
  return Array.from({ length: 10 }, (_, i) => ({ instanceId: `${side}_deck_${i}`, cardId }));
}

export function baseState(partial?: Partial<GameState>): GameState {
  const s: GameState = {
    turn: 1,
    phase: 'ZOMBIE_PLAY',
    lanes: Array.from({ length: DEFAULT_CONFIG.laneCount }, () => ({ plant: null, zombie: null })),
    plant: {
      side: 'plant',
      deck: dummyDeck('plant', 'p_peashooter'),
      hand: [],
      resource: 0,
      bonusResourceNextTurn: 0,
      hero: { hp: 20, blockMeter: 0, readySuperpower: null },
    },
    zombie: {
      side: 'zombie',
      deck: dummyDeck('zombie', 'z_imp'),
      hand: [],
      resource: 0,
      bonusResourceNextTurn: 0,
      hero: { hp: 20, blockMeter: 0, readySuperpower: null },
    },
    rng: 12345,
    instanceCounter: 0,
    winner: null,
    log: [],
    config: DEFAULT_CONFIG,
    ...partial,
  };
  return s;
}

let idc = 0;
export function placeFighter(state: GameState, lane: number, side: Side, cardId: string): Fighter {
  const f = makeFighter({ instanceId: `test_${idc++}`, cardId }, side);
  state.lanes[lane][side] = f;
  return f;
}

// 往手牌塞一张卡,返回 instanceId
export function giveCard(state: GameState, side: Side, cardId: string): string {
  const instanceId = `hand_${idc++}`;
  state[side].hand.push({ instanceId, cardId });
  return instanceId;
}
