import { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  ZoomIn, ZoomOut, Loader2, Trash2, Pen, Eraser, Download,
} from 'lucide-react';
import { usePdfSync, type PdfStroke } from '@/lib/pdfSync';
import { toPersianDigits } from '@/lib/utils';

type Props = {
  slug: string;
  url: string;
  title: string;
  isPresenter: boolean;
};

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString();

const CANVAS_BG = '#ffffff';

type Tool = 'pen' | 'eraser' | null;

export default function PdfViewer({ slug, url, title, isPresenter }: Props) {
  const { state, setScrollRatio, setZoom, addStroke, clearStrokes } = usePdfSync(slug, isPresenter);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const [tool, setTool] = useState<Tool>(null);
  const [color, setColor] = useState('#ef4444');
  const [penSize, setPenSize] = useState(3);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const pageContainersRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const pageCanvasesRef = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const pageOverlaysRef = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const drawing = useRef(false);
  const currentStroke = useRef<PdfStroke | null>(null);
  const renderedPagesRef = useRef<Set<number>>(new Set());
  const zoomRef = useRef(state.zoom);
  zoomRef.current = state.zoom;

  // Load PDF document
  useEffect(() => {
    let active = true;
    setLoading(true);
    setErr(false);
    renderedPagesRef.current.clear();
    pageContainersRef.current.clear();
    pageCanvasesRef.current.clear();
    pageOverlaysRef.current.clear();
    (async () => {
      try {
        const res = await fetch(url, { mode: 'cors' });
        if (!res.ok) throw new Error(`fetch ${res.status}`);
        const buf = await res.arrayBuffer();
        if (!active) return;
        const loadingTask = pdfjsLib.getDocument({ data: buf });
        const doc = await loadingTask.promise;
        if (!active) {
          doc.destroy();
          return;
        }
        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
        // Auto-fit: compute zoom so the first page fits the container width.
        try {
          const page = await doc.getPage(1);
          const baseViewport = page.getViewport({ scale: 1 });
          const container = scrollRef.current;
          const availWidth = container ? container.clientWidth - 32 : 800;
          const fitZoom = Math.max(0.5, Math.min(2, availWidth / baseViewport.width));
          zoomRef.current = fitZoom;
          setZoom(fitZoom);
        } catch {
          // keep default zoom 1
        }
        setLoading(false);
      } catch {
        if (active) {
          setErr(true);
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
      renderTasksRef.current.forEach((t) => t.cancel());
      renderTasksRef.current.clear();
      pdfDocRef.current?.destroy();
      pdfDocRef.current = null;
    };
  }, [url]);

  // Render a single page to its canvas at the current zoom
  // Track in-flight render tasks so we can cancel them when zoom changes.
  // Without cancellation, the old render (at the previous zoom) and the new
  // render (at the new zoom) both write to the same canvas simultaneously —
  // pdf.js interleaves their glyph drawing, producing garbled/corrupted text.
  const renderTasksRef = useRef<Map<number, { cancel: () => void }>>(new Map());

  // Render a single page to its canvas at the current zoom.
  // A render generation guard prevents concurrent renders at different zooms:
  // when zoom changes, the zoom effect increments renderGenRef and clears all
  // rendered pages. But a previous renderPage call may still be awaiting
  // getPage() — it hasn't registered a render task yet, so it can't be
  // cancelled by the zoom effect. Without the guard, that stale call proceeds
  // to render at the OLD zoom while the new call renders at the NEW zoom,
  // both writing to the same canvas and garbling the text.
  const renderGenRef = useRef(0);
  const renderPage = useCallback(async (pageNum: number) => {
    const doc = pdfDocRef.current;
    const canvas = pageCanvasesRef.current.get(pageNum);
    const overlay = pageOverlaysRef.current.get(pageNum);
    if (!doc || !canvas || !overlay) return;
    if (renderedPagesRef.current.has(pageNum)) return;
    renderedPagesRef.current.add(pageNum);
    const myGen = renderGenRef.current;

    // Cancel any previous render for this page before starting a new one.
    const prevTask = renderTasksRef.current.get(pageNum);
    if (prevTask) prevTask.cancel();

    try {
      const page = await doc.getPage(pageNum);
      // If zoom changed while we were awaiting getPage(), abort — the zoom
      // effect has already started a fresh render at the correct zoom.
      if (myGen !== renderGenRef.current) return;
      const zoom = zoomRef.current;
      const viewport = page.getViewport({ scale: zoom });
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const renderTask = page.render({ canvasContext: ctx, viewport });
      renderTasksRef.current.set(pageNum, { cancel: () => renderTask.cancel() });
      await renderTask.promise;

      if (myGen !== renderGenRef.current) return;
      overlay.width = Math.floor(viewport.width * dpr);
      overlay.height = Math.floor(viewport.height * dpr);
      overlay.style.width = `${viewport.width}px`;
      overlay.style.height = `${viewport.height}px`;
      const octx = overlay.getContext('2d');
      if (octx) octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      redrawOverlay(pageNum);
    } catch {
      renderedPagesRef.current.delete(pageNum);
    } finally {
      renderTasksRef.current.delete(pageNum);
    }
  }, []);

  const redrawOverlay = useCallback((pageNum: number) => {
    const overlay = pageOverlaysRef.current.get(pageNum);
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    for (const s of state.strokes) {
      if (s.page !== pageNum) continue;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      s.points.forEach((p, i) => {
        const x = p.x * overlay.width;
        const y = p.y * overlay.height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  }, [state.strokes]);

  // Intersection observer to render pages as they scroll into view
  useEffect(() => {
    if (loading || !numPages) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const pageNum = Number((entry.target as HTMLElement).dataset.pageNum);
            if (pageNum > 0) renderPage(pageNum);
          }
        }
      },
      { root: scrollRef.current, rootMargin: '200px 0px' },
    );
    pageContainersRef.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [loading, numPages, renderPage, state.zoom]);

  // Re-render all visible pages when zoom changes. Cancel any in-flight
  // renders first so the old (wrong-scale) render doesn't interleave with
  // the new one and corrupt the text. Increment the render generation so
  // stale renderPage calls (still awaiting getPage) know to abort.
  useEffect(() => {
    if (loading || !numPages) return;
    renderGenRef.current++;
    renderTasksRef.current.forEach((t) => t.cancel());
    renderTasksRef.current.clear();
    renderedPagesRef.current.clear();
    pageContainersRef.current.forEach((el) => {
      const pageNum = Number(el.dataset.pageNum);
      if (pageNum > 0) renderPage(pageNum);
    });
  }, [state.zoom, loading, numPages, renderPage]);

  // Redraw overlays when strokes change
  useEffect(() => {
    if (loading) return;
    pageOverlaysRef.current.forEach((_, pageNum) => redrawOverlay(pageNum));
  }, [state.strokes, loading, redrawOverlay]);

  // Scroll sync: presenter's scroll position is broadcast to viewers
  useEffect(() => {
    if (!isPresenter) return;
    const el = scrollRef.current;
    if (!el) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const maxScroll = el.scrollHeight - el.clientHeight;
        const ratio = maxScroll > 0 ? el.scrollTop / maxScroll : 0;
        setScrollRatio(ratio);
        ticking = false;
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [isPresenter, setScrollRatio]);

  // Viewers apply scroll position from presenter
  useEffect(() => {
    if (isPresenter) return;
    const el = scrollRef.current;
    if (!el || !numPages) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    el.scrollTo({ top: state.scrollRatio * maxScroll, behavior: 'smooth' });
  }, [state.scrollRatio, numPages, isPresenter]);

  const overlayPos = (e: React.PointerEvent, pageNum: number) => {
    const overlay = pageOverlaysRef.current.get(pageNum);
    if (!overlay) return { x: 0, y: 0 };
    const rect = overlay.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  };

  const onPointerDown = (e: React.PointerEvent, pageNum: number) => {
    if (!isPresenter || !tool) return;
    drawing.current = true;
    const p = overlayPos(e, pageNum);
    currentStroke.current = {
      id: crypto.randomUUID(),
      page: pageNum,
      color: tool === 'eraser' ? '#ffffff' : color,
      width: tool === 'eraser' ? penSize * 4 : penSize,
      points: [p],
    };
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent, pageNum: number) => {
    if (!drawing.current || !currentStroke.current) return;
    const p = overlayPos(e, pageNum);
    currentStroke.current.points.push(p);
    const overlay = pageOverlaysRef.current.get(pageNum);
    const ctx = overlay?.getContext('2d');
    if (!ctx || !overlay) return;
    ctx.strokeStyle = currentStroke.current.color;
    ctx.lineWidth = currentStroke.current.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const pts = currentStroke.current.points;
    const last = pts[pts.length - 2];
    const now = pts[pts.length - 1];
    ctx.beginPath();
    ctx.moveTo(last.x * overlay.width, last.y * overlay.height);
    ctx.lineTo(now.x * overlay.width, now.y * overlay.height);
    ctx.stroke();
  };

  const onPointerUp = () => {
    if (drawing.current && currentStroke.current) {
      addStroke(currentStroke.current);
    }
    drawing.current = false;
    currentStroke.current = null;
  };

  const downloadPage = async () => {
    // Download the first visible page
    for (const [pageNum, canvas] of pageCanvasesRef.current) {
      const rect = canvas.getBoundingClientRect();
      if (rect.bottom > 0 && rect.top < window.innerHeight) {
        const a = document.createElement('a');
        a.download = `${title}-page-${pageNum}.png`;
        a.href = canvas.toDataURL('image/png');
        a.click();
        return;
      }
    }
  };

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-400">
        <Loader2 className="w-7 h-7 animate-spin" />
      </div>
    );
  }

  if (err) {
    return (
      <iframe
        src={url}
        title={title}
        className="w-full h-full rounded-lg bg-white"
        style={{ border: 'none' }}
      />
    );
  }

  const COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#38bdf8', '#a855f7', '#0f172a'];
  const pageNumbers = Array.from({ length: numPages }, (_, i) => i + 1);

  return (
    <div className="w-full h-full flex flex-col">
      {/* toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 bg-slate-900/80 border-b border-slate-800 shrink-0 flex-wrap">
        <span className="text-xs text-slate-300 font-medium tabular-nums px-1">
          {toPersianDigits(numPages)} صفحه
        </span>

        <div className="w-px h-5 bg-slate-700 mx-1" />

        <button
          onClick={() => setZoom(Math.max(0.5, state.zoom - 0.25))}
          disabled={!isPresenter}
          className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 flex items-center justify-center"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="text-xs text-slate-300 tabular-nums w-10 text-center">
          {toPersianDigits(Math.round(state.zoom * 100))}٪
        </span>
        <button
          onClick={() => setZoom(Math.min(5, state.zoom + 0.25))}
          disabled={!isPresenter}
          className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 flex items-center justify-center"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        {isPresenter && (
          <>
            <div className="w-px h-5 bg-slate-700 mx-1" />
            <button
              onClick={() => setTool(tool === 'pen' ? null : 'pen')}
              className={`w-7 h-7 rounded-lg flex items-center justify-center ${tool === 'pen' ? 'bg-sky-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
            >
              <Pen className="w-4 h-4" />
            </button>
            <button
              onClick={() => setTool(tool === 'eraser' ? null : 'eraser')}
              className={`w-7 h-7 rounded-lg flex items-center justify-center ${tool === 'eraser' ? 'bg-sky-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
            >
              <Eraser className="w-4 h-4" />
            </button>
            {tool === 'pen' && (
              <div className="flex items-center gap-1 mx-1">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`w-5 h-5 rounded-full border-2 ${color === c ? 'border-white' : 'border-slate-700'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <input
                  type="range"
                  min={1}
                  max={12}
                  value={penSize}
                  onChange={(e) => setPenSize(+e.target.value)}
                  className="w-16 mr-1"
                />
              </div>
            )}
            <button
              onClick={clearStrokes}
              className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 hover:text-rose-400 hover:bg-rose-500/20 flex items-center justify-center"
              title="پاک کردن یادداشت‌ها"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        )}

        <button
          onClick={downloadPage}
          className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 hover:text-sky-400 hover:bg-sky-500/20 flex items-center justify-center mr-auto"
          title="دانلود صفحه"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable PDF — all pages rendered in a vertical scroll container */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scrollbar-thin bg-slate-950"
      >
        <div className="flex flex-col items-center gap-3 p-4">
          {pageNumbers.map((pageNum) => (
            <div
              key={pageNum}
              data-page-num={pageNum}
              ref={(el) => {
                if (el) pageContainersRef.current.set(pageNum, el);
                else pageContainersRef.current.delete(pageNum);
              }}
              className="relative shadow-2xl"
              style={{ background: CANVAS_BG }}
            >
              <canvas
                ref={(el) => {
                  if (el) pageCanvasesRef.current.set(pageNum, el);
                  else pageCanvasesRef.current.delete(pageNum);
                }}
                className="block"
              />
              <canvas
                ref={(el) => {
                  if (el) pageOverlaysRef.current.set(pageNum, el);
                  else pageOverlaysRef.current.delete(pageNum);
                }}
                onPointerDown={(e) => onPointerDown(e, pageNum)}
                onPointerMove={(e) => onPointerMove(e, pageNum)}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
                className={`absolute inset-0 ${isPresenter && tool ? 'cursor-crosshair touch-none' : 'pointer-events-none'}`}
              />
            </div>
          ))}
        </div>
      </div>
      {!isPresenter && (
        <div className="text-center text-[11px] text-slate-500 pb-1">
          نمایش همگام‌شده با میزبان
        </div>
      )}
    </div>
  );
}
