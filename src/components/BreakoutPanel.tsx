import { useState } from 'react';
import { Users, Plus, Shuffle, X, ArrowLeft, DoorOpen } from 'lucide-react';
import type { Participant } from '@/lib/presence';
import { avatarColor, initials, toPersianDigits } from '@/lib/utils';
import { pushToast } from '@/lib/toast';

type Props = {
  participants: Participant[];
  selfName: string;
  isHost: boolean;
  sendEvent: (event: string, payload: unknown) => void;
};

type Breakout = {
  id: string;
  name: string;
  members: Participant[];
};

export default function BreakoutPanel({ participants, selfName, isHost, sendEvent }: Props) {
  const [breakouts, setBreakouts] = useState<Breakout[]>([]);
  const [assigning, setAssigning] = useState<Record<string, string>>({});

  const createBreakout = () => {
    const id = Math.random().toString(36).slice(2, 8);
    setBreakouts((prev) => [...prev, { id, name: `اتاق فرعی ${toPersianDigits(prev.length + 1)}`, members: [] }]);
  };

  const removeBreakout = (id: string) => {
    setBreakouts((prev) => prev.filter((b) => b.id !== id));
    setAssigning((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        if (next[k] === id) delete next[k];
      });
      return next;
    });
  };

  const autoAssign = () => {
    if (breakouts.length === 0) {
      pushToast('ابتدا یک اتاق فرعی بسازید', 'error');
      return;
    }
    const next: Record<string, string> = {};
    const nonHost = participants.filter((p) => p.role !== 'host');
    nonHost.forEach((p, i) => {
      next[p.id] = breakouts[i % breakouts.length].id;
    });
    setAssigning(next);
    pushToast('اعضا به‌صورت تصادفی تقسیم شدند', 'success');
  };

  const broadcastAssignments = () => {
    const assignments = breakouts.map((b) => ({
      room: b.name,
      members: participants
        .filter((p) => assigning[p.id] === b.id)
        .map((p) => p.name),
    }));
    sendEvent('breakout', assignments);
    pushToast('اتاق‌های فرعی به اعضا اطلاع داده شد', 'success');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800">
        <Users className="w-4 h-4 text-sky-400" />
        <h3 className="text-sm font-bold text-white">اتاق‌های فرعی</h3>
        {isHost && (
          <div className="flex items-center gap-1 mr-auto">
            <button
              onClick={autoAssign}
              className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 text-xs font-bold hover:bg-amber-500/30 transition-colors flex items-center gap-1"
            >
              <Shuffle className="w-3.5 h-3.5" /> تقسیم خودکار
            </button>
            <button
              onClick={createBreakout}
              className="px-2.5 py-1 rounded-lg bg-sky-500/20 text-sky-300 text-xs font-bold hover:bg-sky-500/30 transition-colors flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> اتاق جدید
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3">
        {breakouts.length === 0 ? (
          <div className="text-center text-slate-500 text-sm py-8">
            <DoorOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
            اتاق فرعی‌ای ساخته نشده.
            {isHost && <p className="mt-2">برای شروع، یک اتاق فرعی بسازید.</p>}
          </div>
        ) : (
          breakouts.map((b) => {
            const members = participants.filter((p) => assigning[p.id] === b.id);
            return (
              <div key={b.id} className="glass rounded-2xl p-4 anim-fade-up">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-white">{b.name}</h4>
                  <button onClick={() => removeBreakout(b.id)} className="w-6 h-6 rounded text-slate-500 hover:text-rose-400 flex items-center justify-center">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-3 min-h-[28px]">
                  {members.length === 0 ? (
                    <span className="text-[11px] text-slate-500">هنوز عضوی اختصاص داده نشده</span>
                  ) : (
                    members.map((m) => (
                      <span key={m.id} className={`text-[11px] text-white px-2 py-0.5 rounded-full ${avatarColor(m.name)} flex items-center gap-1`}>
                        {initials(m.name)} {m.name}
                      </span>
                    ))
                  )}
                </div>
                {isHost && (
                  <select
                    value=""
                    onChange={(e) => {
                      if (!e.target.value) return;
                      setAssigning((prev) => ({ ...prev, [e.target.value]: b.id }));
                    }}
                    className="input text-xs py-1.5"
                  >
                    <option value="">+ افزودن عضو</option>
                    {participants
                      .filter((p) => assigning[p.id] !== b.id)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                )}
              </div>
            );
          })
        )}
      </div>

      {isHost && breakouts.length > 0 && (
        <div className="p-4 border-t border-slate-800">
          <button
            onClick={broadcastAssignments}
            className="w-full py-2.5 rounded-xl bg-gradient-to-l from-sky-500 to-blue-600 text-white font-bold text-sm hover:scale-[1.01] transition-transform flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" /> شروع اتاق‌های فرعی
          </button>
        </div>
      )}
    </div>
  );
}
