import { useEffect, useState, useRef, useCallback } from 'react';
import { FileText, Upload, Download, File, Image, FileVideo, FileAudio, Trash2, X, Presentation, Lock, Unlock } from 'lucide-react';
import { supabase, type SharedFile } from '@/lib/supabase';
import { formatBytes, relativeTime } from '@/lib/utils';
import { pushToast } from '@/lib/toast';

type Props = {
  roomId: string;
  name: string;
  allowFiles: boolean;
  canPresent: boolean;
  presentedFileId: string | null;
  onPresent: (fileId: string | null) => void;
};

type UploadingFile = {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: 'uploading' | 'done' | 'error';
};

// Office file extensions that can't be previewed inline — show a download
// button instead. Word, PowerPoint, Excel (old + new formats).
const OFFICE_EXTS = ['.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx'];

export default function FilesPanel({ roomId, name, allowFiles, canPresent, presentedFileId, onPresent }: Props) {
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploads, setUploads] = useState<UploadingFile[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`files:${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'files', filter: `room_id=eq.${roomId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [roomId]);

  const load = async () => {
    const { data } = await supabase
      .from('files')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false });
    if (data) setFiles(data);
  };

  const addFile = useCallback(async (file: File) => {
    if (file.size > 200 * 1024 * 1024) {
      pushToast('حجم فایل باید کمتر از ۲۰۰ مگابایت باشد', 'error');
      return;
    }

    const uploadId = crypto.randomUUID();
    setUploads((prev) => [...prev, { id: uploadId, name: file.name, size: file.size, progress: 0, status: 'uploading' }]);

    const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
    const path = `${roomId}/${crypto.randomUUID()}${ext}`;

    // Use XMLHttpRequest to track real upload progress, which the Supabase
    // JS client does not expose.
    const { data: pub } = supabase.storage.from('room-files').getPublicUrl(path);

    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            setUploads((prev) => prev.map((u) => (u.id === uploadId ? { ...u, progress: pct } : u)));
          }
        });
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`upload failed: ${xhr.status}`));
        });
        xhr.addEventListener('error', () => reject(new Error('network error')));
        xhr.open('POST', `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/room-files/${path}`);
        xhr.setRequestHeader('Authorization', `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.setRequestHeader('x-upsert', 'false');
        xhr.send(file);
      });
    } catch {
      setUploads((prev) => prev.map((u) => (u.id === uploadId ? { ...u, status: 'error' } : u)));
      pushToast('بارگذاری فایل ناموفق بود', 'error');
      setTimeout(() => setUploads((prev) => prev.filter((u) => u.id !== uploadId)), 3000);
      return;
    }

    const { error } = await supabase.from('files').insert({
      room_id: roomId,
      name: file.name,
      url: pub.publicUrl,
      size_bytes: file.size,
      mime_type: file.type || 'application/octet-stream',
      shared_by: name,
    });
    if (error) {
      setUploads((prev) => prev.map((u) => (u.id === uploadId ? { ...u, status: 'error' } : u)));
      pushToast('اشتراک فایل ناموفق بود', 'error');
      setTimeout(() => setUploads((prev) => prev.filter((u) => u.id !== uploadId)), 3000);
      return;
    }

    setUploads((prev) => prev.map((u) => (u.id === uploadId ? { ...u, status: 'done', progress: 100 } : u)));
    pushToast('فایل به اشتراک گذاشته شد', 'success');
    // Remove the completed upload entry after a short delay so the user sees 100%.
    setTimeout(() => setUploads((prev) => prev.filter((u) => u.id !== uploadId)), 1500);
  }, [roomId, name]);

  const remove = async (id: string) => {
    await supabase.from('files').delete().eq('id', id);
  };

  const toggleDownload = async (f: SharedFile) => {
    const next = !f.allow_download;
    setFiles((prev) => prev.map((x) => (x.id === f.id ? { ...x, allow_download: next } : x)));
    const { error } = await supabase.from('files').update({ allow_download: next }).eq('id', f.id);
    if (error) {
      setFiles((prev) => prev.map((x) => (x.id === f.id ? { ...x, allow_download: !next } : x)));
      pushToast('خطا در تغییر دسترسی دانلود', 'error');
    }
  };

  const iconFor = (mime: string, fileName: string) => {
    const ext = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')).toLowerCase() : '';
    if (mime.startsWith('image/')) return Image;
    if (mime.startsWith('video/')) return FileVideo;
    if (mime.startsWith('audio/')) return FileAudio;
    if (mime.includes('pdf')) return FileText;
    if (OFFICE_EXTS.some((e) => ext === e)) return FileText;
    return File;
  };

  const colorFor = (mime: string) => {
    if (mime.startsWith('image/')) return 'text-emerald-400 bg-emerald-500/15';
    if (mime.startsWith('video/')) return 'text-rose-400 bg-rose-500/15';
    if (mime.startsWith('audio/')) return 'text-amber-400 bg-amber-500/15';
    return 'text-sky-400 bg-sky-500/15';
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800">
        <FileText className="w-4 h-4 text-sky-400" />
        <h3 className="text-sm font-bold text-white">فایل‌های جلسه</h3>
        <span className="text-xs text-slate-500 mr-auto">{files.length} فایل</span>
      </div>

      {allowFiles && (
        <div className="p-4 border-b border-slate-800">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              Array.from(e.dataTransfer.files).forEach(addFile);
            }}
            onClick={() => inputRef.current?.click()}
            className={`rounded-xl border-2 border-dashed p-5 text-center cursor-pointer transition-all ${
              dragOver ? 'border-sky-500 bg-sky-500/10' : 'border-slate-700 hover:border-slate-600'
            }`}
          >
            <Upload className="w-7 h-7 text-slate-500 mx-auto mb-2" />
            <p className="text-sm text-slate-300">فایل را اینجا رها کنید یا کلیک کنید</p>
            <p className="text-[11px] text-slate-500 mt-1">حداکثر ۲۰۰ مگابایت • PDF، تصویر، ویدیو، Word، PowerPoint</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                Array.from(e.target.files || []).forEach(addFile);
                e.target.value = '';
              }}
            />
          </div>

          {/* Active uploads with progress bars */}
          {uploads.length > 0 && (
            <div className="mt-3 space-y-2">
              {uploads.map((u) => (
                <div key={u.id} className="glass rounded-lg p-2.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <FileText className="w-4 h-4 text-sky-400 shrink-0" />
                    <span className="text-xs text-white truncate flex-1">{u.name}</span>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {u.status === 'error' ? 'خطا' : u.status === 'done' ? 'تکمیل شد' : `${u.progress}%`}
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-200 ${
                        u.status === 'error' ? 'bg-rose-500' : u.status === 'done' ? 'bg-emerald-500' : 'bg-sky-500'
                      }`}
                      style={{ width: `${u.progress}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">{formatBytes(u.size)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-2">
        {files.length === 0 ? (
          <div className="text-center text-slate-500 text-sm py-8">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
            هنوز فایلی به اشتراک گذاشته نشده.
          </div>
        ) : (
          files.map((f) => {
            const Icon = iconFor(f.mime_type, f.name);
            return (
              <div key={f.id} className="group glass rounded-xl p-3 flex items-center gap-3 anim-fade-up">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${colorFor(f.mime_type)}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{f.name}</p>
                  <p className="text-[11px] text-slate-500">
                    {formatBytes(f.size_bytes)} • {f.shared_by} • {relativeTime(f.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {(canPresent || allowFiles) && (
                    <button
                      onClick={() => onPresent(presentedFileId === f.id ? null : f.id)}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                        presentedFileId === f.id
                          ? 'text-sky-400 bg-sky-500/20'
                          : 'text-slate-400 hover:text-sky-400 hover:bg-sky-500/20'
                      }`}
                      title={presentedFileId === f.id ? 'توقف ارائه' : 'نمایش در کلاس'}
                    >
                      {presentedFileId === f.id ? <X className="w-4 h-4" /> : <Presentation className="w-4 h-4" />}
                    </button>
                  )}
                  {f.shared_by === name && (
                    <button
                      onClick={() => toggleDownload(f)}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                        f.allow_download
                          ? 'text-emerald-400 hover:bg-emerald-500/20'
                          : 'text-amber-400 hover:bg-amber-500/20'
                      }`}
                      title={f.allow_download ? 'دانلود برای همه باز است' : 'دانلود برای همه بسته است'}
                    >
                      {f.allow_download ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                    </button>
                  )}
                  {f.allow_download && (
                    <a
                      href={f.url}
                      download={f.name}
                      className="w-8 h-8 rounded-lg text-slate-400 hover:text-sky-400 hover:bg-sky-500/20 flex items-center justify-center"
                      title="دانلود"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  )}
                  {allowFiles && (
                    <button
                      onClick={() => remove(f.id)}
                      className="w-8 h-8 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/20 flex items-center justify-center"
                      title="حذف"
                    >
                      <Trash2 className="w-4 h-4" />
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
