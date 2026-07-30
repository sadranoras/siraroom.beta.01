import { useState, useRef, useEffect } from 'react';
import { Users, Mic, MicOff, Video, VideoOff, Hand, Crown, X, ChevronDown, Presentation, PenLine, MonitorUp, FileUp, Shield } from 'lucide-react';
import type { Participant, Role } from '@/lib/presence';
import { canPerform } from '@/lib/presence';
import { avatarColor, initials, toPersianDigits } from '@/lib/utils';

type Props = {
  participants: Participant[];
  selfId: string;
  onRemove?: (id: string) => void;
  isHost: boolean;
  isOwner: boolean;
  onChangeRole?: (id: string, role: Role) => void;
  onToggleGrant?: (id: string, cap: 'mic' | 'cam' | 'board' | 'screen' | 'file', value: boolean) => void;
};

const ROLE_LABEL: Record<Role, string> = {
  host: 'میزبان',
  presenter: 'ارائه‌دهنده',
  viewer: 'تماشاچی',
};

const ROLE_BADGE: Record<Role, string> = {
  host: 'text-amber-400 bg-amber-500/15',
  presenter: 'text-sky-400 bg-sky-500/15',
  viewer: 'text-slate-400 bg-slate-700/50',
};

export default function ParticipantsPanel({ participants, selfId, onRemove, isHost, isOwner, onChangeRole, onToggleGrant }: Props) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuFor) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuFor(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuFor]);

  const sorted = [...participants].sort((a, b) => {
    const order: Record<Role, number> = { host: 0, presenter: 1, viewer: 2 };
    if (order[a.role] !== order[b.role]) return order[a.role] - order[b.role];
    if (a.handRaised !== b.handRaised) return a.handRaised ? -1 : 1;
    return a.joinedAt - b.joinedAt;
  });

  const roleIcon = (role: Role) =>
    role === 'host' ? <Crown className="w-3.5 h-3.5 text-amber-400" /> : null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800">
        <Users className="w-4 h-4 text-sky-400" />
        <h3 className="text-sm font-bold text-white">شرکت‌کنندگان</h3>
        <span className="text-xs text-slate-500 mr-auto">{toPersianDigits(participants.length)} نفر</span>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-1.5">
        {sorted.map((p) => {
          const isSelf = p.id === selfId;
          // The room owner can manage co-hosts (demote them back to viewer);
          // co-hosts can only manage presenters and viewers, not other hosts.
          const canManage = isHost && !isSelf && !p.isAdmin && (isOwner || p.role !== 'host');
          const showGrants = canManage;
          return (
            <div
              key={p.id}
              className="flex flex-col gap-2 p-2.5 rounded-xl hover:bg-slate-800/60 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className={`w-10 h-10 rounded-full ${avatarColor(p.name)} flex items-center justify-center text-white text-sm font-bold`}>
                    {initials(p.name)}
                  </div>
                  {p.isSpeaking && (
                    <span className="absolute -inset-0.5 rounded-full ring-2 ring-emerald-400 animate-pulse" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-white truncate">{p.name}</span>
                    {isSelf && <span className="text-[10px] text-sky-400">(شما)</span>}
                    {roleIcon(p.role)}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${ROLE_BADGE[p.role]}`}>{ROLE_LABEL[p.role]}</span>
                    {p.isAdmin && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 font-bold flex items-center gap-1">
                        <Shield className="w-3 h-3" /> مدیر
                      </span>
                    )}
                  </div>
                  {p.handRaised && (
                    <span className="text-[11px] text-amber-400 flex items-center gap-1 mt-0.5">
                      <Hand className="w-3 h-3" /> درخواست گفتگو
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${p.micOn ? 'text-slate-400' : 'bg-rose-500/20 text-rose-400'}`}>
                    {p.micOn ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                  </span>
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${p.camOn ? 'text-slate-400' : 'bg-slate-700 text-slate-500'}`}>
                    {p.camOn ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5" />}
                  </span>
                  {canManage && (
                    <div className="relative">
                      <button
                        onClick={() => setMenuFor(menuFor === p.id ? null : p.id)}
                        className="w-7 h-7 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 flex items-center justify-center transition-all"
                        title="مدیریت کاربر"
                      >
                        <ChevronDown className={`w-4 h-4 transition-transform ${menuFor === p.id ? 'rotate-180' : ''}`} />
                      </button>
                      {menuFor === p.id && (
                        <div
                          ref={menuRef}
                          className="absolute left-0 top-9 z-20 w-52 glass-strong rounded-xl p-2 shadow-2xl anim-pop"
                        >
                          <p className="text-[10px] text-slate-500 px-2 py-1">تغییر نقش</p>
                          {(['host', 'presenter', 'viewer'] as Role[])
                            .filter((r) => r !== 'host' || isOwner)
                            .map((r) => (
                            <button
                              key={r}
                              onClick={() => {
                                onChangeRole?.(p.id, r);
                                setMenuFor(null);
                              }}
                              className={`w-full text-right px-2 py-1.5 rounded-lg text-xs flex items-center gap-2 transition-colors ${
                                p.role === r ? 'bg-sky-500/20 text-sky-300' : 'text-slate-300 hover:bg-slate-700/60'
                              }`}
                            >
                              {ROLE_LABEL[r]}
                              {r === 'host' ? <Crown className="w-3 h-3 text-amber-400 mr-auto" /> : null}
                            </button>
                          ))}

                          {showGrants && (
                            <>
                              <div className="h-px bg-slate-700 my-2" />
                              <p className="text-[10px] text-slate-500 px-2 py-1">دسترسی‌های ویژه</p>
                              <GrantToggle label="میکروفون" icon={<Mic className="w-3.5 h-3.5" />} on={canPerform(p, 'mic')} onChange={(v) => onToggleGrant?.(p.id, 'mic', v)} />
                              <GrantToggle label="دوربین" icon={<Video className="w-3.5 h-3.5" />} on={canPerform(p, 'cam')} onChange={(v) => onToggleGrant?.(p.id, 'cam', v)} />
                              <GrantToggle label="وایت‌بورد" icon={<PenLine className="w-3.5 h-3.5" />} on={canPerform(p, 'board')} onChange={(v) => onToggleGrant?.(p.id, 'board', v)} />
                              <GrantToggle label="اشتراک صفحه" icon={<MonitorUp className="w-3.5 h-3.5" />} on={canPerform(p, 'screen')} onChange={(v) => onToggleGrant?.(p.id, 'screen', v)} />
                              <GrantToggle label="اشتراک فایل" icon={<FileUp className="w-3.5 h-3.5" />} on={canPerform(p, 'file')} onChange={(v) => onToggleGrant?.(p.id, 'file', v)} />
                            </>
                          )}

                          <div className="h-px bg-slate-700 my-2" />
                          <button
                            onClick={() => {
                              onRemove?.(p.id);
                              setMenuFor(null);
                            }}
                            className="w-full text-right px-2 py-1.5 rounded-lg text-xs text-rose-400 hover:bg-rose-500/20 flex items-center gap-2 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" /> حذف از جلسه
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GrantToggle({ label, icon, on, onChange }: { label: string; icon: React.ReactNode; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`w-full text-right px-2 py-1.5 rounded-lg text-xs flex items-center gap-2 transition-colors ${
        on ? 'text-emerald-300 bg-emerald-500/10' : 'text-slate-300 hover:bg-slate-700/60'
      }`}
    >
      {icon} {label}
      <span className={`mr-auto w-8 h-4 rounded-full relative transition-colors ${on ? 'bg-emerald-500' : 'bg-slate-600'}`}>
        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${on ? 'left-0.5' : 'right-0.5'}`} />
      </span>
    </button>
  );
}
