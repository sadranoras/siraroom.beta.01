import type { ReactionEvent } from '@/lib/presence';

const REACTIONS = ['👍', '❤️', '😂', '🎉', '👏', '😮', '⭐'];

export function ReactionPicker({ onSend }: { onSend: (emoji: string) => void }) {
  return (
    <div className="flex items-center gap-1 px-2 py-1.5 rounded-2xl glass-strong shadow-xl">
      {REACTIONS.map((r) => (
        <button
          key={r}
          onClick={() => onSend(r)}
          className="w-9 h-9 rounded-xl text-xl hover:bg-white/10 hover:scale-125 transition-all flex items-center justify-center"
        >
          {r}
        </button>
      ))}
    </div>
  );
}

export function ReactionOverlay({ reactions }: { reactions: ReactionEvent[] }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-30">
      {reactions.map((r) => {
        const left = (parseInt(r.id, 36) % 80) + 10;
        return (
          <div
            key={r.id}
            className="absolute bottom-8 text-3xl reaction-rise"
            style={{ left: `${left}%` }}
          >
            {r.emoji}
            <span className="block text-[11px] text-white/80 text-center mt-0.5 drop-shadow">{r.name}</span>
          </div>
        );
      })}
    </div>
  );
}
