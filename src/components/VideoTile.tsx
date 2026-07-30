import { memo, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Hand, Pin, Crown, Maximize2, Minimize2 } from 'lucide-react';
import type { Participant } from '@/lib/presence';
import { canPerform } from '@/lib/presence';
import { initials, avatarColor } from '@/lib/utils';

type Props = {
  participant: Participant;
  stream: MediaStream | null;
  isPinned: boolean;
  onPin: () => void;
  isSelf: boolean;
  isMaximized?: boolean;
  onMaximize?: () => void;
};

function VideoTile({ participant, stream, isPinned, onPin, isSelf, isMaximized, onMaximize }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Always attach the stream as soon as it arrives — independent of the
  // presence camOn flag, which can lag behind the actual WebRTC track.
  // CRITICAL: React's `muted` JSX attribute is unreliable across browsers.
  // We set `muted` via the ref AFTER the element mounts so the property is
  // guaranteed to be applied, then call play(). For remote streams we keep
  // muted=false so audio is heard.
  //
  // When a new track (e.g. audio) is added to an existing remote stream, the
  // parent passes a NEW MediaStream object (see ontrack in useCameraMesh).
  // This effect re-runs, sets srcObject to the new stream, and calls play() —
  // which is what actually starts the audio track playing in the browser.
  // Without this re-run, the audio track would attach to the DOM but never
  // start playing.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (stream) {
      v.srcObject = stream;
      v.muted = isSelf;
      v.play().catch(() => {});
    } else {
      v.srcObject = null;
    }
  }, [stream, isSelf]);

  const [hasLiveVideo, setHasLiveVideo] = useState(false);
  // Whether we've ever seen the remote video track unmuted. Once true, we
  // trust the muted property to detect when the sender turns off their camera.
  // Before the first unmute, we fall back to videoWidth > 0 because some
  // browsers (notably Chrome) keep remote tracks muted=true even when frames
  // are actively flowing — especially for tracks negotiated after the initial
  // connection (late joiners receiving the host's already-on camera).
  const everUnmutedRef = useRef(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!stream) { setHasLiveVideo(false); everUnmutedRef.current = false; return; }
    everUnmutedRef.current = false;
    const videoTracks = stream.getVideoTracks();
    const check = () => {
      const vt = stream.getVideoTracks();
      const hasTrack = vt.length > 0 && vt.some((t) => t.enabled);
      const anyUnmuted = vt.some((t) => t.enabled && !t.muted);
      if (anyUnmuted) everUnmutedRef.current = true;
      let live: boolean;
      if (everUnmutedRef.current) {
        live = hasTrack && anyUnmuted;
      } else {
        const decoding = !!(v && v.videoWidth > 0 && v.readyState >= 2);
        live = hasTrack && (anyUnmuted || decoding);
      }
      setHasLiveVideo(live);
    };
    check();
    const iv = setInterval(check, 1000);
    stream.addEventListener('addtrack', check);
    stream.addEventListener('removetrack', check);
    videoTracks.forEach((t) => {
      t.addEventListener('mute', check);
      t.addEventListener('unmute', check);
    });
    return () => {
      clearInterval(iv);
      stream.removeEventListener('addtrack', check);
      stream.removeEventListener('removetrack', check);
      videoTracks.forEach((t) => {
        t.removeEventListener('mute', check);
        t.removeEventListener('unmute', check);
      });
    };
  }, [stream]);

  // A live, enabled remote video track is the source of truth for whether to
  // show video. We deliberately do NOT gate on the presence `camOn` flag or the
  // canPerform('cam') grant here, because DB-fallback participants (used when
  // the presence channel drops) carry camOn=false and canUseCam=false even when
  // their camera is actually on. Showing a live track is always correct; when
  // the sender mutes their camera the track's enabled flag flips and we hide.
  const showVideo = stream && hasLiveVideo;
  const showMutedAvatar = !stream || !hasLiveVideo;

  return (
    <div
      className={`relative rounded-2xl overflow-hidden bg-slate-800 group transition-all ${
        isPinned ? 'ring-2 ring-sky-400' : ''
      } ${participant.isSpeaking ? 'ring-2 ring-emerald-400' : ''}`}
    >
      {/* Video is always mounted when a stream exists so the track can attach
          immediately; the avatar overlay hides it when the camera is off. */}
      {stream && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className={`w-full h-full object-cover scale-x-[-1] transition-opacity ${
            showVideo ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}

      {showMutedAvatar && (
        <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
          {!canPerform(participant, 'cam') && !isSelf ? (
            <div className="text-center">
              <div
                className={`w-20 h-20 rounded-full ${avatarColor(participant.name)} flex items-center justify-center text-white text-2xl font-bold shadow-lg mx-auto mb-2`}
              >
                {initials(participant.name)}
              </div>
              <p className="text-xs text-slate-500">در حال تماشا</p>
            </div>
          ) : (
            <div
              className={`w-20 h-20 rounded-full ${avatarColor(participant.name)} flex items-center justify-center text-white text-2xl font-bold shadow-lg`}
            >
              {initials(participant.name)}
            </div>
          )}
        </div>
      )}

      {/* gradient overlay */}
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />

      {/* top indicators */}
      <div className="absolute top-2 right-2 flex items-center gap-1.5">
        {participant.role === 'host' && (
          <span className="px-1.5 py-0.5 rounded-md bg-amber-500/80 text-white text-[10px] font-bold flex items-center gap-1">
            <Crown className="w-3 h-3" /> میزبان
          </span>
        )}
        {participant.handRaised && (
          <span className="w-6 h-6 rounded-md bg-amber-400 text-white flex items-center justify-center wave-anim">
            <Hand className="w-3.5 h-3.5" />
          </span>
        )}
      </div>

      {/* bottom bar */}
      <div className="absolute bottom-2 inset-x-2 flex items-center justify-between">
        <span className="text-xs text-white font-medium px-2 py-0.5 rounded bg-black/40 backdrop-blur flex items-center gap-1.5 truncate">
          {participant.name}
          {isSelf && <span className="text-sky-300">(شما)</span>}
        </span>
        <div className="flex items-center gap-1">
          <span
            className={`w-6 h-6 rounded-md flex items-center justify-center ${
              participant.micOn ? 'bg-black/40 text-white' : 'bg-rose-500 text-white'
            }`}
          >
            {participant.micOn ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
          </span>
          <button
            onClick={onPin}
            className="w-6 h-6 rounded-md bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-sky-500"
            title={isPinned ? 'برداشتن پین' : 'پین کردن'}
          >
            <Pin className={`w-3.5 h-3.5 ${isPinned ? 'fill-current' : ''}`} />
          </button>
          {onMaximize && (
            <button
              onClick={onMaximize}
              className="w-6 h-6 rounded-md bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-sky-500"
              title={isMaximized ? 'کوچک‌نمایی' : 'تمام‌صفحه'}
            >
              {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(VideoTile);
