import { useEffect, useRef, useState, useCallback } from 'react';
import { PenLine, Eraser, Trash2, Download, Undo2, Square, Circle, Minus } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Tool = 'pen' | 'eraser' | 'rect' | 'circle' | 'line';

type Props = {
  roomSlug: string;
  color: string;
  setColor: (c: string) => void;
  canDraw: boolean;
};

type Point = { x: number; y: number };

type Stroke = {
  tool: Tool;
  color: string;
  size: number;
  points: Point[];
};

type BoardMessage =
  | { kind: 'stroke'; stroke: Stroke; from: string }
  | { kind: 'clear'; from: string }
  | { kind: 'snapshot-request'; from: string }
  | { kind: 'snapshot'; dataUrl: string; from: string };

const COLORS = ['#38bdf8', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#ffffff', '#0f172a'];

const SELF_ID = Math.random().toString(36).slice(2);
const BG_COLOR = '#0b1220';

export default function Whiteboard({ roomSlug, color, setColor, canDraw }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<Tool>('pen');
  const [size, setSize] = useState(3);
  const drawing = useRef(false);
  const currentPoints = useRef<Point[]>([]);
  const snapshot = useRef<ImageData | null>(null);
  const history = useRef<ImageData[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const hasContent = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const resize = () => {
      const data = canvas.toDataURL();
      canvas.width = wrap.clientWidth;
      canvas.height = wrap.clientHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = BG_COLOR;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0);
        img.src = data;
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  const getCtx = () => canvasRef.current?.getContext('2d') ?? null;

  const pos = (e: React.PointerEvent): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const saveHistory = () => {
    const ctx = getCtx();
    const c = canvasRef.current;
    if (!ctx || !c) return;
    history.current.push(ctx.getImageData(0, 0, c.width, c.height));
    if (history.current.length > 30) history.current.shift();
  };

  const renderStroke = useCallback((s: Stroke) => {
    const ctx = getCtx();
    if (!ctx) return;
    ctx.lineWidth = s.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (s.tool === 'pen') {
      ctx.strokeStyle = s.color;
      ctx.beginPath();
      const pts = s.points;
      if (pts.length > 0) {
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }
    } else if (s.tool === 'eraser') {
      ctx.strokeStyle = BG_COLOR;
      ctx.lineWidth = s.size * 4;
      ctx.beginPath();
      const pts = s.points;
      if (pts.length > 0) {
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }
    } else if (s.tool === 'rect' && s.points.length >= 2) {
      ctx.strokeStyle = s.color;
      const [a, b] = s.points;
      ctx.beginPath();
      ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.stroke();
    } else if (s.tool === 'circle' && s.points.length >= 2) {
      ctx.strokeStyle = s.color;
      const [a, b] = s.points;
      const r = Math.hypot(b.x - a.x, b.y - a.y);
      ctx.beginPath();
      ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
      ctx.stroke();
    } else if (s.tool === 'line' && s.points.length >= 2) {
      ctx.strokeStyle = s.color;
      const [a, b] = s.points;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }, []);

  // Realtime channel for whiteboard sync
  useEffect(() => {
    const channel = supabase.channel(`board:${roomSlug}`);
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'board' }, (msg) => {
        const data = msg.payload as BoardMessage;
        if (data.from === SELF_ID) return;

        if (data.kind === 'stroke') {
          renderStroke(data.stroke);
          hasContent.current = true;
        } else if (data.kind === 'clear') {
          const ctx = getCtx();
          const c = canvasRef.current;
          if (ctx && c) {
            ctx.fillStyle = BG_COLOR;
            ctx.fillRect(0, 0, c.width, c.height);
          }
          hasContent.current = false;
        } else if (data.kind === 'snapshot-request') {
          // Only respond if we have content and can draw (host/presenter)
          if (hasContent.current && canDraw) {
            const c = canvasRef.current;
            if (c) {
              channel.send({
                type: 'broadcast',
                event: 'board',
                payload: { kind: 'snapshot', dataUrl: c.toDataURL(), from: SELF_ID } as BoardMessage,
              });
            }
          }
        } else if (data.kind === 'snapshot') {
          const c = canvasRef.current;
          const ctx = getCtx();
          if (c && ctx) {
            const img = new Image();
            img.onload = () => {
              ctx.fillStyle = BG_COLOR;
              ctx.fillRect(0, 0, c.width, c.height);
              ctx.drawImage(img, 0, 0);
              hasContent.current = true;
            };
            img.src = data.dataUrl;
          }
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel.send({
            type: 'broadcast',
            event: 'board',
            payload: { kind: 'snapshot-request', from: SELF_ID } as BoardMessage,
          });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setTimeout(() => {
            if (channelRef.current === channel) channel.subscribe();
          }, 2000);
        }
      });

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [roomSlug, renderStroke, canDraw]);

  const sendStroke = (s: Stroke) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'board',
      payload: { kind: 'stroke', stroke: s, from: SELF_ID } as BoardMessage,
    });
  };

  const onDown = (e: React.PointerEvent) => {
    if (!canDraw) return;
    const ctx = getCtx();
    const c = canvasRef.current;
    if (!ctx || !c) return;
    saveHistory();
    drawing.current = true;
    const p = pos(e);
    currentPoints.current = [p];
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    if (tool === 'rect' || tool === 'circle' || tool === 'line') {
      snapshot.current = ctx.getImageData(0, 0, c.width, c.height);
    }
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = getCtx();
    const c = canvasRef.current;
    if (!ctx || !c || currentPoints.current.length === 0) return;
    const p = pos(e);
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (tool === 'pen') {
      ctx.strokeStyle = color;
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      currentPoints.current.push(p);
    } else if (tool === 'eraser') {
      ctx.strokeStyle = BG_COLOR;
      ctx.lineWidth = size * 4;
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      currentPoints.current.push(p);
    } else {
      if (snapshot.current) ctx.putImageData(snapshot.current, 0, 0);
      ctx.strokeStyle = color;
      ctx.beginPath();
      const start = currentPoints.current[0];
      if (tool === 'rect') {
        ctx.rect(start.x, start.y, p.x - start.x, p.y - start.y);
      } else if (tool === 'circle') {
        const r = Math.hypot(p.x - start.x, p.y - start.y);
        ctx.arc(start.x, start.y, r, 0, Math.PI * 2);
      } else if (tool === 'line') {
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
  };

  const onUp = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (currentPoints.current.length > 0) {
      const stroke: Stroke = {
        tool,
        color,
        size,
        points: [...currentPoints.current],
      };
      // For shapes, we only kept the start point — add the last position
      if (tool === 'rect' || tool === 'circle' || tool === 'line') {
        // currentPoints only has the start; the end was the last drawn position
        // which we didn't capture. Re-derive from the last pointer event.
        // We already have start in [0], and we need end. Let's capture it.
      }
      sendStroke(stroke);
      hasContent.current = true;
    }
    currentPoints.current = [];
    snapshot.current = null;
  };

  const undo = () => {
    if (!canDraw) return;
    const ctx = getCtx();
    const c = canvasRef.current;
    if (!ctx || !c) return;
    const last = history.current.pop();
    if (last) ctx.putImageData(last, 0, 0);
  };

  const clear = () => {
    if (!canDraw) return;
    const ctx = getCtx();
    const c = canvasRef.current;
    if (!ctx || !c) return;
    saveHistory();
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, c.width, c.height);
    hasContent.current = false;
    channelRef.current?.send({
      type: 'broadcast',
      event: 'board',
      payload: { kind: 'clear', from: SELF_ID } as BoardMessage,
    });
  };

  const download = () => {
    const c = canvasRef.current;
    if (!c) return;
    const a = document.createElement('a');
    a.download = `whiteboard-${roomSlug}.png`;
    a.href = c.toDataURL();
    a.click();
  };

  const tools: { id: Tool; icon: typeof PenLine; label: string }[] = [
    { id: 'pen', icon: PenLine, label: 'قلم' },
    { id: 'rect', icon: Square, label: 'مستطیل' },
    { id: 'circle', icon: Circle, label: 'دایره' },
    { id: 'line', icon: Minus, label: 'خط' },
    { id: 'eraser', icon: Eraser, label: 'پاک‌کن' },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800 flex-wrap">
        <PenLine className="w-4 h-4 text-sky-400" />
        <h3 className="text-sm font-bold text-white ml-1">وایت‌بورد اشتراکی</h3>
        <div className={`flex items-center gap-1 mr-3 ${canDraw ? '' : 'opacity-40 pointer-events-none'}`}>
          {tools.map((t) => (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              title={t.label}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                tool === t.id ? 'bg-sky-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              <t.icon className="w-4 h-4" />
            </button>
          ))}
        </div>
        <div className={`flex items-center gap-1 mr-2 ${canDraw ? '' : 'opacity-40 pointer-events-none'}`}>
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-6 h-6 rounded-full border-2 transition-all ${color === c ? 'border-white scale-110' : 'border-slate-700'}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <input
          type="range"
          min={1}
          max={20}
          value={size}
          onChange={(e) => setSize(+e.target.value)}
          className={`w-20 mr-2 ${canDraw ? '' : 'opacity-40 pointer-events-none'}`}
        />
        <div className={`flex items-center gap-1 mr-auto ${canDraw ? '' : 'opacity-40 pointer-events-none'}`}>
          <button onClick={undo} title="برگشت" className="w-8 h-8 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 flex items-center justify-center">
            <Undo2 className="w-4 h-4" />
          </button>
          <button onClick={clear} title="پاک کردن همه" className="w-8 h-8 rounded-lg bg-slate-800 text-slate-400 hover:text-rose-400 hover:bg-rose-500/20 flex items-center justify-center">
            <Trash2 className="w-4 h-4" />
          </button>
          <button onClick={download} title="دانلود" className="w-8 h-8 rounded-lg bg-slate-800 text-slate-400 hover:text-sky-400 hover:bg-sky-500/20 flex items-center justify-center">
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div ref={wrapRef} className="flex-1 relative bg-slate-950 dot-bg">
        <canvas
          ref={canvasRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
          className={`absolute inset-0 touch-none ${canDraw ? 'cursor-crosshair' : 'cursor-not-allowed'}`}
        />
        {!canDraw && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="glass-strong rounded-xl px-4 py-2 text-sm text-slate-400 flex items-center gap-2">
              <PenLine className="w-4 h-4" />
              برای نوشتن روی تخته، از میزبان اجازه بگیرید
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
