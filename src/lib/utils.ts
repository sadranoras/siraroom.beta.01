const PERSIAN_ADJECTIVES = ['sehr', 'aflak', 'niloofar', 'setareh', 'donya', 'bahar', 'sepid', 'aram', 'mahi', 'darya'];
const PERSIAN_NOUNS = ['abi', 'zarrin', 'noghre', 'sabz', 'sorush', 'pars', 'afsaneh', 'kimia', 'payam', 'raha'];

export function generateSlug(): string {
  const a = PERSIAN_ADJECTIVES[Math.floor(Math.random() * PERSIAN_ADJECTIVES.length)];
  const n = PERSIAN_NOUNS[Math.floor(Math.random() * PERSIAN_NOUNS.length)];
  const num = Math.floor(100 + Math.random() * 900);
  return `${a}-${n}-${num}`;
}

const AVATAR_COLORS = [
  'bg-sky-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500',
  'bg-violet-500', 'bg-cyan-500', 'bg-fuchsia-500', 'bg-lime-500',
  'bg-orange-500', 'bg-teal-500',
];

export function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '؟';
  if (parts.length === 1) return parts[0].slice(0, 2);
  return parts[0][0] + parts[1][0];
}

const faDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
export function toPersianDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => faDigits[+d]);
}

export function formatFaTime(iso: string): string {
  const d = new Date(iso);
  return toPersianDigits(
    d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
  );
}

export function formatFaDateTime(iso: string): string {
  const d = new Date(iso);
  return toPersianDigits(
    d.toLocaleDateString('fa-IR', { month: 'long', day: 'numeric' }) +
      '، ' +
      d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
  );
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => toPersianDigits(String(n).padStart(2, '0'));
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${toPersianDigits(bytes)} بایت`;
  if (bytes < 1024 * 1024) return `${toPersianDigits((bytes / 1024).toFixed(1))} کیلوبایت`;
  if (bytes < 1024 * 1024 * 1024) return `${toPersianDigits((bytes / 1024 / 1024).toFixed(1))} مگابایت`;
  return `${toPersianDigits((bytes / 1024 / 1024 / 1024).toFixed(1))} گیگابایت`;
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'لحظاتی پیش';
  if (min < 60) return `${toPersianDigits(min)} دقیقه پیش`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${toPersianDigits(hr)} ساعت پیش`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${toPersianDigits(day)} روز پیش`;
  return formatFaDateTime(iso);
}

export function generateId(prefix = ''): string {
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
