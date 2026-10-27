import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Room, RemoteTrack, Participant } from "livekit-client";
import { api, ApiError } from "../api";
import type { Channel } from "../types";

type Ticket = {
  token: string;
  url: string;
  leaseId: string;
  channelId: string;
  channelName: string;
};
type VoiceMember = {
  id: string;
  name: string;
  speaking: boolean;
  mic: boolean;
  quality: string;
  local: boolean;
};
type VoiceState = {
  phase: "idle" | "connecting" | "connected" | "reconnecting";
  channel: Pick<Channel, "id" | "name"> | null;
  members: VoiceMember[];
  muted: boolean;
  deafened: boolean;
  error: string;
  audioBlocked: boolean;
  devices: MediaDeviceInfo[];
  room: Room | null;
  join: (channel: Channel) => Promise<void>;
  leave: () => Promise<void>;
  toggleMute: () => Promise<void>;
  toggleDeafen: () => void;
  startAudio: () => Promise<void>;
  device: (kind: MediaDeviceKind, id: string) => Promise<void>;
  volume: (id: string, volume: number) => void;
};
const Context = createContext<VoiceState | null>(null);
export function useVoice() {
  const value = useContext(Context);
  if (!value) throw new Error("VoiceProvider is missing");
  return value;
}
export function VoiceProvider({ children }: { children: ReactNode }) {
  const [room, setRoom] = useState<Room | null>(null),
    [ticket, setTicket] = useState<Ticket | null>(null),
    [channel, setChannel] = useState<VoiceState["channel"]>(null),
    [phase, setPhase] = useState<VoiceState["phase"]>("idle"),
    [members, setMembers] = useState<VoiceMember[]>([]),
    [muted, setMuted] = useState(false),
    [deafened, setDeafened] = useState(false),
    [error, setError] = useState(""),
    [audioBlocked, setAudioBlocked] = useState(false),
    [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const current = useRef<Room | null>(null),
    currentTicket = useRef<Ticket | null>(null),
    generation = useRef(0),
    deaf = useRef(false),
    audioContainer = useRef<HTMLDivElement>(null);
  async function cleanup() {
    const previous = current.current,
      lease = currentTicket.current;
    current.current = null;
    currentTicket.current = null;
    previous?.removeAllListeners();
    await previous?.disconnect(true);
    audioContainer.current?.replaceChildren();
    if (lease)
      void api(`/voice/channels/${lease.channelId}`, "DELETE", {
        leaseId: lease.leaseId,
      }).catch(() => {});
  }
  async function leave() {
    ++generation.current;
    await cleanup();
    setRoom(null);
    setTicket(null);
    setChannel(null);
    setMembers([]);
    setPhase("idle");
    setMuted(false);
    setDeafened(false);
    deaf.current = false;
    setAudioBlocked(false);
  }
  useEffect(
    () => () => {
      ++generation.current;
      const previous = current.current,
        lease = currentTicket.current;
      previous?.removeAllListeners();
      void previous?.disconnect(true);
      if (lease)
        void fetch(`/api/voice/channels/${lease.channelId}`, {
          method: "DELETE",
          credentials: "include",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leaseId: lease.leaseId }),
        }).catch(() => {});
    },
    [],
  );
  async function join(selected: Channel) {
    if (channel?.id === selected.id && phase !== "idle") return;
    const attempt = ++generation.current;
    await cleanup();
    setError("");
    setMuted(false);
    setDeafened(false);
    deaf.current = false;
    setMembers([]);
    setTicket(null);
    setRoom(null);
    if (attempt !== generation.current) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setPhase("idle");
      setChannel(null);
      setError(
        "Mikrofon için güvenli bağlantı gerekiyor. PC’de localhost kullanın; tablet/telefon için KYTEW’i cihazın güvendiği bir HTTPS adresinden açın.",
      );
      return;
    }
    setChannel({ id: selected.id, name: selected.name });
    setPhase("connecting");
    let sdk: typeof import("livekit-client");
    try {
      sdk = await import("livekit-client");
    } catch {
      if (attempt === generation.current) {
        setChannel(null);
        setPhase("idle");
        setError(
          "Ses bileşeni yüklenemedi. Bağlantını kontrol edip tekrar dene.",
        );
      }
      return;
    }
    const { Room, RoomEvent, Track } = sdk;
    if (attempt !== generation.current) return;
    const next = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      publishDefaults: { dtx: false, red: true },
    });
    current.current = next;
    const update = () => {
      if (current.current !== next) return;
      const participants: Participant[] = [
        next.localParticipant,
        ...next.remoteParticipants.values(),
      ];
      setMembers(
        participants.map((p) => ({
          id: p.identity,
          name: p.name || "Katılımcı",
          speaking: p.isSpeaking && p.isMicrophoneEnabled,
          mic: p.isMicrophoneEnabled,
          quality: p.connectionQuality,
          local: p === next.localParticipant,
        })),
      );
      setMuted(!next.localParticipant.isMicrophoneEnabled);
    };
    const attach = (track: RemoteTrack) => {
      if (track.kind !== Track.Kind.Audio) return;
      const element = track.attach();
      element.dataset.voiceAudio = "true";
      element.muted = deaf.current;
      audioContainer.current?.appendChild(element);
    };
    next.on(RoomEvent.TrackSubscribed, attach);
    next.on(RoomEvent.TrackUnsubscribed, (track) =>
      track.detach().forEach((el) => el.remove()),
    );
    for (const event of [
      RoomEvent.ParticipantConnected,
      RoomEvent.ParticipantDisconnected,
      RoomEvent.ActiveSpeakersChanged,
      RoomEvent.TrackMuted,
      RoomEvent.TrackUnmuted,
      RoomEvent.LocalTrackPublished,
      RoomEvent.LocalTrackUnpublished,
      RoomEvent.TrackPublished,
      RoomEvent.TrackUnpublished,
      RoomEvent.ConnectionQualityChanged,
    ])
      next.on(event, update);
    next.on(RoomEvent.Reconnecting, () => {
      if (current.current === next) setPhase("reconnecting");
    });
    next.on(RoomEvent.SignalReconnecting, () => {
      if (current.current === next) setPhase("reconnecting");
    });
    next.on(RoomEvent.Reconnected, () => {
      if (current.current === next) {
        setPhase("connected");
        update();
      }
    });
    next.on(RoomEvent.AudioPlaybackStatusChanged, () => {
      if (current.current === next) setAudioBlocked(!next.canPlaybackAudio);
    });
    next.on(RoomEvent.Disconnected, () => {
      if (current.current === next) {
        setError("Ses bağlantısı sonlandı. Kanala yeniden katılabilirsiniz.");
        void leave();
      }
    });
    try {
      void next.startAudio().catch(() => {});
      const response = await api<Ticket>(
        `/voice/channels/${selected.id}/join`,
        "POST",
      );
      if (attempt !== generation.current) {
        await api(`/voice/channels/${selected.id}`, "DELETE", {
          leaseId: response.leaseId,
        }).catch(() => {});
        return;
      }
      currentTicket.current = response;
      const url = new URL(response.url, window.location.origin);
      if (url.protocol === "http:") url.protocol = "ws:";
      if (url.protocol === "https:") url.protocol = "wss:";
      await next.connect(url.toString(), response.token);
      if (attempt !== generation.current) {
        await next.disconnect(true);
        return;
      }
      await next.localParticipant.setMicrophoneEnabled(true);
      if (attempt !== generation.current) {
        await next.disconnect(true);
        return;
      }
      setRoom(next);
      setTicket(response);
      setPhase("connected");
      update();
      setDevices(
        await navigator.mediaDevices.enumerateDevices().catch(() => []),
      );
    } catch (e) {
      if (attempt !== generation.current) return;
      const name = (e as Error).name;
      const message =
        name === "NotAllowedError"
          ? "Mikrofon izni verilmedi. Tarayıcı veya Windows gizlilik ayarlarından mikrofon erişimini açın."
          : name === "NotFoundError"
            ? "Mikrofon bulunamadı. Bir mikrofon bağlayıp yeniden deneyin."
            : name === "NotReadableError"
              ? "Mikrofon açılamadı. Başka bir uygulamanın cihazı kullanıp kullanmadığını kontrol edin."
              : (e as Error).message;
      await leave();
      setError(message || "Ses bağlantısı kurulamadı.");
    }
  }
  useEffect(() => {
    if (!room || !ticket) return;
    let busy = false,
      failures = 0,
      disposed = false;
    const timer = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        await api(`/voice/channels/${ticket.channelId}/heartbeat`, "POST", {
          leaseId: ticket.leaseId,
        });
        failures = 0;
      } catch (e) {
        if (disposed) return;
        failures++;
        if (
          (e instanceof ApiError && [401, 403, 404].includes(e.status)) ||
          failures >= 3
        ) {
          await leave();
          setError(
            "Ses oturumu doğrulanamadı. Yeniden giriş yapın veya kanala tekrar katılın.",
          );
        }
      } finally {
        busy = false;
      }
    }, 15000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [room, ticket]);
  useEffect(() => {
    const media = navigator.mediaDevices;
    if (!media) return;
    const update = () => {
      void media
        .enumerateDevices()
        .then(setDevices)
        .catch(() => {});
    };
    media.addEventListener("devicechange", update);
    return () => media.removeEventListener("devicechange", update);
  }, []);
  async function toggleMute() {
    if (!current.current || current.current.state !== "connected") return;
    try {
      await current.current.localParticipant.setMicrophoneEnabled(
        !current.current.localParticipant.isMicrophoneEnabled,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function toggleDeafen() {
    deaf.current = !deaf.current;
    setDeafened(deaf.current);
    audioContainer.current?.querySelectorAll("audio").forEach((el) => {
      el.muted = deaf.current;
    });
  }
  async function startAudio() {
    try {
      await current.current?.startAudio();
    } catch {
      setError("Ses çalınamadı. Tarayıcı ses izinlerini kontrol edin.");
    }
  }
  async function device(kind: MediaDeviceKind, id: string) {
    try {
      const changed = await current.current?.switchActiveDevice(kind, id);
      if (!changed) setError("Bu tarayıcı seçilen ses cihazına geçemedi.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function volume(id: string, amount: number) {
    current.current?.remoteParticipants
      .get(id)
      ?.setVolume(Math.max(0, Math.min(1, amount)));
  }
  return (
    <Context.Provider
      value={{
        room,
        phase,
        channel,
        members,
        muted,
        deafened,
        error,
        audioBlocked,
        devices,
        join,
        leave,
        toggleMute,
        toggleDeafen,
        startAudio,
        device,
        volume,
      }}
    >
      {children}
      <div ref={audioContainer} className="voice-audio" aria-hidden="true" />
    </Context.Provider>
  );
}
