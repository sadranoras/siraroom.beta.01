import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from './supabase';

export type Role = 'host' | 'presenter' | 'viewer';

export type Participant = {
  id: string;
  userId: string | null;
  name: string;
  avatarColor: string;
  role: Role;
  isAdmin: boolean;
  isSpeaking: boolean;
  micOn: boolean;
  camOn: boolean;
  handRaised: boolean;
  joinedAt: number;
  // Per-participant grants the host can toggle. Viewers start with none;
  // presenters inherit mic/cam/screen/whiteboard/file by default.
  canUseMic: boolean;
  canUseCam: boolean;
  canDrawBoard: boolean;
  canShareScreen: boolean;
  canShareFile: boolean;
};

export type ReactionEvent = {
  id: string;
  emoji: string;
  name: string;
  ts: number;
};

// The full file payload carried in the present-file broadcast so receivers
// don't need a database round-trip (which can fail silently for non-hosts).
export type PresentedFile = {
  id: string;
  name: string;
  url: string;
  mime_type: string;
  size_bytes: number;
  shared_by: string;
  allow_download: boolean;
};

type PresenceState = Record<string, Participant>;

const HEARTBEAT_MS = 4000;

// Default capability grants per role. Hosts get everything; presenters get the
// production tools; viewers get nothing by default and must be granted access
// by the host. Mic/cam are also independently grantable per-participant.
export function defaultGrantsForRole(role: Role) {
  if (role === 'host') {
    return { canUseMic: true, canUseCam: true, canDrawBoard: true, canShareScreen: true, canShareFile: true };
  }
  if (role === 'presenter') {
    return { canUseMic: true, canUseCam: true, canDrawBoard: true, canShareScreen: true, canShareFile: true };
  }
  return { canUseMic: false, canUseCam: false, canDrawBoard: false, canShareScreen: false, canShareFile: false };
}

// Whether a participant may exercise a given capability, combining their role
// grants with any per-participant overrides the host has set.
export function canPerform(p: Participant, cap: 'mic' | 'cam' | 'board' | 'screen' | 'file'): boolean {
  if (p.role === 'host' || p.isAdmin) return true;
  switch (cap) {
    case 'mic': return p.canUseMic;
    case 'cam': return p.canUseCam;
    case 'board': return p.canDrawBoard;
    case 'screen': return p.canShareScreen;
    case 'file': return p.canShareFile;
  }
}

