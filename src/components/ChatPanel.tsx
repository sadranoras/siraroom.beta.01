import { useEffect, useRef, useState } from 'react';
import { Send, MessageSquare, Pencil, Check, X, Trash2, Bell, BellOff } from 'lucide-react';
import { supabase, type Message } from '@/lib/supabase';
import { formatFaTime, avatarColor, initials, toPersianDigits } from '@/lib/utils';
import { pushToast } from '@/lib/toast';

type Props = {
  roomId: string;
  roomSlug: string;
  name: string;
  userId: string;
};

export default function ChatPanel({ roomId, name, userId }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [notifyOn, setNotifyOn] = useState(() => {
    return localStorage.getItem('chat-notify') !== 'false';
  });
  const listRef = useRef<HTMLDivElement>(null);
  const lastSenderRef = useRef<string | null>(null);

  useEffect(() => {
    supabase
      .from('messages')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })
      .limit(200)
      .then(({ data }) => {
        if (data) setMessages(data);
        setLoading(false);
      });

    const ch = supabase
      .channel(`chat:${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const msg = payload.new as Message;
          setMessages((prev) => [...prev, msg]);
          if (notifyOn && msg.sender_user_id !== userId && !msg.is_system) {
            pushToast(`پیام جدید از ${msg.sender_name}`, 'info');
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
        (payload) => {
          setMessages((prev) => prev.filter((m) => m.id !== payload.old.id));
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const updated = payload.new as Message;
          setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [roomId, userId, notifyOn]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const toggleNotify = () => {
    const next = !notifyOn;
    setNotifyOn(next);
    localStorage.setItem('chat-notify', String(next));
  };

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    const optimistic: Message = {
      id: crypto.randomUUID(),
      room_id: roomId,
      sender_name: name,
      sender_user_id: userId,
      sender_avatar: avatarColor(name),
      content: t,
      is_system: false,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    const { data, error } = await supabase.from('messages').insert({
      room_id: roomId,
      sender_name: name,
      sender_user_id: userId,
      sender_avatar: avatarColor(name),
      content: t,
      is_system: false,
    }).select().single();
    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      pushToast('خطا در ارسال پیام', 'error');
      return;
    }
    setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? data : m)));
  };

  const deleteMsg = async (m: Message) => {
    setMessages((prev) => prev.filter((msg) => msg.id !== m.id));
    const { error } = await supabase.from('messages').delete().eq('id', m.id);
    if (error) {
      setMessages((prev) => [...prev, m]);
      pushToast('خطا در حذف پیام', 'error');
    }
  };

  const startEdit = (m: Message) => {
    setEditingId(m.id);
    setEditText(m.content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  const saveEdit = async (m: Message) => {
    const t = editText.trim();
    if (!t) return;
    setMessages((prev) => prev.map((msg) => (msg.id === m.id ? { ...msg, content: t } : msg)));
    setEditingId(null);
    setEditText('');
    const { error } = await supabase.from('messages').update({ content: t }).eq('id', m.id);
    if (error) {
      setMessages((prev) => prev.map((msg) => (msg.id === m.id ? { ...msg, content: m.content } : msg)));
      pushToast('خطا در ویرایش پیام', 'error');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800">
        <MessageSquare className="w-4 h-4 text-sky-400" />
        <h3 className="text-sm font-bold text-white">چت جلسه</h3>
        <span className="text-xs text-slate-500 mr-auto">{toPersianDigits(messages.filter((m) => !m.is_system).length)} پیام</span>
        <button
          onClick={toggleNotify}
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors text-slate-400 hover:text-white hover:bg-slate-800"
          title={notifyOn ? 'خاموش کردن نوتیف' : 'روشن کردن نوتیف'}
        >
          {notifyOn ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
        </button>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3">
        {loading ? (
          <div className="text-center text-slate-500 text-sm py-8">در حال بارگذاری...</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-slate-500 text-sm py-8">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
            هنوز پیامی ارسال نشده. اولین نفر باش!
          </div>
        ) : (
          messages.map((m) =>
            m.is_system ? (
              <div key={m.id} className="text-center">
                <span className="inline-block text-[11px] text-slate-500 bg-slate-800/60 px-2.5 py-1 rounded-full">
                  {m.content}
                </span>
              </div>
            ) : (
              <div key={m.id} className={`flex gap-2.5 anim-fade-up ${m.sender_name === name ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-full ${m.sender_avatar || avatarColor(m.sender_name)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                  {initials(m.sender_name)}
                </div>
                <div className={`flex-1 min-w-0 ${m.sender_name === name ? 'items-end' : ''} flex flex-col`}>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-bold text-slate-300">
                      {m.sender_name === name ? 'شما' : m.sender_name}
                    </span>
                    <span className="text-[10px] text-slate-500">{formatFaTime(m.created_at)}</span>
                    {m.sender_user_id === userId && editingId !== m.id && (
                      <>
                        <button
                          onClick={() => startEdit(m)}
                          className="text-slate-500 hover:text-sky-400 transition-colors"
                          title="ویرایش"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => deleteMsg(m)}
                          className="text-slate-500 hover:text-rose-400 transition-colors"
                          title="حذف"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </>
                    )}
                  </div>
                  {editingId === m.id ? (
                    <div className="flex flex-col gap-1.5 max-w-[85%]">
                      <input
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(m); }
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        autoFocus
                        className="text-sm rounded-xl px-3 py-2 bg-slate-800 text-white outline-none border border-sky-500 focus:border-sky-400"
                      />
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => saveEdit(m)}
                          className="w-7 h-7 rounded-lg bg-sky-500 text-white flex items-center justify-center hover:bg-sky-400 transition-colors"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="w-7 h-7 rounded-lg bg-slate-700 text-slate-300 flex items-center justify-center hover:bg-slate-600 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className={`text-sm rounded-2xl px-3 py-2 max-w-[85%] break-words ${
                      m.sender_name === name
                        ? 'bg-sky-500/20 text-sky-50 rounded-tr-sm'
                        : 'bg-slate-800 text-slate-100 rounded-tl-sm'
                    }`}>
                      {m.content}
                    </div>
                  )}
                </div>
              </div>
            ),
          )
        )}
      </div>

      <div className="p-3 border-t border-slate-800">
        <div className="flex items-center gap-2 bg-slate-800/70 rounded-xl px-3 py-2 border border-slate-700 focus-within:border-sky-500 transition-colors">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
            placeholder="پیام بنویسید..."
            className="flex-1 bg-transparent outline-none text-sm text-white placeholder-slate-500"
          />
          <button
            onClick={send}
            disabled={!text.trim()}
            className="w-8 h-8 rounded-lg bg-sky-500 text-white flex items-center justify-center hover:bg-sky-400 transition-colors disabled:opacity-40"
          >
            <Send className="w-4 h-4 -scale-x-100" />
          </button>
        </div>
      </div>
    </div>
  );
}
