# 家庭卡牌对战 App — 技术规格书 (v1 Spec)

> 目的:一个 PvZ Heroes 规则的家用对战 web app,两台 iPad 联网对战(Ben vs 象象/豹豹)。
> 本文档供 Claude Code 阅读并产出实施计划。所有规则/关键词/超能力数据均已对照官方 PvZ Heroes 校验。
> 技术标识符、规则表、schema 一律用英文;散文说明用中文。

---

## 0. 法律边界 (Legal scope)

- 游戏**规则与机制不受版权保护**(game mechanics = idea 层),完整复刻 ruleset 合规。
- 受保护的是**表达层**:官方卡牌美术、商标 "Plants vs Zombies"。
- 本 app 为**纯私有家用、不分发、不上架**。美术走**自绘/手绘扫描**,不使用 EA 资源。
- 角色名 (Green Shadow / Super Brainz 等) 在私有语境下沿用无实际风险;若日后有任何分发意图,需全部 reskin 重命名。

---

## 1. 项目目标与非目标

### v1 目标
- 两名玩家在**两台 iPad** 上通过房间码联网对战。
- **规则保真度拉满**:忠实实现 PvZ Heroes 的非对称回合结构 + 完整关键词交互 + 两英雄各 4 个超能力 + Super-Block Meter。
- 单一英雄对局:**Green Shadow (植物)** vs **Super Brainz (僵尸)**。
- 精选卡池(~10 植物 + ~10 僵尸),每张规则完整。数据驱动,加卡=改 JSON。

### v1 非目标 (明确砍掉,列 roadmap)
- ❌ Team-Up(同 lane 叠放两个植物)。v1 每 lane 每侧单格单 fighter。见 §12 roadmap。
- ❌ 水路 (Amphibious) / 空中 lane 特性。v1 五条 lane 全地面。
- ❌ 其它英雄、卡组构筑器、账号系统、天梯、卡包、成就。
- ❌ 炫酷动画/音效/粒子。UI 极简,功能正确优先。
- ❌ 服务端权威校验(隐藏信息靠客户端不渲染,见 §10.4)。

---

## 2. 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 构建 | Vite + React + TypeScript | Claude Code 高效,类型安全对规则引擎关键 |
| 样式 | Tailwind CSS | 快速出 UI |
| 状态 | 纯 reducer (useReducer) 或 Zustand | **引擎必须是纯函数**,见 §5 |
| 联网 | Supabase Realtime | 免费额度覆盖一家人,无需自建服务器 |
| 部署 | Vercel (免费) | 配 PWA manifest,iPad "添加到主屏幕" |
| PWA | manifest + service worker | 全屏、类原生观感 |

---

## 3. 架构核心原则

**规则引擎 = 纯函数 reducer**,与 UI、网络完全解耦:

```ts
function reduce(state: GameState, action: GameAction): GameState
```

- 引擎不含任何 React / 网络 / 随机副作用。所有随机(抽牌洗牌、Block Meter 充能)通过**注入的 seeded RNG** 或在 action payload 里带入结果,保证**确定性**(determinism)——同 state + 同 action → 同结果。这是联网同步与可测试性的基石。
- 单机(hot-seat)与联网**共用同一引擎**,一行不改。网络层只是"把 action 广播、把 state 同步"的薄壳。
- 引擎必须有**单元测试**覆盖每个关键词交互(见 §12 里程碑)。

```
┌─────────────┐     action      ┌──────────────┐
│  React UI   │ ──────────────▶ │  Rule Engine │  (pure reducer)
│ (per-iPad)  │ ◀────────────── │  reduce()    │
└─────────────┘   new state     └──────────────┘
       │                                │
       ▼                                ▼
┌─────────────────────────────────────────────┐
│         Supabase Realtime (game row)         │
│   两台 iPad 订阅同一 game_id,同步 state     │
└─────────────────────────────────────────────┘
```

