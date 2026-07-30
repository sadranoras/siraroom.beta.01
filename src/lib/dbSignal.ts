import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { supabase } from './supabase';

// A WebRTC signaling message carried as a row in rtc_signals.
export type SignalRow = {
  id: string;
  room_slug: string;
  from_id: string;
  to_id: string;
  kind: string;
  payload: Record<string, unknown>;
  created_at: string;
};

type Handler = (rows: SignalRow[]) => void;

/**
 * Shared database-backed signaling channel for ALL WebRTC hooks in a room.
 * There must be exactly ONE instance per (roomSlug, selfId) — otherwise
 * multiple polling loops would race and a row consumed (deleted) by one
 * instance would be lost to the others.
 *
 * Transport: `postgres_changes` (reliable) + polling fallback. Rows are
 * cleaned up by a periodic server-side delete of old rows, NOT on receipt,
 * so every handler gets a chance to process broadcast ('*') rows.
 */
export function useDbSignal(roomSlug: string, selfId: string) {
  const [peers, setPeers] = useState<string[]>([]);
  // Multiple handlers can register for the same kind (e.g. cam-ice is used by
  // both the camera mesh and... nothing yet, but the design supports it).
  const handlersRef = useRef<Map<string, Set<Handler>>>(new Map());
  const seenRef = useRef<Set<string>>(new Set());

  const on = useCallback((kind: string, fn: Handler) => {
    let set = handlersRef.current.get(kind);
    if (!set) {
      set = new Set();
      handlersRef.current.set(kind, set);
    }
    set.add(fn);
    // Return an unsubscribe function.
    return () => {
      set!.delete(fn);
      if (set!.size === 0) handlersRef.current.delete(kind);
    };
  }, []);

  const send = useCallback(async (
    kind: string,
    toId: string,
    payload: Record<string, unknown> = {},
  ) => {
    const { error } = await supabase.from('rtc_signals').insert({
      room_slug: roomSlug,
      from_id: selfId,
      to_id: toId,
      kind,
      payload,
    });
    if (error) console.error('[dbSignal] insert failed:', kind, error.message);
  }, [roomSlug, selfId]);

  const processRows = useCallback((rows: SignalRow[]) => {
    const newRows = rows.filter((r) => !seenRef.current.has(r.id));
    if (newRows.length === 0) return;

    const byKind = new Map<string, SignalRow[]>();
    for (const r of newRows) {
      seenRef.current.add(r.id);
      if (!byKind.has(r.kind)) byKind.set(r.kind, []);
      byKind.get(r.kind)!.push(r);
    }

    for (const [kind, group] of byKind) {
      const handlers = handlersRef.current.get(kind);
      if (handlers) {
        for (const fn of handlers) fn(group);
      }
    }

    // Track peers from hello/bye rows.
    const toAdd = new Set<string>();
    const toRemove = new Set<string>();
    for (const r of newRows) {
      if (r.from_id === selfId) continue;
      if (r.kind === 'hello' || r.kind === 'cam-hello' || r.kind === 'screen-hello') toAdd.add(r.from_id);
      if (r.kind === 'bye' || r.kind === 'cam-bye' || r.kind === 'screen-stop') toRemove.add(r.from_id);
    }
    if (toAdd.size || toRemove.size) {
      setPeers((prev) => {
        const next = new Set(prev);
        toAdd.forEach((id) => next.add(id));
        toRemove.forEach((id) => next.delete(id));
        return [...next].sort();
      });
    }
  }, [selfId]);

  useEffect(() => {
    if (!roomSlug || !selfId) return;
    seenRef.current.clear();

    // Initial fetch + subscription + polling + cleanup — one loop only.
    const initialFetch = async () => {
      const { data } = await supabase
        .from('rtc_signals')
        .select('*')
        .eq('room_slug', roomSlug)
        .or(`to_id.eq.*,to_id.eq.${selfId}`)
        .order('created_at', { ascending: true })
        .limit(200);
      if (data && data.length > 0) {
        processRows(data as SignalRow[]);
      }
    };
    initialFetch();

    const ch = supabase
      .channel(`rtc-signal:${roomSlug}:${selfId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'rtc_signals', filter: `room_slug=eq.${roomSlug}` },
        (payload) => {
          const row = payload.new as SignalRow;
          if (row.to_id !== '*' && row.to_id !== selfId) return;
          processRows([row]);
        },
      )
      .subscribe();

    const poll = setInterval(() => {
      supabase
        .from('rtc_signals')
        .select('*')
        .eq('room_slug', roomSlug)
        .or(`to_id.eq.*,to_id.eq.${selfId}`)
        .order('created_at', { ascending: true })
        .limit(200)
        .then(({ data }) => {
          if (data && data.length > 0) processRows(data as SignalRow[]);
        });
    }, 500);

    // Periodic cleanup: delete ALL rows older than 15s. This keeps the table
    // small without racing against recipient handlers.
    const cleanup = setInterval(() => {
      supabase
        .from('rtc_signals')
        .delete()
        .eq('room_slug', roomSlug)
        .lt('created_at', new Date(Date.now() - 15000).toISOString())
        .then(() => {});
    }, 5000);

    return () => {
      clearInterval(poll);
      clearInterval(cleanup);
      supabase.removeChannel(ch);
    };
  }, [roomSlug, selfId, processRows]);

  // The signaling interface MUST be referentially stable. WebRTC hooks list
  // `sig` in their effect dependency arrays; if a new object is returned every
  // render (e.g. because `peers` changed), every effect tears down and
  // recreates its peer connections — destroying the offer/answer exchange
  // before it can complete. `on` and `send` are already useCallback-stable, so
  // memoizing them together yields a stable `sig` object.
  const sig = useMemo(() => ({ on, send }), [on, send]);
  return { sig, peers };
}
