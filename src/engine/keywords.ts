// 关键词注册表:引擎支持的全部关键词。JSON 卡池里出现的关键词必须 ∈ 此表(见 validateCardpool),
// hasKeyword/keywordValue 的 name 参数被约束为 Keyword —— 拼错在编译期即报错,不再默默失效。
export const KEYWORDS = [
  'armored', // armored:N —— 战斗伤害减 N
  'bullseye', // 命中 hero 无视 Super-Block Meter
  'strikethrough', // 同时命中对方 fighter 与 hero
  'deadly', // 造成 >0 伤害即摧毁(僵尸专属)
  'frenzy', // 存活且清空本 lane → bonus attack 打脸(僵尸专属)
  'gravestone', // 面朝下,植物阶段结束才翻面(僵尸专属)
  'untrickable', // 免疫敌方 trick / 超能力指向
  'cantBeHurt', // 本回合免伤(destroyIf 仍可摧毁)
] as const;

export type Keyword = (typeof KEYWORDS)[number];

// 带数值的关键词(形如 "armored:1")。其余关键词不带 :N。
export const VALUED_KEYWORDS: readonly Keyword[] = ['armored'];

export function isKeyword(s: string): s is Keyword {
  return (KEYWORDS as readonly string[]).includes(s);
}

// 解析 "armored:1" → { name:'armored', value:1 }。name 为裸串(可能非法,validateCardpool 负责拦截)。
export function parseKeyword(kw: string): { name: string; value: number | null } {
  const [name, val] = kw.split(':');
  return { name, value: val === undefined ? null : Number(val) };
}

export function keywordValue(keywords: string[], name: Keyword): number | null {
  for (const kw of keywords) {
    const p = parseKeyword(kw);
    if (p.name === name) return p.value ?? 0;
  }
  return null;
}

export function hasKeyword(keywords: string[], name: Keyword): boolean {
  return keywords.some((kw) => parseKeyword(kw).name === name);
}