---

## 4. 棋盘与资源

- **Lanes**: 5 条,index 0–4,全地面(水/空特性 = roadmap)。战斗按 lane 0→4(left→right)顺序结算。
- **Hero HP**: 双方各 20。降到 ≤0 即负。
- **资源**: 植物用 `sun`,僵尸用 `brains`。
  - 每回合开始,当前行动方资源池设为 `turnNumber`(第 1 回合 =1,第 2 回合 =2 … 逐回合 +1,无硬上限但对局通常 10~12 回合内结束)。
  - **僵尸的 brains 在 zombie_play → zombie_tricks 两阶段之间不重置**(官方规则,延续同一池子)。
  - Sunflower 类 ramp 效果:下回合额外 +N(用 `bonusSunNextTurn` 追踪)。

---

## 5. 回合结构 (Turn structure) — 非对称核心

每个完整回合 = 4 个 phase,**僵尸每回合先手**:

```
TURN N:
  ── start ──   双方各 draw 1;当前双方资源池 = N (+ 任何 ramp bonus)
  1. ZOMBIE_PLAY   僵尸放 fighters + 打 tricks (花 brains)
  2. PLANT_PLAY    植物放 fighters + 打 tricks (花 sun)
  3. ZOMBIE_TRICKS 僵尸只能打 tricks 响应 (brains 池延续,不重置)
  4. FIGHT         逐 lane (0→4) 结算战斗
  ── end ──     检查胜负;turn++
```

**这套顺序就是 PvZ Heroes 的灵魂**:僵尸先亮 fighters(植物看得见)→ 植物针对性布防+buff → 僵尸拿到"最后手牌权"打 trick → 开打。信息不对称与博弈全在此。引擎必须严格按 phase 门控哪一方能出什么。

### phase 门控规则
- `ZOMBIE_PLAY`: 僵尸可 play fighter(任意空 lane 的己方格)+ play trick + use superpower(若 ready)。
- `PLANT_PLAY`: 植物同上(fighter + trick + superpower)。
- `ZOMBIE_TRICKS`: 僵尸**仅** trick + superpower(不可放 fighter)。
- Gravestone 僵尸在 `ZOMBIE_PLAY` 放下时**面朝下、隐藏**(植物看不到卡面/名称,仅知其存在于某 lane 与 cost 可选隐藏),在 `FIGHT` 阶段开始时**翻面**并结算 onReveal(若有)。见 §7 关键词。

---

## 6. 战斗结算算法 (FIGHT phase) — 精确规范

逐 lane `l` 从 0 到 4:

```
对每个 lane l:
  P = 该 lane 的植物 fighter (或 null)
  Z = 该 lane 的僵尸 fighter (或 null)

  // 官方规则:每 lane 内【僵尸先攻击】,再植物攻击。
  // 同时致死的平局 → 僵尸赢(因僵尸先手)。用"僵尸先结算"实现这一点。

  STEP 1 — 僵尸攻击:
    若 Z 存在:
      若 Z 有 Bullseye:
         → 伤害直接打 plantHero (无视 P),量 = Z.attack
         → (Bullseye 不触发 Super-Block Meter 充能, 见 §8)
      否则若 Z 有 Strikethrough:
         → 对 P 造成 Z.attack (P 存在时,Armored 减免)
         → 同时对 plantHero 造成 Z.attack (穿透)
      否则若 P 存在:
         → 对 P 造成 dmg = max(0, Z.attack − P.ArmoredValue)
         → 若 Z 有 Deadly 且 dmg>0 → 标记 P 致死
      否则 (lane 无 P):
         → 对 plantHero 造成 Z.attack  (→ 触发 Super-Block 充能, §8)

  STEP 2 — 植物攻击:
    若 P 存在:
      若 P 有 Bullseye:
         → 直接打 zombieHero, 量 = P.attack (不触发对方 Block? 见 §8 注)
      否则若 P 有 Strikethrough:
         → 对 Z 造成 P.attack (Armored 减免) + 对 zombieHero 造成 P.attack
      否则若 Z 存在(且 STEP1 后 Z 仍在场):
         → 对 Z 造成 dmg = max(0, P.attack − Z.ArmoredValue)
         → 若 P 有 Deadly 且 dmg>0 → 标记 Z 致死
      否则 (lane 无 Z):
         → 对 zombieHero 造成 P.attack (→ 触发 Super-Block 充能)

  STEP 3 — 结算死亡:
    HP ≤ 0 或被 Deadly 标记的 fighter 从 lane 移除,触发其 onDeath(若有)。

  STEP 4 — Frenzy (僵尸专属):
    若 Z 有 Frenzy 且 Z 在本 lane 战斗后【存活】且【本次摧毁了 P】:
      → Z 做一次 bonus attack 进入现已清空的 lane → 打 plantHero (量 = Z.attack)
      → (若未来有多 fighter/Team-Up,Frenzy 可连续清场;v1 单格,一次即打脸)

结束逐 lane 后:检查 heroHP ≤ 0 → gameover。
```

