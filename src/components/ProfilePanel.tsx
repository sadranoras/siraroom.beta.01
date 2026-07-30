import { useState } from 'react';
import { User, Check, Loader2 } from 'lucide-react';
import { supabase, type Profile } from '@/lib/supabase';
import { pushToast } from '@/lib/toast';
import { avatarColor, initials } from '@/lib/utils';

type Props = {
  profile: Profile;
  displayName: string;
  onDisplayNameChange: (name: string) => void;
  onProfileUpdate: (newName: string) => void;
};

export default function ProfilePanel({ profile, displayName, onDisplayNameChange, onProfileUpdate }: Props) {
  const [name, setName] = useState(displayName);
  const [applyToAll, setApplyToAll] = useState(true);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return pushToast('نام نمی‌تواند خالی باشد', 'error');
    if (trimmed === displayName) return;

    setSaving(true);

    if (applyToAll) {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: trimmed })
        .eq('id', profile.id);
      setSaving(false);
      if (error) return pushToast('خطا در ذخیره نام', 'error');
    } else {
      setSaving(false);
    }

    onDisplayNameChange(trimmed);
    onProfileUpdate(trimmed);
    pushToast(applyToAll ? 'نام شما برای همه جلسات تغییر کرد' : 'نام شما در این جلسه تغییر کرد', 'success');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800">
        <User className="w-4 h-4 text-sky-400" />
        <h3 className="text-sm font-bold text-white">نام نمایشی من</h3>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-5">
        <div className="flex flex-col items-center gap-3 py-4">
          <div className={`w-16 h-16 rounded-full ${avatarColor(name || profile.display_name)} flex items-center justify-center text-white text-xl font-bold`}>
            {initials(name || profile.display_name)}
          </div>
          <p className="text-sm text-slate-400">نام فعلی: <span className="text-white font-medium">{displayName}</span></p>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-slate-400 font-medium">نام جدید</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            autoFocus
            maxLength={40}
            className="input"
            placeholder="نام خود را وارد کنید"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs text-slate-400 font-medium">دامنه اعمال تغییر</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setApplyToAll(true)}
              className={`rounded-xl px-3 py-2.5 text-sm font-medium transition-all border-2 ${
                applyToAll
                  ? 'border-sky-500 bg-sky-500/15 text-sky-200'
                  : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600'
              }`}
            >
              همه جلسات
            </button>
            <button
              onClick={() => setApplyToAll(false)}
              className={`rounded-xl px-3 py-2.5 text-sm font-medium transition-all border-2 ${
                !applyToAll
                  ? 'border-sky-500 bg-sky-500/15 text-sky-200'
                  : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600'
              }`}
            >
              فقط این جلسه
            </button>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            {applyToAll
              ? 'نام شما در حساب کاربری ذخیره می‌شود و برای همه جلسات بعدی هم استفاده می‌شود.'
              : 'نام فقط در این جلسه تغییر می‌کند و حساب کاربری شما دست‌نخورده باقی می‌ماند.'}
          </p>
        </div>

        <button
          onClick={save}
          disabled={saving || !name.trim() || name.trim() === displayName}
          className="w-full py-2.5 rounded-xl bg-sky-500 text-white text-sm font-bold hover:bg-sky-400 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          ذخیره
        </button>
      </div>
    </div>
  );
}
