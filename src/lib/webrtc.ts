import { useEffect, useRef, useState, useCallback } from 'react';
import type { SignalRow } from './dbSignal';

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
};

type SdpPayload = { from: string; to: string; sdp: RTCSessionDescriptionInit };
type IcePayload = { from: string; to: string; candidate: RTCIceCandidateInit };

// A shared signaling interface — the caller creates ONE useDbSignal instance
// and passes send/on to every WebRTC hook, so rows are never deleted by an
// instance that has no handler for them.
type Signal = {
  send: (kind: string, toId: string, payload?: Record<string, unknown>) => Promise<void>;
  on: (kind: string, fn: (rows: SignalRow[]) => void) => () => void;
};

function isVideoStream(stream: MediaStream | null): boolean {
  return !!stream && stream.getVideoTracks().some((t) => t.readyState === 'live');
}

function getEnabledVideoStream(stream: MediaStream | null): boolean {
  return !!stream && stream.getVideoTracks().some((t) => t.enabled && t.readyState === 'live');
}

// --- Screen share publisher (host) ---
export function useScreenPublisher(
  selfId: string,
  screenStream: MediaStream | null,
  viewerIds: string[],
  sig: Signal,
) {
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const streamRef = useRef<MediaStream | null>(screenStream);
  // Buffer ICE candidates per-viewer until the answer (remote description)
  // arrives. Without this, addIceCandidate throws and the candidate is lost.
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  streamRef.current = screenStream;

  const sendOffer = useCallback(async (viewerId: string) => {
    const stream = streamRef.current;
    if (!stream) return;
    let pc = pcsRef.current.get(viewerId);
    if (!pc) {
      pc = new RTCPeerConnection(ICE_CONFIG);
      pcsRef.current.set(viewerId, pc);
      // ICE candidates MUST be forwarded to the viewer — without this, the
      // WebRTC connection can never establish (offer/answer exchange alone
      // isn't enough; the viewer needs ICE candidates to find the host's
      // network path). This was the root cause of screen share never working.
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          sig.send('screen-ice', viewerId, { from: selfId, to: viewerId, candidate: e.candidate.toJSON() });
        }
      };
      stream.getTracks().forEach((t) => pc!.addTrack(t, stream));
    }
    // Roll back any pending offer so we can create a fresh one.
    if (pc.signalingState === 'have-local-offer') {
      try { await pc.setLocalDescription({ type: 'rollback' }); }
      catch { return; }
    }
    if (pc.signalingState !== 'stable') return;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await sig.send('screen-offer', viewerId, { from: selfId, to: viewerId, sdp: pc.localDescription!.toJSON() });
  }, [selfId, sig]);

  useEffect(() => {
    const unsubs: (() => void)[] = [];

    unsubs.push(sig.on('screen-answer', (rows) => {
      for (const r of rows) {
        const d = r.payload as unknown as SdpPayload;
        if (d.to !== selfId) continue;
        const pc = pcsRef.current.get(d.from);
        if (!pc) continue;
        if (pc.signalingState === 'have-local-offer') {
          pc.setRemoteDescription(d.sdp).then(() => {
            // Flush buffered ICE candidates now that remote description is set.
            const buffered = pendingIceRef.current.get(d.from) ?? [];
            pendingIceRef.current.delete(d.from);
            for (const c of buffered) pc.addIceCandidate(c).catch(() => {});
          }).catch(() => {});
        }
      }
    }));

    unsubs.push(sig.on('screen-ice', (rows) => {
      for (const r of rows) {
        const d = r.payload as unknown as IcePayload;
        if (d.to !== selfId) continue;
        const pc = pcsRef.current.get(d.from);
        if (!pc) continue;
        if (pc.remoteDescription) {
          pc.addIceCandidate(d.candidate).catch(() => {});
        } else {
          const buf = pendingIceRef.current.get(d.from) ?? [];
          buf.push(d.candidate);
          pendingIceRef.current.set(d.from, buf);
        }
      }
    }));

    unsubs.push(sig.on('screen-hello', (rows) => {
      for (const r of rows) {
        if (r.from_id === selfId) continue;
        // Only send an offer if we don't already have a connection to this
        // viewer. Closing and recreating the PC on every hello destroys
        // in-progress negotiations — and viewers send hello multiple times
        // (on mount AND on receiving screen-start), so the first offer's
        // answer would arrive after the PC was already replaced, leaving
        // the connection permanently stuck.
        if (!pcsRef.current.has(r.from_id)) {
          sendOffer(r.from_id);
        }
      }
    }));

    return () => unsubs.forEach((u) => u());
  }, [selfId, sig, sendOffer]);

  useEffect(() => {
    if (!screenStream || typeof RTCPeerConnection === 'undefined') {
      // Sharing stopped (or never started) — notify viewers and tear down
      // all peer connections so they stop waiting for a stream that no
      // longer exists. Without this, viewers keep their subscriber PC
      // open indefinitely and the screen share tile never clears.
      sig.send('screen-stop', '*');
      pcsRef.current.forEach((pc) => pc.close());
      pcsRef.current.clear();
      pendingIceRef.current.clear();
      return;
    }
    sig.send('screen-start', '*');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenStream]);

  useEffect(() => {
    if (!screenStream) return;
    [...pcsRef.current.keys()].forEach((id) => {
      if (!viewerIds.includes(id)) {
        pcsRef.current.get(id)?.close();
        pcsRef.current.delete(id);
        pendingIceRef.current.delete(id);
      }
    });
  }, [viewerIds, screenStream]);

  useEffect(() => {
    return () => {
      sig.send('screen-stop', '*');
      pcsRef.current.forEach((pc) => pc.close());
      pcsRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// --- Screen share subscriber (viewers) ---
export function useScreenSubscriber(
  selfId: string,
  enabled: boolean,
  sig: Signal,
) {
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  // Buffer ICE candidates that arrive before the offer's remote description
  // is set. Without this, addIceCandidate throws and the candidate is lost —
  // the screen share video track never connects.
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);

  useEffect(() => {
    if (!enabled || typeof RTCPeerConnection === 'undefined') {
      pcRef.current?.close();
      pcRef.current = null;
      setRemoteStream(null);
      return;
    }

    const unsubs: (() => void)[] = [];

    unsubs.push(sig.on('screen-offer', async (rows) => {
      for (const r of rows) {
        const d = r.payload as unknown as SdpPayload;
        if (d.to !== selfId) continue;
        pcRef.current?.close();
        pendingIceRef.current = [];
        const pc = new RTCPeerConnection(ICE_CONFIG);
        pcRef.current = pc;
        pc.ontrack = (e) => setRemoteStream(e.streams[0]);
        pc.onicecandidate = (e) => {
          if (e.candidate) {
            sig.send('screen-ice', d.from, { from: selfId, to: d.from, candidate: e.candidate.toJSON() });
          }
        };
        try {
          await pc.setRemoteDescription(d.sdp);
          // Flush buffered ICE candidates now that remote description is set.
          const buffered = pendingIceRef.current;
          pendingIceRef.current = [];
          for (const c of buffered) pc.addIceCandidate(c).catch(() => {});
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sig.send('screen-answer', d.from, { from: selfId, to: d.from, sdp: pc.localDescription!.toJSON() });
        } catch { /* negotiation conflict */ }
      }
    }));

    unsubs.push(sig.on('screen-ice', (rows) => {
      for (const r of rows) {
        const d = r.payload as unknown as IcePayload;
        if (d.to !== selfId) continue;
        const pc = pcRef.current;
        if (pc && pc.remoteDescription) {
          pc.addIceCandidate(d.candidate).catch(() => {});
        } else {
          pendingIceRef.current.push(d.candidate);
        }
      }
    }));

    unsubs.push(sig.on('screen-stop', () => {
      pcRef.current?.close();
      pcRef.current = null;
      setRemoteStream(null);
    }));

    unsubs.push(sig.on('screen-start', () => {
      sig.send('screen-hello', '*');
    }));

    // Announce so any publisher already sharing sends us an offer.
    sig.send('screen-hello', '*');

    return () => {
      unsubs.forEach((u) => u());
      pcRef.current?.close();
      pcRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, selfId, sig]);

  return remoteStream;
}

// --- Camera mesh ---
export function useCameraMesh(
  selfId: string,
  camStream: MediaStream | null,
  peerIds: string[],
  sig: Signal,
) {
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const camStreamRef = useRef<MediaStream | null>(camStream);
  const peerIdsRef = useRef<string[]>(peerIds);
  // Tracks peers for which we have a queued renegotiation. When
  // forceOffer is called while a negotiation is already in flight, we mark
  // the peer as needing a re-offer instead of rolling back the current one
  // (which causes answer mismatch and permanently breaks the connection).
  const needsRenegotiationRef = useRef<Set<string>>(new Set());
  // Tracks peers for which we currently have an outstanding offer (sent but
  // no answer received yet). Used to decide whether to queue or send
  // immediately, and to avoid processing incoming offers while our own is
  // in flight (perfect negotiation: impolite side wins).
  const pendingOfferRef = useRef<Set<string>>(new Set());
  // Buffer ICE candidates that arrive before the remote description is set.
  // addIceCandidate throws if remoteDescription is null, and silently catching
  // that error permanently loses the candidate — so the video track never
  // connects. This is especially common during renegotiation (host turns on
  // camera): the offer's ICE candidates arrive before the viewer's answer sets
  // the remote description on the host side.
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  // forceOffer is defined below ensurePeer but needed inside ensurePeer's
  // oniceconnectionstatechange handler for ICE restart. We bridge the
  // definition order with a ref that's kept in sync with the latest
  // forceOffer callback.
  const forceOfferRef = useRef<(peerId: string) => void>(() => {});

  camStreamRef.current = camStream;
  peerIdsRef.current = peerIds;

  const ensurePeer = useCallback((peerId: string): RTCPeerConnection | null => {
    if (peerId === selfId) return null;
    const existing = pcsRef.current.get(peerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection(ICE_CONFIG);
    pcsRef.current.set(peerId, pc);

    const stream = camStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => {
        const sender = pc.addTrack(t, stream);
        // Maximize quality: high bitrate for video, clear audio.
        const params = sender.getParameters();
        const enc = params.encodings?.[0] ?? {};
        if (t.kind === 'video') {
          enc.maxBitrate = 2_500_000;
          enc.maxFramerate = 60;
        } else {
          enc.maxBitrate = 128_000;
        }
        if (params.encodings && params.encodings.length > 0) {
          params.encodings[0] = enc;
        } else {
          params.encodings = [enc];
        }
        sender.setParameters(params).catch(() => {});
      });
    }
    const hasAudio = !!stream?.getAudioTracks().length;
    const hasVideo = !!stream?.getVideoTracks().length;
    // Add recvonly transceivers for any media type we don't have locally.
    // This is CRITICAL: when the lower-ID peer offers first, the offer's
    // m-sections determine what the answer can contain. If the viewer has no
    // video transceiver, their offer has no video m-section, and the host's
    // answer CANNOT add one — so the host's video track is silently dropped.
    // With a recvonly video transceiver, the viewer's offer includes a video
    // m-section, and the host's answer can upgrade it to sendrecv.
    // When the host later calls addTrack, the browser reuses the recvonly
    // sender (upgrading it to sendrecv) — no duplicate m-sections.
    if (!hasAudio) pc.addTransceiver('audio', { direction: 'recvonly' });
    if (!hasVideo) pc.addTransceiver('video', { direction: 'recvonly' });

    // Merge incoming tracks into a single per-peer stream. If ontrack fires
    // multiple times (audio first, then video after renegotiation), we merge
    // the new track into the existing stream. CRITICAL: we must return a NEW
    // MediaStream object — if we mutate the existing stream in-place and
    // return `prev`, React doesn't detect a state change, VideoTile never
    // re-renders, its effect never re-runs, and play() is never called for
    // the new audio track. The track attaches to the DOM but never starts
    // playing, so the participant's audio is silent.
    pc.ontrack = (e) => {
      if (!e.track) return;
      setRemoteStreams((prev) => {
        const existing = prev[peerId];
        if (existing) {
          if (existing.getTracks().some((t) => t.id === e.track!.id)) return prev;
          const next = new MediaStream([...existing.getTracks(), e.track!]);
          return { ...prev, [peerId]: next };
        }
        return { ...prev, [peerId]: new MediaStream([e.track!]) };
      });
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sig.send('cam-ice', peerId, { from: selfId, to: peerId, candidate: e.candidate.toJSON() });
      }
    };
    // ICE restart: if the connection drops (network blip, NAT rebinding),
    // automatically restart ICE by sending a new offer with iceRestart.
    // Without this, a transient failure permanently kills the peer's audio
    // and video until one side reloads.
    let iceRestartTimer: ReturnType<typeof setTimeout> | null = null;
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        if (iceRestartTimer) clearTimeout(iceRestartTimer);
        iceRestartTimer = setTimeout(() => {
          if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
            if (pc.signalingState === 'stable') {
              forceOfferRef.current(peerId);
            }
          }
        }, 2000);
      }
    };
    return pc;
  }, [selfId, sig]);

  // The lower ID offers — but ONLY for brand-new peer connections. Existing
  // connections are renegotiated exclusively via forceOffer (when tracks are
  // added). Re-offering on existing connections causes glare with forceOffer.
  const maybeOffer = useCallback(async (peerId: string) => {
    if (selfId >= peerId) return;
    const isNew = !pcsRef.current.has(peerId);
    const pc = ensurePeer(peerId);
    if (!pc || pc.signalingState !== 'stable') return;
    if (!isNew) return;
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await sig.send('cam-offer', peerId, { from: selfId, to: peerId, sdp: pc.localDescription!.toJSON() });
    } catch { /* peer connection not ready */ }
  }, [selfId, ensurePeer, sig]);

  // Force an offer regardless of ID ordering. Used when a local track is
  // added to an EXISTING peer connection. If a negotiation is already in
  // flight (have-local-offer), we QUEUE a re-offer instead of rolling back —
  // rolling back the current offer would discard it, but the remote side
  // may already be processing it and sending an answer. When that answer
  // arrives for a rolled-back PC, setRemoteDescription fails with
  // "InvalidStateError" or silently mismatches, permanently breaking the
  // connection. Instead, we wait for the current negotiation to complete,
  // then re-offer with the new tracks.
  const forceOffer = useCallback(async (peerId: string) => {
    const pc = ensurePeer(peerId);
    if (!pc) return;
    if (pc.signalingState !== 'stable') {
      needsRenegotiationRef.current.add(peerId);
      return;
    }
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      pendingOfferRef.current.add(peerId);
      await sig.send('cam-offer', peerId, { from: selfId, to: peerId, sdp: pc.localDescription!.toJSON() });
    } catch { /* peer connection not ready */ }
  }, [ensurePeer, sig]);

  // Keep forceOfferRef in sync so ensurePeer's oniceconnectionstatechange
  // handler (defined before forceOffer) can trigger ICE restart.
  useEffect(() => {
    forceOfferRef.current = forceOffer;
  }, [forceOffer]);

  // Wire up all signal handlers in one effect.
  useEffect(() => {
    if (typeof RTCPeerConnection === 'undefined') return;
    const unsubs: (() => void)[] = [];

    unsubs.push(sig.on('cam-offer', async (rows: SignalRow[]) => {
      for (const r of rows) {
        const d = r.payload as unknown as SdpPayload;
        if (d.to !== selfId) continue;
        const pc = ensurePeer(d.from);
        if (!pc) continue;
        try {
          if (pc.signalingState === 'have-local-offer') {
            // Perfect negotiation: the impolite side (higher ID) keeps its
            // own offer and ignores the incoming one; the polite side (lower
            // ID) rolls back and accepts the incoming offer.
            if (selfId > d.from) continue;
            await pc.setLocalDescription({ type: 'rollback' });
          }
          await pc.setRemoteDescription(d.sdp);
          const buffered = pendingIceRef.current.get(d.from);
          if (buffered) {
            pendingIceRef.current.delete(d.from);
            for (const c of buffered) pc.addIceCandidate(c).catch(() => {});
          }
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sig.send('cam-answer', d.from, { from: selfId, to: d.from, sdp: pc.localDescription!.toJSON() });
          // If we were the polite side (lower ID) and had a pending offer
          // that got rolled back, re-offer now to send our tracks.
          if (selfId < d.from && pendingOfferRef.current.has(d.from)) {
            pendingOfferRef.current.delete(d.from);
            setTimeout(() => forceOffer(d.from), 200);
          }
        } catch { /* ignore */ }
      }
    }));

    unsubs.push(sig.on('cam-answer', (rows: SignalRow[]) => {
      for (const r of rows) {
        const d = r.payload as unknown as SdpPayload;
        if (d.to !== selfId) continue;
        const pc = pcsRef.current.get(d.from);
        if (!pc) continue;
        if (pc.signalingState === 'have-local-offer') {
          pc.setRemoteDescription(d.sdp).then(() => {
            pendingOfferRef.current.delete(d.from);
            const buffered = pendingIceRef.current.get(d.from);
            if (buffered) {
              pendingIceRef.current.delete(d.from);
              for (const c of buffered) pc.addIceCandidate(c).catch(() => {});
            }
            // If a renegotiation was queued while this offer was in flight,
            // fire it now.
            if (needsRenegotiationRef.current.has(d.from)) {
              needsRenegotiationRef.current.delete(d.from);
              setTimeout(() => forceOffer(d.from), 100);
            }
          }).catch(() => {});
        }
      }
    }));

    unsubs.push(sig.on('cam-ice', (rows: SignalRow[]) => {
      for (const r of rows) {
        const d = r.payload as unknown as IcePayload;
        if (d.to !== selfId) continue;
        const pc = pcsRef.current.get(d.from);
        if (!pc) continue;
        if (pc.remoteDescription) {
          pc.addIceCandidate(d.candidate).catch(() => {});
        } else {
          const buf = pendingIceRef.current.get(d.from) ?? [];
          buf.push(d.candidate);
          pendingIceRef.current.set(d.from, buf);
        }
      }
    }));

    unsubs.push(sig.on('cam-hello', (rows: SignalRow[]) => {
      for (const r of rows) {
        if (r.from_id === selfId) continue;
        if (pcsRef.current.has(r.from_id)) continue;
        // maybeOffer creates the PC via ensurePeer and sends an offer, but
        // only when selfId < peerId (lower ID offers). For selfId >= peerId,
        // we still need to create the PC so we're ready to receive the other
        // side's offer. Calling ensurePeer before maybeOffer breaks the
        // isNew check inside maybeOffer — it sees the PC already exists and
        // skips the offer, so late joiners never receive the host's camera.
        if (selfId < r.from_id) {
          maybeOffer(r.from_id);
        } else {
          ensurePeer(r.from_id);
        }
      }
    }));

    unsubs.push(sig.on('cam-bye', (rows: SignalRow[]) => {
      for (const r of rows) {
        if (r.from_id === selfId) continue;
        pcsRef.current.get(r.from_id)?.close();
        pcsRef.current.delete(r.from_id);
        pendingOfferRef.current.delete(r.from_id);
        pendingIceRef.current.delete(r.from_id);
        setRemoteStreams((prev) => {
          const next = { ...prev };
          delete next[r.from_id];
          return next;
        });
      }
    }));

    return () => unsubs.forEach((u) => u());
  }, [selfId, ensurePeer, maybeOffer, forceOffer, sig]);

  // Announce on mount + periodically so late joiners connect.
  useEffect(() => {
    sig.send('cam-hello', '*');
    const reAnnounce = setInterval(() => sig.send('cam-hello', '*'), 4000);
    return () => clearInterval(reAnnounce);
  }, [sig]);

  // Sync peer set as participants join/leave. ensurePeer already adds our
  // existing camera tracks when creating a new PC, so maybeOffer (which calls
  // ensurePeer internally) is sufficient for the offering side. For the
  // non-offering side (higher ID), we call ensurePeer directly to create the
  // PC so we're ready to answer. Calling ensurePeer before maybeOffer would
  // break maybeOffer's isNew check and silently skip the offer.
  useEffect(() => {
    peerIds.forEach((id) => {
      if (pcsRef.current.has(id)) return;
      if (selfId < id) {
        maybeOffer(id);
      } else {
        ensurePeer(id);
      }
    });
    [...pcsRef.current.keys()].forEach((id) => {
      if (!peerIds.includes(id)) {
        pcsRef.current.get(id)?.close();
        pcsRef.current.delete(id);
        pendingOfferRef.current.delete(id);
        pendingIceRef.current.delete(id);
        setRemoteStreams((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    });
  }, [peerIds, ensurePeer, maybeOffer]);

  // When local camera stream arrives or changes, add tracks to existing PCs
  // and renegotiate. forceOffer queues a re-offer if a negotiation is already
  // in flight, so adding audio then video in quick succession won't cause one
  // to be lost — the second addTrack + forceOffer is queued and fires after
  // the first negotiation completes.
  useEffect(() => {
    if (!camStream) return;
    let addedToExisting = false;
    pcsRef.current.forEach((pc) => {
      const senders = pc.getSenders();
      camStream.getTracks().forEach((t) => {
        if (!senders.some((s) => s.track === t)) {
          pc.addTrack(t, camStream);
          addedToExisting = true;
        }
      });
    });
    peerIdsRef.current.forEach((id) => {
      if (pcsRef.current.has(id)) {
        if (addedToExisting) forceOffer(id);
      } else if (selfId < id) {
        maybeOffer(id);
      } else {
        ensurePeer(id);
      }
    });
  }, [camStream, selfId, ensurePeer, maybeOffer, forceOffer]);

  // Replace sender track on camera toggle.
  useEffect(() => {
    if (!camStream) return;
    const track = camStream.getVideoTracks()[0];
    if (!track) return;
    pcsRef.current.forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (sender) {
        sender.replaceTrack(track).catch(() => {});
        // Maximize video quality: high max bitrate, high resolution.
        const params = sender.getParameters();
        if (params.encodings && params.encodings.length > 0) {
          params.encodings[0].maxBitrate = 2_500_000;
          params.encodings[0].maxFramerate = 60;
        } else {
          params.encodings = [{ maxBitrate: 2_500_000, maxFramerate: 60 }];
        }
        sender.setParameters(params).catch(() => {});
      }
      // Maximize audio quality: high max bitrate for clear voice.
      const audioSender = pc.getSenders().find((s) => s.track && s.track.kind === 'audio');
      if (audioSender) {
        const aParams = audioSender.getParameters();
        if (aParams.encodings && aParams.encodings.length > 0) {
          aParams.encodings[0].maxBitrate = 128_000;
        } else {
          aParams.encodings = [{ maxBitrate: 128_000 }];
        }
        audioSender.setParameters(aParams).catch(() => {});
      }
    });
  }, [camStream]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      sig.send('cam-bye', '*');
      pcsRef.current.forEach((pc) => pc.close());
      pcsRef.current.clear();
      setRemoteStreams({});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return remoteStreams;
}

// Exported helpers for VideoTile (kept here so VideoTile doesn't need dbSignal).
export { isVideoStream, getEnabledVideoStream };