**关键实现注意**:
- 伤害取**攻击快照**还是实时?v1 采用**逐 lane 顺序结算**(非全局同时),lane 内僵尸先手——这与官方"僵尸先攻击、平局僵尸胜"一致。fighter 攻击力在其攻击瞬间取当前值。
- Armored N:受到 fighter 战斗伤害时减 N(**不减免** trick/superpower 的直接伤害,除非另行规定——遵循官方:Armored 只减 combat damage)。
- Deadly:任何 >0 的战斗伤害即致死目标 fighter(对 hero 无特殊)。

---

## 7. 关键词 (Keywords) — v1 完整集

关键词以字符串数组存于卡上,带值的用 `keyword:N`。

| Keyword | 归属 | 定义 (v1 实现) |
|---|---|---|
| `armored:N` | 通用 | 受 combat 伤害时减免 N。 |
| `bullseye` | 通用 | 攻击直接命中对方 hero,无视该 lane 阻挡;不触发对方 Super-Block 充能。 |
| `strikethrough` | 通用 | 攻击同时命中该 lane 的对方 fighter 与对方 hero。 |
| `deadly` | 通用 | 造成 >0 combat 伤害即摧毁对方 fighter。 |
| `frenzy` | 僵尸 | 若摧毁对方 fighter 且自身存活,做一次 bonus attack。 |
| `gravestone` | 僵尸 | 在 zombie_play 放下时隐藏(植物不可见/不可被指向),FIGHT 开始时翻面。 |

**Roadmap 关键词**(spec 里预留但 v1 不实现):`team-up`, `amphibious`, `double-strike`(植物版 frenzy), `anti-hero`, `splash:N`, `overshoot:N`, `hunt`, `dino-roar`。

---

## 8. 英雄与超能力 (Heroes & Superpowers)

### 8.1 Super-Block Meter (超能力获取机制,v1 忠实实现)

官方机制,决定超能力如何获得:

- 每个 hero 有一条 8 格的 Super-Block Meter。
- **本方 hero 每次被 fighter 攻击命中**(非 Bullseye、非 trick),充能**随机 1~3 格**(等概率)。
  - RNG 必须走注入的 seeded 随机,以保证联网确定性(充能结果在 action payload 里带入)。
- 累计 ≥8 时:该次触发的攻击被**完全格挡**(伤害归零),Meter 清零,本方获得**一个从自己 4 个超能力中随机抽取**的超能力,进入 `readySuperpower` 槽。
- `readySuperpower` 在本方 play phase 可打出,**cost 0**(超能力不占资源,不占卡组)。一次持有一个;用掉后槽位空,等下次充满再获得。

