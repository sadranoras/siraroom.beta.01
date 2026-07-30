import { useEffect, useState } from 'react';
import {
  Video, Mic, ScreenShare, MessageSquare, Hand, ThumbsUp, PenLine,
  Users, Calendar, Disc, Settings, Sparkles, ArrowLeft, Lock, Globe,
  Clock, Play, FileText, ChevronLeft, Zap, Shield, Wifi, LogOut, Trash2, Crown, Search,
} from 'lucide-react';
import { supabase, type Recording, type ScheduledMeeting, type Profile, type Room } from '@/lib/supabase';
import { generateSlug, formatFaDateTime, relativeTime, formatDuration, formatBytes, toPersianDigits, avatarColor, initials } from '@/lib/utils';
import { pushToast } from '@/lib/toast';
import Modal from '@/components/Modal';

type Props = {
  profile: Profile;
  onEnterRoom: (slug: string) => void;
  onSignOut: () => void;
};

export default function Landing({ profile, onEnterRoom, onSignOut }: Props) {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [meetings, setMeetings] = useState<ScheduledMeeting[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  useEffect(() => {
    supabase
      .from('recordings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(6)
      .then(({ data }) => data && setRecordings(data as Recording[]));
    supabase
      .from('scheduled_meetings')
      .select('*')
      .order('start_at', { ascending: true })
      .limit(6)
      .then(({ data }) => data && setMeetings((data as ScheduledMeeting[]).filter((m) => new Date(m.start_at).getTime() > Date.now() - 3600000)));
  }, []);

  return (
    <div className="min-h-screen relative overflow-x-hidden">
      {/* ambient background */}
      <div className="fixed inset-0 -z-10 grid-bg">
        <div className="absolute top-0 right-1/4 w-[480px] h-[480px] bg-sky-500/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-1/4 w-[420px] h-[420px] bg-cyan-500/15 rounded-full blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-[140px]" />
      </div>

      <Header profile={profile} onSignOut={onSignOut} />

      <Hero
        onCreate={() => setCreateOpen(true)}
        onJoin={() => setJoinOpen(true)}
        onSchedule={() => setScheduleOpen(true)}
      />

      <MyRooms profile={profile} onEnterRoom={onEnterRoom} />

      {profile.is_admin && (
        <AdminDashboard onEnterRoom={onEnterRoom} />
      )}

      <Features />

      <Scheduled meetings={meetings} onJoin={(slug) => onEnterRoom(slug)} />

      <Recordings recordings={recordings} />

      <Footer />

      <CreateRoomModal open={createOpen} onClose={() => setCreateOpen(false)} profile={profile} onCreated={(slug) => onEnterRoom(slug)} />
      <JoinRoomModal open={joinOpen} onClose={() => setJoinOpen(false)} onJoin={(slug) => onEnterRoom(slug)} />
      <ScheduleModal open={scheduleOpen} onClose={() => setScheduleOpen(false)} profile={profile} onSaved={() => {
        setScheduleOpen(false);
        pushToast('جلسه با موفقیت زمان‌بندی شد', 'success');
        supabase.from('scheduled_meetings').select('*').order('start_at', { ascending: true }).limit(6)
          .then(({ data }) => data && setMeetings((data as ScheduledMeeting[]).filter((m) => new Date(m.start_at).getTime() > Date.now() - 3600000)));
      }} />
    </div>
  );
}

function Header({ profile, onSignOut }: { profile: Profile; onSignOut: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 glass border-b border-slate-800/60">
      <div className="max-w-7xl mx-auto px-5 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shadow-lg shadow-sky-500/30">
            <Video className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-white leading-none">SiraRoom</h1>
            <p className="text-[11px] text-slate-400 mt-0.5">پلتفرم جلسات آنلاین</p>
          </div>
        </div>
        <nav className="hidden md:flex items-center gap-7 text-sm text-slate-300">
          <a href="#features" className="hover:text-white transition-colors">امکانات</a>
          <a href="#schedule" className="hover:text-white transition-colors">جلسات پیش‌رو</a>
          <a href="#recordings" className="hover:text-white transition-colors">ضبط‌ها</a>
        </nav>
        <div className="flex items-center gap-3">
          <a href="#join" className="hidden sm:block text-sm px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-slate-700 text-white transition-colors">
            ورود به جلسه
          </a>
          <div className="relative">
            <button onClick={() => setMenuOpen((v) => !v)} className="flex items-center gap-2 pl-1 pr-3 py-1.5 rounded-xl glass hover:bg-slate-800/80 transition-colors">
              <div className={`w-7 h-7 rounded-full ${profile.avatar_color || avatarColor(profile.display_name)} flex items-center justify-center text-white text-xs font-bold`}>
                {initials(profile.display_name)}
              </div>
              <span className="text-sm text-white font-medium max-w-[100px] truncate">{profile.display_name}</span>
              {profile.is_admin && <Shield className="w-3.5 h-3.5 text-sky-400" />}
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute left-0 top-12 z-50 w-48 glass-strong rounded-xl p-1.5 shadow-2xl anim-pop">
                  <div className="px-3 py-2 border-b border-slate-700/60 mb-1">
                    <p className="text-xs text-slate-400">حساب کاربری</p>
                    <p className="text-sm text-white font-medium truncate flex items-center gap-1.5">
                      {profile.display_name}
                      {profile.is_admin && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 font-bold">مدیر سایت</span>}
                    </p>
                  </div>
                  <button onClick={() => { setMenuOpen(false); onSignOut(); }} className="w-full text-right px-3 py-2 rounded-lg text-sm text-rose-400 hover:bg-rose-500/20 flex items-center gap-2 transition-colors">
                    <LogOut className="w-4 h-4" /> خروج از حساب
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function Hero({ onCreate, onJoin, onSchedule }: { onCreate: () => void; onJoin: () => void; onSchedule: () => void }) {
  return (
    <section className="relative max-w-7xl mx-auto px-5 pt-16 pb-24 md:pt-24 md:pb-32">
      <div className="grid md:grid-cols-2 gap-12 items-center">
        <div className="anim-fade-up">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass text-xs text-sky-300 mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            <span>پلتفرم کامل جلسات آنلاین — رایگان</span>
          </div>
          <h2 className="text-4xl md:text-6xl font-extrabold text-white leading-[1.15] mb-6">
            جلسه‌ت رو بساز،
            <br />
            <span className="gradient-text">دنیا رو دعوت کن.</span>
          </h2>
          <p className="text-slate-300 text-lg leading-relaxed mb-8 max-w-xl">
            با SiraRoom در چند ثانیه یک اتاق جلسه بساز و با تصویر، صدا، چت زنده، نظرسنجی،
            وایت‌بورد اشتراکی، اشتراک صفحه و ضبط جلسه، یک تجربه حرفه‌ای داشته باش.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={onCreate}
              className="group px-6 py-3.5 rounded-xl bg-gradient-to-l from-sky-500 to-blue-600 text-white font-bold shadow-xl shadow-sky-500/30 hover:shadow-sky-500/50 hover:scale-[1.02] transition-all flex items-center gap-2"
            >
              <Video className="w-5 h-5" />
              ساخت جلسه جدید
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            </button>
            <button
              onClick={onJoin}
              className="px-6 py-3.5 rounded-xl glass text-white font-bold hover:bg-slate-800/80 transition-all flex items-center gap-2"
            >
              <Users className="w-5 h-5" />
              ورود با کد
            </button>
            <button
              onClick={onSchedule}
              className="px-6 py-3.5 rounded-xl text-slate-200 hover:text-white hover:bg-white/5 transition-all flex items-center gap-2"
            >
              <Calendar className="w-5 h-5" />
              زمان‌بندی
            </button>
          </div>

          <div className="flex items-center gap-6 mt-10 text-sm text-slate-400">
            <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-success-400" /> رمزگذاری اتاق</div>
            <div className="flex items-center gap-2"><Wifi className="w-4 h-4 text-sky-400" /> کیفیت تطبیقی</div>
            <div className="flex items-center gap-2"><Zap className="w-4 h-4 text-amber-400" /> بدون نصب</div>
          </div>
        </div>

        {/* decorative meeting preview */}
        <div className="relative anim-fade-up" style={{ animationDelay: '0.1s' }}>
          <div className="glass-strong rounded-3xl p-3 shadow-2xl shadow-black/40 rotate-1 hover:rotate-0 transition-transform duration-500">
            <div className="grid grid-cols-2 gap-2">
              {[
                { c: 'from-sky-500/30 to-blue-600/20', n: 'سارا', t: 'میزبان' },
                { c: 'from-emerald-500/30 to-teal-600/20', n: 'علی', t: '' },
                { c: 'from-amber-500/30 to-orange-600/20', n: 'نگار', t: '' },
                { c: 'from-rose-500/30 to-pink-600/20', n: 'محمد', t: '' },
              ].map((p, i) => (
                <div key={i} className={`aspect-video rounded-xl bg-gradient-to-br ${p.c} relative overflow-hidden flex items-center justify-center`}>
                  <div className="w-12 h-12 rounded-full bg-white/10 backdrop-blur flex items-center justify-center text-white font-bold text-sm">
                    {p.n.slice(0, 2)}
                  </div>
                  <div className="absolute bottom-2 right-2 flex items-center gap-1 text-[10px] text-white/90 bg-black/40 px-1.5 py-0.5 rounded">
                    {p.n}
                    {p.t && <span className="text-sky-300">• {p.t}</span>}
                  </div>
                  {i === 1 && <Mic className="absolute top-2 left-2 w-3.5 h-3.5 text-rose-400" />}
                </div>
              ))}
            </div>
            <div className="mt-3 glass rounded-xl px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-rose-300">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                در حال ضبط
              </div>
              <div className="flex items-center gap-2">
                {[Mic, Video, ScreenShare, Hand].map((Icon, i) => (
                  <div key={i} className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-300">
                    <Icon className="w-4 h-4" />
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* floating reactions */}
          <div className="absolute -top-3 -left-3 text-3xl anim-float">👍</div>
          <div className="absolute top-1/3 -right-4 text-3xl anim-float" style={{ animationDelay: '1.5s' }}>👏</div>
          <div className="absolute -bottom-2 left-1/4 text-3xl anim-float" style={{ animationDelay: '0.8s' }}>❤️</div>
        </div>
      </div>
    </section>
  );
}

const FEATURES = [
  { icon: Video, title: 'تصویر و صدا', desc: 'تماس تصویری گروهی با کیفیت HD و نویزگیری هوشمند', color: 'from-sky-500/20 to-blue-600/10 text-sky-300' },
  { icon: MessageSquare, title: 'چت زنده', desc: 'گفتگوی متنی هم‌زمان با همه شرکت‌کنندگان', color: 'from-emerald-500/20 to-teal-600/10 text-emerald-300' },
  { icon: ScreenShare, title: 'اشتراک صفحه', desc: 'صفحه نمایش خود را با همه به اشتراک بگذارید', color: 'from-violet-500/20 to-fuchsia-600/10 text-violet-300' },
  { icon: PenLine, title: 'وایت‌بورد اشتراکی', desc: 'طراحی و یادداشت مشترک روی تخته سفید', color: 'from-amber-500/20 to-orange-600/10 text-amber-300' },
  { icon: ThumbsUp, title: 'نظرسنجی زنده', desc: 'سوال بسازید و نظر همه را زنده ببینید', color: 'from-rose-500/20 to-pink-600/10 text-rose-300' },
  { icon: Hand, title: 'درخواست گفتگو', desc: 'دست بالا ببرید تا میزبان شما را شناسا کند', color: 'from-cyan-500/20 to-sky-600/10 text-cyan-300' },
  { icon: Disc, title: 'ضبط جلسه', desc: 'جلسه را ضبط و بعدا پخش یا دانلود کنید', color: 'from-lime-500/20 to-green-600/10 text-lime-300' },
  { icon: Users, title: 'اتاق‌های فرعی', desc: 'گروه‌ها را به اتاق‌های کوچک‌تر تقسیم کنید', color: 'from-fuchsia-500/20 to-purple-600/10 text-fuchsia-300' },
  { icon: FileText, title: 'اشتراک فایل', desc: 'فایل‌های جلسه را به اشتراک بگذارید', color: 'from-indigo-500/20 to-blue-600/10 text-indigo-300' },
  { icon: Sparkles, title: 'واکنش‌ها', desc: 'با ایموجی و انیمیشن واکنش نشان دهید', color: 'from-orange-500/20 to-amber-600/10 text-orange-300' },
  { icon: Calendar, title: 'زمان‌بندی', desc: 'جلسات پیش‌رو را برنامه‌ریزی کنید', color: 'from-teal-500/20 to-cyan-600/10 text-teal-300' },
  { icon: Lock, title: 'اتاق خصوصی', desc: 'با رمز عبور، جلسه خود را امن کنید', color: 'from-slate-500/20 to-slate-600/10 text-slate-300' },
];

function Features() {
  return (
    <section id="features" className="max-w-7xl mx-auto px-5 py-20">
      <div className="text-center mb-12">
        <h3 className="text-3xl md:text-4xl font-extrabold text-white mb-3">تمام امکانات یک پلتفرم حرفه‌ای</h3>
        <p className="text-slate-400">هرچه برای یک جلسه آنلاین کامل لازم داری، یکجا.</p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {FEATURES.map((f, i) => (
          <div
            key={i}
            className="group glass rounded-2xl p-5 hover:bg-slate-800/60 transition-all hover:-translate-y-1 anim-fade-up"
            style={{ animationDelay: `${i * 0.04}s` }}
          >
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
              <f.icon className="w-6 h-6" />
            </div>
            <h4 className="text-base font-bold text-white mb-1.5">{f.title}</h4>
            <p className="text-sm text-slate-400 leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Scheduled({ meetings, onJoin }: { meetings: ScheduledMeeting[]; onJoin: (slug: string) => void }) {
  if (meetings.length === 0) return null;
  return (
    <section id="schedule" className="max-w-7xl mx-auto px-5 py-16">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h3 className="text-2xl md:text-3xl font-extrabold text-white flex items-center gap-3">
            <Calendar className="w-7 h-7 text-sky-400" />
            جلسات پیش‌رو
          </h3>
          <p className="text-slate-400 mt-2">جلسات زمان‌بندی‌شده که به‌زودی برگزار می‌شوند</p>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {meetings.map((m) => {
          const d = new Date(m.start_at);
          const isSoon = d.getTime() - Date.now() < 15 * 60 * 1000;
          return (
            <div key={m.id} className="glass rounded-2xl p-5 hover:bg-slate-800/60 transition-all group">
              <div className="flex items-start justify-between mb-3">
                <div className="px-2.5 py-1 rounded-lg bg-sky-500/15 text-sky-300 text-xs font-bold">
                  {toPersianDigits(d.toLocaleDateString('fa-IR', { month: 'long', day: 'numeric' }))}
                </div>
                {isSoon && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> به‌زودی
                  </span>
                )}
              </div>
              <h4 className="text-base font-bold text-white mb-1">{m.title}</h4>
              <p className="text-xs text-slate-400 mb-3 line-clamp-2">{m.agenda || 'بدون دستور جلسه'}</p>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  {formatFaDateTime(m.start_at)}
                </span>
                <span>تا {toPersianDigits(m.duration_minutes)} دقیقه</span>
              </div>
              <button
                onClick={() => onJoin(m.room_slug)}
                className="mt-4 w-full py-2 rounded-xl bg-white/5 hover:bg-sky-500/20 hover:text-sky-300 text-slate-200 text-sm font-medium transition-all flex items-center justify-center gap-2"
              >
                ورود به جلسه <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Recordings({ recordings }: { recordings: Recording[] }) {
  return (
    <section id="recordings" className="max-w-7xl mx-auto px-5 py-16">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h3 className="text-2xl md:text-3xl font-extrabold text-white flex items-center gap-3">
            <Disc className="w-7 h-7 text-rose-400" />
            ضبط‌های اخیر
          </h3>
          <p className="text-slate-400 mt-2">جلسات ضبط‌شده برای پخش و دانلود</p>
        </div>
      </div>
      {recordings.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <Disc className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">هنوز ضبتی ثبت نشده است.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {recordings.map((r) => (
            <a
              key={r.id}
              href={r.url}
              target="_blank"
              rel="noreferrer"
              className="group glass rounded-2xl overflow-hidden hover:bg-slate-800/60 transition-all"
            >
              <div className="aspect-video bg-gradient-to-br from-slate-800 to-slate-900 relative flex items-center justify-center">
                {r.thumbnail ? (
                  <img src={r.thumbnail} alt={r.title} className="w-full h-full object-cover" />
                ) : (
                  <Play className="w-12 h-12 text-white/40 group-hover:text-sky-400 group-hover:scale-110 transition-all" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <span className="absolute bottom-2 left-2 text-xs text-white bg-black/60 px-2 py-0.5 rounded">
                  {formatDuration(r.duration_seconds)}
                </span>
              </div>
              <div className="p-4">
                <h4 className="text-sm font-bold text-white mb-1 line-clamp-1">{r.title}</h4>
                <p className="text-xs text-slate-400">{relativeTime(r.created_at)} • {formatBytes(r.file_size_bytes)}</p>
              </div>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-slate-800/60 mt-12">
      <div className="max-w-7xl mx-auto px-5 py-10 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-slate-500">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center">
            <Video className="w-4 h-4 text-white" />
          </div>
          <span>SiraRoom — {toPersianDigits(new Date().getFullYear())}</span>
        </div>
        <p>ساخته‌شده با عشق برای جلسات آنلاین فارسی‌زبان</p>
      </div>
    </footer>
  );
}

function MyRooms({ profile, onEnterRoom }: { profile: Profile; onEnterRoom: (slug: string) => void }) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    supabase
      .from('rooms')
      .select('*')
      .eq('owner_user_id', profile.id)
      .order('last_activity', { ascending: false })
      .then(({ data }) => {
        setRooms((data as Room[]) ?? []);
        setLoading(false);
      });
  };
  useEffect(load, [profile.id]);

  const del = async (id: string, title: string) => {
    if (!confirm(`حذف اتاق «${title}»؟ این عمل قابل بازگشت نیست.`)) return;
    await supabase.from('rooms').delete().eq('id', id);
    setRooms((prev) => prev.filter((r) => r.id !== id));
    pushToast('اتاق حذف شد', 'info');
  };

  return (
    <section className="max-w-7xl mx-auto px-5 py-10" id="my-rooms">
      <div className="flex items-center gap-2 mb-6">
        <Video className="w-5 h-5 text-sky-400" />
        <h2 className="text-xl font-extrabold text-white">اتاق‌های من</h2>
        {!loading && rooms.length > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 font-bold">
            {toPersianDigits(rooms.length)} اتاق
          </span>
        )}
      </div>

      {loading ? (
        <div className="glass rounded-2xl p-12 text-center">
          <p className="text-slate-400">در حال بارگذاری...</p>
        </div>
      ) : rooms.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-800/60 flex items-center justify-center mx-auto mb-3">
            <Users className="w-7 h-7 text-slate-600" />
          </div>
          <p className="text-slate-300 font-medium">هنوز اتاقی نساخته‌اید</p>
          <p className="text-slate-500 text-sm mt-1">با «ساخت جلسه جدید» اولین اتاق خود را بسازید</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rooms.map((r) => (
            <div key={r.id} className="glass rounded-2xl p-5 hover:bg-slate-800/60 transition-all group flex flex-col">
              <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${r.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-500'}`}>
                  <Video className="w-5 h-5" />
                </div>
                <div className="flex items-center gap-1.5">
                  {r.is_locked && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 flex items-center gap-1">
                      <Lock className="w-3 h-3" /> خصوصی
                    </span>
                  )}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${r.is_active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700 text-slate-400'}`}>
                    {r.is_active ? 'فعال' : 'پایان‌یافته'}
                  </span>
                </div>
              </div>
              <h4 className="text-base font-bold text-white mb-1 line-clamp-1">{r.title}</h4>
              {r.description && <p className="text-xs text-slate-400 mb-3 line-clamp-2">{r.description}</p>}
              <div className="text-[11px] text-slate-500 mb-4">
                <span>کد: </span>
                <span dir="ltr" className="text-slate-300">{r.slug}</span>
                <span className="mx-2">•</span>
                <span>{relativeTime(r.last_activity)}</span>
              </div>
              <div className="mt-auto flex items-center gap-2">
                <button
                  onClick={() => onEnterRoom(r.slug)}
                  className="flex-1 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-sm font-bold flex items-center justify-center gap-1.5 transition-colors"
                >
                  ورود به جلسه <ArrowLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => del(r.id, r.title)}
                  className="w-9 h-9 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/20 flex items-center justify-center transition-colors shrink-0"
                  title="حذف اتاق"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AdminDashboard({ onEnterRoom }: { onEnterRoom: (slug: string) => void }) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    supabase.from('rooms').select('*').order('last_activity', { ascending: false }).limit(50)
      .then(({ data }) => { setRooms((data as Room[]) ?? []); setLoading(false); });
  };
  useEffect(load, []);

  const del = async (id: string, title: string) => {
    if (!confirm(`حذف اتاق «${title}»؟ این عمل قابل بازگشت نیست.`)) return;
    await supabase.from('rooms').delete().eq('id', id);
    setRooms((prev) => prev.filter((r) => r.id !== id));
    pushToast('اتاق حذف شد', 'info');
  };

  const filtered = rooms.filter((r) =>
    r.title.toLowerCase().includes(query.toLowerCase()) || r.slug.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <section className="max-w-7xl mx-auto px-5 py-10" id="admin">
      <div className="flex items-center gap-2 mb-6">
        <Shield className="w-5 h-5 text-sky-400" />
        <h2 className="text-xl font-extrabold text-white">پنل مدیریت</h2>
        <span className="text-xs px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 font-bold">مدیر سایت</span>
      </div>

      <div className="glass-strong rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="جستجو در اتاق‌ها..."
              className="input pr-10"
            />
          </div>
          <span className="text-sm text-slate-400 shrink-0">{toPersianDigits(filtered.length)} اتاق</span>
        </div>

        {loading ? (
          <p className="text-center text-slate-400 py-8">در حال بارگذاری...</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-slate-500 py-8">اتاقی یافت نشد</p>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto scrollbar-thin">
            {filtered.map((r) => (
              <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 hover:bg-slate-800 transition-colors group">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${r.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-500'}`}>
                  <Video className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate flex items-center gap-1.5">
                    {r.title}
                    {r.is_locked && <Lock className="w-3 h-3 text-amber-400" />}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">
                    کد: <span dir="ltr">{r.slug}</span> • میزبان: {r.host_name}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => onEnterRoom(r.slug)}
                    className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold flex items-center gap-1 transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> ورود
                  </button>
                  <button
                    onClick={() => del(r.id, r.title)}
                    className="w-8 h-8 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/20 flex items-center justify-center transition-colors"
                    title="حذف اتاق"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function CreateRoomModal({
  open, onClose, onCreated, profile,
}: { open: boolean; onClose: () => void; onCreated: (slug: string) => void; profile: Profile }) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [locked, setLocked] = useState(false);
  const [password, setPassword] = useState('');
  const [maxP, setMaxP] = useState(50);
  const [loading, setLoading] = useState(false);

  const create = async () => {
    if (!title.trim()) return pushToast('عنوان جلسه را وارد کنید', 'error');
    if (locked && !password.trim()) return pushToast('رمز عبور را وارد کنید', 'error');
    setLoading(true);
    const slug = generateSlug();
    const { error } = await supabase.from('rooms').insert({
      slug,
      title: title.trim(),
      description: desc.trim() || null,
      host_name: profile.display_name,
      owner_user_id: profile.id,
      is_locked: locked,
      password: locked ? password : null,
      max_participants: maxP,
    });
    setLoading(false);
    if (error) return pushToast('ساخت اتاق ناموفق بود', 'error');
    pushToast('اتاق ساخته شد', 'success');
    onClose();
    setTitle(''); setDesc(''); setLocked(false); setPassword(''); setMaxP(50);
    onCreated(slug);
  };

  return (
    <Modal open={open} onClose={onClose} title="ساخت جلسه جدید" size="md">
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50">
          <div className={`w-10 h-10 rounded-full ${profile.avatar_color || avatarColor(profile.display_name)} flex items-center justify-center text-white text-sm font-bold`}>
            {initials(profile.display_name)}
          </div>
          <div>
            <p className="text-xs text-slate-400">میزبان جلسه</p>
            <p className="text-sm text-white font-bold">{profile.display_name}</p>
          </div>
        </div>
        <Field label="عنوان جلسه">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً: جلسه تیم محصول"
            className="input" />
        </Field>
        <Field label="توضیحات (اختیاری)">
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder="دستور جلسه..."
            className="input resize-none" />
        </Field>
        <Field label={`حداکثر شرکت‌کنندگان: ${toPersianDigits(maxP)}`}>
          <input type="range" min={2} max={5000} value={maxP} onChange={(e) => setMaxP(+e.target.value)} className="w-full" />
          {maxP > 200 && <p className="text-[11px] text-sky-400 mt-1">ظرفیت ویژه مدیر سایت فعال شد</p>}
        </Field>
        <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl bg-slate-800/50 hover:bg-slate-800 transition-colors">
          <input type="checkbox" checked={locked} onChange={(e) => setLocked(e.target.checked)} className="w-4 h-4 accent-sky-500" />
          <Lock className="w-4 h-4 text-amber-400" />
          <span className="text-sm text-slate-200">قفل کردن اتاق با رمز عبور</span>
        </label>
        {locked && (
          <Field label="رمز عبور">
            <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="رمز عبور اتاق"
              className="input" />
          </Field>
        )}
        <button
          onClick={create}
          disabled={loading}
          className="w-full py-3 rounded-xl bg-gradient-to-l from-sky-500 to-blue-600 text-white font-bold hover:scale-[1.01] transition-transform disabled:opacity-50"
        >
          {loading ? 'در حال ساخت...' : 'ساخت و ورود به جلسه'}
        </button>
      </div>
    </Modal>
  );
}

function JoinRoomModal({
  open, onClose, onJoin,
}: { open: boolean; onClose: () => void; onJoin: (slug: string) => void }) {
  const [slug, setSlug] = useState('');
  const [password, setPassword] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [checking, setChecking] = useState(false);

  const check = async () => {
    if (!slug.trim()) return pushToast('کد اتاق را وارد کنید', 'error');
    setChecking(true);
    const { data } = await supabase.from('rooms').select('is_locked, password').eq('slug', slug.trim()).maybeSingle();
    setChecking(false);
    if (!data) return pushToast('اتاقی با این کد یافت نشد', 'error');
    if (data.is_locked) {
      if (data.password !== password) {
        setNeedsPassword(true);
        if (password) return pushToast('رمز عبور اشتباه است', 'error');
        return pushToast('این اتاق رمزگذاری شده است', 'info');
      }
    }
    pushToast('در حال ورود...', 'success');
    onJoin(slug.trim());
    setSlug(''); setPassword(''); setNeedsPassword(false);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="ورود به جلسه" size="sm">
      <div className="space-y-4">
        <Field label="کد اتاق">
          <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="مثلاً: setareh-abi-123"
            dir="ltr" className="input text-center" />
        </Field>
        {needsPassword && (
          <Field label="رمز عبور اتاق">
            <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="رمز"
              className="input" />
          </Field>
        )}
        <button onClick={check} disabled={checking}
          className="w-full py-3 rounded-xl bg-gradient-to-l from-sky-500 to-blue-600 text-white font-bold hover:scale-[1.01] transition-transform disabled:opacity-50">
          {checking ? 'در حال بررسی...' : 'ورود به جلسه'}
        </button>
      </div>
    </Modal>
  );
}

function ScheduleModal({ open, onClose, onSaved, profile }: { open: boolean; onClose: () => void; onSaved: () => void; profile: Profile }) {
  const [title, setTitle] = useState('');
  const [agenda, setAgenda] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState(60);
  const [loading, setLoading] = useState(false);

  const save = async () => {
    if (!title.trim()) return pushToast('عنوان را وارد کنید', 'error');
    if (!date || !time) return pushToast('تاریخ و زمان را انتخاب کنید', 'error');
    setLoading(true);
    const startAt = new Date(`${date}T${time}`).toISOString();
    const slug = generateSlug();
    const { error } = await supabase.from('scheduled_meetings').insert({
      title: title.trim(),
      agenda: agenda.trim() || null,
      host_name: profile.display_name,
      owner_user_id: profile.id,
      room_slug: slug,
      start_at: startAt,
      duration_minutes: duration,
    });
    setLoading(false);
    if (error) return pushToast('زمان‌بندی ناموفق بود', 'error');
    setTitle(''); setAgenda(''); setDate(''); setTime(''); setDuration(60);
    onSaved();
  };

  return (
    <Modal open={open} onClose={onClose} title="زمان‌بندی جلسه" size="md">
      <div className="space-y-4">
        <Field label="عنوان جلسه">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" placeholder="مثلاً: جلسه هفتگی تیم" />
        </Field>
        <Field label="دستور جلسه (اختیاری)">
          <textarea value={agenda} onChange={(e) => setAgenda(e.target.value)} rows={2} className="input resize-none" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="تاریخ">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" dir="ltr" />
          </Field>
          <Field label="ساعت">
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="input" dir="ltr" />
          </Field>
        </div>
        <Field label={`مدت زمان: ${toPersianDigits(duration)} دقیقه`}>
          <input type="range" min={15} max={180} step={15} value={duration} onChange={(e) => setDuration(+e.target.value)} className="w-full" />
        </Field>
        <button onClick={save} disabled={loading}
          className="w-full py-3 rounded-xl bg-gradient-to-l from-sky-500 to-blue-600 text-white font-bold hover:scale-[1.01] transition-transform disabled:opacity-50">
          {loading ? 'در حال ذخیره...' : 'زمان‌بندی جلسه'}
        </button>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-400 mb-1.5">{label}</span>
      {children}
    </label>
  );
}

// shared input class via @layer would be cleaner, but inline utility keeps it simple
