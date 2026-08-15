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
import { getCard, getSuperpower } from './cardpool.ts';
import { buildDeck, makeFighter, hasKeyword } from './deck.ts';
import { seedFromString, shuffle } from './rng.ts';
import { applyEffects, drawCards, otherSide, player } from './effects.ts';
import { resolveFight } from './combat.ts';
import { applySuperpower, grantSuperpower } from './superpowers.ts';
import type { Fighter, Superpower } from './types.ts';

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

// —— 超能力(§8)——
function playSuperpower(
  state: GameState,
  action: Extract<GameAction, { type: 'PLAY_SUPERPOWER' }>,
  config: GameConfig,
): void {
  const { side } = action;
  // 超能力当作 trick 卡。SUPERPOWER_INTERRUPT:仅队首一方可即时打出(战斗中断窗口)。
  const head = state.phase === 'SUPERPOWER_INTERRUPT' ? state.interrupts?.[0] : undefined;
  const inInterrupt = head?.side === side;
  // 中断窗口外则视同 trick:僵尸只能在 ZOMBIE_TRICKS 打(与 PR#7 分歧一致),植物在 PLANT_PLAY 打。
  const okPhase = inInterrupt || canPlayTrick(side, state.phase);
  if (!okPhase) throw new IllegalActionError(`cannot play superpower in ${state.phase}`);

  const p = player(state, side);
  const hero = p.hero;
  if (!hero.readySuperpowers.length) throw new IllegalActionError('no superpower ready');
  // 中断窗口:只有“本回合刚授予”的那张(head.spId)可即时免费打出;旧超能力不可在战斗中打(留到本方 trick 窗口 1 费打)。
  // 窗口外(trick):未指定则默认打出最近授予的(队尾),否则按 id 从列表取。
  const spId = inInterrupt
    ? head!.spId ?? action.superpowerId ?? hero.readySuperpowers[hero.readySuperpowers.length - 1]
    : action.superpowerId ?? hero.readySuperpowers[hero.readySuperpowers.length - 1];
  if (inInterrupt && head!.spId !== undefined && spId !== head!.spId)
    throw new IllegalActionError('only the just-charged superpower is free this fight; play others in your trick phase');
  const idx = hero.readySuperpowers.lastIndexOf(spId);
  if (idx === -1) throw new IllegalActionError(`superpower not ready: ${spId}`);
  const sp = getSuperpower(spId);
  if (sp.faction !== side) throw new IllegalActionError('wrong faction superpower');

  // 花费:中断窗口内免费(Super-Block 奖励),之后当作 1 费 trick 从“手牌”打出。
  const cost = inInterrupt ? 0 : config.superpowerHandCost ?? 1;
  if (cost > p.resource) throw new IllegalActionError(`not enough resource (${p.resource}/${cost})`);

  validateSuperpowerTarget(state, side, sp, action);
  hero.readySuperpowers.splice(idx, 1);
  p.resource -= cost;
  applySuperpower(state, side, sp, action);

  if (inInterrupt) finishInterruptStep(state, config); // 打出后续算战斗
}

function requireTargetable(state: GameState, t: { lane: number; side: Side }): Fighter {
  const f = state.lanes[t.lane]?.[t.side];
  if (!f) throw new IllegalActionError('no fighter at target');
  if (f.gravestone) throw new IllegalActionError('target is a hidden gravestone'); // 未翻面不可指向(§7)
  return f; // untrickable 检查在 enemyFighter 分支(仅挡敌方指向,友方增益不受限)
}

function validateSuperpowerTarget(
  state: GameState,
  side: Side,
  sp: Superpower,
  action: Extract<GameAction, { type: 'PLAY_SUPERPOWER' }>,
): void {
  const enemy = otherSide(side);
  switch (sp.targeting) {
    case 'none':
      return;
    case 'friendlyFighter': {
      const t = action.target;
      if (!t || t.side !== side) throw new IllegalActionError('must target a friendly fighter');
      requireTargetable(state, t);
      return;
    }
    case 'enemyFighter': {
      const t = action.target;
      if (!t || t.side !== enemy) throw new IllegalActionError('must target an enemy fighter');
      const f = requireTargetable(state, t);
      // untrickable:敌方对其免疫 trick 与超能力(§7)
      if (hasKeyword(f.keywords, 'untrickable')) throw new IllegalActionError('target is untrickable');
      if (sp.minAttack !== undefined && f.attack < sp.minAttack)
        throw new IllegalActionError(`target attack must be ≥ ${sp.minAttack}`);
      return;
    }
    case 'friendlyFighterThenLane': {
      const t = action.target;
      if (!t || t.side !== side) throw new IllegalActionError('must target a friendly fighter');
      requireTargetable(state, t);
      const toLane = action.toLane;
      if (toLane === undefined) throw new IllegalActionError('destination lane required');
      if (toLane < 0 || toLane >= state.lanes.length) throw new IllegalActionError(`bad lane ${toLane}`);
      if (state.lanes[toLane][side]) throw new IllegalActionError(`destination lane ${toLane} occupied`);
      return;
    }
  }
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