> 简化开关(config flag `superblock.mode`):
> - `"faithful"` = 上述随机机制(默认)。
> - `"pick"` = 充满后让玩家从 4 个里**自选**(对孩子更友好,便于教学)。
> - `"off"` = 关闭 Meter,改为每方每 3 回合自选一个超能力(最简)。
> 三种模式引擎都要支持,默认 faithful。

### 8.2 Green Shadow (植物英雄) — 全 4 超能力

Class: Mega-Grow / Smarty. HP 20.

| SP id | 名称 | 效果 (v1 实现) | targeting |
|---|---|---|---|
| `gs_precision_blast` | Precision Blast (signature) | 对**中路 lane (index 2)** 造成 5 伤害;该 lane 有僵尸则打僵尸,否则打 zombieHero。 | none (固定中路) |
| `gs_whirlwind` | Whirlwind | 将**一个随机僵尸** bounce 回其拥有者手牌。 | none (随机) |
| `gs_big_chill` | Big Chill | Freeze 一个指定僵尸(冻结:跳过它下一次攻击);然后 draw 1。 | enemyFighter |
| `gs_embiggen` | Embiggen | 一个指定植物 +2/+2。 | friendlyFighter |

### 8.3 Super Brainz (僵尸英雄) — 全 4 超能力

Class: Brainy / Sneaky. HP 20.

| SP id | 名称 | 效果 (v1 实现) | targeting |
|---|---|---|---|
| `sb_carried_away` | Carried Away (signature) | 将一个指定僵尸移到另一指定 lane;它 +1/+1;然后它立即做一次 bonus attack。 | zombieFighter → lane |
| `sb_telepathy` | Telepathy | Draw 2 cards. | none |
| `sb_cut_down` | Cut Down to Size | 摧毁一个 strength(attack)≥5 的指定植物。 | enemyFighter (attack≥5) |
| `sb_super_stench` | Super Stench | 场上所有僵尸获得 `deadly`;然后 draw 1。 | none |

**Freeze 机制** (Big Chill 需要):fighter 上加 `frozen: true` 标记,其下一次攻击被跳过后清除标记。引擎需在 FIGHT 的 STEP1/STEP2 前检查 frozen。
**Bounce 机制** (Whirlwind / Backyard Bounce 需要):fighter 回到拥有者手牌,清除所有临时 buff/标记,恢复印刷值(printed stats)。
**Move + Bonus Attack** (Carried Away 需要):可复用 §6 的单 fighter 攻击子程序(`performAttack(fighter, lane)`)。

---

## 9. 卡牌数据 schema (数据驱动核心)

```ts
type Card = {
  id: string;                    // 唯一,如 "plant_peashooter"
  name: string;
  faction: 'plant' | 'zombie';
  cost: number;
  type: 'fighter' | 'trick';
  attack?: number;               // fighter
  health?: number;               // fighter (印刷值 printed)
  keywords: string[];            // 如 ["armored:1"], ["bullseye"]
  classes: string[];             // ["mega-grow"], ["brainy","sneaky"] — v1 展示用
  onPlay?: Effect[];             // trick 效果 / fighter 的 ETB
  onDeath?: Effect[];            // 死亡触发 (roadmap 预留)
  onReveal?: Effect[];           // gravestone 翻面触发 (预留)
  targeting?: TargetSpec;        // 打出时需指向
  art: {
    placeholder: { emoji: string; bg: string };  // v1 占位:emoji + 背景色 hex
    image: string | null;        // 手绘扫描 URL,非 null 时覆盖 placeholder (见 §11.4)
  };
};

type Effect =
  | { kind: 'damage'; amount: number; target: TargetRef }
  | { kind: 'buff'; attack: number; health: number; target: TargetRef }
  | { kind: 'draw'; count: number; side: 'self' }
  | { kind: 'rampResource'; amount: number }        // 下回合 +amount 资源
  | { kind: 'destroyIf'; stat: 'attack'|'health'; op: '>='|'<='; value: number; target: TargetRef }
  | { kind: 'bounce'; target: TargetRef }
  | { kind: 'freeze'; target: TargetRef }
  | { kind: 'giveKeywordAll'; keyword: string; side: 'friendly'|'enemy' }
  | { kind: 'move'; target: TargetRef; toLane: number }
  | { kind: 'bonusAttack'; target: TargetRef };

type TargetSpec =
  | 'none'
  | 'friendlyFighter' | 'enemyFighter' | 'anyFighter'
  | 'lane' | 'enemyFighterThenLane';   // Carried Away 是 fighter+lane 两段指向

type TargetRef = { lane: number; side: 'plant'|'zombie' } | 'random' | 'fixedLane2' | 'self';
```

