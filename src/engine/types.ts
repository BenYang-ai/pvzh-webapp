// 规则引擎类型定义。引擎 = 纯函数,无 React/网络/随机副作用(§3)。
// 所有随机走 state 内的 seeded RNG(见 rng.ts),保证 determinism。

export type Side = 'plant' | 'zombie';
export type Faction = Side;

// §5 回合四阶段。START 不是常驻阶段,在回合边界处理(抽牌+资源)。
export type Phase = 'ZOMBIE_PLAY' | 'PLANT_PLAY' | 'ZOMBIE_TRICKS' | 'FIGHT' | 'GAME_OVER';

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

export interface Cardpool {
  cards: Record<string, Card>;
  decklists: Record<Side, Array<{ id: string; copies: number }>>;
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
  readySuperpower: string | null; // SP id 或 null
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
}

// —— Actions ——
export type GameAction =
  | { type: 'PLAY_FIGHTER'; side: Side; instanceId: string; lane: number }
  | { type: 'PLAY_TRICK'; side: Side; instanceId: string; target?: { lane: number; side: Side }; toLane?: number }
  | { type: 'PLAY_SUPERPOWER'; side: Side; target?: { lane: number; side: Side }; toLane?: number } // M3
  | { type: 'PICK_SUPERPOWER'; side: Side; superpowerId: string } // M3 pick 模式
  | { type: 'ADVANCE_PHASE'; side: Side };
