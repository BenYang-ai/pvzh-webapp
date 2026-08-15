import { useState } from 'react';
import { checkSecret, grantAccess } from '../net/access.ts';

// 访问门:输入家庭口令才能进入。通过后写 localStorage,本设备只问一次。
export function Gate({ onUnlock }: { onUnlock: () => void }) {
  const [word, setWord] = useState('');
  const [wrong, setWrong] = useState(false);

  function submit() {
    if (checkSecret(word)) {
      grantAccess();
      onUnlock();
    } else {
      setWrong(true);
    }
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-3 rounded-xl bg-[#16241a] p-6 text-[#e8f0e8] shadow-lg">
      <h1 className="text-xl font-bold">🌱 vs 🧟 Card Game</h1>
      <p className="text-sm text-[#8fae95]">Enter the secret word to play.</p>
      <input
        value={word}
        autoFocus
        onChange={(e) => {
          setWord(e.target.value);
          setWrong(false);
        }}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="secret word"
        className="rounded-md bg-[#0f1a12] px-3 py-2 text-lg outline-none ring-1 ring-[#2a3d30] focus:ring-[#4a8f5a]"
      />
      {wrong && <p className="text-sm text-red-300">⚠ Wrong word — ask a grown-up.</p>}
      <button
        onClick={submit}
        className="rounded-md bg-sky-700 px-3 py-3 font-semibold hover:bg-sky-600"
      >
        Enter
      </button>
    </div>
  );
}
