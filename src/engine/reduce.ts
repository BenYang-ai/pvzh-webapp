import type {
  GameAction,
  GameState,
  HeroState,
  InstanceRef,
  Phase,
  PlayerState,
  Side,
} from './types.ts';
import { DEFAULT_CONFIG, type GameConfig } from '../config.ts';
import { getCard } from './cardpool.ts';
import { buildDeck, makeFighter, hasKeyword } from './deck.ts';
import { seedFromString, shuffle } from './rng.ts';
import { applyEffects, drawCards, otherSide, player } from './effects.ts';
import { resolveFight } from './combat.ts';

export class IllegalActionError extends Error {}

// —— 初始化 ——
export interface InitOptions {
  seed: string;
  config?: GameConfig;
}

function newHero(config: GameConfig): HeroState {
  return { hp: config.heroStartHp, blockMeter: 0, readySuperpower: null };
}

export function createInitialState(opts: InitOptions): GameState {
  const config = opts.config ?? DEFAULT_CONFIG;
  let rng = seedFromString(opts.seed);
  let counter = 0;

  const plantBuilt = buildDeck('plant', counter);
  counter = plantBuilt.counter;
  const zombieBuilt = buildDeck('zombie', counter);
  counter = zombieBuilt.counter;

  let plantDeck: InstanceRef[];
  let zombieDeck: InstanceRef[];
  [rng, plantDeck] = shuffle(rng, plantBuilt.deck);
  [rng, zombieDeck] = shuffle(rng, zombieBuilt.deck);

  const plant: PlayerState = {
    side: 'plant',
    deck: plantDeck,
    hand: [],
    resource: 0,
    bonusResourceNextTurn: 0,
    hero: newHero(config),
  };
  const zombie: PlayerState = {
    side: 'zombie',
    deck: zombieDeck,
    hand: [],
    resource: 0,
    bonusResourceNextTurn: 0,
    hero: newHero(config),
  };

  const state: GameState = {
    turn: 0,
    phase: 'ZOMBIE_PLAY',
    lanes: Array.from({ length: config.laneCount }, () => ({ plant: null, zombie: null })),
    plant,
    zombie,
    rng,
    instanceCounter: counter,
    winner: null,
    log: [],
  };

  // 起手 draw(§10.3)
  drawCards(state, 'plant', config.openingDraw);
  drawCards(state, 'zombie', config.openingDraw);

  // 进入回合 1
  startTurn(state, config, 1);
  return state;
}

// —— 回合开始:抽牌 + 资源 + 清 this-turn 标记 ——
function startTurn(state: GameState, config: GameConfig, turn: number): void {
  state.turn = turn;
  // shield(cantBeHurt)= 本回合有效,新回合开始前清除(§7 讨论)
  for (const lane of state.lanes) {
    if (lane.plant) lane.plant.cantBeHurt = false;
    if (lane.zombie) lane.zombie.cantBeHurt = false;
  }
  for (const side of ['plant', 'zombie'] as Side[]) {
    const p = player(state, side);
    drawCards(state, side, config.drawPerTurn);
    if (state.winner) return; // 牌库抽空 → 和局
    p.resource = turn + p.bonusResourceNextTurn;
    p.bonusResourceNextTurn = 0;
  }
  state.phase = 'ZOMBIE_PLAY';
}

// —— phase 归属 ——
function phaseOwner(phase: Phase): Side | null {
  switch (phase) {
    case 'ZOMBIE_PLAY':
    case 'ZOMBIE_TRICKS':
      return 'zombie';
    case 'PLANT_PLAY':
      return 'plant';
    default:
      return null; // FIGHT / GAME_OVER 无归属
  }
}

function canPlayFighter(side: Side, phase: Phase): boolean {
  return (side === 'zombie' && phase === 'ZOMBIE_PLAY') || (side === 'plant' && phase === 'PLANT_PLAY');
}

function canPlayTrick(side: Side, phase: Phase): boolean {
  if (side === 'plant') return phase === 'PLANT_PLAY';
  // 僵尸只能在 ZOMBIE_TRICKS 出 trick(不能在打牌阶段 ZOMBIE_PLAY 出)
  return phase === 'ZOMBIE_TRICKS';
}

function endTurn(state: GameState, config: GameConfig): void {
  resolveFight(state, config); // 命中 hero 致死时内部已设 winner + GAME_OVER
  if (state.winner) return;
  startTurn(state, config, state.turn + 1);
}

// —— 主 reducer ——(纯函数:克隆输入,变更克隆,返回)
export function reduce(prev: GameState, action: GameAction, config: GameConfig = DEFAULT_CONFIG): GameState {
  if (prev.phase === 'GAME_OVER') throw new IllegalActionError('game over');
  const state: GameState = structuredClone(prev);

  switch (action.type) {
    case 'PLAY_FIGHTER':
      playFighter(state, action);
      return state;
    case 'PLAY_TRICK':
      playTrick(state, action);
      return state;
    case 'ADVANCE_PHASE':
      advancePhase(state, action, config);
      return state;
    case 'PLAY_SUPERPOWER':
    case 'PICK_SUPERPOWER':
      throw new IllegalActionError('superpowers land in M3');
  }
}

