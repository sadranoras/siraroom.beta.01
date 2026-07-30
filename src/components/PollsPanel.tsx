import { useEffect, useState } from 'react';
import { ThumbsUp, X, Plus, BarChart3, Check } from 'lucide-react';
import { supabase, type Poll, type PollVote } from '@/lib/supabase';
import { toPersianDigits, relativeTime } from '@/lib/utils';
import { pushToast } from '@/lib/toast';

type Props = {
  roomId: string;
  name: string;
  userId: string;
  allowPolls: boolean;
};

type PollWithVotes = Poll & { votes: PollVote[] };

export default function PollsPanel({ roomId, name, userId, allowPolls }: Props) {
  const [polls, setPolls] = useState<PollWithVotes[]>([]);
  const [creating, setCreating] = useState(false);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadPolls();
    const ch = supabase
      .channel(`polls:${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'polls', filter: `room_id=eq.${roomId}` },
        () => loadPolls(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'poll_votes' },
        () => loadPolls(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [roomId]);

  const loadPolls = async () => {
    const { data: ps } = await supabase
      .from('polls')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false });
    if (!ps) return;
    const ids = ps.map((p) => p.id);
    if (ids.length === 0) return setPolls([]);
    const { data: vs } = await supabase.from('poll_votes').select('*').in('poll_id', ids);
    const votesByPoll: Record<string, PollVote[]> = {};
    (vs || []).forEach((v) => {
      (votesByPoll[v.poll_id] ||= []).push(v);
    });
    setPolls(ps.map((p) => ({ ...p, votes: votesByPoll[p.id] || [] })));
  };

  const createPoll = async () => {
    const q = question.trim();
    const opts = options.map((o) => o.trim()).filter(Boolean);
    if (!q) return pushToast('سوال را وارد کنید', 'error');
    if (opts.length < 2) return pushToast('حداقل دو گزینه لازم است', 'error');
    setLoading(true);
    const { error } = await supabase.from('polls').insert({
      room_id: roomId,
      question: q,
      options: opts,
      created_by: name,
      is_open: true,
    });
    setLoading(false);
    if (error) return pushToast('ساخت نظرسنجی ناموفق بود', 'error');
    setQuestion('');
    setOptions(['', '']);
    setCreating(false);
    pushToast('نظرسنجی ایجاد شد', 'success');
  };

  const vote = async (poll: Poll, optionIndex: number) => {
    if (!poll.is_open) return;
    const { error } = await supabase.from('poll_votes').upsert(
      { poll_id: poll.id, voter_name: name, voter_user_id: userId, option_index: optionIndex },
      { onConflict: 'poll_id,voter_name' },
    );
    if (error) {
      if (error.code === '23505') return; // already voted — upsert handles it
      return pushToast('ثبت رای ناموفق بود', 'error');
    }
  };

  const closePoll = async (poll: Poll) => {
    await supabase.from('polls').update({ is_open: false }).eq('id', poll.id);
  };

  const deletePoll = async (poll: Poll) => {
    await supabase.from('polls').delete().eq('id', poll.id);
  };

  const myVote = (poll: PollWithVotes) => poll.votes.find((v) => v.voter_name === name)?.option_index;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800">
        <BarChart3 className="w-4 h-4 text-sky-400" />
        <h3 className="text-sm font-bold text-white">نظرسنجی‌ها</h3>
        {allowPolls && (
          <button
            onClick={() => setCreating((v) => !v)}
            className="mr-auto px-2.5 py-1 rounded-lg bg-sky-500/20 text-sky-300 text-xs font-bold hover:bg-sky-500/30 transition-colors flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> نظرسنجی جدید
          </button>
        )}
      </div>

      {creating && (
        <div className="p-4 border-b border-slate-800 space-y-3 anim-fade-up">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="سوال نظرسنجی..."
            className="input"
          />
          <div className="space-y-2">
            {options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={o}
                  onChange={(e) => setOptions((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder={`گزینه ${toPersianDigits(i + 1)}`}
                  className="input"
                />
                {options.length > 2 && (
                  <button
                    onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                    className="w-8 h-8 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/20 flex items-center justify-center"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOptions((prev) => [...prev, ''])}
              disabled={options.length >= 6}
              className="text-xs text-sky-300 hover:text-sky-200 flex items-center gap-1 disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" /> افزودن گزینه
            </button>
            <div className="flex items-center gap-2 mr-auto">
              <button onClick={() => setCreating(false)} className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white text-sm">
                انصراف
              </button>
              <button
                onClick={createPoll}
                disabled={loading}
                className="px-4 py-1.5 rounded-lg bg-sky-500 text-white text-sm font-bold hover:bg-sky-400 disabled:opacity-50"
              >
                {loading ? '...' : 'ایجاد'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3">
        {polls.length === 0 ? (
          <div className="text-center text-slate-500 text-sm py-8">
            <ThumbsUp className="w-8 h-8 mx-auto mb-2 opacity-40" />
            هنوز نظرسنجی‌ای وجود ندارد.
          </div>
        ) : (
          polls.map((poll) => {
            const total = poll.votes.length;
            const my = myVote(poll);
            return (
              <div key={poll.id} className="glass rounded-2xl p-4 anim-fade-up">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <h4 className="text-sm font-bold text-white">{poll.question}</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      توسط {poll.created_by} • {relativeTime(poll.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {poll.is_open ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-success-500/20 text-success-300">فعال</span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">بسته‌شده</span>
                    )}
                    <button onClick={() => deletePoll(poll)} className="w-6 h-6 rounded text-slate-500 hover:text-rose-400 flex items-center justify-center">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  {poll.options.map((opt, i) => {
                    const count = poll.votes.filter((v) => v.option_index === i).length;
                    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                    const voted = my === i;
                    return (
                      <button
                        key={i}
                        onClick={() => vote(poll, i)}
                        disabled={!poll.is_open}
                        className={`w-full text-right relative overflow-hidden rounded-xl px-3 py-2.5 border transition-all ${
                          voted
                            ? 'border-sky-500 bg-sky-500/10'
                            : 'border-slate-700 hover:border-slate-600 bg-slate-800/40'
                        } ${!poll.is_open ? 'cursor-default' : 'cursor-pointer'}`}
                      >
                        <div
                          className="absolute inset-y-0 right-0 bg-sky-500/15 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                        <div className="relative flex items-center justify-between">
                          <span className={`text-sm flex items-center gap-2 ${voted ? 'text-sky-200' : 'text-slate-200'}`}>
                            {voted && <Check className="w-3.5 h-3.5" />}
                            {opt}
                          </span>
                          <span className="text-xs text-slate-400">
                            {toPersianDigits(count)} ({toPersianDigits(pct)}٪)
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between mt-3 text-[11px] text-slate-500">
                  <span>مجموع: {toPersianDigits(total)} رای</span>
                  {poll.is_open && (
                    <button onClick={() => closePoll(poll)} className="text-slate-400 hover:text-amber-400">
                      بستن نظرسنجی
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
