// 确定性 seeded RNG(mulberry32)。state 里存一个 uint32,每次 next 推进。
// 引擎纯函数:所有随机从 state.rng 派生,同 seed → 同序列(§3 determinism)。

export function seedFromString(s: string): number {
  // xmur3 hash → uint32 seed
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

// 返回 [nextState, float in [0,1)]
export function nextFloat(state: number): [number, number] {
  let t = (state + 0x6d2b79f5) | 0;
  const s = t >>> 0;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
  const val = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [s, val];
}

// 返回 [nextState, int in [min,max]] 闭区间等概率
export function nextInt(state: number, min: number, max: number): [number, number] {
  const [s, f] = nextFloat(state);
  return [s, min + Math.floor(f * (max - min + 1))];
}

// Fisher-Yates 洗牌,纯函数:返回 [nextState, shuffledCopy]
export function shuffle<T>(state: number, arr: readonly T[]): [number, T[]] {
  const out = arr.slice();
  let s = state;
  for (let i = out.length - 1; i > 0; i--) {
    let j: number;
    [s, j] = nextInt(s, 0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return [s, out];
}
