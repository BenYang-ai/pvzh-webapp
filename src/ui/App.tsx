import { Board } from './Board.tsx';

// M4: 本地 god-view,双方手牌可见,点选出牌 + 推进阶段 + 观战 FIGHT。
// M5 联网时把 Board 拆成单侧视角 + Supabase 同步。
export function App() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#0f1a12] p-2">
      <Board />
    </div>
  );
}
