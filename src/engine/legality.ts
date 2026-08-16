// 规则合法性:出牌相位、目标校验、超能力窗口/花费。
// 单一事实源:reduce.ts(校验 → 抛 IllegalActionError)与 selectors.ts(UI 高亮)都从这里取,
// 二者不再各写一份镜像逻辑(见 HANDOFF「legality」)。本模块纯函数,不改 state。
import type { Fighter, GameState, Phase, Side, TargetSpec } from './types.ts';
import type { SuperpowerTargeting } from './types.ts';
import { hasKeyword } from './keywords.ts';
import { otherSide } from './effects.ts';

export type Target = { lane: number; side: Side };

// —— 相位归属 / 出牌窗口 ——
export function phaseOwner(phase: Phase): Side | null {
  switch (phase) {
    case 'ZOMBIE_PLAY':
    case 'ZOMBIE_TRICKS':
      return 'zombie';
    case 'PLANT_PLAY':
      return 'plant';
    default:
      return null; // FIGHT / SUPERPOWER_INTERRUPT / GAME_OVER 无固定归属
  }
}

// fighter 只能在本方 play 阶段落子。
export function canPlayFighter(state: GameState, side: Side): boolean {
  return (side === 'zombie' && state.phase === 'ZOMBIE_PLAY') || (side === 'plant' && state.phase === 'PLANT_PLAY');
}

// trick:植物在 PLANT_PLAY;僵尸只能在 ZOMBIE_TRICKS(不能在 ZOMBIE_PLAY,PR#7 分歧)。
export function canPlayTrick(state: GameState, side: Side): boolean {
  if (side === 'plant') return state.phase === 'PLANT_PLAY';
  return state.phase === 'ZOMBIE_TRICKS';
}

// —— 目标系统 ——
// trick 与超能力共用同一套 fighter 目标语义。差异仅两处,作为 opts 传入:
//   isEnemyTarget → untrickable 只挡敌方指向(友方增益不受限);
//   minAttack     → 仅 Cut Down 这类「attack≥N」限制。
// gravestone 未翻面:任何一方都不可指向。
type AnyTargetSpec = TargetSpec | SuperpowerTargeting;

interface CandidateSide {
  side: Side;
  isEnemy: boolean;
}

// 某 spec 的候选目标方(及是否算敌方指向),外加是否需要目的 lane(移动类)。
const SPEC_CANDIDATES: Record<AnyTargetSpec, (self: Side) => CandidateSide[]> = {
  none: () => [],
  friendlyFighter: (s) => [{ side: s, isEnemy: false }],
  enemyFighter: (s) => [{ side: otherSide(s), isEnemy: true }],
  anyFighter: (s) => [
    { side: s, isEnemy: false },
    { side: otherSide(s), isEnemy: true },
  ],
  friendlyFighterThenLane: (s) => [{ side: s, isEnemy: false }],
};

const SPEC_NEEDS_DEST_LANE: Partial<Record<AnyTargetSpec, boolean>> = {
  friendlyFighterThenLane: true,
};

// 单个 fighter 此刻能否被指向(enumerate + validate 共用的布尔判定 → 二者永不漂移)。
export function isFighterTargetable(f: Fighter, opts: { isEnemyTarget: boolean; minAttack?: number }): boolean {
  if (f.gravestone) return false; // 未翻面,隐藏
  if (opts.isEnemyTarget && hasKeyword(f.keywords, 'untrickable')) return false; // untrickable 只挡敌方
  if (opts.minAttack !== undefined && f.attack < opts.minAttack) return false;
  return true;
}

// 合法目标枚举(UI 高亮)。none/无候选 → []。
export function enumerateTargets(
  state: GameState,
  side: Side,
  spec: AnyTargetSpec,
  opts?: { minAttack?: number },
): Target[] {
  const out: Target[] = [];
  for (const cand of SPEC_CANDIDATES[spec](side)) {
    state.lanes.forEach((ln, i) => {
      const f = ln[cand.side];
      if (f && isFighterTargetable(f, { isEnemyTarget: cand.isEnemy, minAttack: opts?.minAttack })) {
        out.push({ lane: i, side: cand.side });
      }
    });
  }
  return out;
}

