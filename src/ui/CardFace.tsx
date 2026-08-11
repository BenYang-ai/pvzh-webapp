import type { Card, Fighter } from '../engine/types.ts';
import { parseKeyword } from '../engine/deck.ts';

export const KEYWORD_ICON: Record<string, string> = {
  armored: '🛡',
  bullseye: '🎯',
  strikethrough: '⚔️',
  deadly: '☠️',
  frenzy: '⚡',
  gravestone: '🪦',
  untrickable: '🚫',
};

function KeywordIcons({ keywords }: { keywords: string[] }) {
  if (keywords.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-0.5 text-[10px] leading-none">
      {keywords.map((kw) => {
        const { name, value } = parseKeyword(kw);
        const icon = KEYWORD_ICON[name] ?? '•';
        return (
          <span key={kw} title={kw}>
            {icon}
            {value !== null ? value : ''}
          </span>
        );
      })}
    </span>
  );
}

// 渲染一张卡:手牌用印刷值(fighter 未定义),场上用 fighter 当前值 + 标记。
export function CardFace({
  card,
  fighter,
  compact = false,
}: {
  card: Card;
  fighter?: Fighter;
  compact?: boolean;
}) {
  const atk = fighter ? fighter.attack : card.attack;
  const hp = fighter ? fighter.health : card.health;
  const keywords = fighter ? fighter.keywords : card.keywords;
  const bg = card.art.placeholder.bg;
  // 手绘扫描覆盖 emoji 占位(§11.4)。相对路径 → 加 BASE_URL 适配部署子路径。
  const image = card.art.image ? `${import.meta.env.BASE_URL}${card.art.image}` : null;

  return (
    <div
      className={`relative flex h-full w-full flex-col justify-between rounded-md p-1 text-white shadow-sm ${
        compact ? 'text-[10px]' : 'text-xs'
      }`}
      style={
        image
          ? { backgroundImage: `url(${image})`, backgroundSize: 'cover', backgroundPosition: 'center' }
          : { background: bg }
      }
    >
      {/* cost 角标 */}
      {card.type === 'trick' || fighter === undefined ? (
        <span className="absolute -left-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/70 text-[10px]">
          {card.cost}
        </span>
      ) : null}

      {/* 状态标记 */}
      <span className="absolute right-0.5 top-0.5 text-[10px]">
        {fighter?.frozen ? '❄️' : ''}
        {fighter?.cantBeHurt ? '🛡️' : ''}
        {fighter?.gravestone ? '🪦' : ''}
      </span>

      {!image && (
        <div className="flex items-center justify-center text-lg leading-none">
          {card.art.placeholder.emoji}
        </div>
      )}
      <div
        className={`truncate text-center font-medium leading-tight ${image ? 'bg-black/50 rounded-sm' : ''}`}
      >
        {card.name}
      </div>
      <div className="flex items-end justify-between">
        <span className="rounded-sm bg-black/40 px-0.5 font-bold text-amber-200">{atk ?? ''}</span>
        <KeywordIcons keywords={keywords} />
        <span className="rounded-sm bg-black/40 px-0.5 font-bold text-red-200">{hp ?? ''}</span>
      </div>
    </div>
  );
}