export function useRoomPresence(roomSlug: string, self: Participant | null) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [reactions, setReactions] = useState<ReactionEvent[]>([]);
  const [presentedFile, setPresentedFile] = useState<PresentedFile | null>(null);
  const [selfHandRaised, setSelfHandRaised] = useState(false);
  const presentedFileRef = useRef<PresentedFile | null>(null);
  // True only on the participant who initiated the current presentation, so
  // they alone answer a late joiner's request and re-broadcast the file.
  const presentedByMeRef = useRef(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const setPresentedFileBoth = useCallback((f: PresentedFile | null) => {
    presentedFileRef.current = f;
    presentedByMeRef.current = f !== null;
    setPresentedFile(f);
  }, []);

  const applyPresentedFile = useCallback((f: PresentedFile | null) => {
    presentedFileRef.current = f;
    presentedByMeRef.current = false;
    setPresentedFile(f);
  }, []);

  // Source of truth for the tracked presence. Only re-seed from `self` when the
  // identity (id) changes — never on every prop update, or the channel storm
  // caused by rapidly-flipping `speaking`/`micOn` would tear the connection down.
  const selfRef = useRef<Participant | null>(null);
  if (self && selfRef.current?.id !== self.id) {
    selfRef.current = { ...self };
  }

  const updateSelf = useCallback((patch: Partial<Participant>) => {
    const channel = channelRef.current;
    const current = selfRef.current;
    if (!channel || !current) return;
    const next = { ...current, ...patch };
    selfRef.current = next;
    channel.track(next);
  }, []);

  const sendReaction = useCallback((emoji: string) => {
    const channel = channelRef.current;
    const current = selfRef.current;
    if (!channel || !current) return;
    const evt: ReactionEvent = {
      id: Math.random().toString(36).slice(2),
      emoji,
      name: current.name,
      ts: Date.now(),
    };
    channel.send({ type: 'broadcast', event: 'reaction', payload: evt });
    setReactions((prev) => [...prev, evt]);
  }, []);

  const sendEvent = useCallback((event: string, payload: unknown) => {
    channelRef.current?.send({ type: 'broadcast', event, payload });
  }, []);

  // Channel setup depends only on the room + identity (id), NOT on the full
  // self object — otherwise every speaking/mic toggle re-runs this effect and
  // destroys/recreates the realtime channel.
  const selfId = self?.id;
  useEffect(() => {
    if (!roomSlug || !selfId) return;
    const initial = selfRef.current;
    if (!initial) return;

    const channel = supabase.channel(`room:${roomSlug}`, {
      config: { presence: { key: selfId } },
    });
    channelRef.current = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<Participant>();
        const map: PresenceState = {};
        Object.values(state).forEach((arr) => {
          arr.forEach((p) => {
            map[p.id] = p;
          });
        });
        setParticipants(Object.values(map).sort((a, b) => a.joinedAt - b.joinedAt));
      })
      .on('broadcast', { event: 'reaction' }, (msg) => {
        setReactions((prev) => [...prev, msg.payload as ReactionEvent]);
      })
      .on('broadcast', { event: 'speaking' }, (msg) => {
        const data = msg.payload as { id: string; speaking: boolean };
        setParticipants((prev) =>
          prev.map((p) => (p.id === data.id ? { ...p, isSpeaking: data.speaking } : p)),
        );
      })
      .on('broadcast', { event: 'media-state' }, (msg) => {
        const data = msg.payload as { id: string; micOn: boolean; camOn: boolean };
        if (selfRef.current?.id === data.id) {
          selfRef.current = { ...selfRef.current, micOn: data.micOn, camOn: data.camOn };
          channelRef.current?.track(selfRef.current);
        }
        setParticipants((prev) =>
          prev.map((p) => (p.id === data.id ? { ...p, micOn: data.micOn, camOn: data.camOn } : p)),
        );
      })
      // Host reassigns a participant's role. The targeted participant updates
      // their own self + re-tracks; everyone else just updates the list.
      .on('broadcast', { event: 'role-change' }, (msg) => {
        const data = msg.payload as { id: string; role: Role };
        const grants = defaultGrantsForRole(data.role);
        if (selfRef.current?.id === data.id) {
          selfRef.current = { ...selfRef.current, role: data.role, ...grants };
          channelRef.current?.track(selfRef.current);
        }
        setParticipants((prev) =>
          prev.map((p) => (p.id === data.id ? { ...p, role: data.role, ...grants } : p)),
        );
      })
      // Host toggles a per-participant capability grant (mic/cam/board/screen/file).
      .on('broadcast', { event: 'grant' }, (msg) => {
        const data = msg.payload as { id: string; cap: 'mic' | 'cam' | 'board' | 'screen' | 'file'; value: boolean };
        const key = data.cap === 'mic' ? 'canUseMic' : data.cap === 'cam' ? 'canUseCam' : data.cap === 'board' ? 'canDrawBoard' : data.cap === 'screen' ? 'canShareScreen' : 'canShareFile';
        if (selfRef.current?.id === data.id) {
          selfRef.current = { ...selfRef.current, [key]: data.value };
          channelRef.current?.track(selfRef.current);
        }
        setParticipants((prev) =>
          prev.map((p) => (p.id === data.id ? { ...p, [key]: data.value } : p)),
        );
      })
      .on('broadcast', { event: 'present-file' }, (msg) => {
        const data = msg.payload as { file: PresentedFile | null; from?: string } | null;
        // Skip our own broadcast so we don't reset presentedByMeRef.
        if (data?.from && data.from === selfRef.current?.id) return;
        const incoming = data?.file ?? null;
        // Receivers always apply the file without claiming ownership, so a
        // late-joiner's re-broadcast doesn't make existing viewers think
        // they are the presenter.
        applyPresentedFile(incoming);
      })
      // A late joiner asks for the current presentation. Only the
      // participant who initiated it answers, so the file is re-broadcast
      // exactly once instead of spammed by everyone in the room.
      .on('broadcast', { event: 'present-request' }, () => {
        if (presentedByMeRef.current && presentedFileRef.current) {
          channel.send({
            type: 'broadcast',
            event: 'present-file',
            payload: { file: presentedFileRef.current, from: selfRef.current?.id },
          });
        }
      })
      .on('broadcast', { event: 'force-leave' }, (msg) => {
        const data = msg.payload as { id: string };
        if (data.id === 'all' || selfRef.current?.id === data.id) {
          window.location.hash = '';
          window.location.reload();
        }
      })
      // Host left the room — everyone else is kicked (room closes).
      .on('broadcast', { event: 'host-left' }, () => {
        window.location.hash = '';
        window.location.reload();
      })
      // Participant raised / lowered their hand — host UI reacts in real time.
      .on('broadcast', { event: 'hand' }, (msg) => {
        const data = msg.payload as { id: string; raised: boolean };
        // Update selfRef if the host is lowering our hand from across the room.
        if (selfRef.current?.id === data.id) {
          selfRef.current = { ...selfRef.current, handRaised: data.raised };
          channelRef.current?.track(selfRef.current);
          setSelfHandRaised(data.raised);
        }
        setParticipants((prev) =>
          prev.map((p) => (p.id === data.id ? { ...p, handRaised: data.raised } : p)),
        );
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track(selfRef.current ?? initial);
          // Ask whoever is currently presenting to re-broadcast the file so
          // late joiners learn what's on stage. Anyone who isn't presenting
          // ignores the request.
          channel.send({ type: 'broadcast', event: 'present-request', payload: {} });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // Re-subscribe after a short delay if the channel drops.
          setTimeout(() => {
            if (channelRef.current === channel) channel.subscribe();
          }, 2000);
        }
      });

    const heartbeat = setInterval(() => {
      if (selfRef.current) channel.track(selfRef.current);
    }, HEARTBEAT_MS);

    return () => {
      clearInterval(heartbeat);
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [roomSlug, selfId]);

  // expire old reactions
  useEffect(() => {
    if (reactions.length === 0) return;
    const t = setTimeout(() => {
      setReactions((prev) => prev.filter((r) => Date.now() - r.ts < 3000));
    }, 3100);
    return () => clearTimeout(t);
  }, [reactions]);

  return {
    participants, reactions, presentedFile,
    setPresentedFile: setPresentedFileBoth, applyPresentedFile,
    presentedFileRef, presentedByMeRef,
    updateSelf, sendReaction, sendEvent, selfHandRaised,
  };
}
