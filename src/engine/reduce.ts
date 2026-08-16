import type {
  GameAction,
  GameState,
  HeroState,
  InstanceRef,
  PlayerState,
  Side,
} from './types.ts';
import { DEFAULT_CONFIG, type GameConfig } from '../config.ts';
import { getCard, getSuperpower } from './cardpool.ts';
import { buildDeck, makeFighter } from './deck.ts';
import { seedFromString, shuffle } from './rng.ts';
import { applyEffects, drawCards, player } from './effects.ts';
import { resolveFight, revealGravestones } from './combat.ts';
import { applySuperpower, grantSuperpower } from './superpowers.ts';
import {
  canPlayFighter,
  canPlayTrick,
  phaseOwner,
  superpowerCostFor,
  superpowerWindow,
  validateDestLane,
  validateTarget,
} from './legality.ts';

export class IllegalActionError extends Error {}

// —— 初始化 ——
export interface InitOptions {
  seed: string;
  config?: GameConfig;
}

function newHero(config: GameConfig): HeroState {
  return { hp: config.heroStartHp, blockMeter: 0, blockTriggers: 0, readySuperpowers: [], usedSuperpowerIds: [] };
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
    config,
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
    // 手牌已满(≥handSizeMax)→ 回合开始不抽牌(真实 PvZH:满手不摸)。
    // 其它机制(超能力/卡牌效果)仍可让手牌超过上限。
    if (p.hand.length < config.handSizeMax) drawCards(state, side, config.drawPerTurn);
    if (state.winner) return; // 牌库抽空 → 和局
    p.resource = turn + p.bonusResourceNextTurn;
    p.bonusResourceNextTurn = 0;
  }
  // off 模式:每 N 回合给每方提供一次自选(无 Super-Block Meter)。
  if (config.superblock.mode === 'off' && turn % config.superblockOffEveryNTurns === 0) {
    for (const side of ['plant', 'zombie'] as Side[]) {
      const hero = player(state, side).hero;
      if (!hero.readySuperpowers.length && !hero.superpowerOfferedIds?.length) grantSuperpower(state, side);
    }
  }
  state.phase = 'ZOMBIE_PLAY';
}

function endTurn(state: GameState, config: GameConfig): void {
  resolveFight(state, config); // 命中 hero 致死时内部已设 winner + GAME_OVER
  if (state.winner) return;
  if (state.phase === 'SUPERPOWER_INTERRUPT') return; // 战斗被 Super-Block 打断 → 等玩家处理
  startTurn(state, config, state.turn + 1);
}

// 处理完队首 interrupt(打出或跳过)后:弹出队首;仍有则留在 INTERRUPT,否则续算战斗。
function finishInterruptStep(state: GameState, config: GameConfig): void {
  state.interrupts?.shift();
  if (state.interrupts && state.interrupts.length > 0) return; // 还有下一方待处理
  state.interrupts = undefined;
  state.phase = 'FIGHT'; // 退出中断窗口,回到战斗;endTurn 续算完再决定进入下一回合
  endTurn(state, config); // resolveFight 从 fightResume 续算;完成则进入下一回合
}

// —— 主 reducer ——(纯函数:克隆输入,变更克隆,返回)
export function reduce(prev: GameState, action: GameAction, configOverride: GameConfig = DEFAULT_CONFIG): GameState {
  if (prev.phase === 'GAME_OVER') throw new IllegalActionError('game over');
  const state: GameState = structuredClone(prev);
  state.combatEvents = []; // 每次 apply 只保留本 action 产出的战斗动画事件(见 CombatEvent)
  // 规则配置随 state 走(联网两端一致);老式 config 入参仅作缺省兜底。
  const config: GameConfig = prev.config ?? configOverride;

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
      playSuperpower(state, action, config);
      return state;
    case 'PICK_SUPERPOWER':
      pickSuperpower(state, action);
      return state;
  }
}

function takeFromHand(p: PlayerState, instanceId: string): InstanceRef {
  const idx = p.hand.findIndex((r) => r.instanceId === instanceId);
  if (idx < 0) throw new IllegalActionError(`card not in ${p.side} hand: ${instanceId}`);
  return p.hand.splice(idx, 1)[0];
}

function playFighter(state: GameState, action: Extract<GameAction, { type: 'PLAY_FIGHTER' }>): void {
  const { side, instanceId, lane } = action;
  if (!canPlayFighter(state, side)) throw new IllegalActionError(`cannot play fighter in ${state.phase}`);
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
  state.log.push(`${side} played ${card.name} at L${lane + 1}`);

  // 非 gravestone 立即触发 onPlay;gravestone 面朝下,onReveal 留到翻面(M2)
  if (!fighter.gravestone && card.onPlay) {
    applyEffects(state, card.onPlay, { caster: side, self: fighter });
  }
}

