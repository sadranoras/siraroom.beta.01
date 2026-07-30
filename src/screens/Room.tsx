import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Mic, MicOff, Video, VideoOff, ScreenShare, ScreenShareOff, Hand, Smile,
  MessageSquare, Users, PenLine, BarChart3, FileText, DoorOpen, MoreHorizontal,
  PhoneOff, Settings, Copy, Check, LogOut, Maximize2, Grid3x3, Crown, Send,
  Presentation, X, Loader2, Shield, Minimize2, Clock, User, KeyRound,
} from 'lucide-react';
import { supabase, type Room, type SharedFile, type RoomMember, type Profile } from '@/lib/supabase';
import { useLocalMedia, useScreenShare, useSpeakingDetector } from '@/lib/media';
import { useScreenPublisher, useScreenSubscriber, useCameraMesh } from '@/lib/webrtc';
import { useDbSignal } from '@/lib/dbSignal';
import { useRoomPresence, type Participant, type Role, type PresentedFile, canPerform, defaultGrantsForRole } from '@/lib/presence';
import { toPersianDigits, avatarColor, initials } from '@/lib/utils';
import { pushToast } from '@/lib/toast';
import VideoTile from '@/components/VideoTile';
import FilePresentation from '@/components/FilePresentation';
import ScreenShareTile from '@/components/ScreenShareTile';
import ChatPanel from '@/components/ChatPanel';
import ParticipantsPanel from '@/components/ParticipantsPanel';
import ProfilePanel from '@/components/ProfilePanel';
import PollsPanel from '@/components/PollsPanel';
import BreakoutPanel from '@/components/BreakoutPanel';
import Whiteboard from '@/components/Whiteboard';
import FilesPanel from '@/components/FilesPanel';
import RecordingBar from '@/components/RecordingBar';
import { ReactionPicker, ReactionOverlay } from '@/components/Reactions';
import Modal from '@/components/Modal';

type Props = {
  slug: string;
  profile: Profile;
  onLeave: () => void;
};

type PanelKind = 'chat' | 'participants' | 'whiteboard' | 'polls' | 'files' | 'breakout' | 'settings' | 'profile' | null;

// Loader: fetch the room, resolve persisted membership (create if first join),
// then hand off to RoomInner once the role + grants are known.
export default function Room({ slug, profile, onLeave }: Props) {
  const [room, setRoom] = useState<Room | null>(null);
  const [member, setMember] = useState<RoomMember | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: roomRow, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();
      if (!active) return;
      if (error || !roomRow) {
        setLoadError('اتاق یافت نشد. لطفاً کد را بررسی کنید.');
        return;
      }
      const r = roomRow as Room;
      setRoom(r);

      // Resolve membership: the room owner or site admin joins as host;
      // everyone else reads their existing row or creates a fresh viewer
      // membership.
      const isOwner = r.owner_user_id === profile.id;
      const joinsAsHost = isOwner || profile.is_admin;
      const { data: existing } = await supabase
        .from('room_members')
        .select('*')
        .eq('room_id', r.id)
        .eq('user_id', profile.id)
        .maybeSingle();

      if (existing) {
        // Owner/admin rejoining: ensure host role + full grants stick.
        if (joinsAsHost && (existing as RoomMember).role !== 'host') {
          const { data: upd } = await supabase
            .from('room_members')
            .update({ role: 'host', can_use_mic: true, can_use_cam: true, can_draw_board: true, can_share_screen: true, can_share_file: true })
            .eq('id', (existing as RoomMember).id)
            .select('*')
            .maybeSingle();
          if (active && upd) setMember(upd as RoomMember);
          else if (active) setMember(existing as RoomMember);
        } else if (active) {
          setMember(existing as RoomMember);
        }
      } else {
        const grants = joinsAsHost
          ? { role: 'host' as const, can_use_mic: true, can_use_cam: true, can_draw_board: true, can_share_screen: true, can_share_file: true }
          : { role: 'viewer' as const, can_use_mic: false, can_use_cam: false, can_draw_board: false, can_share_screen: false, can_share_file: false };
        const { data: created } = await supabase
          .from('room_members')
          .insert({ room_id: r.id, user_id: profile.id, ...grants })
          .select('*')
          .maybeSingle();
        if (active && created) setMember(created as RoomMember);
        else if (active) setLoadError('ورود به جلسه ناموفق بود.');
      }

      // Host arrival opens the room so non-hosts can enter.
      if (joinsAsHost && !r.is_active) {
        await supabase.from('rooms').update({ is_active: true }).eq('id', r.id);
        if (active) setRoom({ ...r, is_active: true });
      }
    })();
    return () => { active = false; };
  }, [slug, profile.id]);

  // Non-hosts wait until the host arrives. Subscribe to rooms table changes
  // so the waiting screen flips to the live room the moment is_active turns true.
  const isHostJoiner = room ? (room.owner_user_id === profile.id || profile.is_admin) : false;
  const waitingForHost = room !== null && member !== null && !room.is_active && !isHostJoiner;
  useEffect(() => {
    if (!waitingForHost || !room) return;
    const ch = supabase
      .channel(`room-active:${room.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${room.id}` },
        (payload) => {
          const updated = payload.new as Room;
          if (updated.is_active) setRoom(updated);
        },
      )
      .subscribe();
    const poll = setInterval(async () => {
      const { data: row } = await supabase.from('rooms').select('*').eq('id', room.id).maybeSingle();
      if (row && (row as Room).is_active) setRoom(row as Room);
    }, 2000);
    return () => { supabase.removeChannel(ch); clearInterval(poll); };
  }, [waitingForHost, room]);

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-950">
        <div className="glass-strong rounded-2xl p-8 text-center max-w-md">
          <p className="text-lg font-bold text-white mb-2">{loadError}</p>
          <button onClick={onLeave} className="mt-4 px-5 py-2.5 rounded-xl bg-sky-500 text-white font-bold">بازگشت</button>
        </div>
      </div>
    );
  }

  if (waitingForHost) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-950">
        <div className="glass-strong rounded-2xl p-8 text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-sky-500/20 flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8 text-sky-400 animate-pulse" />
          </div>
          <p className="text-lg font-bold text-white mb-2">در انتظار ورود میزبان</p>
          <p className="text-slate-400 text-sm leading-relaxed">جلسه هنوز توسط میزبان آغاز نشده است. به‌محض ورود میزبان، شما به‌صورت خودکار وارد جلسه خواهید شد.</p>
          <button onClick={onLeave} className="mt-6 px-5 py-2.5 rounded-xl bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors">بازگشت</button>
        </div>
      </div>
    );
  }

  if (!room || !member) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-sky-500 animate-spin mx-auto mb-3" />
          <p className="text-slate-400">در حال ورود به جلسه...</p>
        </div>
      </div>
    );
  }

  return <RoomInner slug={slug} room={room} member={member} profile={profile} onLeave={onLeave} />;
}

