// 全局配置。数值调整走 cardpool.json;规则开关走这里。
export type SuperblockMode = 'faithful' | 'pick' | 'off';

export interface GameConfig {
  heroStartHp: number; // §4 双方各 20
  laneCount: number; // §4 五条 lane
  blockMeterMax: number; // §8.1 8 格
  blockChargeMin: number; // §8.1 随机 1~3
  blockChargeMax: number;
  superblock: { mode: SuperblockMode }; // §8.1 faithful(默认)/pick/off
  superblockOffEveryNTurns: number; // off 模式:每 N 回合自选一个 SP
  deckSize: number; // §10.3 每方 40
  maxCopies: number; // §10.3 每卡最多 4 份
  openingDraw: number; // §10.3 起手 draw 4
  drawPerTurn: number; // §10.3 每回合 start draw 1
  handSizeMax: number; // 手牌上限:≥此值时回合开始不再抽牌,且被击中不再充能 Super-Block(视同 bullseye)
}

export const DEFAULT_CONFIG: GameConfig = {
  heroStartHp: 20,
  laneCount: 5,
  blockMeterMax: 8,
  blockChargeMin: 1,
  blockChargeMax: 3,
  superblock: { mode: 'faithful' },
  superblockOffEveryNTurns: 3,
  deckSize: 30,
  maxCopies: 4,
  openingDraw: 4,
  drawPerTurn: 1,
  handSizeMax: 10,
};