// spec 对应的「必须指向友/敌」提示语(保留旧错误信息子串:friendly / enemy)。
function sideMismatchReason(spec: AnyTargetSpec): string {
  const cands = SPEC_CANDIDATES[spec]('plant');
  if (cands.length === 1) return cands[0].isEnemy ? 'must target an enemy fighter' : 'must target a friendly fighter';
  return 'must target a fighter';
}

// 校验一个目标(reduce 用)。合法 → null;否则返回原因串(含旧子串,供测试正则匹配)。
export function validateTarget(
  state: GameState,
  side: Side,
  spec: AnyTargetSpec,
  target: Target | undefined,
  opts?: { minAttack?: number },
): string | null {
  const cands = SPEC_CANDIDATES[spec](side);
  if (cands.length === 0) return null; // none / lane:无 fighter 目标
  if (!target) return `target required for ${spec}`;
  const cand = cands.find((c) => c.side === target.side);
  if (!cand) return sideMismatchReason(spec);
  const f = state.lanes[target.lane]?.[target.side];
  if (!f) return 'no fighter at target';
  // 按固定顺序给出最贴切原因(untrickable 优先于 minAttack:见 superpowers.test「untrickable at atk≥5」)。
  if (f.gravestone) return 'target is a hidden gravestone';
  if (cand.isEnemy && hasKeyword(f.keywords, 'untrickable')) return 'target is untrickable';
  if (opts?.minAttack !== undefined && f.attack < opts.minAttack) return `target attack must be ≥ ${opts.minAttack}`;
  return null;
}

// 目的 lane 校验(移动/放置类:friendlyFighterThenLane 等)。合法 → null。
export function validateDestLane(state: GameState, side: Side, spec: AnyTargetSpec, toLane: number | undefined): string | null {
  if (!SPEC_NEEDS_DEST_LANE[spec]) return null;
  if (toLane === undefined) return 'destination lane required';
  if (toLane < 0 || toLane >= state.lanes.length) return `bad lane ${toLane}`;
  if (state.lanes[toLane][side]) return `destination lane ${toLane} occupied`;
  return null;
}

// —— 超能力窗口 / 花费 ——
// 一次算清:此刻这方处于哪种可打超能力的窗口,以及中断窗口里「刚授予、可免费打」的那张 id。
export interface SuperpowerWindow {
  kind: 'interrupt' | 'trick' | null;
  freeId?: string; // interrupt:本回合刚授予、可免费即时打出的 SP id(pick 未选定 → undefined)
}

export function superpowerWindow(state: GameState, side: Side): SuperpowerWindow {
  if (state.phase === 'SUPERPOWER_INTERRUPT') {
    const head = state.interrupts?.[0];
    if (head?.side === side) return { kind: 'interrupt', freeId: head.spId };
    return { kind: null };
  }
  if (canPlayTrick(state, side)) return { kind: 'trick' };
  return { kind: null };
}

// 一张 SP 的花费:中断窗口内「刚授予那张」免费,其余(旧 SP / trick 窗口)= superpowerHandCost(默认 1)。
export function superpowerCostFor(state: GameState, side: Side, spId: string): number {
  const w = superpowerWindow(state, side);
  if (w.kind === 'interrupt' && w.freeId === spId) return 0;
  return state.config.superpowerHandCost ?? 1;
}

// 此刻本方实际可即时打出的 SP id 列表。
//   interrupt:仅「刚授予」那张(旧 SP 留到本方 trick 窗口);
//   trick:全部持有;其余窗口:空。与 reduce.playSuperpower 校验一致。
export function castableSuperpowerIds(state: GameState, side: Side): string[] {
  const w = superpowerWindow(state, side);
  const held = state[side].hero.readySuperpowers;
  if (w.kind === 'interrupt') return w.freeId ? [w.freeId] : [];
  if (w.kind === 'trick') return [...held];
  return [];
}
