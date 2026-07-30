import { useEffect, useState, lazy, Suspense } from 'react';
import Auth from '@/screens/Auth';
import Landing from '@/screens/Landing';
import { supabase, type Room as RoomRow, type Profile } from '@/lib/supabase';
import { avatarColor, initials } from '@/lib/utils';
import { Video, ArrowLeft, Loader2 } from 'lucide-react';
import Toaster from '@/components/Toaster';

const Room = lazy(() => import('@/screens/Room'));

type View =
  | { kind: 'landing' }
  | { kind: 'lobby'; slug: string }
  | { kind: 'room'; slug: string };

export default function App() {
  const [session, setSession] = useState<'loading' | 'out' | 'in'>('loading');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [view, setView] = useState<View>({ kind: 'landing' });

  // Load session once, then subscribe to auth changes.
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) {
        setSession('in');
        loadProfile(data.session.user.id);
      } else {
        setSession('out');
      }
    }).catch(() => { if (active) setSession('out'); });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      (async () => {
        if (sess?.user) {
          setSession('in');
          loadProfile(sess.user.id);
        } else {
          setSession('out');
          setProfile(null);
          setView({ kind: 'landing' });
        }
      })();
    });

    return () => { active = false; sub.subscription.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (data) {
      setProfile(data as Profile);
      return;
    }
    // Profile row missing (trigger lagged or failed). Create a fallback row
    // so the user isn't stuck on the login screen while signed in.
    const { data: authUser } = await supabase.auth.getUser();
    const name = authUser?.user?.user_metadata?.display_name || authUser?.user?.email || 'کاربر';
    const { data: inserted } = await supabase
      .from('profiles')
      .upsert({ id: userId, display_name: name, avatar_color: null, is_admin: false })
      .select('*')
      .maybeSingle();
    setProfile((inserted as Profile) ?? { id: userId, display_name: name, avatar_color: null, is_admin: false, created_at: new Date().toISOString() });
  };

  // Hash routing — switch to lobby on deep-link while idle.
  useEffect(() => {
    if (session !== 'in') return;
    const apply = () => {
      let hash = window.location.hash.replace(/^#/, '').trim();
      try { hash = decodeURIComponent(hash); } catch { /* malformed */ }
      setView((current) => {
        if (hash) {
          if (current.kind === 'landing') return { kind: 'lobby', slug: hash };
          return current;
        }
        return { kind: 'landing' };
      });
    };
    apply();
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
  }, [session]);

  const enterRoom = (slug: string) => {
    window.location.hash = slug;
    setView({ kind: 'room', slug });
  };

  const leaveRoom = () => {
    window.location.hash = '';
    setView({ kind: 'landing' });
  };

  if (session === 'loading') {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-950">
        <Loader2 className="w-10 h-10 text-sky-500 animate-spin" />
      </div>
    );
  }

  if (session === 'out' || !profile) {
    return (
      <>
        <Auth onAuthed={() => setSession('in')} />
        <Toaster />
      </>
    );
  }

  if (view.kind === 'room') {
    return (
      <>
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-950"><Loader2 className="w-10 h-10 text-sky-500 animate-spin" /></div>}>
          <Room slug={view.slug} profile={profile} onLeave={leaveRoom} />
        </Suspense>
        <Toaster />
      </>
    );
  }

  return (
    <>
      <Landing profile={profile} onEnterRoom={enterRoom} onSignOut={signOut} />
      {view.kind === 'lobby' && (
        <Lobby slug={view.slug} onEnter={enterRoom} onBack={leaveRoom} />
      )}
      <Toaster />
    </>
  );

  function signOut() {
    supabase.auth.signOut();
  }
}

function Lobby({
  slug, onEnter, onBack,
}: { slug: string; onEnter: (slug: string) => void; onBack: () => void }) {
  const [room, setRoom] = useState<RoomRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('rooms')
      .select('*')
      .eq('slug', slug)
      .maybeSingle()
      .then(({ data }) => {
        setRoom((data as RoomRow) ?? null);
        setLoading(false);
      });
  }, [slug]);

  const join = () => {
    if (!room) return;
    if (room.is_locked && room.password !== password) return setError('رمز عبور اشتباه است');
    onEnter(slug);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950">
        <Loader2 className="w-10 h-10 text-sky-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 min-h-screen flex items-center justify-center p-4 bg-slate-950 grid-bg">
      <div className="absolute top-0 right-1/4 w-[400px] h-[400px] bg-sky-500/20 rounded-full blur-[120px]" />
      <div className="relative w-full max-w-md glass-strong rounded-3xl p-8 shadow-2xl anim-pop">
        <button onClick={onBack} className="text-slate-400 hover:text-white text-sm flex items-center gap-1 mb-6">
          <ArrowLeft className="w-4 h-4" /> بازگشت به خانه
        </button>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center">
            <Video className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-white">{room ? room.title : 'اتاق یافت نشد'}</h2>
            {room && <p className="text-xs text-slate-400">{room.description || 'به جلسه بپیوندید'}</p>}
          </div>
        </div>

        {!room ? (
          <div className="text-center py-6">
            <p className="text-slate-400 mb-4">اتاقی با این کد وجود ندارد یا به‌پایان رسیده است.</p>
            <button onClick={onBack} className="px-5 py-2.5 rounded-xl bg-sky-500 text-white font-bold">بازگشت</button>
          </div>
        ) : (
          <div className="space-y-4">
            {room.host_name && (
              <div className="flex items-center gap-2 text-xs text-slate-400 p-3 rounded-xl bg-slate-800/50">
                <div className={`w-8 h-8 rounded-full ${avatarColor(room.host_name)} flex items-center justify-center text-white text-xs font-bold`}>
                  {initials(room.host_name)}
                </div>
                میزبان: <span className="text-white font-bold">{room.host_name}</span>
              </div>
            )}
            {room.is_locked && (
              <label className="block">
                <span className="block text-xs text-slate-400 mb-1.5">رمز عبور اتاق</span>
                <input value={password} onChange={(e) => { setPassword(e.target.value); setError(null); }} placeholder="رمز" className="input" />
              </label>
            )}
            {error && <p className="text-xs text-rose-400">{error}</p>}
            <button onClick={join} className="w-full py-3 rounded-xl bg-gradient-to-l from-sky-500 to-blue-600 text-white font-bold hover:scale-[1.01] transition-transform">
              ورود به جلسه
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