function playTrick(state: GameState, action: Extract<GameAction, { type: 'PLAY_TRICK' }>): void {
  const { side, instanceId, target } = action;
  if (!canPlayTrick(state, side)) throw new IllegalActionError(`cannot play trick in ${state.phase}`);

  const p = player(state, side);
  const ref = p.hand.find((r) => r.instanceId === instanceId);
  if (!ref) throw new IllegalActionError(`card not in hand: ${instanceId}`);
  const card = getCard(ref.cardId);
  if (card.type !== 'trick') throw new IllegalActionError(`not a trick: ${ref.cardId}`);
  if (card.faction !== side) throw new IllegalActionError(`wrong faction`);
  if (card.cost > p.resource) throw new IllegalActionError(`not enough resource (${p.resource}/${card.cost})`);

  const reason = validateTarget(state, side, card.targeting ?? 'none', target);
  if (reason) throw new IllegalActionError(reason);

  takeFromHand(p, instanceId);
  p.resource -= card.cost;
  state.log.push(`${side} played ${card.name}${target ? ` at L${target.lane + 1}` : ''}`);
  if (card.onPlay) applyEffects(state, card.onPlay, { caster: side, chosen: target });
}

// —— 超能力(§8)——
function playSuperpower(
  state: GameState,
  action: Extract<GameAction, { type: 'PLAY_SUPERPOWER' }>,
  config: GameConfig,
): void {
  const { side } = action;
  // 超能力当作 trick 卡。窗口由 legality 统一判定:interrupt(战斗中断,仅队首一方,免费打「刚授予那张」)
  // / trick(本方 trick 窗口,1 费打任意持有)/ null(不可打)。
  const w = superpowerWindow(state, side);
  if (w.kind === null) throw new IllegalActionError(`cannot play superpower in ${state.phase}`);

  const p = player(state, side);
  const hero = p.hero;
  if (!hero.readySuperpowers.length) throw new IllegalActionError('no superpower ready');
  const last = hero.readySuperpowers[hero.readySuperpowers.length - 1];
  // 中断窗口:只有“本回合刚授予”那张(w.freeId)可即时免费打出;旧超能力不可在战斗中打(留到本方 trick 窗口)。
  // trick 窗口:未指定则默认最近授予(队尾),否则按 id 取。
  const spId = w.kind === 'interrupt' ? w.freeId ?? action.superpowerId ?? last : action.superpowerId ?? last;
  if (w.kind === 'interrupt' && w.freeId !== undefined && spId !== w.freeId)
    throw new IllegalActionError('only the just-charged superpower is free this fight; play others in your trick phase');
  const idx = hero.readySuperpowers.lastIndexOf(spId);
  if (idx === -1) throw new IllegalActionError(`superpower not ready: ${spId}`);
  const sp = getSuperpower(spId);
  if (sp.faction !== side) throw new IllegalActionError('wrong faction superpower');

  // 花费:中断窗口内「刚授予那张」免费(Super-Block 奖励),否则当作 trick 从“手牌”打出(默认 1 费)。
  const cost = superpowerCostFor(state, side, spId);
  if (cost > p.resource) throw new IllegalActionError(`not enough resource (${p.resource}/${cost})`);

  const reason =
    validateTarget(state, side, sp.targeting, action.target, { minAttack: sp.minAttack }) ??
    validateDestLane(state, side, sp.targeting, action.toLane);
  if (reason) throw new IllegalActionError(reason);

  hero.readySuperpowers.splice(idx, 1);
  p.resource -= cost;
  applySuperpower(state, side, sp, action);

  if (w.kind === 'interrupt') finishInterruptStep(state, config); // 打出后续算战斗
}

function pickSuperpower(state: GameState, action: Extract<GameAction, { type: 'PICK_SUPERPOWER' }>): void {
  const hero = player(state, action.side).hero;
  const offered = hero.superpowerOfferedIds;
  if (!offered?.includes(action.superpowerId)) throw new IllegalActionError('superpower not offered');
  hero.readySuperpowers.push(action.superpowerId);
  hero.usedSuperpowerIds.push(action.superpowerId); // 唯一牌:抽到即消耗,不再被 offer/grant
  hero.superpowerOfferedIds = undefined;
  // pick 模式在中断窗口选定 → 回填 spId,使这张成为本次中断可免费打出的那张。
  const head = state.interrupts?.[0];
  if (state.phase === 'SUPERPOWER_INTERRUPT' && head?.side === action.side && head.spId === undefined)
    head.spId = action.superpowerId;
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
      // 植物出牌结束 → 僵尸出土(翻开 gravestone + onReveal),再进僵尸 trick 阶段。
      // 此后 gravestone 已面朝上,僵尸 trick 可指向、战斗直接结算(不再在战斗开始翻面)。
      revealGravestones(state);
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
    case 'SUPERPOWER_INTERRUPT': {
      // 跳过:超能力留在 readySuperpower,可在本方 play phase 再打;续算战斗。
      const side = state.interrupts?.[0]?.side;
      if (!side) throw new IllegalActionError('no interrupt pending');
      if (action.side !== side) throw new IllegalActionError(`not your interrupt (${side})`);
      state.log.push(`${side} kept the Super-Block superpower for later`);
      finishInterruptStep(state, config);
      return;
    }
    default:
      throw new IllegalActionError(`cannot advance from ${state.phase}`);
  }
}