**新增卡 = 往卡池 JSON 加一条,不改引擎。** 引擎的 effect 解释器覆盖上述所有 `kind`。

---

## 10. 起始卡池 (v1 fixed pool)

每方牌组用下列卡池按 §10.3 配比组成。数值为 `cost · attack/health · keywords`。

### 10.1 植物卡池 (Green Shadow)

| id | name | cost | atk/hp | keywords | onPlay |
|---|---|---|---|---|---|
| `p_peashooter` | Peashooter | 1 | 2/2 | — | — |
| `p_sunflower` | Sunflower | 1 | 1/2 | — | rampResource +1 |
| `p_cabbagepult` | Cabbage-pult | 2 | 3/2 | — | — |
| `p_wallnut` | Wall-nut | 2 | 0/6 | armored:1 | — |
| `p_cactus` | Cactus | 3 | 2/3 | bullseye | — |
| `p_bonkchoy` | Bonk Choy | 3 | 4/3 | — | — |
| `p_threepeater` | Threepeater | 4 | 3/4 | strikethrough | — |
| `p_snapdragon` | Snapdragon | 5 | 4/5 | deadly | — |
| `p_cherrybomb` | Cherry Bomb *(trick)* | 3 | — | — | damage 4 → enemyFighter |
| `p_fertilize` | Fertilize *(trick)* | 1 | — | — | buff +1/+1 → friendlyFighter |

### 10.2 僵尸卡池 (Super Brainz)

| id | name | cost | atk/hp | keywords | onPlay |
|---|---|---|---|---|---|
| `z_imp` | Imp | 1 | 2/1 | — | — |
| `z_basic` | Basic Zombie | 2 | 3/2 | — | — |
| `z_conehead` | Conehead Zombie | 2 | 3/4 | armored:1 | — |
| `z_sneaky` | Sneaky Zombie | 2 | 4/2 | gravestone | — |
| `z_toxicimp` | Toxic Imp | 3 | 2/2 | deadly | — |
| `z_ninja` | Zombie Ninja | 3 | 4/2 | frenzy | — |
| `z_capecod` | Cape Cod Squad | 4 | 5/3 | — | — |
| `z_wizardgarg` | Wizard Gargantuar | 5 | 6/6 | bullseye | — |
| `z_nibble` | Nibble *(trick)* | 2 | — | — | damage 3 → enemyFighter |
| `z_bounce` | Backyard Bounce *(trick)* | 3 | — | — | bounce → enemyFighter |

### 10.3 牌组配比
- v1 每方牌组 = 上述 10 张卡各放若干份,凑成 **30 张**(config 可调;真实 PvZH 是 40)。建议:8 张 fighter 各 3 份 = 24,2 张 trick 各 3 份 = 6,合计 30。
- 每卡最多 4 份(沿用官方上限)。
- 开局起手 **draw 4**,每回合 start draw 1。牌库抽空 = 后续每回合改为 hero 受 1 点 "疲劳" 伤害(fatigue,防止卡库僵局;config 可关)。

