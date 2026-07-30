import { useEffect, useRef, useState } from 'react';
import { Disc, Pause, Play, Square, Circle } from 'lucide-react';
import { supabase, type Recording } from '@/lib/supabase';
import { formatDuration, formatFaDateTime, formatBytes, toPersianDigits } from '@/lib/utils';
import { pushToast } from '@/lib/toast';

type Props = {
  roomId: string;
  roomTitle: string;
  name: string;
  allowRecording: boolean;
  isHost: boolean;
};

export default function RecordingBar({ roomId, roomTitle, name, allowRecording, isHost }: Props) {
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!recording || paused) return;
    timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [recording, paused]);

  const start = async () => {
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 10 } as MediaTrackConstraints,
        audio: false,
      });
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      const combined = new MediaStream();
      display.getVideoTracks().forEach((t) => combined.addTrack(t));
      mic.getAudioTracks().forEach((t) => combined.addTrack(t));
      streamRef.current = combined;

      const rec = new MediaRecorder(combined, { mimeType: 'video/webm' });
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const duration = seconds;
        supabase
          .from('recordings')
          .insert({
            room_id: roomId,
            title: `${roomTitle} — ${formatFaDateTime(new Date().toISOString())}`,
            duration_seconds: duration,
            url,
            file_size_bytes: blob.size,
            recorded_by: name,
          })
          .then(({ error }) => {
            if (error) pushToast('ذخیره ضبط ناموفق بود', 'error');
            else pushToast('ضبط ذخیره شد و در کتابخانه ضبط‌ها قابل دسترس است', 'success');
          });
        display.getTracks().forEach((t) => t.stop());
        mic.getTracks().forEach((t) => t.stop());
        setSeconds(0);
      };
      rec.start(1000);
      recorderRef.current = rec;
      setRecording(true);
      setPaused(false);
      pushToast('ضبط شروع شد', 'success');
    } catch {
      pushToast('شروع ضبط ناموفق بود (دسترسی به صفحه لازم است)', 'error');
    }
  };

  const pause = () => {
    const rec = recorderRef.current;
    if (!rec) return;
    if (rec.state === 'recording') {
      rec.pause();
      setPaused(true);
    } else if (rec.state === 'paused') {
      rec.resume();
      setPaused(false);
    }
  };

  const stop = () => {
    recorderRef.current?.stop();
    setRecording(false);
    setPaused(false);
  };

  if (!allowRecording || !isHost) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl glass border border-rose-500/30">
      <canvas ref={canvasRef} className="hidden" />
      {recording ? (
        <>
          <span className="flex items-center gap-1.5 text-xs font-bold text-rose-300">
            <Circle className="w-3 h-3 fill-rose-500 text-rose-500 animate-pulse" />
            {paused ? 'متوقف موقت' : 'در حال ضبط'}
          </span>
          <span className="text-xs font-mono text-white tabular-nums">{formatDuration(seconds)}</span>
          <button onClick={pause} className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center">
            {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          </button>
          <button onClick={stop} className="w-7 h-7 rounded-lg bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 flex items-center justify-center" title="پایان ضبط">
            <Square className="w-3.5 h-3.5" />
          </button>
        </>
      ) : (
        <button onClick={start} className="flex items-center gap-1.5 text-xs font-bold text-rose-300 hover:text-rose-200">
          <Disc className="w-4 h-4" />
          شروع ضبط
        </button>
      )}
    </div>
  );
}

export function RecordingsList({ roomId }: { roomId: string }) {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  useEffect(() => {
    supabase.from('recordings').select('*').eq('room_id', roomId).order('created_at', { ascending: false }).then(({ data }) => data && setRecordings(data));
  }, [roomId]);
  return (
    <div className="space-y-2">
      {recordings.map((r) => (
        <a key={r.id} href={r.url} target="_blank" rel="noreferrer" className="block glass rounded-xl p-3 hover:bg-slate-800/60 transition-colors">
          <div className="text-sm font-medium text-white truncate">{r.title}</div>
          <div className="text-[11px] text-slate-500 mt-1">
            {formatDuration(r.duration_seconds)} • {formatBytes(r.file_size_bytes)} • {toPersianDigits(formatFaDateTime(r.created_at))}
          </div>
        </a>
      ))}
    </div>
  );
}
