import { ScreenShare, X } from 'lucide-react';

type Props = {
  stream: MediaStream | null;
  label: string;
  onClose?: () => void;
};

export default function ScreenShareTile({ stream, label, onClose }: Props) {
  return (
    <div className="h-full w-full rounded-2xl overflow-hidden bg-black ring-2 ring-sky-400/50 flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900/80 border-b border-slate-800 shrink-0">
        <span className="text-xs text-sky-300 font-bold flex items-center gap-2">
          <ScreenShare className="w-4 h-4" /> {label}
        </span>
        {onClose && (
          <button onClick={onClose} className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1">
            <X className="w-3.5 h-3.5" /> توقف
          </button>
        )}
      </div>
      <div className="flex-1 relative overflow-hidden">
        <video
          ref={(v) => { if (v && stream) { v.srcObject = stream; v.play().catch(() => {}); } }}
          muted
          playsInline
          className="w-full h-full object-contain"
        />
      </div>
    </div>
  );
}