function RoomInner({
  slug, room: initialRoom, member, profile, onLeave,
}: {
  slug: string;
  room: Room;
  member: RoomMember;
  profile: Profile;
  onLeave: () => void;
}) {
  const [room, setRoom] = useState<Room>(initialRoom);
  const [panel, setPanel] = useState<PanelKind>('chat');
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  // Each user can independently maximize any tile — webcam, screen share,
  // or file presentation — just like SiraRoom. 'self' = own webcam,
  // 'screen' = screen share, 'file' = presented file, or a participant ID.
  const [maximizedId, setMaximizedId] = useState<string | null>(null);
  const [showReactions, setShowReactions] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [wbColor, setWbColor] = useState('#38bdf8');
  const [layout, setLayout] = useState<'grid' | 'spotlight'>('grid');

  const media = useLocalMedia();
  const screen = useScreenShare();

  const selfId = useMemo(() => profile.id, [profile.id]);
  const joinedAtRef = useRef(Date.now());
  const handRaisedRef = useRef(false);
  const speaking = useSpeakingDetector(media.stream, media.micOn);

  const name = profile.display_name;
  const [displayName, setDisplayName] = useState(name);
  const isAdmin = profile.is_admin;
  // Admin or room owner always joins with host powers; otherwise use the
  // persisted role from room_members.
  const isHostByOwnership = room.owner_user_id === profile.id;
  const initialRole: Role = (isAdmin || isHostByOwnership) ? 'host' : member.role;
  const initialGrants = (isAdmin || isHostByOwnership)
    ? { canUseMic: true, canUseCam: true, canDrawBoard: true, canShareScreen: true, canShareFile: true }
    : {
        canUseMic: member.can_use_mic,
        canUseCam: member.can_use_cam,
        canDrawBoard: member.can_draw_board,
        canShareScreen: member.can_share_screen,
        canShareFile: member.can_share_file,
      };

  const selfIdentity: Participant = useMemo(
    () => ({
      id: selfId,
      userId: profile.id,
      name,
      avatarColor: profile.avatar_color || avatarColor(name),
      role: initialRole,
      isAdmin,
      isSpeaking: false,
      // Default to OFF — viewers and presenters must explicitly toggle.
      // Host starts with mic/cam OFF too; they toggle on when ready. This
      // avoids prompting for getUserMedia on join for anyone.
      micOn: false,
      camOn: false,
      handRaised: false,
      joinedAt: joinedAtRef.current,
      ...initialGrants,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selfId, name, initialRole, profile.id],
  );

  const { participants, reactions, presentedFile, setPresentedFile, applyPresentedFile, presentedFileRef, presentedByMeRef, updateSelf, sendReaction, sendEvent, selfHandRaised } = useRoomPresence(
    slug,
    selfIdentity,
  );

  // Sync local handRaisedRef with the presence state so when the host
  // lowers our hand remotely, our button and self-view update instantly.
  const [handRaisedDisplay, setHandRaisedDisplay] = useState(false);
  useEffect(() => {
    handRaisedRef.current = selfHandRaised;
    setHandRaisedDisplay(selfHandRaised);
  }, [selfHandRaised]);

  const selfParticipant: Participant = {
    ...selfIdentity,
    isSpeaking: speaking,
    micOn: media.micOn,
    camOn: media.camOn,
    handRaised: handRaisedRef.current,
  };

  // Broadcast mic/cam state instantly so other participants see the change
  // without waiting for the presence heartbeat (which can take 4+ seconds).
  useEffect(() => {
    if (!sendEvent) return;
    sendEvent('media-state', { id: selfId, micOn: media.micOn, camOn: media.camOn });
  }, [media.micOn, media.camOn, selfId, sendEvent]);

  // Database-backed participant list: fetch room_members + profiles so we
  // have a reliable participant source even when Supabase presence channels
  // drop. The DB is the source of truth for WHO is in the room; presence only
  // adds live state (mic/cam/speaking/handRaised).
  type DbMemberWithProfile = RoomMember & {
    display_name: string | null;
    avatar_color: string | null;
  };
  const [dbMembers, setDbMembers] = useState<DbMemberWithProfile[]>([]);
  useEffect(() => {
    if (!room.id) return;
    const load = async () => {
      // Fetch members and profiles separately — there is no direct FK from
      // room_members to profiles (both reference auth.users), so a join
      // would fail silently and return no rows.
      const { data: members } = await supabase
        .from('room_members')
        .select('*')
        .eq('room_id', room.id);
      if (!members) return;
      const userIds = members.map((m) => m.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_color')
        .in('id', userIds);
      const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
      const merged: DbMemberWithProfile[] = members.map((m) => ({
        ...(m as RoomMember),
        display_name: profileMap.get(m.user_id)?.display_name ?? null,
        avatar_color: profileMap.get(m.user_id)?.avatar_color ?? null,
      }));
      setDbMembers(merged);
    };
    load();
    const ch = supabase
      .channel(`room-members:${room.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${room.id}` },
        () => load(),
      )
      .subscribe();
    // Polling fallback — realtime postgres_changes can silently drop, so
    // re-fetch every 3 seconds to guarantee the participant list stays live.
    const poll = setInterval(load, 3000);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(poll);
    };
  }, [room.id]);

  // Merge presence participants with DB members. Since selfId = profile.id
  // and DB participants use user_id as their id, WebRTC peer IDs match
  // across clients — the camera mesh can connect even without presence.
  const allParticipants: Participant[] = useMemo(() => {
    const presenceMap = new Map(participants.map((p) => [p.userId ?? p.id, p]));
    const result: Participant[] = [];
    for (const p of participants) {
      const dbMatch = dbMembers.find((m) => m.user_id === p.userId);
      if (dbMatch) {
        result.push({
          ...p,
          role: dbMatch.role as Role,
          canUseMic: dbMatch.can_use_mic,
          canUseCam: dbMatch.can_use_cam,
          canDrawBoard: dbMatch.can_draw_board,
          canShareScreen: dbMatch.can_share_screen,
          canShareFile: dbMatch.can_share_file,
        });
      } else {
        result.push(p);
      }
    }
    for (const m of dbMembers) {
      if (!presenceMap.has(m.user_id)) {
        // Self fallback: when the presence channel drops, self won't appear
        // in the presence list. Use the live selfParticipant (which carries
        // current mic/cam/speaking state) so the participant count and panel
        // stay correct.
        if (m.user_id === profile.id) {
          result.push(selfParticipant);
          continue;
        }
        const displayName = m.display_name || 'کاربر';
        result.push({
          id: m.user_id,
          userId: m.user_id,
          name: displayName,
          avatarColor: m.avatar_color || avatarColor(displayName),
          role: m.role,
          isAdmin: false,
          isSpeaking: false,
          micOn: false,
          camOn: false,
          handRaised: false,
          joinedAt: new Date(m.joined_at).getTime(),
          canUseMic: m.can_use_mic,
          canUseCam: m.can_use_cam,
          canDrawBoard: m.can_draw_board,
          canShareScreen: m.can_share_screen,
          canShareFile: m.can_share_file,
        });
      }
    }
    return result;
  }, [participants, dbMembers, profile.id]);

  const me = allParticipants.find((p) => p.id === selfId) ?? selfParticipant;
  const myRole: Role = me.role;
  const isHost = myRole === 'host' || isHostByOwnership || isAdmin;

  // Admin bypasses all room-wide feature toggles; others are gated by them.
  const featureAllowed = (k: keyof Room) => isAdmin || (room[k] as boolean);

  // Per-user capability checks. These combine the room-wide feature toggle
  // (host can disable a feature for the whole room) with the per-participant
  // grant (host can give a viewer access to mic/cam/screen/board/file).
  // Viewers start with ALL grants false and must be granted access by the host.
  const canMic = isHost || canPerform(me, 'mic');
  const canCam = isHost || canPerform(me, 'cam');
  const canScreen = isHost || canPerform(me, 'screen');
  // Board and files are VIEWABLE by everyone (to see host's content), but only
  // ACTIONABLE (draw/upload) with the per-user grant + room-wide toggle.
  const canBoard = featureAllowed('allow_whiteboard') && (isHost || canPerform(me, 'board'));
  const canFile = featureAllowed('allow_file_sharing') && (isHost || canPerform(me, 'file'));

  // Only connect WebRTC to participants confirmed via presence (actually
  // online right now). DB-only fallback entries may be stale/offline, and
  // attempting to connect to them wastes signaling round-trips and can
  // delay real connections.
  const viewerIds = useMemo(
    () => participants.filter((p) => p.id !== selfId).map((p) => p.id),
    [participants, selfId],
  );
  // ONE shared signaling instance for all WebRTC hooks. If each hook created its
  // own, their polling loops would race and a row consumed by one instance
  // would be lost to the others — breaking the offer/answer exchange.
  const { sig } = useDbSignal(slug, selfId);
  useScreenPublisher(selfId, screen.sharing ? screen.screenStream : null, viewerIds, sig);
  const remoteScreen = useScreenSubscriber(selfId, !screen.sharing, sig);

  // Camera mesh: every participant publishes their camera to every other
  // participant over WebRTC. We always pass the local stream so peer
  // connections keep their video sender; camera on/off is conveyed by the
  // track's enabled flag plus the presence camOn broadcast (VideoTile shows
  // an avatar when camOn is false).
  const remoteCamStreams = useCameraMesh(
    selfId,
    media.stream,
    viewerIds,
    sig,
  );

  // Raised hands — host sees these in real time.
  const raisedHands = (isHost || featureAllowed('allow_view_participants'))
    ? allParticipants.filter((p) => p.handRaised && p.id !== selfId)
    : [];
  const [handsOpen, setHandsOpen] = useState(false);

  // Live room settings + host-left detection. We subscribe to ALL column
  // changes on the rooms row so that when the host toggles a room-wide
  // setting (allow_view_participants, allow_chat, etc.) every participant
  // sees the effect immediately — no reload needed. When is_active flips
  // to false, everyone is kicked.
  useEffect(() => {
    if (!room.id) return;
    const ch = supabase
      .channel(`room-settings:${room.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${room.id}` },
        (payload) => {
          const updated = payload.new as Room;
          setRoom(updated);
          if (!updated.is_active && !isHost) onLeave();
        },
      )
      .subscribe();
    const poll = setInterval(async () => {
      const { data: row } = await supabase.from('rooms').select('*').eq('id', room.id).maybeSingle();
      if (row) {
        const updated = row as Room;
        setRoom(updated);
        if (!updated.is_active && !isHost) onLeave();
      }
    }, 3000);
    return () => { supabase.removeChannel(ch); clearInterval(poll); };
  }, [room.id, isHost, onLeave]);

  // Database-backed file presentation sync. We use BOTH a realtime
  // postgres_changes subscription AND a 3-second polling fallback, because
  // realtime alone is unreliable in this environment. The host writes
  // presented_file_id to the rooms table; everyone else reads it.
  useEffect(() => {
    if (!room.id) return;

    const fetchFile = (fileId: string) => {
      supabase.from('files').select('*').eq('id', fileId).maybeSingle().then(({ data, error }) => {
        if (error || !data) {
          // RLS may block a viewer who isn't yet in room_members. Retry once
          // after 2s so a member who joined slightly after the file fetch
          // resolves still gets the presentation.
          if (error) {
            setTimeout(() => {
              supabase.from('files').select('*').eq('id', fileId).maybeSingle().then(({ data: d2 }) => {
                const f = d2 as SharedFile | null;
                if (!f) return;
                applyPresentedFile({
                  id: f.id, name: f.name, url: f.url, mime_type: f.mime_type,
                  size_bytes: f.size_bytes, shared_by: f.shared_by, allow_download: f.allow_download,
                });
              });
            }, 2000);
          }
          return;
        }
        const f = data as SharedFile;
        applyPresentedFile({
          id: f.id, name: f.name, url: f.url, mime_type: f.mime_type,
          size_bytes: f.size_bytes, shared_by: f.shared_by, allow_download: f.allow_download,
        });
      });
    };

    // Initial load: if a file is already presented when we join, fetch it.
    if (room.presented_file_id) {
      fetchFile(room.presented_file_id);
    }

    // Realtime subscription — fires immediately when the host updates the room.
    const ch = supabase
      .channel(`room-present:${room.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${room.id}` },
        (payload) => {
          const updated = payload.new as Room;
          const newFileId = updated.presented_file_id;
          if (!newFileId) {
            applyPresentedFile(null);
          } else if (newFileId !== presentedFileRef.current?.id) {
            fetchFile(newFileId);
          }
        },
      )
      .subscribe();

    // Polling fallback — guarantees members see the file even if realtime
    // silently drops. Checks every 3 seconds for presented_file_id changes.
    const poll = setInterval(() => {
      supabase
        .from('rooms')
        .select('presented_file_id')
        .eq('id', room.id)
        .maybeSingle()
        .then(({ data }) => {
          const row = data as { presented_file_id: string | null } | null;
          const currentId = row?.presented_file_id ?? null;
          const showingId = presentedFileRef.current?.id ?? null;
          if (currentId !== showingId) {
            if (!currentId) {
              applyPresentedFile(null);
            } else {
              fetchFile(currentId);
            }
          }
        });
    }, 3000);

    return () => {
      supabase.removeChannel(ch);
      clearInterval(poll);
    };
  }, [room.id]);

  // Heartbeat: update room_members.last_heartbeat periodically so other
  // clients can detect our presence via postgres_changes (reliable fallback
  // for Supabase presence channels).
  useEffect(() => {
    if (!room.id) return;
    const beat = () => {
      supabase.from('room_members').update({ last_heartbeat: new Date().toISOString() }).eq('room_id', room.id).eq('user_id', profile.id);
    };
    beat();
    const t = setInterval(beat, 10000);
    return () => clearInterval(t);
  }, [room.id, profile.id]);

  // Keep last_activity fresh
  useEffect(() => {
    const t = setInterval(() => {
      supabase.from('rooms').update({ last_activity: new Date().toISOString() }).eq('slug', slug);
    }, 30000);
    return () => clearInterval(t);
  }, [slug]);

  // Only acquire media when the user toggles mic or cam on. We do NOT call
  // media.start() on mount — that would prompt every viewer for camera/mic
  // permission on join. getUserMedia fires lazily inside toggleMic/toggleCam.
  useEffect(() => {
    return () => media.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!sendEvent) return;
    sendEvent('speaking', { id: selfId, speaking });
  }, [speaking, selfId, sendEvent]);

  useEffect(() => {
    if (!room.id) return;
    supabase.from('messages').insert({
      room_id: room.id,
      sender_name: 'سیستم',
      sender_user_id: profile.id,
      content: `${name} به جلسه پیوست.`,
      is_system: true,
    });
    return () => {
      supabase.from('messages').insert({
        room_id: room.id,
        sender_name: 'سیستم',
        sender_user_id: profile.id,
        content: `${name} از جلسه خارج شد.`,
        is_system: true,
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id]);

  useEffect(() => {
    updateSelf({ micOn: media.micOn, camOn: media.camOn, isSpeaking: speaking });
  }, [media.micOn, media.camOn, speaking, updateSelf]);

  // Auto-disable mic / cam / screen share / file presentation the instant
  // the current user loses permission due to a role change, grant revocation,
  // or room-wide setting toggle. Without this a demoted participant keeps
  // broadcasting until they reload.
  const prevPermsRef = useRef({ mic: canMic, cam: canCam, screen: canScreen, file: canFile, board: canBoard });
  useEffect(() => {
    const prev = prevPermsRef.current;
    if (prev.mic && !canMic && media.micOn) media.toggleMic();
    if (prev.cam && !canCam && media.camOn) media.toggleCam();
    if (prev.screen && !canScreen && screen.sharing) screen.stopShare();
    if (prev.file && !canFile && presentedFileRef.current && presentedByMeRef.current) {
      presentFile(null);
      pushToast('دسترسی ارائه فایل گرفته شد', 'info');
    }
    prevPermsRef.current = { mic: canMic, cam: canCam, screen: canScreen, file: canFile, board: canBoard };
  }, [canMic, canCam, canScreen, canFile, canBoard, media, screen]);

  const toggleHand = () => {
    const next = !handRaisedRef.current;
    handRaisedRef.current = next;
    setHandRaisedDisplay(next);
    updateSelf({ handRaised: next });
    sendEvent('hand', { id: selfId, raised: next });
    if (next && room) {
      supabase.from('messages').insert({
        room_id: room.id,
        sender_name: 'سیستم',
        sender_user_id: profile.id,
        content: `${name} درخواست گفتگو دارد.`,
        is_system: true,
      });
    }
    pushToast(next ? 'درخواست گفتگو ثبت شد' : 'درخواست برداشته شد', 'info');
  };

  const toggleShare = async () => {
    if (screen.sharing) {
      screen.stopShare();
    } else {
      if (!canScreen) {
        pushToast('برای اشتراک صفحه نیاز به اجازه میزبان دارید', 'info');
        return;
      }
      const ok = await screen.startShare();
      if (!ok) pushToast('اشتراک صفحه لغو شد', 'info');
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps

  const removeParticipant = (id: string) => {
    sendEvent('force-leave', { id });
    pushToast('درخواست خروج ارسال شد', 'info');
  };

  // Host actions: broadcast via presence AND persist to room_members so the
  // role/grant survives a participant leaving and rejoining. Optimistically
  // update dbMembers so the host sees the toggle flip instantly; the realtime
  // subscription then confirms with the authoritative DB value.
  const changeRole = async (id: string, role: Role) => {
    sendEvent('role-change', { id, role });
    const target = allParticipants.find((p) => p.id === id);
    const grants = defaultGrantsForRole(role);
    if (target?.userId) {
      setDbMembers((prev) => prev.map((m) =>
        m.user_id === target.userId
          ? { ...m, role, can_use_mic: grants.canUseMic, can_use_cam: grants.canUseCam, can_draw_board: grants.canDrawBoard, can_share_screen: grants.canShareScreen, can_share_file: grants.canShareFile }
          : m,
      ));
      const { error } = await supabase.from('room_members')
        .update({ role, can_use_mic: grants.canUseMic, can_use_cam: grants.canUseCam, can_draw_board: grants.canDrawBoard, can_share_screen: grants.canShareScreen, can_share_file: grants.canShareFile })
        .eq('room_id', room.id).eq('user_id', target.userId);
      if (error) { pushToast('خطا در تغییر نقش', 'error'); return; }
    }
    pushToast(role === 'host' ? 'کاربر به میزبان ارتقا یافت' : role === 'presenter' ? 'کاربر به ارائه‌دهنده تبدیل شد' : 'کاربر به تماشاچی تبدیل شد', 'success');
  };
  const toggleGrant = async (id: string, cap: 'mic' | 'cam' | 'board' | 'screen' | 'file', value: boolean) => {
    sendEvent('grant', { id, cap, value });
    const target = allParticipants.find((p) => p.id === id);
    if (target?.userId) {
      const col = cap === 'mic' ? 'can_use_mic' : cap === 'cam' ? 'can_use_cam' : cap === 'board' ? 'can_draw_board' : cap === 'screen' ? 'can_share_screen' : 'can_share_file';
      setDbMembers((prev) => prev.map((m) =>
        m.user_id === target.userId ? { ...m, [col]: value } : m,
      ));
      const { error } = await supabase.from('room_members').update({ [col]: value }).eq('room_id', room.id).eq('user_id', target.userId);
      if (error) pushToast('خطا در تغییر دسترسی', 'error');
    }
  };
  // Cache of files loaded in the FilesPanel, so presentFile can find a file
  // by ID without a DB round-trip — the presentation starts instantly.
  const filesListRef = useRef<SharedFile[]>([]);
  useEffect(() => {
    if (!room.id) return;
    let active = true;
    const load = async () => {
      const { data } = await supabase
        .from('files')
        .select('*')
        .eq('room_id', room.id)
        .order('created_at', { ascending: false });
      if (active && data) filesListRef.current = data;
    };
    load();
    const ch = supabase
      .channel(`room-files-cache:${room.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'files', filter: `room_id=eq.${room.id}` }, load)
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, [room.id]);

  const presentFile = (fileId: string | null) => {
    presentedByMeRef.current = fileId !== null;
    // Persist to DB for late-joiners and polling fallback.
    supabase
      .from('rooms')
      .update({ presented_file_id: fileId })
      .eq('id', room.id)
      .then(({ error }) => {
        if (error) pushToast('خطا در ثبت ارائه فایل', 'error');
      });
    if (!fileId) {
      setPresentedFile(null);
      sendEvent('present-file', { file: null, from: selfId });
      return;
    }
    // Find the file from the already-loaded list first — avoids a DB
    // round-trip so the presentation appears instantly for the presenter
    // and is broadcast to viewers without delay.
    const fromList = filesListRef.current.find((f) => f.id === fileId);
    if (fromList) {
      const payload: PresentedFile = {
        id: fromList.id, name: fromList.name, url: fromList.url,
        mime_type: fromList.mime_type, size_bytes: fromList.size_bytes,
        shared_by: fromList.shared_by, allow_download: fromList.allow_download,
      };
      setPresentedFile(payload);
      sendEvent('present-file', { file: payload, from: selfId });
      return;
    }
    // Fallback: fetch from DB if not in the local list.
    supabase.from('files').select('*').eq('id', fileId).maybeSingle().then(({ data, error }) => {
      const f = data as SharedFile | null;
      if (!f || error) return;
      const payload: PresentedFile = {
        id: f.id, name: f.name, url: f.url, mime_type: f.mime_type,
        size_bytes: f.size_bytes, shared_by: f.shared_by, allow_download: f.allow_download,
      };
      setPresentedFile(payload);
      sendEvent('present-file', { file: payload, from: selfId });
    });
  };

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/#${slug}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    pushToast('لینک جلسه کپی شد', 'success');
  };

  // No one sees their own video tile. Each other participant's tile shows
  // the remote camera stream we receive from them over WebRTC; viewers who
  // have their camera off (or are muted by the host) show an avatar instead.
  const tiles = allParticipants
    .filter((p) => p.id !== selfId)
    .map((p) => ({
      participant: p,
      stream: remoteCamStreams[p.id] ?? null,
    }));

  const pinnedTile = pinnedId ? tiles.find((t) => t.participant.id === pinnedId) : null;
  const otherTiles = pinnedTile ? tiles.filter((t) => t.participant.id !== pinnedId) : tiles;
  const screenTile = screen.sharing
    ? { participant: { ...selfParticipant, name: 'اشتراک صفحه' }, stream: screen.screenStream }
    : remoteScreen
    ? { participant: { ...selfParticipant, name: 'اشتراک صفحه میزبان' }, stream: remoteScreen }
    : null;
  const hasFeatured = !!presentedFile || !!screenTile;

  // Build the list of all tiles — webcams (self + others), screen share, and
  // file presentation — so any of them can be maximized independently.
  type MaxTile = { id: string; kind: 'cam' | 'screen' | 'file'; label: string };
  const allTiles: MaxTile[] = [
    { id: 'self', kind: 'cam', label: 'دوربین شما' },
    ...tiles.map((t) => ({ id: t.participant.id, kind: 'cam' as const, label: t.participant.name })),
    ...(screenTile ? [{ id: 'screen', kind: 'screen' as const, label: screen.sharing ? 'اشتراک صفحه • شما' : 'اشتراک صفحه • میزبان' }] : []),
    ...(presentedFile ? [{ id: 'file', kind: 'file' as const, label: presentedFile.name }] : []),
  ];
  const maximizedTile = maximizedId ? allTiles.find((t) => t.id === maximizedId) : null;

  // Panels: whiteboard and files are always visible so viewers can SEE the
  // host's shared content. The actual interaction (drawing, uploading) is
  // gated inside each panel by the per-user grant. Other panels stay gated
  // by room-wide toggles.
  const panelMeta: { kind: PanelKind; icon: typeof Mic; label: string; allowed: boolean }[] = [
    { kind: 'chat', icon: MessageSquare, label: 'چت', allowed: featureAllowed('allow_chat') },
    { kind: 'participants', icon: Users, label: 'اعضا', allowed: isHost || featureAllowed('allow_view_participants') },
    { kind: 'whiteboard', icon: PenLine, label: 'وایت‌بورد', allowed: true },
    { kind: 'polls', icon: BarChart3, label: 'نظرسنجی', allowed: featureAllowed('allow_polls') },
    { kind: 'files', icon: FileText, label: 'فایل‌ها', allowed: true },
    { kind: 'breakout', icon: DoorOpen, label: 'اتاق فرعی', allowed: featureAllowed('allow_breakout') && isHost },
    { kind: 'settings', icon: Settings, label: 'تنظیمات', allowed: isHost },
    { kind: 'profile', icon: User, label: 'نام من', allowed: true },
  ];

  return (
    <div className="h-screen flex flex-col bg-slate-950 overflow-hidden">
      {/* top bar */}
      <header className="h-14 glass border-b border-slate-800 flex items-center justify-between px-4 gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shrink-0">
            <Video className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-white truncate flex items-center gap-1.5">
              {room.title}
              {isHost && <Crown className="w-3.5 h-3.5 text-amber-400" />}
              {isAdmin && <Shield className="w-3.5 h-3.5 text-sky-400" />}
            </h2>
            <p className="text-[11px] text-slate-400">{toPersianDigits(allParticipants.length)} / {toPersianDigits(room.max_participants)} شرکت‌کننده</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <RecordingBar roomId={room.id} roomTitle={room.title} name={name} allowRecording={featureAllowed('allow_recording')} isHost={isHost} />
          <button
            onClick={copyLink}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass text-xs text-slate-200 hover:bg-slate-800 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">کپی لینک</span>
          </button>
          <button
            onClick={() => setShowCodeModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass text-xs text-slate-200 hover:bg-slate-800 transition-colors"
            title="دیدن کد کلاس"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">کد کلاس</span>
          </button>
          <button
            onClick={() => setShowLeaveConfirm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 text-xs font-bold transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">خروج</span>
          </button>
        </div>
      </header>

      {/* main area */}
      <div className="flex-1 flex overflow-hidden">
        {/* video stage */}
        <main className="flex-1 flex flex-col overflow-hidden relative">
          <div className="flex-1 relative p-3 dot-bg overflow-hidden min-h-0">
            <ReactionOverlay reactions={reactions} />

            {(() => {
              // Render a single tile by its ID — used for both the maximized
              // view and the filmstrip. Each tile gets a maximize button so
              // any user can independently expand any webcam, screen share,
              // or file presentation — just like SiraRoom.
              const renderTile = (tileId: string, big: boolean) => {
                const tile = allTiles.find((t) => t.id === tileId);
                if (!tile) return null;
                const isMax = maximizedId === tileId;
                const toggleMax = () => setMaximizedId(isMax ? null : tileId);
                if (tile.kind === 'screen' && screenTile) {
                  if (big) {
                    return (
                      <ScreenShareTile
                        stream={screenTile.stream}
                        label={screen.sharing ? 'اشتراک صفحه • شما' : 'اشتراک صفحه • میزبان'}
                        onClose={screen.sharing ? () => screen.stopShare() : undefined}
                      />
                    );
                  }
                  return (
                    <div className="w-40 h-full shrink-0 rounded-xl overflow-hidden relative group">
                      <ScreenShareTile stream={screenTile.stream} label="اشتراک صفحه" />
                      <button onClick={toggleMax} className="absolute top-1 left-1 w-6 h-6 rounded-md bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-sky-500">
                        {isMax ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  );
                }
                if (tile.kind === 'file' && presentedFile) {
                  if (big) {
                    return (
                      <FilePresentation file={presentedFile} slug={slug} isPresenter={isHost || myRole === 'presenter'} onClose={(isHost || myRole === 'presenter') ? () => presentFile(null) : undefined} />
                    );
                  }
                  return (
                    <div className="w-40 h-full shrink-0 rounded-xl overflow-hidden relative group bg-slate-950 ring-1 ring-slate-700 flex flex-col">
                      <div className="flex-1 flex items-center justify-center p-2 overflow-hidden">
                        {presentedFile.mime_type.startsWith('image/') ? (
                          <img src={presentedFile.url} alt={presentedFile.name} className="max-w-full max-h-full object-contain" />
                        ) : (
                          <div className="text-sky-400 text-center text-[10px] flex flex-col items-center gap-1">
                            <Presentation className="w-6 h-6" />
                            <span className="truncate w-full">{presentedFile.name}</span>
                          </div>
                        )}
                      </div>
                      <button onClick={toggleMax} className="absolute top-1 left-1 w-6 h-6 rounded-md bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-sky-500">
                        {isMax ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  );
                }
                // Webcam tile
                if (tile.id === 'self') {
                  return big ? (
                    <div className="h-full w-full rounded-2xl overflow-hidden bg-slate-800 ring-2 ring-sky-400/50 relative">
                      {media.camOn && media.stream ? (
                        <video ref={(v) => { if (v && media.stream) { v.srcObject = media.stream; v.muted = true; v.play().catch(() => {}); } }} autoPlay playsInline className="w-full h-full object-cover scale-x-[-1]" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                          <div className={`w-20 h-20 rounded-full ${avatarColor(name)} flex items-center justify-center text-white text-2xl font-bold`}>{initials(name)}</div>
                        </div>
                      )}
                      <div className="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-black/60 backdrop-blur text-white text-xs font-medium flex items-center gap-1">شما{!media.micOn && <MicOff className="w-3.5 h-3.5 text-rose-400" />}</div>
                    </div>
                  ) : (
                    <div className="w-40 h-full shrink-0 rounded-xl overflow-hidden bg-slate-800 ring-1 ring-slate-700 relative group">
                      {media.camOn && media.stream ? (
                        <video ref={(v) => { if (v && media.stream) { v.srcObject = media.stream; v.muted = true; v.play().catch(() => {}); } }} autoPlay playsInline className="w-full h-full object-cover scale-x-[-1]" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                          <div className={`w-12 h-12 rounded-full ${avatarColor(name)} flex items-center justify-center text-white text-lg font-bold`}>{initials(name)}</div>
                        </div>
                      )}
                      <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur text-white text-[9px] font-medium flex items-center gap-1">شما{!media.micOn && <MicOff className="w-3 h-3 text-rose-400" />}</div>
                      <button onClick={toggleMax} className="absolute top-1 left-1 w-6 h-6 rounded-md bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-sky-500">
                        {isMax ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  );
                }
                const t = tiles.find((tt) => tt.participant.id === tile.id);
                if (!t) return null;
                return big ? (
                  <div className="h-full w-full rounded-2xl overflow-hidden">
                    <VideoTile participant={t.participant} stream={t.stream} isPinned={pinnedId === t.participant.id} onPin={() => setPinnedId(pinnedId === t.participant.id ? null : t.participant.id)} isSelf={false} isMaximized onMaximize={toggleMax} />
                  </div>
                ) : (
                  <div className="w-40 h-full shrink-0 rounded-xl overflow-hidden">
                    <VideoTile participant={t.participant} stream={t.stream} isPinned={pinnedId === t.participant.id} onPin={() => setPinnedId(pinnedId === t.participant.id ? null : t.participant.id)} isSelf={false} isMaximized={isMax} onMaximize={toggleMax} />
                  </div>
                );
              };

              // If a tile is maximized, show it large + filmstrip below.
              if (maximizedTile) {
                return (
                  <div className="h-full flex flex-col gap-2">
                    <div className="flex-1 min-h-0 relative">
                      {renderTile(maximizedTile.id, true)}
                      <button onClick={() => setMaximizedId(null)} className="absolute top-3 left-3 z-30 px-3 py-1.5 rounded-lg glass-strong text-white text-xs font-bold flex items-center gap-1.5 hover:bg-slate-700 transition-colors">
                        <Minimize2 className="w-4 h-4" /> کوچک‌نمایی
                      </button>
                    </div>
                    <div className="shrink-0 h-[110px] flex gap-2 overflow-x-auto scrollbar-thin pb-1">
                      {allTiles.filter((t) => t.id !== maximizedTile.id).map((t) => (
                        <div key={t.id}>{renderTile(t.id, false)}</div>
                      ))}
                    </div>
                  </div>
                );
              }

              // Auto-featured: if screen share or file presentation exists,
              // show them side by side + webcam filmstrip. Each has a maximize
              // button so users can expand any one independently.
              if (hasFeatured) {
                return (
                  <div className="h-full flex flex-col gap-2">
                    <div className="flex-1 min-h-0 flex gap-2">
                      {screenTile && (
                        <div className={(presentedFile ? 'w-1/2' : 'w-full') + ' relative group'}>
                          <ScreenShareTile stream={screenTile.stream} label={screen.sharing ? 'اشتراک صفحه • شما' : 'اشتراک صفحه • میزبان'} onClose={screen.sharing ? () => screen.stopShare() : undefined} />
                          <button onClick={() => setMaximizedId('screen')} className="absolute top-3 left-3 z-20 w-7 h-7 rounded-md bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-sky-500">
                            <Maximize2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                      {presentedFile && (
                        <div className={(screenTile ? 'w-1/2' : 'w-full') + ' relative group'}>
                          <FilePresentation file={presentedFile} slug={slug} isPresenter={isHost || myRole === 'presenter'} onClose={(isHost || myRole === 'presenter') ? () => presentFile(null) : undefined} />
                          <button onClick={() => setMaximizedId('file')} className="absolute top-3 left-3 w-7 h-7 rounded-md bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-sky-500">
                            <Maximize2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 h-[110px] flex gap-2 overflow-x-auto scrollbar-thin pb-1">
                      {allTiles.filter((t) => t.kind === 'cam').map((t) => (
                        <div key={t.id}>{renderTile(t.id, false)}</div>
                      ))}
                    </div>
                  </div>
                );
              }

              // Spotlight layout: pinned or speaking participant large + filmstrip.
              if (layout === 'spotlight' && (pinnedTile || tiles.find((t) => t.participant.isSpeaking))) {
                const spot = (pinnedTile || tiles.find((t) => t.participant.isSpeaking))!;
                return (
                  <div className="h-full flex flex-col gap-3">
                    <div className="flex-1 rounded-2xl overflow-hidden">
                      <VideoTile participant={spot.participant} stream={spot.stream} isPinned={!!pinnedTile} onPin={() => setPinnedId(pinnedTile ? null : spot.participant.id)} isSelf={spot.participant.id === selfId} isMaximized onMaximize={() => setMaximizedId(spot.participant.id)} />
                    </div>
                    <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-1">
                      {otherTiles.map((t) => (
                        <div key={t.participant.id} className="w-40 h-24 shrink-0 rounded-xl overflow-hidden">
                          <VideoTile participant={t.participant} stream={t.stream} isPinned={false} onPin={() => setPinnedId(t.participant.id)} isSelf={t.participant.id === selfId} isMaximized={false} onMaximize={() => setMaximizedId(t.participant.id)} />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }

              // Empty state.
              if (tiles.length === 0) {
                return (
                  <div className="h-full flex flex-col items-center justify-center text-center">
                    <div className="w-20 h-20 rounded-2xl bg-slate-800/60 flex items-center justify-center mb-4">
                      <Users className="w-10 h-10 text-slate-600" />
                    </div>
                    <p className="text-slate-300 font-medium">در انتظار پیوستن سایر شرکت‌کنندگان</p>
                    <p className="text-slate-500 text-sm mt-1">لینک جلسه را برای دعوت دیگران کپی کنید</p>
                  </div>
                );
              }

              // Default grid layout.
              return (
                <div className={'grid gap-3 h-full ' + (tiles.length <= 1 ? 'grid-cols-1' : tiles.length === 2 ? 'grid-cols-2' : tiles.length <= 4 ? 'grid-cols-2 grid-rows-2' : 'grid-cols-3 auto-rows-fr')}>
                  {tiles.map((t) => (
                    <VideoTile key={t.participant.id} participant={t.participant} stream={t.stream} isPinned={pinnedId === t.participant.id} onPin={() => setPinnedId(pinnedId === t.participant.id ? null : t.participant.id)} isSelf={t.participant.id === selfId} isMaximized={false} onMaximize={() => setMaximizedId(t.participant.id)} />
                  ))}
                </div>
              );
            })()}

            {/* raised-hands panel — host only */}
            {isHost && raisedHands.length > 0 && (
              <div className="absolute top-3 left-3 z-30">
                <button
                  onClick={() => setHandsOpen((v) => !v)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl glass-strong shadow-lg anim-pop"
                >
                  <span className="w-7 h-7 rounded-lg bg-amber-400 text-white flex items-center justify-center wave-anim">
                    <Hand className="w-4 h-4" />
                  </span>
                  <span className="text-sm font-bold text-white">{toPersianDigits(raisedHands.length)} درخواست گفتگو</span>
                </button>
                {handsOpen && (
                  <div className="mt-2 w-64 glass-strong rounded-2xl p-3 shadow-2xl anim-pop">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-slate-400">افراد در صف گفتگو</span>
                      <button onClick={() => setHandsOpen(false)} className="text-slate-500 hover:text-white text-xs">بستن</button>
                    </div>
                    <div className="space-y-2 max-h-60 overflow-y-auto scrollbar-thin">
                      {raisedHands.map((p) => (
                        <div key={p.id} className="flex items-center gap-2 p-2 rounded-xl bg-slate-800/60">
                          <div className={`w-8 h-8 rounded-full ${p.avatarColor} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                            {p.name.charAt(0)}
                          </div>
                          <span className="text-sm text-white flex-1 truncate">{p.name}</span>
                          <button
                            onClick={() => { changeRole(p.id, 'presenter'); sendEvent('hand', { id: p.id, raised: false }); }}
                            className="px-2 py-1 rounded-lg bg-sky-500 text-white text-[11px] font-bold hover:bg-sky-600"
                          >
                            اجازه گفتگو
                          </button>
                          <button
                            onClick={() => sendEvent('hand', { id: p.id, raised: false })}
                            className="w-7 h-7 rounded-lg bg-slate-700 text-slate-300 flex items-center justify-center hover:bg-slate-600"
                            title="پایین آوردن دست"
                          >
                            <Hand className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* self-view picture-in-picture — only when no featured content */}
            {!hasFeatured && (
              <div className="absolute bottom-4 right-4 w-48 h-36 rounded-xl overflow-hidden bg-slate-800 ring-1 ring-slate-700/80 shadow-2xl z-30 group transition-all hover:ring-sky-500/50">
                {media.camOn && media.stream ? (
                  <video
                    ref={(v) => { if (v && media.stream) { v.srcObject = media.stream; v.play().catch(() => {}); } }}
                    muted
                    playsInline
                    className="w-full h-full object-cover scale-x-[-1]"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                    <div className={`w-14 h-14 rounded-full ${avatarColor(name)} flex items-center justify-center text-white text-xl font-bold`}>
                      {initials(name)}
                    </div>
                  </div>
                )}
                <div className="absolute bottom-1.5 right-1.5 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur text-white text-[10px] font-medium flex items-center gap-1">
                  شما
                  {!media.micOn && <MicOff className="w-3 h-3 text-rose-400" />}
                </div>
              </div>
            )}
          </div>

          {/* control bar — media controls only; panel toggles live in the side rail */}
          <div className="glass-strong border-t border-slate-800/80 px-4 py-2.5 flex items-center justify-center gap-2 shrink-0 relative">
            {showReactions && (
              <div className="absolute -top-14 right-1/2 translate-x-1/2">
                <ReactionPicker onSend={(e) => { sendReaction(e); setShowReactions(false); }} />
              </div>
            )}
            <ControlButton active={media.micOn} onClick={() => media.toggleMic()} onIcon={<Mic className="w-5 h-5" />} offIcon={<MicOff className="w-5 h-5" />} label={canMic ? 'میکروفون' : 'میکروفون (نیازمند اجازه میزبان)'} danger={!media.micOn} disabled={!canMic} />
            <ControlButton active={media.camOn} onClick={() => media.toggleCam()} onIcon={<Video className="w-5 h-5" />} offIcon={<VideoOff className="w-5 h-5" />} label={canCam ? 'دوربین' : 'دوربین (نیازمند اجازه میزبان)'} danger={!media.camOn} disabled={!canCam} />
            <ControlButton active={screen.sharing} onClick={toggleShare} onIcon={<ScreenShare className="w-5 h-5" />} offIcon={<ScreenShareOff className="w-5 h-5" />} label={canScreen ? 'اشتراک صفحه' : 'اشتراک صفحه (نیازمند اجازه)'} highlight={screen.sharing} disabled={!canScreen} />
{featureAllowed('allow_hand_raise') && featureAllowed('allow_view_participants') && (
              <ControlButton active={handRaisedDisplay} onClick={toggleHand} onIcon={<Hand className="w-5 h-5" />} offIcon={<Hand className="w-5 h-5" />} label="درخواست گفتگو" highlight={handRaisedDisplay} />
            )}
            {featureAllowed('allow_reactions') && (
              <ControlButton active={showReactions} onClick={() => setShowReactions((v) => !v)} onIcon={<Smile className="w-5 h-5" />} offIcon={<Smile className="w-5 h-5" />} label="واکنش" />
            )}
            <div className="w-px h-8 bg-slate-700 mx-1" />
            <ControlButton active={layout === 'grid'} onClick={() => setLayout(layout === 'grid' ? 'spotlight' : 'grid')} onIcon={<Grid3x3 className="w-5 h-5" />} offIcon={<Maximize2 className="w-5 h-5" />} label={layout === 'grid' ? 'شبکه' : 'اسپات‌لایت'} />
            <div className="w-px h-8 bg-slate-700 mx-1" />
            <button
              onClick={() => setShowLeaveConfirm(true)}
              className="w-12 h-12 rounded-xl bg-rose-500 hover:bg-rose-600 text-white flex items-center justify-center transition-colors shadow-lg shadow-rose-500/30"
              title="پایان جلسه"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
          </div>
        </main>

        {/* side panel */}
        {panel && (
          <aside className="w-[340px] shrink-0 glass border-x border-slate-800 flex flex-col anim-slide-in">
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800">
              <span className="text-sm font-bold text-white flex items-center gap-2">
                {(() => { const m = panelMeta.find((p) => p.kind === panel); return m ? <m.icon className="w-4 h-4 text-sky-400" /> : null; })()}
                {panelMeta.find((p) => p.kind === panel)?.label}
              </span>
              <button onClick={() => setPanel(null)} className="text-slate-500 hover:text-white w-7 h-7 rounded-lg hover:bg-slate-800 flex items-center justify-center transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              {panel === 'chat' && <ChatPanel roomId={room.id} roomSlug={slug} name={name} userId={profile.id} />}
              {panel === 'participants' && (
                <ParticipantsPanel participants={allParticipants} selfId={selfId} onRemove={removeParticipant} isHost={isHost} isOwner={isHostByOwnership || isAdmin} onChangeRole={changeRole} onToggleGrant={toggleGrant} />
              )}
              {panel === 'whiteboard' && <Whiteboard roomSlug={slug} color={wbColor} setColor={setWbColor} canDraw={canBoard} />}
              {panel === 'polls' && <PollsPanel roomId={room.id} name={name} userId={profile.id} allowPolls={isHost} />}
              {panel === 'files' && <FilesPanel roomId={room.id} name={name} allowFiles={canFile} presentedFileId={presentedFile?.id ?? null} onPresent={presentFile} canPresent={isHost || myRole === 'presenter'} />}
              {panel === 'breakout' && (
                <BreakoutPanel participants={allParticipants} selfName={name} isHost={isHost} sendEvent={sendEvent} />
              )}
              {panel === 'settings' && <RoomSettings room={room} onUpdate={setRoom} />}
              {panel === 'profile' && (
                <ProfilePanel
                  profile={profile}
                  displayName={displayName}
                  onDisplayNameChange={setDisplayName}
                  onProfileUpdate={(newName) => {
                    setDisplayName(newName);
                    updateSelf({ name: newName });
                  }}
                />
              )}
            </div>
          </aside>
        )}

        {/* vertical icon rail — panel toggles */}
        <nav className="w-16 shrink-0 glass-strong border-l border-slate-800 flex flex-col items-center py-3 gap-1.5 overflow-y-auto scrollbar-thin">
          {panelMeta.filter((p) => p.allowed).map((p) => (
            <button
              key={p.kind}
              onClick={() => setPanel(panel === p.kind ? null : p.kind)}
              className={`relative w-11 h-11 rounded-xl flex items-center justify-center transition-all group ${
                panel === p.kind
                  ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title={p.label}
            >
              <p.icon className="w-5 h-5" />
              <span className="absolute left-full ml-2 px-2.5 py-1 rounded-lg bg-slate-800 text-white text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-xl z-50">
                {p.label}
              </span>
            </button>
          ))}
        </nav>
      </div>

      <LeaveConfirm
        open={showLeaveConfirm}
        isHost={isHost}
        onCancel={() => setShowLeaveConfirm(false)}
        onConfirm={async () => {
          if (isHost) {
            // Close the room in the DB first so the realtime subscription +
            // polling fallback in every other client kicks them out. Then
            // broadcast as a backup, then leave.
            await supabase.from('rooms').update({ is_active: false }).eq('id', room.id);
            sendEvent('host-left', {});
          }
          onLeave();
        }}
      />

      <Modal open={showCodeModal} onClose={() => setShowCodeModal(false)} title="کد کلاس" size="sm">
        <div className="space-y-4">
          <p className="text-slate-300 text-sm leading-relaxed">
            این کد را به شرکت‌کنندگان بدهید تا وارد جلسه شوند:
          </p>
          <div className="flex items-center gap-2">
            <div className="flex-1 px-4 py-3 rounded-xl bg-slate-800 text-center">
              <span className="text-2xl font-bold text-sky-400 tracking-widest">{slug}</span>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(slug);
                pushToast('کد کلاس کپی شد', 'info');
              }}
              className="px-4 py-3 rounded-xl bg-sky-500 text-white font-bold hover:bg-sky-600 transition-colors flex items-center gap-1.5"
            >
              <Copy className="w-4 h-4" />
              کپی
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ControlButton({
  active, onClick, onIcon, offIcon, label, danger, highlight, disabled,
}: {
  active: boolean;
  onClick: () => void;
  onIcon: React.ReactNode;
  offIcon: React.ReactNode;
  label: string;
  danger?: boolean;
  highlight?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative w-12 h-12 rounded-xl flex items-center justify-center transition-all group ${
        disabled
          ? 'bg-slate-800/40 text-slate-600 cursor-not-allowed'
          : danger
          ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30'
          : highlight
          ? 'bg-sky-500 text-white'
          : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
      }`}
      title={label}
    >
      {active ? onIcon : offIcon}
      <span className="absolute -bottom-5 text-[10px] text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
        {label}
      </span>
    </button>
  );
}

function RoomSettings({ room, onUpdate }: { room: Room; onUpdate: (r: Room) => void }) {
  const toggles: { key: keyof Room; label: string }[] = [
    { key: 'allow_chat', label: 'چت' },
    { key: 'allow_file_sharing', label: 'اشتراک فایل' },
    { key: 'allow_screen_share', label: 'اشتراک صفحه' },
    { key: 'allow_recording', label: 'ضبط جلسه' },
    { key: 'allow_breakout', label: 'اتاق فرعی' },
    { key: 'allow_whiteboard', label: 'وایت‌بورد' },
    { key: 'allow_polls', label: 'نظرسنجی' },
    { key: 'allow_reactions', label: 'واکنش‌ها' },
    { key: 'allow_hand_raise', label: 'درخواست گفتگو' },
    { key: 'allow_view_participants', label: 'مشاهده لیست شرکت‌کنندگان' },
  ];
  const [saving, setSaving] = useState<string | null>(null);

  const toggle = async (key: keyof Room) => {
    setSaving(key);
    const next = !room[key];
    await supabase.from('rooms').update({ [key]: next }).eq('id', room.id);
    onUpdate({ ...room, [key]: next });
    setSaving(null);
    pushToast(`${next ? 'فعال شد' : 'غیرفعال شد'}`, 'info');
  };

  return (
    <div className="p-4 space-y-2">
      <p className="text-xs text-slate-400 mb-3">امکانات قابل تغییر در حین جلسه:</p>
      {toggles.map((t) => (
        <label key={t.key} className="flex items-center justify-between p-3 rounded-xl bg-slate-800/50 hover:bg-slate-800 cursor-pointer transition-colors">
          <span className="text-sm text-slate-200">{t.label}</span>
          <button
            onClick={() => toggle(t.key)}
            disabled={saving === t.key}
            className={`relative w-11 h-6 rounded-full transition-colors ${room[t.key] ? 'bg-sky-500' : 'bg-slate-700'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${room[t.key] ? 'right-0.5' : 'right-5'}`} />
          </button>
        </label>
      ))}
    </div>
  );
}

function LeaveConfirm({
  open, isHost, onCancel, onConfirm,
}: { open: boolean; isHost: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Modal open={open} onClose={onCancel} title="خروج از جلسه" size="sm">
      <div className="space-y-4">
        <p className="text-slate-300 text-sm leading-relaxed">
          {isHost
            ? 'به‌عنوان میزبان، در صورت خروج همه اعضا از جلسه خارج خواهند شد. آیا مطمئن هستید؟'
            : 'آیا از خروج از جلسه مطمئن هستید؟'}
        </p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors">
            انصراف
          </button>
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-xl bg-rose-500 text-white font-bold hover:bg-rose-600 transition-colors">
            خروج
          </button>
        </div>
      </div>
    </Modal>
  );
}