function takeFromHand(p: PlayerState, instanceId: string): InstanceRef {
  const idx = p.hand.findIndex((r) => r.instanceId === instanceId);
  if (idx < 0) throw new IllegalActionError(`card not in ${p.side} hand: ${instanceId}`);
  return p.hand.splice(idx, 1)[0];
}

function playFighter(state: GameState, action: Extract<GameAction, { type: 'PLAY_FIGHTER' }>): void {
  const { side, instanceId, lane } = action;
  if (!canPlayFighter(side, state.phase)) throw new IllegalActionError(`cannot play fighter in ${state.phase}`);
  if (lane < 0 || lane >= state.lanes.length) throw new IllegalActionError(`bad lane ${lane}`);
  if (state.lanes[lane][side]) throw new IllegalActionError(`lane ${lane} occupied`);

  const p = player(state, side);
  const ref = p.hand.find((r) => r.instanceId === instanceId);
  if (!ref) throw new IllegalActionError(`card not in hand: ${instanceId}`);
  const card = getCard(ref.cardId);
  if (card.type !== 'fighter') throw new IllegalActionError(`not a fighter: ${ref.cardId}`);
  if (card.faction !== side) throw new IllegalActionError(`wrong faction`);
  if (card.cost > p.resource) throw new IllegalActionError(`not enough resource (${p.resource}/${card.cost})`);

  takeFromHand(p, instanceId);
  p.resource -= card.cost;
  const fighter = makeFighter(ref, side);
  state.lanes[lane][side] = fighter;

  // 非 gravestone 立即触发 onPlay;gravestone 面朝下,onReveal 留到翻面(M2)
  if (!fighter.gravestone && card.onPlay) {
    applyEffects(state, card.onPlay, { caster: side, self: fighter });
  }
}

function playTrick(state: GameState, action: Extract<GameAction, { type: 'PLAY_TRICK' }>): void {
  const { side, instanceId, target } = action;
  if (!canPlayTrick(side, state.phase)) throw new IllegalActionError(`cannot play trick in ${state.phase}`);

  const p = player(state, side);
  const ref = p.hand.find((r) => r.instanceId === instanceId);
  if (!ref) throw new IllegalActionError(`card not in hand: ${instanceId}`);
  const card = getCard(ref.cardId);
  if (card.type !== 'trick') throw new IllegalActionError(`not a trick: ${ref.cardId}`);
  if (card.faction !== side) throw new IllegalActionError(`wrong faction`);
  if (card.cost > p.resource) throw new IllegalActionError(`not enough resource (${p.resource}/${card.cost})`);

  validateTrickTarget(state, side, card.targeting ?? 'none', target);

  takeFromHand(p, instanceId);
  p.resource -= card.cost;
  if (card.onPlay) applyEffects(state, card.onPlay, { caster: side, chosen: target });
}

function validateTrickTarget(
  state: GameState,
  side: Side,
  spec: string,
  target?: { lane: number; side: Side },
): void {
  if (spec === 'none') return;
  if (!target) throw new IllegalActionError(`target required for ${spec}`);
  const f = state.lanes[target.lane]?.[target.side];
  if (!f) throw new IllegalActionError(`no fighter at target`);
  // untrickable:双方 trick 均不可指向(§7)
  if (hasKeyword(f.keywords, 'untrickable')) throw new IllegalActionError(`target is untrickable`);
  // gravestone 未翻面:不可被任何一方指向(§7)
  if (f.gravestone) throw new IllegalActionError(`target is a hidden gravestone`);

  if (spec === 'friendlyFighter' && target.side !== side) throw new IllegalActionError(`must target friendly`);
  if (spec === 'enemyFighter' && target.side !== otherSide(side)) throw new IllegalActionError(`must target enemy`);
}

function advancePhase(
  state: GameState,
  action: Extract<GameAction, { type: 'ADVANCE_PHASE' }>,
  config: GameConfig,
): void {
  const owner = phaseOwner(state.phase);
  if (owner && action.side !== owner) throw new IllegalActionError(`not your phase (${state.phase})`);

  switch (state.phase) {
    case 'ZOMBIE_PLAY':
      state.phase = 'PLANT_PLAY';
      return;
    case 'PLANT_PLAY':
      state.phase = 'ZOMBIE_TRICKS';
      return;
    case 'ZOMBIE_TRICKS':
      // 结束僵尸 trick → 立即结算战斗并进入下一回合(自动,无需再点)
      state.phase = 'FIGHT';
      endTurn(state, config);
      return;
    case 'FIGHT':
      endTurn(state, config);
      return;
    default:
      throw new IllegalActionError(`cannot advance from ${state.phase}`);
  }
}
