// 卡池 schema 校验:JSON 是「加一张卡 = 改数据」的入口,但 TS 只在编译期看类型,
// 运行期 poolJson 是 `as unknown as Cardpool` 的裸投射 —— 关键词/效果 kind/targeting 拼错不会报错,
// 只在那张卡被抽到时才怪异地失效。此函数把这些非法值一次性挑出来(测试 + dev 启动各跑一次)。
import type { Cardpool, Effect, Side } from './types.ts';
import { isKeyword, VALUED_KEYWORDS, parseKeyword } from './keywords.ts';

const SIDES: Side[] = ['plant', 'zombie'];
const CARD_TYPES = ['fighter', 'trick'];
const EFFECT_KINDS = [
  'damage',
  'buff',
  'draw',
  'rampResource',
  'destroyIf',
  'bounce',
  'freeze',
  'shield',
  'giveKeywordAll',
  'move',
  'bonusAttack',
];
const TARGET_REFS = ['chosen', 'random', 'fixedLane2', 'self']; // 字面 TargetRef(非 {lane,side})
const CARD_TARGETING = ['none', 'friendlyFighter', 'enemyFighter', 'anyFighter']; // TargetSpec
const SP_TARGETING = ['none', 'friendlyFighter', 'enemyFighter', 'friendlyFighterThenLane']; // SuperpowerTargeting
// id 特判、不走通用 effects 的招牌超能力(见 superpowers.ts):允许 effects 缺省。
const SPECIAL_SP_IDS = ['gs_precision_blast', 'sb_carried_away'];

function checkTargetRef(ref: unknown, where: string, out: string[]): void {
  if (typeof ref === 'string') {
    if (!TARGET_REFS.includes(ref)) out.push(`${where}: unknown target ref "${ref}"`);
    return;
  }
  if (ref && typeof ref === 'object' && 'lane' in ref && 'side' in ref) return; // {lane,side}
  out.push(`${where}: malformed target`);
}

function checkEffect(e: Effect, where: string, out: string[]): void {
  if (!EFFECT_KINDS.includes(e.kind)) {
    out.push(`${where}: unknown effect kind "${(e as { kind: string }).kind}"`);
    return;
  }
  if ('target' in e) checkTargetRef(e.target, `${where}.${e.kind}`, out);
  if (e.kind === 'giveKeywordAll') {
    if (!isKeyword(e.keyword)) out.push(`${where}.giveKeywordAll: unknown keyword "${e.keyword}"`);
    if (e.side !== 'friendly' && e.side !== 'enemy') out.push(`${where}.giveKeywordAll: bad side "${e.side}"`);
  }
}

function checkEffects(effects: Effect[] | undefined, where: string, out: string[]): void {
  for (const [i, e] of (effects ?? []).entries()) checkEffect(e, `${where}[${i}]`, out);
}

// 返回问题列表(空 = 卡池合法)。不抛异常 —— 调用方决定测试失败还是 console.error。
export function validateCardpool(pool: Cardpool): string[] {
  const out: string[] = [];
  const cards = pool.cards;

  // —— 卡定义 ——
  for (const [id, c] of Object.entries(cards)) {
    if (c.id !== id) out.push(`card "${id}": id field mismatch ("${c.id}")`);
    if (!SIDES.includes(c.faction)) out.push(`card "${id}": bad faction "${c.faction}"`);
    if (!CARD_TYPES.includes(c.type)) out.push(`card "${id}": bad type "${c.type}"`);
    for (const kw of c.keywords ?? []) {
      const { name, value } = parseKeyword(kw);
      if (!isKeyword(name)) out.push(`card "${id}": unknown keyword "${kw}"`);
      else if (value !== null && !VALUED_KEYWORDS.includes(name)) out.push(`card "${id}": keyword "${name}" takes no value`);
      else if (value !== null && Number.isNaN(value)) out.push(`card "${id}": keyword "${kw}" has non-numeric value`);
    }
    if (c.type === 'fighter' && (typeof c.attack !== 'number' || typeof c.health !== 'number'))
      out.push(`card "${id}": fighter needs numeric attack + health`);
    if (c.targeting && !CARD_TARGETING.includes(c.targeting)) out.push(`card "${id}": bad targeting "${c.targeting}"`);
    checkEffects(c.onPlay, `card "${id}".onPlay`, out);
    checkEffects(c.onDeath, `card "${id}".onDeath`, out);
    checkEffects(c.onReveal, `card "${id}".onReveal`, out);
  }

  // —— 牌表:引用的 id 存在、copies>0、faction 与所在侧一致 ——
  for (const side of SIDES) {
    for (const entry of pool.decklists[side] ?? []) {
      const c = cards[entry.id];
      if (!c) out.push(`decklist ${side}: unknown card "${entry.id}"`);
      else if (c.faction !== side) out.push(`decklist ${side}: card "${entry.id}" is faction "${c.faction}"`);
      if (!(entry.copies > 0)) out.push(`decklist ${side}: card "${entry.id}" copies must be > 0`);
    }
  }

  // —— 超能力 ——
  for (const side of SIDES) {
    for (const sp of pool.superpowers[side] ?? []) {
      if (sp.faction !== side) out.push(`superpower "${sp.id}": faction "${sp.faction}" ≠ ${side}`);
      if (!SP_TARGETING.includes(sp.targeting)) out.push(`superpower "${sp.id}": bad targeting "${sp.targeting}"`);
      if (!sp.effects && !SPECIAL_SP_IDS.includes(sp.id))
        out.push(`superpower "${sp.id}": no effects and not an id-special superpower`);
      checkEffects(sp.effects, `superpower "${sp.id}".effects`, out);
    }
  }

  return out;
}
