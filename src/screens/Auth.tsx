import { useState } from 'react';
import { Video, Mail, Lock, User, ArrowLeft, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { pushToast } from '@/lib/toast';

export default function Auth({ onAuthed }: { onAuthed: () => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) return setError('ایمیل و رمز عبور را وارد کنید');
    if (mode === 'signup' && !displayName.trim()) return setError('نام نمایشی خود را وارد کنید');
    setLoading(true);

    if (mode === 'signup') {
      const { error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { display_name: displayName.trim() } },
      });
      setLoading(false);
      if (err) {
        if (err.message.includes('already')) return setError('این ایمیل قبلاً ثبت شده است. وارد شوید.');
        return setError('ثبت‌نام ناموفق بود. رمز عبور باید حداقل ۶ کاراکتر باشد.');
      }
      pushToast('حساب کاربری ساخته شد', 'success');
      onAuthed();
    } else {
      const { error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      setLoading(false);
      if (err) return setError('ایمیل یا رمز عبور اشتباه است.');
      pushToast('خوش آمدید', 'success');
      onAuthed();
    }
  };

  return (
    <div className="fixed inset-0 min-h-screen flex items-center justify-center p-4 bg-slate-950 grid-bg overflow-y-auto">
      <div className="absolute top-0 right-1/4 w-[400px] h-[400px] bg-sky-500/20 rounded-full blur-[120px]" />
      <div className="absolute bottom-0 left-1/4 w-[380px] h-[380px] bg-cyan-500/15 rounded-full blur-[120px]" />

      <div className="relative w-full max-w-md anim-pop my-8">
        <div className="text-center mb-8">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 items-center justify-center shadow-xl shadow-sky-500/30 mb-4">
            <Video className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-white">SiraRoom</h1>
          <p className="text-sm text-slate-400 mt-1">پلتفرم جلسات آنلاین</p>
        </div>

        <div className="glass-strong rounded-3xl p-7 shadow-2xl">
          <div className="flex gap-1 p-1 rounded-xl bg-slate-800/60 mb-6">
            <button
              onClick={() => { setMode('signin'); setError(null); }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
                mode === 'signin' ? 'bg-gradient-to-l from-sky-500 to-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'
              }`}
            >
              ورود
            </button>
            <button
              onClick={() => { setMode('signup'); setError(null); }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
                mode === 'signup' ? 'bg-gradient-to-l from-sky-500 to-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'
              }`}
            >
              ثبت‌نام
            </button>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === 'signup' && (
              <label className="block">
                <span className="block text-xs font-medium text-slate-400 mb-1.5">نام نمایشی</span>
                <div className="relative">
                  <User className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    value={displayName}
                    onChange={(e) => { setDisplayName(e.target.value); setError(null); }}
                    placeholder="مثلاً: سارا محمدی"
                    className="input pr-10"
                    autoFocus
                  />
                </div>
              </label>
            )}
            <label className="block">
              <span className="block text-xs font-medium text-slate-400 mb-1.5">ایمیل</span>
              <div className="relative">
                <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(null); }}
                  placeholder="you@example.com"
                  dir="ltr"
                  className="input pr-10 text-left"
                  autoFocus={mode === 'signin'}
                />
              </div>
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-400 mb-1.5">رمز عبور</span>
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  placeholder="••••••••"
                  dir="ltr"
                  className="input pr-10 text-left"
                />
              </div>
            </label>

            {error && (
              <p className="text-xs text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-gradient-to-l from-sky-500 to-blue-600 text-white font-bold hover:scale-[1.01] transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> لطفاً صبر کنید...</>
              ) : mode === 'signin' ? (
                <>ورود به حساب <ArrowLeft className="w-4 h-4" /></>
              ) : (
                <>ساخت حساب کاربری <ArrowLeft className="w-4 h-4" /></>
              )}
            </button>
          </form>

          <p className="text-[11px] text-slate-500 text-center mt-5">
            {mode === 'signin' ? 'حساب کاربری ندارید؟ ' : 'حساب دارید؟ '}
            <button
              onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); }}
              className="text-sky-400 hover:text-sky-300 font-medium"
            >
              {mode === 'signin' ? 'ثبت‌نام کنید' : 'وارد شوید'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
