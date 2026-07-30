import { lazy, Suspense } from 'react';
import { Presentation, Download, X, FileText, Lock } from 'lucide-react';
import type { PresentedFile } from '@/lib/presence';

const PdfViewer = lazy(() => import('@/components/PdfViewer'));

type Props = {
  file: PresentedFile;
  slug: string;
  isPresenter: boolean;
  onClose?: () => void;
};

const OFFICE_MIME: Record<string, boolean> = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': true,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': true,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': true,
  'application/msword': true,
  'application/vnd.ms-powerpoint': true,
  'application/vnd.ms-excel': true,
};

function isOfficeFile(mime: string): boolean {
  return !!OFFICE_MIME[mime];
}

export default function FilePresentation({ file, slug, isPresenter, onClose }: Props) {
  const isOffice = isOfficeFile(file.mime_type);

  return (
    <div className="h-full w-full rounded-2xl overflow-hidden bg-slate-950 ring-2 ring-sky-400/50 flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900/80 border-b border-slate-800 shrink-0">
        <span className="text-xs text-sky-300 font-bold flex items-center gap-2 truncate">
          <Presentation className="w-4 h-4 shrink-0" /> ارائه فایل • {file.name}
        </span>
        {onClose && isPresenter && (
          <button onClick={onClose} className="text-xs text-slate-400 hover:text-white flex items-center gap-1 shrink-0">
            <X className="w-3.5 h-3.5" /> پایان ارائه
          </button>
        )}
      </div>
      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden min-h-0">
        {file.mime_type.startsWith('image/') ? (
          <img
            src={file.url}
            alt={file.name}
            className="max-w-full max-h-full object-contain rounded-lg"
            style={{ imageRendering: 'auto' }}
          />
        ) : file.mime_type.startsWith('video/') ? (
          <video
            src={file.url}
            controls
            className="max-w-full max-h-full rounded-lg"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        ) : file.mime_type.startsWith('audio/') ? (
          <div className="w-full max-w-md flex flex-col items-center gap-4">
            <div className="w-full flex items-center justify-center py-8">
              <div className="w-20 h-20 rounded-full bg-sky-500/20 flex items-center justify-center">
                <Presentation className="w-10 h-10 text-sky-400" />
              </div>
            </div>
            <audio src={file.url} controls className="w-full" />
          </div>
        ) : file.mime_type === 'application/pdf' ? (
          <Suspense fallback={<div className="flex items-center justify-center text-slate-400"><Presentation className="w-8 h-8 animate-pulse" /></div>}>
            <PdfViewer slug={slug} url={file.url} title={file.name} isPresenter={isPresenter} />
          </Suspense>
        ) : isOffice ? (
          <div className="w-full h-full flex flex-col">
            <iframe
              src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(file.url)}`}
              className="flex-1 w-full bg-white"
              style={{ border: 'none', minHeight: 0 }}
              title={file.name}
            />
            <div className="shrink-0 flex items-center justify-center gap-3 py-2 bg-slate-900/80 border-t border-slate-800">
              {file.allow_download ? (
                <a href={file.url} download={file.name} className="px-4 py-2 rounded-xl bg-sky-500 text-white text-xs font-bold flex items-center gap-2 hover:bg-sky-400 transition-colors">
                  <Download className="w-4 h-4" /> دانلود فایل
                </a>
              ) : (
                <span className="px-4 py-2 text-amber-400 text-xs font-bold flex items-center gap-2">
                  <Lock className="w-4 h-4" /> دانلود توسط آپلودکننده غیرفعال شده است
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center">
              <Presentation className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-sm text-slate-400">پیش‌نمایش این نوع فایل پشتیبانی نمی‌شود</p>
            {file.allow_download ? (
              <a href={file.url} download={file.name} className="px-4 py-3 rounded-xl bg-sky-500 text-white text-sm font-bold flex items-center gap-2 hover:bg-sky-400 transition-colors">
                <Download className="w-4 h-4" /> دانلود {file.name}
              </a>
            ) : (
              <span className="px-4 py-3 text-amber-400 text-sm font-bold flex items-center gap-2">
                <Lock className="w-4 h-4" /> دانلود توسط آپلودکننده غیرفعال شده است
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