### 10.4 平衡说明
数值是**起点估算**,非终值。豹豹是 FIDE 选手,预期他会很快找到强势线(Wizard Gargantuar bullseye / Sneaky Zombie gravestone 偷伤;植物侧 Wall-nut 拖 + Threepeater strikethrough)。Claude Code 应把所有数值抽到一个 `cardpool.json`,便于你和孩子**打完一局就调**。

---

## 11. 联网层 (Supabase Realtime)

### 11.1 房间流程
1. 玩家 A(host)开局 → 生成 4~6 位房间码(room code)→ 选边(plant/zombie)。
2. 玩家 B 输入房间码 → 加入 → 自动分到另一边。
3. 双方 ready → host 用 seeded RNG 初始化牌库/发牌 → 写入 game row → 开打。

### 11.2 数据模型
```
table games:
  id            uuid pk
  room_code     text unique
  state         jsonb        -- 完整 GameState (含 seed)
  turn_owner    text         -- 'plant' | 'zombie' | phase 归属锁
  rng_seed      text
  updated_at    timestamptz
```

### 11.3 同步模型
- 两台 iPad 均 `subscribe` 同一 `game_id` 的 realtime channel。
- 行动方本地 `reduce(state, action)` 算出 newState → **乐观更新本地** + 写回 `games.state`。
- 另一台收到 realtime update → 用服务器 state 覆盖本地(server state wins on conflict)。
- **回合归属锁**:`turn_owner` 字段防双写;仅当 `turn_owner === mySide && phase 允许我行动` 时本地才接受 input。
- 回合制无延迟要求,乐观更新 + last-write-wins 足够;冲突极罕见。

### 11.4 隐藏信息 (诚实取舍)
- 完整 state(含双方手牌)都在共享 row 里。**隐藏靠客户端选择不渲染对方的手**,非加密。
- 象象若开 Safari 开发者工具理论上能偷看对方手牌 / gravestone 卡面。
- 对 7 岁 + 11 岁家庭对战,不构成实际威胁,**v1 不处理**。真要防需把权威逻辑搬到 Supabase Edge Function 服务端跑 —— 列 roadmap,v1 跳过。

---

## 12. UI 规格

### 12.1 屏幕/状态
- `LOBBY`: 创建/加入房间,选边,room code 显示与输入。
- `BOARD`: 主对战界面。
- `GAMEOVER`: 胜负 + 再来一局。

### 12.2 Board 布局 (iPad 横屏优先)
```
┌──────────────────────────────────────────────┐
│  对方 Hero  [HP 20] [Block Meter ▮▮▯▯▯▯▯▯]     │  ← 对方手牌只显示【背面张数】
│  ┌────┬────┬────┬────┬────┐                    │
│  │ L0 │ L1 │ L2 │ L3 │ L4 │  ← 对方 fighter 行 │
│  ├────┼────┼────┼────┼────┤                    │
│  │ L0 │ L1 │ L2 │ L3 │ L4 │  ← 己方 fighter 行 │
│  └────┴────┴────┴────┴────┘                    │
│  己方 Hero  [HP 20] [Block Meter] [资源: ☀ N]   │
│  ┌──────────────────────────────────────┐      │
│  │  己方手牌 (正面, 可点选)              │      │
│  └──────────────────────────────────────┘      │
│  [阶段指示: ZOMBIE_PLAY]   [结束阶段 ▶]         │
└──────────────────────────────────────────────┘
```

### 12.3 交互
- **出 fighter**:点手牌 → 高亮可放的空 lane 格 → 点 lane 落子(资源不足则禁用+提示)。
- **出 trick / 超能力(需指向)**:进入 **targeting 模式** → 高亮合法目标 → 点目标结算 → 退出 targeting。
- **Carried Away** 两段指向:先点僵尸 → 再点目标 lane。
- **阶段推进**:每 phase 一个 "结束阶段" 按钮,推进到下一 phase。
- **gravestone**:己方看得到卡面,对方只看到一块墓碑占位。FIGHT 翻面时给个简单翻转过渡。
- 文案:用玩家控制的语言("放下 / 攻击 / 结束阶段"),active voice,sentence case。失败态给明确原因("阳光不足",而非静默禁用)。

