import { Board } from './Board.tsx';

// M0: 仅渲染空 board(5 lane + 双 hero HP)。M4 接入引擎状态与交互。
export function App() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#0f1a12] p-2">
      <Board />
    </div>
  );
}
