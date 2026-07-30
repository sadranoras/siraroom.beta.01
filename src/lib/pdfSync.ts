import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type PdfStroke = {
  id: string;
  page: number;
  color: string;
  width: number;
  points: { x: number; y: number }[];
};

export type PdfState = {
  scrollRatio: number;
  zoom: number;
  strokes: PdfStroke[];
};

type PdfStatePayload = Partial<PdfState> & { seq?: number };

const channelName = (slug: string) => `pdf:${slug}`;

export function usePdfSync(
  slug: string,
  isPresenter: boolean,
): {
  state: PdfState;
  setScrollRatio: (r: number) => void;
  setZoom: (z: number) => void;
  addStroke: (s: PdfStroke) => void;
  clearStrokes: () => void;
} {
  const [state, setState] = useState<PdfState>({ scrollRatio: 0, zoom: 1, strokes: [] });
  const stateRef = useRef<PdfState>(state);
  stateRef.current = state;
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    const ch = supabase.channel(channelName(slug));

    ch.on('broadcast', { event: 'pdf-state' }, (msg) => {
      const data = msg.payload as PdfStatePayload;
      if (!data) return;
      setState((prev) => ({
        scrollRatio: data.scrollRatio ?? prev.scrollRatio,
        zoom: data.zoom ?? prev.zoom,
        strokes: data.strokes ?? prev.strokes,
      }));
    });

    ch.on('broadcast', { event: 'pdf-stroke' }, (msg) => {
      const data = msg.payload as PdfStroke;
      if (!data) return;
      setState((prev) =>
        prev.strokes.some((s) => s.id === data.id)
          ? prev
          : { ...prev, strokes: [...prev.strokes, data] },
      );
    });

    ch.on('broadcast', { event: 'pdf-clear' }, () => {
      setState((prev) => ({ ...prev, strokes: [] }));
    });

    ch.on('broadcast', { event: 'pdf-request' }, () => {
      if (!isPresenter) return;
      ch.send({ type: 'broadcast', event: 'pdf-state', payload: stateRef.current });
    });

    channelRef.current = ch;

    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        ch.send({ type: 'broadcast', event: 'pdf-request', payload: {} });
      }
    });

    return () => {
      channelRef.current = null;
      supabase.removeChannel(ch);
    };
  }, [slug, isPresenter]);

  const broadcast = useCallback((event: string, payload: unknown) => {
    channelRef.current?.send({ type: 'broadcast', event, payload });
  }, []);

  const setScrollRatio = useCallback((r: number) => {
    if (!isPresenter) return;
    const next = { ...stateRef.current, scrollRatio: r };
    stateRef.current = next;
    setState(next);
    broadcast('pdf-state', { scrollRatio: r });
  }, [isPresenter, broadcast]);

  const setZoom = useCallback((z: number) => {
    if (!isPresenter) return;
    const next = { ...stateRef.current, zoom: z };
    stateRef.current = next;
    setState(next);
    broadcast('pdf-state', { zoom: z });
  }, [isPresenter, broadcast]);

  const addStroke = useCallback((s: PdfStroke) => {
    const next = { ...stateRef.current, strokes: [...stateRef.current.strokes, s] };
    stateRef.current = next;
    setState(next);
    broadcast('pdf-stroke', s);
  }, [broadcast]);

  const clearStrokes = useCallback(() => {
    if (!isPresenter) return;
    const next = { ...stateRef.current, strokes: [] };
    stateRef.current = next;
    setState(next);
    broadcast('pdf-clear', {});
  }, [isPresenter, broadcast]);

  // Presenter re-broadcasts the full state every 2 seconds so viewers who
  // missed a scroll/zoom broadcast can re-sync. Broadcasts are fire-and-forget;
  // without this, a single missed message leaves viewers permanently out of sync.
  useEffect(() => {
    if (!isPresenter) return;
    const id = setInterval(() => {
      broadcast('pdf-state', stateRef.current);
    }, 2000);
    return () => clearInterval(id);
  }, [isPresenter, broadcast]);

  // Viewers periodically request the current state as a fallback for missed
  // broadcasts. The presenter's pdf-request handler responds with pdf-state.
  useEffect(() => {
    if (isPresenter) return;
    const id = setInterval(() => {
      broadcast('pdf-request', {});
    }, 3000);
    return () => clearInterval(id);
  }, [isPresenter, broadcast]);

  return { state, setScrollRatio, setZoom, addStroke, clearStrokes };
}
