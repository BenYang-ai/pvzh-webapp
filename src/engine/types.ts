// 规则引擎类型定义。引擎 = 纯函数,无 React/网络/随机副作用(§3)。
// 所有随机走 state 内的 seeded RNG(见 rng.ts),保证 determinism。

export type Side = 'plant' | 'zombie';
export type Faction = Side;

// §5 回合四阶段。START 不是常驻阶段,在回合边界处理(抽牌+资源)。
// SUPERPOWER_INTERRUPT:FIGHT 中途 Super-Block 授予超能力 → 暂停战斗,让该方立即打出或跳过。
export type Phase =
  | 'ZOMBIE_PLAY'
  | 'PLANT_PLAY'
  | 'ZOMBIE_TRICKS'
  | 'FIGHT'
  | 'SUPERPOWER_INTERRUPT'
  | 'GAME_OVER';

// —— 卡牌静态定义(来自 cardpool.json)——
export type CardType = 'fighter' | 'trick';

export type TargetSpec =
  | 'none'
  | 'friendlyFighter'
  | 'enemyFighter'
  | 'anyFighter'
  | 'lane'
  | 'enemyFighterThenLane'; // Carried Away:fighter + lane 两段

// TargetRef:effect 内如何定位目标。
// 'chosen' = 打出此卡时玩家选中的目标(action.target)。
export type TargetRef =
  | { lane: number; side: Side }
  | 'chosen'
  | 'random'
  | 'fixedLane2'
  | 'self';

export type Effect =
  | { kind: 'damage'; amount: number; target: TargetRef }
  | { kind: 'buff'; attack: number; health: number; target: TargetRef }
  | { kind: 'draw'; count: number; side: 'self' }
  | { kind: 'rampResource'; amount: number } // 下回合 +amount 资源
  | { kind: 'destroyIf'; stat: 'attack' | 'health'; op: '>=' | '<='; value: number; target: TargetRef }
  | { kind: 'bounce'; target: TargetRef }
  | { kind: 'freeze'; target: TargetRef }
  | { kind: 'shield'; target: TargetRef } // cantBeHurt this turn(§7 讨论新增)
  | { kind: 'giveKeywordAll'; keyword: string; side: 'friendly' | 'enemy' }
  | { kind: 'move'; target: TargetRef; toLane: number }
  | { kind: 'bonusAttack'; target: TargetRef };

export interface CardArt {
  placeholder: { emoji: string; bg: string };
  image: string | null;
}

export interface Card {
  id: string;
  name: string;
  faction: Faction;
  cost: number;
  type: CardType;
  attack?: number;
  health?: number; // 印刷值 printed
  keywords: string[];
  classes: string[];
  onPlay?: Effect[];
  onDeath?: Effect[];
  onReveal?: Effect[];
  targeting?: TargetSpec;
  art: CardArt;
}

// —— 超能力(§8)。cost 0,不占卡组;通过 Super-Block Meter 获得。——
export type SuperpowerTargeting = 'none' | 'friendlyFighter' | 'enemyFighter' | 'friendlyFighterThenLane';

export interface Superpower {
  id: string;
  name: string;
  faction: Faction;
  signature?: boolean; // 英雄招牌超能力
  targeting: SuperpowerTargeting;
  minAttack?: number; // Cut Down:仅可指向 attack≥minAttack 的目标
  effects?: Effect[]; // 通用效果串;precision_blast/carried_away 由 id 特判
}

export interface Cardpool {
  cards: Record<string, Card>;
  decklists: Record<Side, Array<{ id: string; copies: number }>>;
  superpowers: Record<Side, Superpower[]>;
}

// —— 运行时实例 ——
export interface InstanceRef {
  instanceId: string;
  cardId: string;
}

// 场上 fighter 实例:带当前(非印刷)数值与临时标记。
export interface Fighter {
  instanceId: string;
  cardId: string;
  owner: Side;
  attack: number;
  health: number;
  keywords: string[]; // 当前关键词(可被 giveKeywordAll/shield 之外的效果改动)
  frozen: boolean; // 跳过下一次攻击
  cantBeHurt: boolean; // 本回合免伤(destroyIf 仍可摧毁),回合末清除
  gravestone: boolean; // 面朝下未翻面(§7)
}

export type Lane = {
  plant: Fighter | null;
  zombie: Fighter | null;
};

export interface HeroState {
  hp: number;
  blockMeter: number; // 0..blockMeterMax
  // 待用超能力(可叠多张)。Super-Block 授予即入列;当作 trick 卡:中断窗口内免费即打,
  // 之后留在列表里,在本方 trick 窗口花 1 资源打出(见 reduce.playSuperpower)。
  readySuperpowers: string[]; // SP id 列表(队尾=最近授予)
  superpowerOfferedIds?: string[]; // pick 模式:待玩家选择的候选
}

export interface PlayerState {
  side: Side;
  deck: InstanceRef[];
  hand: InstanceRef[];
  resource: number; // sun / brains 当前池
  bonusResourceNextTurn: number; // ramp
  hero: HeroState;
}

export interface GameState {
  turn: number;
  phase: Phase;
  lanes: Lane[];
  plant: PlayerState;
  zombie: PlayerState;
  rng: number; // seeded RNG 状态(见 rng.ts)
  instanceCounter: number; // 生成 instanceId,保持确定性
  winner: Side | 'draw' | null;
  log: string[];
  config: import('../config.ts').GameConfig; // 规则开关(Super-Block 模式等),随 state 走,联网两端一致
  // —— FIGHT 中断续算(SUPERPOWER_INTERRUPT 期间有值)——
  fightResume?: { nextLane: number } | null; // resolveFight 从哪条 lane 续算
  interrupts?: Side[]; // 本次 fight 中因 Super-Block 获得超能力、待处理的一方(队列,队首优先)
}

// —— Actions ——
export type GameAction =
  | { type: 'PLAY_FIGHTER'; side: Side; instanceId: string; lane: number }
  | { type: 'PLAY_TRICK'; side: Side; instanceId: string; target?: { lane: number; side: Side }; toLane?: number }
  | { type: 'PLAY_SUPERPOWER'; side: Side; superpowerId?: string; target?: { lane: number; side: Side }; toLane?: number } // M3;superpowerId 省略时取列表首个
  | { type: 'PICK_SUPERPOWER'; side: Side; superpowerId: string } // M3 pick 模式
  | { type: 'ADVANCE_PHASE'; side: Side };