### 12.4 美术:占位 + 手绘扫描接口
- v1 每张卡渲染为**色块 + emoji + 攻/血/关键词图标**(数据来自 `art.placeholder`)。
- **预留手绘替换**:`art.image` 字段非 null 时,卡面用该图 URL 覆盖 placeholder。
- 提供一个极简 **卡面上传/映射**流程(v1 可只做:把手绘扫描图放进 `/public/cards/{id}.png`,构建时若文件存在则 `art.image = "/cards/{id}.png"`)。这样象象豹豹画完卡、扫描、丢进目录即生效,无需改代码。
- 关键词图标用简单 SVG/emoji 集(🎯bullseye ⚔️strikethrough ☠️deadly 🛡armored ⚡frenzy 🪦gravestone)。

---

## 13. 建议构建顺序 (里程碑)

| # | 里程碑 | 交付 | 验收 |
|---|---|---|---|
| M0 | 脚手架 | Vite+React+TS+Tailwind,空 board 渲染 | 5 lane + 双 hero HP 显示 |
| M1 | **纯引擎 + 单测** | `reduce()`、卡池 JSON、回合结构、资源、抽牌 | 单测:出牌/资源门控/phase 推进通过 |
| M2 | **战斗结算 + 关键词** | §6 FIGHT 算法 + 全 6 关键词 | 单测:每个关键词交互 case 通过(尤其 bullseye/strikethrough/deadly/frenzy/gravestone 组合) |
| M3 | 超能力 + Block Meter | 两英雄各 4 SP + §8.1 三模式 | 单测:8 个 SP 效果正确;Meter 充能/格挡/授予 |
| M4 | Hot-seat UI | 单机可玩(带简单遮屏过渡),targeting 模式 | Ben 能一台 iPad 跑通整局 |
| M5 | **Supabase 联网** | 房间码、订阅同步、回合锁 | 两台 iPad 跑通整局 |
| M6 | PWA + 部署 | manifest/SW,Vercel 上线 | iPad "添加到主屏幕" 全屏可玩 |
| M7 | 手绘接管 | §11.4 卡面替换流程 | 扫描图丢目录即生效 |

> 引擎(M1–M3)是项目 80% 的真正复杂度且完全离线可测——**先把引擎和单测做扎实,UI 和联网都是薄壳。** 建议 M4 先做 hot-seat 验证手感,再上 M5 联网。

---

## 14. Roadmap (v2+)

- Team-Up(同 lane 叠植物)→ 需把 lane 的 fighter 从单槽改为**有序数组**,重写 §6 结算为多 fighter 循环。
- 水路/空中 lane + Amphibious / 飞行。
- 更多关键词:double-strike, splash, overshoot, anti-hero, hunt, dino-roar。
- 更多英雄(各自 4 超能力 + class 卡池限制)。
- 卡组构筑器。
- 服务端权威(Edge Function)彻底隐藏手牌/gravestone,防偷看。
- 战斗动画/音效。

---

## 15. 给 Claude Code 的执行提示

1. **先读本 spec 全文,产出实施计划**(文件树、模块划分、里程碑拆解),再动手。
2. **引擎优先、纯函数、determinism**:所有随机走注入的 seeded RNG,结果进 action payload。
3. **数值全抽到 `cardpool.json`**,便于家庭平衡调整。
4. **每个关键词交互都要单元测试**(这是保真度的护栏,也是回归防线)。
5. 卡牌名沿用官方仅限私有;`art.placeholder` 占位,`art.image` 预留手绘。
6. 有规则歧义时,以本 spec §6/§7/§8 的明文定义为准,不要凭对 PvZ Heroes 的记忆改写。
