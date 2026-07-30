import { useEffect, useRef, useState, useCallback } from 'react';

export type MediaState = {
  stream: MediaStream | null;
  micOn: boolean;
  camOn: boolean;
  error: string | null;
};

// Local camera + microphone. Media is acquired LAZILY — no getUserMedia prompt
// fires until the user toggles mic or cam on (or start() is called explicitly).
// This means viewers with no mic/cam permission never see a browser permission
// dialog on join. Default state is mic/cam OFF.
export function useLocalMedia() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const ensureStream = useCallback(async (video: boolean, audio: boolean): Promise<MediaStream | null> => {
    const existing = streamRef.current;
    const hasVideo = !!existing?.getVideoTracks().length;
    const hasAudio = !!existing?.getAudioTracks().length;
    if (existing && (video ? hasVideo : true) && (audio ? hasAudio : true)) {
      return existing;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: video ? {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 60, min: 30 },
          facingMode: 'user',
        } : false,
        audio: audio ? {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 2,
          sampleRate: 48000,
          sampleSize: 16,
        } : false,
      });
      if (existing) {
        // Merge new tracks into a NEW MediaStream wrapping all tracks.
        // We must create a new object so React detects the reference change
        // and downstream hooks (useCameraMesh) re-run their effects to add
        // the new track to peer connections and re-offer. Reusing the same
        // stream reference silently drops the track from the WebRTC mesh.
        s.getTracks().forEach((t) => existing.addTrack(t));
        const merged = new MediaStream(existing.getTracks());
        streamRef.current = merged;
        setStream(merged);
        return merged;
      }
      streamRef.current = s;
      setStream(s);
      return s;
    } catch (e) {
      const err = e as Error;
      if (err.name === 'NotAllowedError') {
        setError('دسترسی به میکروفون و دوربین داده نشد. لطفاً در تنظیمات مرورگر اجازه دهید.');
      } else if (err.name === 'NotFoundError') {
        setError('دوربین یا میکروفونی یافت نشد.');
      } else {
        setError('فعال‌سازی رسانه ناموفق بود: ' + err.message);
      }
      return null;
    }
  }, []);

  const start = useCallback(async (video = true, audio = true) => {
    const s = await ensureStream(video, audio);
    if (s) {
      s.getAudioTracks().forEach((t) => (t.enabled = micOn));
      s.getVideoTracks().forEach((t) => (t.enabled = camOn));
      setError(null);
    }
  }, [ensureStream, micOn, camOn]);

  const toggleMic = useCallback(async () => {
    const next = !micOn;
    if (next) {
      // Turning on — acquire audio if we don't have it yet.
      const s = await ensureStream(false, true);
      if (!s) return;
      s.getAudioTracks().forEach((t) => (t.enabled = true));
    } else {
      streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = false));
    }
    setMicOn(next);
  }, [micOn, ensureStream]);

  const toggleCam = useCallback(async () => {
  const next = !camOn;

  if (next) {
    // روشن کردن دوربین
    const s = await ensureStream(true, false);

    if (!s) {
      return;
    }

    s.getVideoTracks().forEach((t) => {
      t.enabled = true;
    });

    streamRef.current = s;
    setStream(new MediaStream(s.getTracks()));
  } else {
    // خاموش کردن کامل دوربین
    const current = streamRef.current;

    current?.getVideoTracks().forEach((track) => {
      track.stop();
      current.removeTrack(track);
    });

    if (current) {
      const remainingTracks = current.getTracks();

      if (remainingTracks.length) {
        const newStream = new MediaStream(remainingTracks);

        streamRef.current = newStream;
        setStream(newStream);
      } else {
        streamRef.current = null;
        setStream(null);
      }
    }
  }

  setCamOn(next);
}, [camOn, ensureStream]);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
    setMicOn(false);
    setCamOn(false);
  }, []);

  return { stream, micOn, camOn, error, start, toggleMic, toggleCam, stop };
}

// Screen share hook
export function useScreenShare() {
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [sharing, setSharing] = useState(false);

  const startShare = useCallback(async () => {
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 } as MediaTrackConstraints,
        audio: false,
      });
      setScreenStream(s);
      setSharing(true);
      s.getVideoTracks()[0]?.addEventListener('ended', () => {
        setScreenStream(null);
        setSharing(false);
      });
      return true;
    } catch {
      return false;
    }
  }, []);

  const stopShare = useCallback(() => {
    screenStream?.getTracks().forEach((t) => t.stop());
    setScreenStream(null);
    setSharing(false);
  }, [screenStream]);

  return { screenStream, sharing, startShare, stopShare };
}

// Speaker detection via audio analysis
export function useSpeakingDetector(stream: MediaStream | null, enabled: boolean) {
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    if (!stream || !enabled) {
      setSpeaking(false);
      return;
    }
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.6;
    src.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;
    let lastSpeaking = false;
    const tick = () => {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const avg = sum / data.length;
      const nowSpeaking = avg > 18;
      if (nowSpeaking !== lastSpeaking) {
        lastSpeaking = nowSpeaking;
        setSpeaking(nowSpeaking);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      src.disconnect();
      ctx.close();
    };
  }, [stream, enabled]);

  return speaking;
}
